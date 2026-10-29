-- RLS Storage revocación y privilegios post-migración 9 (CI ONLY, full ROLLBACK).
begin;
insert into auth.users(id,email_confirmed_at,is_anonymous) values
('a1111111-1111-4111-8111-111111111111',now(),false),('b2222222-2222-4222-8222-222222222222',now(),false),('c3333333-3333-4333-8333-333333333333',null,false);
insert into auth.sessions(id,user_id,not_after) values
('f1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',null),('f2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222',null),('f3333333-3333-4333-8333-333333333333','c3333333-3333-4333-8333-333333333333',null);
insert into public.organizations(id,display_name,organization_type) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Guard A CI','buyer'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Guard B CI','buyer');
insert into public.organization_members(organization_id,user_id,membership_role,status) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a1111111-1111-4111-8111-111111111111','owner','active'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b2222222-2222-4222-8222-222222222222','owner','active'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c3333333-3333-4333-8333-333333333333','manager','active');
select ci_helpers.assert_true(
 (select p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and p.proconfig @> array['search_path=']
  from pg_proc p where p.oid='cotironda_private.storage_session_active()'::regprocedure),
 'helper privado SEC DEF owner postgres con search_path vacio');
select ci_helpers.assert_true(
 has_function_privilege('authenticated','cotironda_private.storage_session_active()','EXECUTE')
 and not has_function_privilege('anon','cotironda_private.storage_session_active()','EXECUTE')
 and not has_function_privilege('service_role','cotironda_private.storage_session_active()','EXECUTE')
 and not has_function_privilege('authenticated','cotironda_private.is_session_verified(uuid,uuid)','EXECUTE'),
 'solo usuario authenticated puede llamar al gate sin acceder al helper interno');
select ci_helpers.assert_true(
 (select count(*) from pg_policies where schemaname='storage' and tablename='objects'
 and policyname like 'cotironda_buyer_drafts_%')=2,
 'dos políticas Storage conservadas');
select ci_helpers.assert_true(
 (select count(*) from pg_policies where schemaname='storage' and tablename='objects'
 and policyname like 'cotironda_buyer_drafts_%'
 and (coalesce(qual,'') like '%storage_session_active%'
 or coalesce(with_check,'') like '%storage_session_active%'))=2,
 'ambas políticas usan guard de sesión vigente');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f1111111-1111-4111-8111-111111111111"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
-- A vigente
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is true, 'A vigente: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,'A vigente: RLS lectura');
insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf');
reset role;
delete from auth.sessions where id='f1111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f1111111-1111-4111-8111-111111111111"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
-- A revocada aunque JWT no expire
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is false, 'A revocada aunque JWT no expire: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,'A revocada aunque JWT no expire: RLS lectura');
do $deny$ begin
  begin
   insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/99999999-9999-4999-8999-999999999999.pdf');
   raise exception 'TEST_FAILED: A revocada aunque JWT no expire upload';
  exception when insufficient_privilege then null; end;
end;$deny$;
reset role;
insert into auth.sessions(id,user_id,not_after) values('f7777777-7777-4777-8777-777777777777','a1111111-1111-4111-8111-111111111111',null);
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f1111111-1111-4111-8111-111111111111"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
-- JWT antiguo tras re-login
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is false, 'JWT antiguo tras re-login: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,'JWT antiguo tras re-login: RLS lectura');
do $deny$ begin
  begin
   insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/99999999-9999-4999-8999-999999999999.pdf');
   raise exception 'TEST_FAILED: JWT antiguo tras re-login upload';
  exception when insufficient_privilege then null; end;
end;$deny$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f7777777-7777-4777-8777-777777777777"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
-- JWT nueva sesión A
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is true, 'JWT nueva sesión A: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=1,'JWT nueva sesión A: RLS lectura');
insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/99999999-9999-4999-8999-999999999999.pdf');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f2222222-2222-4222-8222-222222222222"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
-- sesion B usada con claim A
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is false, 'sesion B usada con claim A: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,'sesion B usada con claim A: RLS lectura');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"b2222222-2222-4222-8222-222222222222","session_id":"f2222222-2222-4222-8222-222222222222"}',true);
select set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',true);
-- B activa nunca lee A
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is true, 'B activa nunca lee A: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,'B activa nunca lee A: RLS lectura');
insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/ffffffff-ffff-4fff-8fff-ffffffffffff.pdf');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"c3333333-3333-4333-8333-333333333333","session_id":"f3333333-3333-4333-8333-333333333333"}',true);
select set_config('request.jwt.claim.sub','c3333333-3333-4333-8333-333333333333',true);
-- correo no confirmado aunque claim diga true
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is false, 'correo no confirmado aunque claim diga true: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,'correo no confirmado aunque claim diga true: RLS lectura');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":false,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f7777777-7777-4777-8777-777777777777"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
-- claim correo falso
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is false, 'claim correo falso: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,'claim correo falso: RLS lectura');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"sin-uuid"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
-- session_id malformado
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is false, 'session_id malformado: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,'session_id malformado: RLS lectura');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"anon","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f7777777-7777-4777-8777-777777777777"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
-- claim role no autenticado
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is false, 'claim role no autenticado: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,'claim role no autenticado: RLS lectura');
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where id='f7777777-7777-4777-8777-777777777777';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f7777777-7777-4777-8777-777777777777"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
-- session_id not_after vencido
select ci_helpers.assert_true((select cotironda_private.storage_session_active()) is false, 'session_id not_after vencido: sesion helper');
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,'session_id not_after vencido: RLS lectura');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"b2222222-2222-4222-8222-222222222222","session_id":"f2222222-2222-4222-8222-222222222222"}',true);
select set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',true);
select ci_helpers.assert_true(
 (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,
 'anon no lee aunque falsee claims');
reset role;
select ci_helpers.assert_true((select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=3,
 'solo A sesion vieja valida, A sesion nueva y B vigente crearon registros ficticios');
rollback;
