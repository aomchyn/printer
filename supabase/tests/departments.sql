\set ON_ERROR_STOP on
set role postgres;
begin;

create function pg_temp.assert(ok boolean, label text)
returns void
language plpgsql
as $$
begin
  if ok is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'PASS: %', label;
end
$$;

create function pg_temp.expect_error(
  statement text,
  expected_state text,
  expected_message text
)
returns boolean
language plpgsql
as $$
declare
  actual_state text;
  actual_message text;
begin
  execute statement;
  return false;
exception when others then
  get stacked diagnostics
    actual_state = returned_sqlstate,
    actual_message = message_text;
  return actual_state = expected_state
     and actual_message = expected_message;
end
$$;

do $$
declare
  moderator_id uuid := '00000000-0000-0000-0000-000000000101';
  assistant_id uuid := '00000000-0000-0000-0000-000000000102';
  user_id uuid := '00000000-0000-0000-0000-000000000103';
  google_id uuid := '00000000-0000-0000-0000-000000000104';
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  values
    (moderator_id, 'authenticated', 'authenticated',
     'departments-moderator@example.test', '', now(), '{}', '{}'),
    (assistant_id, 'authenticated', 'authenticated',
     'departments-assistant@example.test', '', now(), '{}', '{}'),
    (user_id, 'authenticated', 'authenticated',
     'departments-user@example.test', '', now(), '{}', '{}'),
    (google_id, 'authenticated', 'authenticated',
     'departments-google@example.test', '', now(), '{}', '{}');

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    google_id,
    google_id::text,
    jsonb_build_object(
      'sub', google_id::text,
      'email', 'departments-google@example.test'
    ),
    'google',
    now(),
    now()
  );

  insert into public.users (id, email, name, role)
  values
    (moderator_id, 'departments-moderator@example.test', 'Departments Moderator', 'moderator'),
    (assistant_id, 'departments-assistant@example.test', 'Departments Assistant', 'assistant_moderator'),
    (user_id, 'departments-user@example.test', 'Departments User', 'user'),
    (google_id, 'departments-google@example.test', 'Departments Google User', 'user');
end
$$;

select pg_temp.assert(
  (select count(*) = 4 from public.departments),
  'seed contains four departments'
);
select pg_temp.assert(
  (select is_system and value = 'QA ประกันคุณภาพ'
   from public.departments where code = 'QA'),
  'QA is the system department'
);

select pg_temp.assert(
  has_table_privilege('authenticated', 'public.departments', 'SELECT'),
  'authenticated can select departments'
);
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.departments', 'INSERT'),
  'authenticated has no table-wide insert privilege'
);
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.departments', 'DELETE'),
  'authenticated has no delete privilege'
);
select pg_temp.assert(
  not has_table_privilege('anon', 'public.departments', 'SELECT'),
  'anon cannot select departments'
);

