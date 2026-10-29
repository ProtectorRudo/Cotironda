-- SOLO para PostgreSQL 17 efímero en GitHub Actions: NUNCA Supabase dev ni producción.
-- Este fixture abre el registro únicamente en cotironda_ci_http y solo usa IDs sintéticos.
begin;
do $guard$
begin
 if current_database() <> 'cotironda_ci_http'
   or (select enabled from cotironda_private.registration_settings where singleton=true) is distinct from false
   or (select count(*) from auth.users) <> 0
   or (select count(*) from auth.sessions) <> 0
   or (select count(*) from public.organizations) <> 0
   or (select count(*) from cotironda_private.registration_attempt_quotas) <> 0
 then raise exception 'http_ci_database_not_isolated'; end if;
end;
$guard$;
insert into auth.users (id,email_confirmed_at,is_anonymous) values
 ('a1111111-1111-4111-8111-111111111111',now(),false),
 ('b2222222-2222-4222-8222-222222222222',now(),false);
insert into auth.sessions (id,user_id,not_after) values
 ('f1111111-1111-4111-8111-111111111111',
  'a1111111-1111-4111-8111-111111111111',null),
 ('f2222222-2222-4222-8222-222222222222',
  'b2222222-2222-4222-8222-222222222222',null);
update cotironda_private.registration_settings set enabled=true where singleton=true;
commit;
