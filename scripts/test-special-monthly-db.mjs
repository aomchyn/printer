// Runs the REAL migration against a disposable database on a fixed local-only socket.
// Start an isolated PostgreSQL instance there first. Never uses application .env files.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
const socket = '/tmp/printer-special-monthly-socket';
const database = `special_monthly_test_${Date.now()}`;
const args = ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', '55439', '-U', userInfo().username];
function sql(text, db = database) {
  return execFileSync('psql', [...args, '-d', db], { input: text, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}
const baseline = readFileSync('supabase/migrations/20260821051320_security_hardening_20260821.sql', 'utf8');
const rename = readFileSync('supabase/migrations/20260825090000_restore_manager_fgcode_rename.sql', 'utf8');
function table(name) {
  const result = baseline.match(new RegExp(`create table "public"\\."${name}" \\([\\s\\S]*?\\n\\);`));
  if (!result) throw new Error(`Missing baseline table ${name}`);
  return result[0];
}
function fn(source, name) {
  const result = source.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`, 'i'));
  if (!result) throw new Error(`Missing baseline function ${name}`);
  return result[0];
}
const policies = [...baseline.matchAll(/create policy "[^"]+" on "public"\."(?:fgcode|paper_reports|paper_transactions|orders)"[\s\S]*?;/gi)].map((m) => m[0]).join('\n');
const baselineTableGrants = [...baseline.matchAll(/(?:revoke|grant)[^;]+;/g)]
  .map((m) => m[0]).filter((statement) => ['fgcode','paper_reports','paper_transactions','orders','audit_logs'].some((t) => statement.includes(`on table "public"."${t}"`))).join('\n');
const fixture = `
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres SUPERUSER; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
SET ROLE postgres;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE TABLE public.users(id uuid PRIMARY KEY, role text);
GRANT SELECT ON public.users TO authenticated;
${fn(baseline, 'is_user_manager')}
${fn(baseline, 'is_user_moderator')}
${['fgcode','paper_reports','paper_transactions','orders','audit_logs'].map(table).join('\n')}
ALTER TABLE public.fgcode ADD COLUMN expiry_offset_days integer NOT NULL DEFAULT 0, ADD COLUMN printing_config jsonb;
${fn(rename, 'protect_fgcode_fields')}
${fn(readFileSync('supabase/migrations/20260825030000_add_product_expiry_printing_audit.sql','utf8'),'audit_fgcode_write')}
CREATE TRIGGER trg_protect_fgcode_fields BEFORE INSERT OR UPDATE ON public.fgcode FOR EACH ROW EXECUTE FUNCTION public.protect_fgcode_fields();
CREATE TRIGGER trg_audit_fgcode_write AFTER INSERT OR UPDATE ON public.fgcode FOR EACH ROW EXECUTE FUNCTION public.audit_fgcode_write();
${['fgcode','paper_reports','paper_transactions','orders'].map(t=>`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`).join('\n')}
${policies}
${baselineTableGrants}
-- Reproduce the baseline's FINAL broad defaults for the feature's NEW objects.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE paper_reports_id_seq TO authenticated;
INSERT INTO users VALUES ('00000000-0000-0000-0000-000000000001','moderator'),('00000000-0000-0000-0000-000000000002','assistant_moderator'),('00000000-0000-0000-0000-000000000003','user'),('00000000-0000-0000-0000-000000000004','admin');
INSERT INTO fgcode(id,name,exp) VALUES ('CARD','Test card','12'),('BROCHUREA4','Test brochure','12'),('OTHER','Private Product','12'),('OTHER2','Second Product','12');
INSERT INTO paper_reports(id,lot_number,product_id,department,paper_type,target_a3,good_a3,waste_a3,report_type,created_by)
VALUES (90000,'old','BROCHUREA4','test','130 แกรม',99,10,1,'MANUAL','test');
`;
try {
  sql(`CREATE DATABASE "${database}";`, 'postgres');
  sql(fixture);
  // Applying here is confined to the newly created disposable LOCAL test database.
  sql('SET ROLE postgres;\n' + readFileSync('supabase/migrations/20260911000000_add_special_job_paper_reports.sql','utf8'));
  process.stdout.write(sql(readFileSync('supabase/tests/special_job_paper_reports.sql','utf8')));
} finally {
  sql(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`, 'postgres');
}