do $$
declare
  moderator_id uuid := '00000000-0000-0000-0000-000000000101';
  assistant_id uuid := '00000000-0000-0000-0000-000000000102';
  user_id uuid := '00000000-0000-0000-0000-000000000103';
  pd_id uuid;
  ok boolean;
  affected bigint;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', moderator_id::text, false);
  set local role authenticated;

  insert into public.departments (code, name, value, sort_order)
  values ('TM', 'ทดสอบ', 'ignored', 10)
  returning id into pd_id;

  set local role postgres;
  select value = 'TM ทดสอบ'
     and is_system = false
     and created_by = moderator_id
  into ok
  from public.departments
  where id = pd_id;
  perform pg_temp.assert(
    ok,
    'manager insert is normalized by trigger'
  );

  set local role authenticated;
  update public.departments
  set name = 'ทดสอบใหม่'
  where id = pd_id;

  set local role postgres;
  select value = 'TM ทดสอบ'
  into ok
  from public.departments
  where id = pd_id;
  perform pg_temp.assert(
    ok,
    'renaming does not rewrite historical value'
  );

  set local role authenticated;
  update public.departments set is_active = false where id = pd_id;

  set local role postgres;
  select not is_active into ok
  from public.departments
  where id = pd_id;
  perform pg_temp.assert(
    ok,
    'manager can soft-delete a department'
  );

  set local role authenticated;
  update public.departments set is_active = true where id = pd_id;

  set local role postgres;
  select is_active into ok
  from public.departments
  where id = pd_id;
  perform pg_temp.assert(
    ok,
    'manager can reactivate a department'
  );

  set local role authenticated;
  ok := pg_temp.expect_error(
    format(
      'delete from public.departments where id = %L::uuid',
      pd_id::text
    ),
    '42501',
    'permission denied for table departments'
  );

  set local role postgres;
  perform pg_temp.assert(
    ok,
    'manager delete is rejected by table privilege'
  );

  set local role postgres;
  perform set_config('request.jwt.claim.sub', assistant_id::text, false);
  set local role authenticated;

  update public.departments set sort_order = 11 where id = pd_id;

  set local role postgres;
  select sort_order = 11 into ok
  from public.departments
  where id = pd_id;
  perform pg_temp.assert(
    ok,
    'assistant moderator can update'
  );

  set local role postgres;
  perform set_config('request.jwt.claim.sub', user_id::text, false);
  set local role authenticated;

  begin
    insert into public.departments (code, name, value, sort_order)
    values ('NO', 'ไม่ได้รับอนุญาต', 'NO ไม่ได้ใช้', 20);
    raise exception 'normal user insert was accepted';
  exception when insufficient_privilege then
    raise notice 'PASS: normal user insert rejected';
  end;

  begin
    update public.departments set sort_order = 12 where id = pd_id;
    get diagnostics affected = row_count;
  end;

  set local role postgres;
  select sort_order = 11 into ok
  from public.departments
  where id = pd_id;
  perform pg_temp.assert(
    affected = 0 and ok,
    'normal user update rejected by RLS without changing sort_order'
  );

  set local role authenticated;
  ok := pg_temp.expect_error(
    format(
      'delete from public.departments where id = %L::uuid',
      pd_id::text
    ),
    '42501',
    'permission denied for table departments'
  );

  set local role postgres;
  perform pg_temp.assert(
    ok,
    'normal user delete is rejected by table privilege'
  );

  set local role postgres;
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.jwt.claim.sub', '', false);
end
$$;

do $$
declare
  moderator_id uuid := '00000000-0000-0000-0000-000000000101';
  pd_id uuid;
  code_ok boolean;
  value_ok boolean;
  is_system_ok boolean;
  created_at_ok boolean;
  created_by_ok boolean;
  id_ok boolean;
  qa_hide_ok boolean;
  qa_rename_ok boolean;
