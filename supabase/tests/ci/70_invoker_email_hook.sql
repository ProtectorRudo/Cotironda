-- Pruebas de separación INVOKER/DEFINER, correo firmado y bloqueo.
begin;
insert into auth.users(id,email_confirmed_at,is_anonymous)
 values ('11111111-7777-4777-8777-111111111111',now(),false),
 ('22222222-7777-4777-8777-222222222222',null,false),
 ('33333333-7777-4777-8777-333333333333',now(),true);

select ci_helpers.assert_true(
 (select not p.prosecdef from pg_proc p
 where p.oid='public.register_company_for_current_user(uuid,text,text,text)'::regprocedure),
 'RPC pública SECURITY INVOKER');
select ci_helpers.assert_true(
 (select p.prosecdef and r.rolname='cotironda_registrar' and not r.rolbypassrls
 from pg_proc p join pg_roles r on r.oid=p.proowner
 where p.oid='cotironda_private.register_company_with_verified_claim(uuid,text,text,text)'::regprocedure),
 'elevación sólo en privado y owner sin BYPASSRLS');
select ci_helpers.assert_true(
 has_function_privilege('authenticated',
 'public.register_company_for_current_user(uuid,text,text,text)','EXECUTE'),
 'authenticated invoca envoltura');
select ci_helpers.assert_true(
 not has_function_privilege('anon',
 'public.register_company_for_current_user(uuid,text,text,text)','EXECUTE'),
 'anon no invoca envoltura');
select ci_helpers.assert_true(
 not has_function_privilege('authenticated',
 'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'authenticated no puede elegir user_id en la función original');
select ci_helpers.assert_true(
 not has_function_privilege('authenticated',
 'cotironda_private.email_verified_access_token(jsonb)','EXECUTE'),
 'hook no invocable por authenticated');
select ci_helpers.assert_true(
 has_function_privilege('supabase_auth_admin',
 'cotironda_private.email_verified_access_token(jsonb)','EXECUTE'),
 'hook sólo ejecutable por el actor Auth');
select ci_helpers.assert_true(
 not has_table_privilege('authenticated','auth.users','SELECT'),
 'identidades Auth no visibles al browser');
select ci_helpers.assert_true(
 not has_table_privilege('authenticated','public.organization_members','INSERT'),
 'sin inserción directa de membresías');
select ci_helpers.assert_true(
 not has_schema_privilege('cotironda_registrar','public','CREATE'),
 'función propietaria no puede crear objetos en public');

-- El hook sólo usa la tabla Auth. No toma confirmación de user_metadata.
select ci_helpers.assert_true(
 (cotironda_private.email_verified_access_token(
 jsonb_build_object('user_id','11111111-7777-4777-8777-111111111111',
  'claims',jsonb_build_object('role','authenticated',
  'user_metadata',jsonb_build_object('email_verified',false)))
 )->'claims'->>'cotironda_email_verified')='true',
 'Auth confirma el correo aunque user_metadata sea falso');
select ci_helpers.assert_true(
 (cotironda_private.email_verified_access_token(
 jsonb_build_object('user_id','22222222-7777-4777-8777-222222222222',
  'claims',jsonb_build_object('user_metadata',
  jsonb_build_object('email_verified',true)))
 )->'claims'->>'cotironda_email_verified')='false',
 'no puede falsificar confirmación editando metadata');
select ci_helpers.assert_true(
 (cotironda_private.email_verified_access_token(
 jsonb_build_object('user_id','33333333-7777-4777-8777-333333333333',
  'claims',jsonb_build_object())
 )->'claims'->>'cotironda_email_verified')='false',
 'no habilita usuarios anónimos aunque haya fecha de confirmación');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"sub":"11111111-7777-4777-8777-111111111111","cotironda_email_verified":true}',true);
select set_config('request.jwt.claim.sub','11111111-7777-4777-8777-111111111111',true);
do $$
begin
 begin
  perform * from public.register_company_for_current_user(
   'aaaaaaaa-7777-4777-8777-aaaaaaaaaaaa','BLOQUEADA','buyer');
  raise exception 'TEST_FAILED: registro permitido con flag false';
 exception when insufficient_privilege then null;
 end;
end;$$;

reset role;
update cotironda_private.registration_settings set enabled=true where singleton=true;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"sub":"22222222-7777-4777-8777-222222222222","cotironda_email_verified":false}',true);
select set_config('request.jwt.claim.sub','22222222-7777-4777-8777-222222222222',true);
do $$
begin
 begin
  perform * from public.register_company_for_current_user(
   'bbbbbbbb-7777-4777-8777-bbbbbbbbbbbb','Correo sin confirmar','buyer');
  raise exception 'TEST_FAILED: no confirmado pudo registrar';
 exception when insufficient_privilege then null;
 end;
end;$$;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"sub":"22222222-7777-4777-8777-222222222222"}',true);
do $$
begin
 begin
  perform * from public.register_company_for_current_user(
   'bbbbbbbb-7777-4777-8777-bbbbbbbbbbbb','Sin claim de correo','buyer');
  raise exception 'TEST_FAILED: falta de claim permitió registro';
 exception when insufficient_privilege then null;
 end;
end;$$;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":true,"sub":"33333333-7777-4777-8777-333333333333","cotironda_email_verified":true}',true);
select set_config('request.jwt.claim.sub','33333333-7777-4777-8777-333333333333',true);
do $$
begin
 begin
  perform * from public.register_company_for_current_user(
   'cccccccc-7777-4777-8777-cccccccccccc','Anonima','buyer');
  raise exception 'TEST_FAILED: anónimo pudo registrar';
 exception when insufficient_privilege then null;
 end;
end;$$;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"sub":"11111111-7777-4777-8777-111111111111","cotironda_email_verified":true}',true);
select set_config('request.jwt.claim.sub','11111111-7777-4777-8777-111111111111',true);
select ci_helpers.assert_true(
 (select replay from public.register_company_for_current_user(
 'dddddddd-7777-4777-8777-dddddddddddd','Empresa comprobada','buyer'))=false,
 'correo verificado permite alta');
select ci_helpers.assert_true(
 (select replay from public.register_company_for_current_user(
 'dddddddd-7777-4777-8777-dddddddddddd','Empresa comprobada','buyer'))=true,
 'idempotencia intacta');
reset role;
select ci_helpers.assert_true(
 (select count(*) from public.organization_members where
 user_id='11111111-7777-4777-8777-111111111111')=1,
 'propietaria A correcta');
select ci_helpers.assert_true(
 (select count(*) from public.organization_members where
 user_id='22222222-7777-4777-8777-222222222222')=0,
 'no confirmado sin empresa');
select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Empresa comprobada')=1,
 'una sola empresa en fixture reversible');
rollback;
