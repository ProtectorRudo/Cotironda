-- Migracion 10: SQL RLS fail-closed para cargas directas. Fixtures en ROLLBACK.
begin;
insert into auth.users(id,email_confirmed_at,is_anonymous)
values('a1111111-1111-4111-8111-111111111111',now(),false);
insert into auth.sessions(id,user_id,not_after)
values('f1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',null);
insert into public.organizations(id,display_name,organization_type)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Buyer CI fail closed','buyer');
insert into public.organization_members(organization_id,user_id,membership_role,status)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'a1111111-1111-4111-8111-111111111111','owner','active');
select ci_helpers.assert_true(
 (select count(*) from pg_policies where schemaname='storage'
 and tablename='objects'
 and policyname like 'cotironda_buyer_drafts_%')=1,
 'Solo SELECT sobre los borradores privados');
select ci_helpers.assert_true(
 (select count(*) from pg_policies where schemaname='storage'
 and tablename='objects' and policyname='cotironda_buyer_drafts_read_member'
 and cmd='SELECT' and coalesce(qual,'') like '%storage_session_active%')=1,
 'SELECT sigue exigiendo sesión vigente');
-- Solo fixture: insertar metadata en tabla emulada como postgres para
-- probar que la lectura vigente sigue funcionando sin INSERT del cliente.
insert into storage.objects(bucket_id,name) values(
 'cotironda-buyer-drafts',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf');
set local role authenticated;
select set_config('request.jwt.claims',
 '{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f1111111-1111-4111-8111-111111111111"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
select ci_helpers.assert_true(
 (select cotironda_private.storage_session_active())=true,
 'La cuenta propietaria de ensayo tiene sesión válida');
select ci_helpers.assert_true(
 (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=1,
 'No se rompe lectura de archivos existentes para propietario activo');
-- Aunque tenga sesión, sea owner y formato/extensión válidos:
-- INSERT siempre debe ser denegado por RLS.
do $denied$
begin
 begin
  insert into storage.objects(bucket_id,name) values(
   'cotironda-buyer-drafts',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf');
  raise exception 'TEST_FAILED: owner activo pudo saltar cuarentena con INSERT directo';
 exception when insufficient_privilege then null; end;
end;$denied$;
reset role;
select ci_helpers.assert_true(
 (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=1,
 'Intento INSERT denegado no generó registros');
-- JWT anterior deja de ver al eliminar su sesión.
delete from auth.sessions where id='f1111111-1111-4111-8111-111111111111';
set local role authenticated;
select ci_helpers.assert_true(
 (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')=0,
 'La revocación sigue bloqueando SELECT');
reset role;
rollback;