begin
  select id into pd_id
  from public.departments
  where code = 'PD';

  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.jwt.claim.sub', moderator_id::text, false);
  set local role service_role;

  code_ok := pg_temp.expect_error(
    format(
      'update public.departments set code = ''PX'' where id = %L::uuid',
      pd_id::text
    ),
    'P0001',
    'Department code cannot be changed'
  );
  value_ok := pg_temp.expect_error(
    format(
      'update public.departments set value = ''PD เปลี่ยน'' where id = %L::uuid',
      pd_id::text
    ),
    'P0001',
    'Department value cannot be changed'
  );
  is_system_ok := pg_temp.expect_error(
    format(
      'update public.departments set is_system = true where id = %L::uuid',
      pd_id::text
    ),
    'P0001',
    'Department system flag cannot be changed'
  );
  created_at_ok := pg_temp.expect_error(
    format(
      'update public.departments set created_at = timestamp ''2000-01-01'' where id = %L::uuid',
      pd_id::text
    ),
    'P0001',
    'Department created_at cannot be changed'
  );
  created_by_ok := pg_temp.expect_error(
    format(
      'update public.departments set created_by = %L::uuid where id = %L::uuid',
      moderator_id::text,
      pd_id::text
    ),
    'P0001',
    'Department created_by cannot be changed'
  );
  id_ok := pg_temp.expect_error(
    format(
      'update public.departments set id = gen_random_uuid() where id = %L::uuid',
      pd_id::text
    ),
    'P0001',
    'Department ID cannot be changed'
  );
  qa_hide_ok := pg_temp.expect_error(
    'update public.departments set is_active = false where code = ''QA''',
    'P0001',
    'System department cannot be hidden'
  );
  qa_rename_ok := pg_temp.expect_error(
    'update public.departments set name = ''QA เปลี่ยน'' where code = ''QA''',
    'P0001',
    'System department name cannot be changed'
  );

  set local role postgres;
  perform pg_temp.assert(
    code_ok,
    'service_role rejects code changes'
  );
  perform pg_temp.assert(
    value_ok,
    'service_role rejects value changes'
  );
  perform pg_temp.assert(
    is_system_ok,
    'service_role rejects is_system changes'
  );
  perform pg_temp.assert(
    created_at_ok,
    'service_role rejects created_at changes'
  );
  perform pg_temp.assert(
    created_by_ok,
    'service_role rejects created_by changes'
  );
  perform pg_temp.assert(
    id_ok,
    'service_role rejects id changes'
  );
  perform pg_temp.assert(
    qa_hide_ok,
    'service_role rejects hiding QA'
  );
  perform pg_temp.assert(
    qa_rename_ok,
    'service_role rejects renaming QA'
  );
end
$$;

do $$
declare
  moderator_id uuid := '00000000-0000-0000-0000-000000000101';
  pd_id uuid;
  bad_code text;
  ok boolean;
begin
  select id into pd_id from public.departments where code = 'PD';

  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', moderator_id::text, false);
  set local role authenticated;

  foreach bad_code in array array['pd', 'P D', 'TOOLONG', 'QAX'] loop
    begin
      insert into public.departments (code, name, value, sort_order)
      values (bad_code, 'ไม่ผ่าน', 'ส่งเอง', 30);
      raise exception 'invalid code accepted: %', bad_code;
    exception when check_violation then
      raise notice 'PASS: invalid code rejected: %', bad_code;
    end;
  end loop;

  begin
    insert into public.departments (code, name, value, sort_order)
    values ('ZZ', '   ', 'ส่งเอง', 30);
    raise exception 'blank name accepted';
  exception when check_violation then
    raise notice 'PASS: blank name rejected';
  end;

  begin
    insert into public.departments (code, name, value, sort_order)
    values ('PD', 'ซ้ำ', 'ส่งเอง', 30);
    raise exception 'duplicate code accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate code rejected';
  end;

  begin
    insert into public.departments (code, name, value, sort_order, is_system)
    values ('XX', 'พยายามเป็นระบบ', 'ส่งเอง', 30, true);
    raise exception 'client is_system was accepted';
  exception when insufficient_privilege then
    raise notice 'PASS: client is_system write rejected';
  end;

  insert into public.departments (code, name, value, sort_order)
  values ('XY', 'บังคับค่า', 'ค่าที่ส่งมา', 31);

  set local role postgres;
  select value = 'XY บังคับค่า' into ok
  from public.departments
  where code = 'XY';
  perform pg_temp.assert(
    ok,
    'client value is normalized by trigger'
  );

  set local role authenticated;
  begin
    update public.departments set code = 'PX' where id = pd_id;
    raise exception 'code update was accepted';
  exception when insufficient_privilege or raise_exception then
    if sqlstate = 'P0001' and sqlerrm <> 'Department code cannot be changed' then
      raise;
    end if;
    raise notice 'PASS: code update rejected';
  end;

  begin
    update public.departments set value = 'PD เปลี่ยน' where id = pd_id;
    raise exception 'value update was accepted';
  exception when insufficient_privilege or raise_exception then
    if sqlstate = 'P0001' and sqlerrm <> 'Department value cannot be changed' then
      raise;
    end if;
    raise notice 'PASS: value update rejected';
  end;

  begin
    update public.departments set is_active = false where code = 'QA';
    raise exception 'QA hide was accepted';
  exception when raise_exception then
    if sqlerrm <> 'System department cannot be hidden' then
      raise;
    end if;
    raise notice 'PASS: QA hide rejected';
  end;

  begin
    update public.departments set name = 'QA เปลี่ยน' where code = 'QA';
    raise exception 'QA rename was accepted';
  exception when raise_exception then
    if sqlerrm <> 'System department name cannot be changed' then
      raise;
    end if;
    raise notice 'PASS: QA rename rejected';
  end;

  set local role postgres;
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.jwt.claim.sub', '', false);
end
$$;

