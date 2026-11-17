-- Department catalogue and soft-delete management.

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  value text not null unique,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  constraint departments_code_format
    check (code ~ '^[A-Z0-9]{2,6}$'),
  constraint departments_name_not_blank
    check (btrim(name) <> ''),
  constraint departments_name_length
    check (char_length(name) <= 60),
  constraint departments_non_qa_code
    check (is_system or code not like 'QA%')
);

alter table public.departments enable row level security;

revoke all on table public.departments from public, anon, authenticated;

grant select on table public.departments to authenticated;
grant insert (code, name, value, sort_order)
  on table public.departments to authenticated;
grant update (name, sort_order, is_active)
  on table public.departments to authenticated;

create policy departments_select_authenticated
on public.departments
for select
to authenticated
using (true);

create policy departments_insert_manager
on public.departments
for insert
to authenticated
with check (public.is_user_manager());

create policy departments_update_manager
on public.departments
for update
to authenticated
using (public.is_user_manager())
with check (public.is_user_manager());

insert into public.departments
  (code, name, value, is_active, is_system, sort_order)
values
  ('QA', 'ประกันคุณภาพ', 'QA ประกันคุณภาพ', true, true, 1),
  ('PD', 'ฝ่ายผลิต', 'PD ฝ่ายผลิต', true, false, 2),
  ('WH', 'คลังสินค้า', 'WH คลังสินค้า', true, false, 3),
  ('VD', 'ผลิตยาสัตว์', 'VD ผลิตยาสัตว์', true, false, 4)
on conflict do nothing;

create or replace function public.protect_department_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.is_system := false;
    new.value := new.code || ' ' || btrim(new.name);
    new.created_by := auth.uid();
    new.updated_at := now();
    return new;
  end if;

  -- FK cleanup from public.users ON DELETE SET NULL: allow clearing
  -- created_by only after the creator row is really gone and nothing
  -- else in the row changed.
  if old.created_by is not null
     and new.created_by is null
     and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by')
     and not exists (
       select 1
       from public.users u
       where u.id = old.created_by
     )
  then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'Department ID cannot be changed';
  end if;

  if new.code is distinct from old.code then
    raise exception 'Department code cannot be changed';
  end if;

  if new.value is distinct from old.value then
    raise exception 'Department value cannot be changed';
  end if;

  if new.is_system is distinct from old.is_system then
    raise exception 'Department system flag cannot be changed';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'Department created_at cannot be changed';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'Department created_by cannot be changed';
  end if;

  if old.is_system then
    if new.is_active is distinct from true then
      raise exception 'System department cannot be hidden';
    end if;

    if new.name is distinct from old.name then
      raise exception 'System department name cannot be changed';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

create trigger trg_protect_department_fields
before insert or update on public.departments
for each row
execute function public.protect_department_fields();

create or replace function public.validate_user_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.department is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.department is not distinct from old.department then
    return new;
  end if;

  if not exists (
    select 1
    from public.departments d
    where d.value = new.department
      and d.is_active = true
  ) then
    raise exception 'Invalid active department';
  end if;

  return new;
end;
$function$;

create trigger trg_validate_user_department
before insert or update of department on public.users
for each row
execute function public.validate_user_department();

create or replace function public.choose_google_department(
  p_department text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_department text;
begin
  if coalesce(auth.role(), '') <> 'authenticated'
     or auth.uid() is null
  then
    raise exception 'Authentication required';
  end if;

  if not public.is_current_user_google_account() then
    raise exception 'Google account required';
  end if;

  select role, department
  into v_role, v_department
  from public.users
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  if v_role <> 'user' then
    raise exception 'Only user accounts can choose a department';
  end if;

  if v_department is not null then
    raise exception 'Department has already been selected';
  end if;

  if not exists (
    select 1
    from public.departments d
    where d.value = p_department
      and d.is_active = true
      and d.is_system = false
  ) then
    raise exception 'Invalid department';
  end if;

  perform set_config(
    'app.user_department_internal',
    'on',
    true
  );

  update public.users
  set department = p_department
  where id = auth.uid();
end;
$function$;

revoke all
on function public.choose_google_department(text)
from public, anon;

grant execute
on function public.choose_google_department(text)
to authenticated;
