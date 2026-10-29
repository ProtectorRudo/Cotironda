-- PostgreSQL CI con JWT simulado, no es verificación criptográfica.
-- PostgREST REAL debe verificar firma y exp antes de asignar claims a request.
begin;
insert into auth.users(id) values
 ('11111111-5555-4555-8555-111111111111'),
 ('22222222-5555-4555-8555-222222222222');

select ci_helpers.assert_true(
 has_function_privilege('authenticated',
   'public.register_company_for_current_user(uuid,text,text,text)','EXECUTE'),
 'solo usuarios authenticated pueden llamar RPC');
select ci_helpers.assert_true(
 not has_function_privilege('anon',
   'public.register_company_for_current_user(uuid,text,text,text)','EXECUTE'),
 'anon sin invocacion');
select ci_helpers.assert_true(
 not has_function_privilege('service_role',
   'public.register_company_for_current_user(uuid,text,text,text)','EXECUTE'),
 'service_role sin invocacion directa');
select ci_helpers.assert_true(
 not has_function_privilege('cotironda_app',
   'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'viejo camino p_user_id revocado');
select ci_helpers.assert_true(
 not has_schema_privilege('cotironda_app','cotironda_private','USAGE'),
 'viejo rol sin schema privado');
select ci_helpers.assert_true(
 (select p.prosecdef and r.rolname='cotironda_registrar' and not r.rolbypassrls
 from pg_proc p join pg_roles r on p.proowner=r.oid
 where p.oid='public.register_company_for_current_user(uuid,text,text,text)'::regprocedure),
 'funcion publica administrada por rol no bypass');

set local role authenticated;

-- Sin JWT ni claims de usuario, siempre rechazado.
do $$
begin
 begin
  perform * from public.register_company_for_current_user(
   'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa','Sin JWT','buyer');
  raise exception 'TEST_FAILED: sin JWT';
 exception when insufficient_privilege then null;
 end;
end $$;

select pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
select pg_catalog.set_config('request.jwt.claim.sub','11111111-5555-4555-8555-111111111111',true);
select pg_catalog.set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":true}',true);
do $$
begin
 begin
   perform * from public.register_company_for_current_user(
    'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa','Anonimo','buyer');
   raise exception 'TEST_FAILED: usuario anonimo';
 exception when insufficient_privilege then null;
 end;
end $$;

select pg_catalog.set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false}',true);
-- La RPC no tiene parámetro p_user_id: se deriva exclusivamente de auth.uid().
select ci_helpers.assert_true(
 (select replay from public.register_company_for_current_user(
  'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa','Empresa Usuario A','buyer'))=false,
 'usuario A registra la empresa');
select ci_helpers.assert_true(
 (select replay from public.register_company_for_current_user(
  'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa','Empresa Usuario A','buyer'))=true,
 'usuario A reintenta sin duplicar');
do $$
begin
 begin
  perform * from public.register_company_for_current_user(
   'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa','Empresa alterada','buyer');
  raise exception 'TEST_FAILED: identificador reutilizado con otros datos';
 exception when unique_violation then null;
 end;
end $$;

-- Un usuario distinto con el mismo request ID crea SU propia empresa.
select pg_catalog.set_config('request.jwt.claim.sub','22222222-5555-4555-8555-222222222222',true);
select ci_helpers.assert_true(
 (select replay from public.register_company_for_current_user(
  'aaaaaaaa-5555-4555-8555-aaaaaaaaaaaa','Empresa Usuario B','buyer'))=false,
 'usuario B se registra bajo su identidad propia');
reset role;
select ci_helpers.assert_true(
 (select count(*) from public.organization_members
 where user_id='11111111-5555-4555-8555-111111111111')=1,
 'A es propietario solo de A');
select ci_helpers.assert_true(
 (select count(*) from public.organization_members
 where user_id='22222222-5555-4555-8555-222222222222')=1,
 'B es propietario solo de B');
select ci_helpers.assert_true(
 (select count(*) from public.organizations
 where display_name in ('Anonimo','Sin JWT','Empresa alterada'))=0,
 'ningun intento invalido persistio');
rollback;