do $$
declare
  moderator_id uuid := '00000000-0000-0000-0000-000000000101';
  user_id uuid := '00000000-0000-0000-0000-000000000103';
  hidden_value text := 'TM ทดสอบ';
  ok boolean;
begin
  set local role postgres;
  update public.users set department = hidden_value where id = user_id;

  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', moderator_id::text, false);
  set local role authenticated;
  update public.departments set is_active = false where value = hidden_value;

  set local role postgres;
  select not is_active into ok
  from public.departments
  where value = hidden_value;
  perform pg_temp.assert(ok, 'test department is hidden before validation');

  perform set_config('request.jwt.claim.role', 'service_role', false);
  set local role service_role;

  update public.users set name = 'Departments User Updated' where id = user_id;
  set local role postgres;
  select department = hidden_value into ok
  from public.users
  where id = user_id;
  perform pg_temp.assert(
    ok,
    'other user fields remain editable for hidden department'
  );

  set local role service_role;
  update public.users set department = 'PD ฝ่ายผลิต' where id = user_id;
  set local role postgres;
  select department = 'PD ฝ่ายผลิต' into ok
  from public.users
  where id = user_id;
  perform pg_temp.assert(ok, 'service_role can set an active department');

  set local role service_role;
  select pg_temp.expect_error(
    'update public.users set department = ''TM ทดสอบ'' where id = '''
      || user_id::text || '''::uuid',
    'P0001',
    'Invalid active department'
  )
  into ok;
  set local role postgres;
  perform pg_temp.assert(ok, 'service_role cannot set a hidden department');

  set local role service_role;
  select pg_temp.expect_error(
    'update public.users set department = ''XX ไม่มีจริง'' where id = '''
      || user_id::text || '''::uuid',
    'P0001',
    'Invalid active department'
  )
  into ok;
  set local role postgres;
  perform pg_temp.assert(ok, 'service_role cannot set an unknown department');

  perform set_config('app.user_department_internal', 'on', true);
  update public.users set department = null where id = user_id;
  perform set_config('app.user_department_internal', '', true);
  perform set_config('request.jwt.claim.role', '', false);
end
$$;

do $$
declare
  google_user_id uuid;
begin
  perform set_config('app.user_department_internal', '', true);

  select u.id
  into google_user_id
  from public.users u
  join auth.identities i on i.user_id = u.id
  where i.provider = 'google'
    and u.role = 'user'
    and u.department is null
  limit 1;

  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', google_user_id::text, false);
  set local role authenticated;
  perform public.choose_google_department('PD ฝ่ายผลิต');

  set local role postgres;
  perform pg_temp.assert(
    (select department = 'PD ฝ่ายผลิต' from public.users where id = google_user_id),
    'active department is accepted by choose_google_department'
  );
  perform set_config('app.user_department_internal', 'on', true);
  update public.users set department = null where id = google_user_id;
  perform set_config('app.user_department_internal', '', true);

  set local role authenticated;
  begin
    perform public.choose_google_department('TM ทดสอบ');
    raise exception 'hidden department accepted by choose_google_department';
  exception when raise_exception then
    if sqlerrm <> 'Invalid department' then
      raise;
    end if;
    raise notice 'PASS: hidden department rejected by choose_google_department';
  end;

  set local role postgres;
  perform set_config('app.user_department_internal', 'on', true);
  update public.users set department = null where id = google_user_id;
  perform set_config('app.user_department_internal', '', true);
  set local role authenticated;
  begin
    perform public.choose_google_department('QA ประกันคุณภาพ');
    raise exception 'QA accepted by choose_google_department';
  exception when raise_exception then
    if sqlerrm <> 'Invalid department' then
      raise;
    end if;
    raise notice 'PASS: QA rejected by choose_google_department';
  end;

  set local role postgres;
  perform set_config('app.user_department_internal', 'on', true);
  update public.users set department = null where id = google_user_id;
  perform set_config('app.user_department_internal', '', true);
  set local role authenticated;
  begin
    perform public.choose_google_department('XX ไม่มีจริง');
    raise exception 'unknown department accepted by choose_google_department';
  exception when raise_exception then
    if sqlerrm <> 'Invalid department' then
      raise;
    end if;
    raise notice 'PASS: unknown department rejected by choose_google_department';
  end;

  set local role postgres;
  perform set_config('app.user_department_internal', 'on', true);
  update public.users set department = null where id = google_user_id;
  perform set_config('app.user_department_internal', '', true);
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.jwt.claim.sub', '', false);
end
$$;

-- QA approval remains responsible for assigning the seeded system value.
do $$
declare
  moderator_id uuid := '00000000-0000-0000-0000-000000000101';
  user_id uuid := '00000000-0000-0000-0000-000000000103';
  request_id uuid;
begin
  perform set_config('app.user_department_internal', '', true);

  insert into public.qa_department_requests (user_id)
  values (user_id)
  returning id into request_id;

  perform pg_temp.assert(
    (select department is null from public.users where id = user_id),
    'QA approval fixture starts without a department'
  );

  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', moderator_id::text, false);
  set local role authenticated;
  perform public.review_qa_department_request(request_id, true);
  set local role postgres;
  perform pg_temp.assert(
    (select department = 'QA ประกันคุณภาพ' from public.users where id = user_id),
    'QA approval still assigns the seeded value'
  );
  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.jwt.claim.sub', '', false);
end
$$;

-- Deleting the manager who created a department must not be blocked by
-- the created_by protection: the FK ON DELETE SET NULL has to go through.
do $$
declare
  creator_id uuid := '00000000-0000-0000-0000-000000000105';
  dept_id uuid;
  ok boolean;
begin
  set local role postgres;
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  values (
    creator_id, 'authenticated', 'authenticated',
    'departments-creator@example.test', '', now(), '{}', '{}'
  );
  insert into public.users (id, email, name, role)
  values (
    creator_id,
    'departments-creator@example.test',
    'Departments Creator',
    'moderator'
  );

  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', creator_id::text, false);
  set local role authenticated;
  insert into public.departments (code, name, value, sort_order)
  values ('DL', 'ลบผู้สร้าง', 'ignored', 40)
  returning id into dept_id;

  set local role postgres;
  perform pg_temp.assert(
    (select created_by = creator_id from public.departments where id = dept_id),
    'department records its creator'
  );

  perform set_config('request.jwt.claim.role', 'service_role', false);
  set local role service_role;
  ok := pg_temp.expect_error(
    format(
      'update public.departments set created_by = null where id = %L::uuid',
      dept_id::text
    ),
    'P0001',
    'Department created_by cannot be changed'
  );
  set local role postgres;
  perform pg_temp.assert(
    ok,
    'created_by cannot be cleared while the creator still exists'
  );

  perform set_config('request.jwt.claim.role', '', false);
  perform set_config('request.jwt.claim.sub', '', false);

  delete from auth.users where id = creator_id;

  perform pg_temp.assert(
    not exists (select 1 from public.users where id = creator_id),
    'creator profile is deleted'
  );

  select created_by is null
     and code = 'DL'
     and value = 'DL ลบผู้สร้าง'
     and is_active
  into ok
  from public.departments
  where id = dept_id;
  perform pg_temp.assert(
    ok,
    'deleting the creator clears created_by and keeps the department'
  );
end
$$;

select pg_temp.assert(
  not has_table_privilege('anon', 'public.departments', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no department table privileges'
);

reset role;
rollback;
