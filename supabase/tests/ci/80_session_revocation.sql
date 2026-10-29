-- Solo fixtures CI/rollback. Todos los UUID y sesiones son artificiales.
begin;
insert into auth.users(id,email_confirmed_at,is_anonymous)
values ('a1111111-1111-4111-8111-111111111111',now(),false),
('b2222222-2222-4222-8222-222222222222',null,false),
('c3333333-3333-4333-8333-333333333333',now(),false),
('d4444444-4444-4444-8444-444444444444',now(),true),
('e5555555-5555-4555-8555-555555555555',now(),false);
insert into auth.sessions(id,user_id,not_after) values
('f1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',null),
('f2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222',null),
('f3333333-3333-4333-8333-333333333333','c3333333-3333-4333-8333-333333333333',now()-interval '1 day'),
('f4444444-4444-4444-8444-444444444444','d4444444-4444-4444-8444-444444444444',null),
('f5555555-5555-4555-8555-555555555555','e5555555-5555-4555-8555-555555555555',null);

select ci_helpers.assert_true(
 (select p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
  from pg_proc p where p.oid='cotironda_private.is_session_verified(uuid,uuid)'::regprocedure),
 'helper booleana es privada, propietaria postgres');
select ci_helpers.assert_true(
 not has_function_privilege('authenticated',
 'cotironda_private.is_session_verified(uuid,uuid)','EXECUTE')
 and not has_function_privilege('anon',
 'cotironda_private.is_session_verified(uuid,uuid)','EXECUTE')
 and not has_function_privilege('service_role',
 'cotironda_private.is_session_verified(uuid,uuid)','EXECUTE'),
 'ningun cliente puede ejecutar consulta de sesiones');
select ci_helpers.assert_true(
 has_function_privilege('cotironda_registrar',
 'cotironda_private.is_session_verified(uuid,uuid)','EXECUTE'),
 'solo registrar privado puede consultar helper');
select ci_helpers.assert_true(
 cotironda_private.is_session_verified(
 'a1111111-1111-4111-8111-111111111111','f1111111-1111-4111-8111-111111111111'),
 'sesión activa verificada');
select ci_helpers.assert_true(
 not cotironda_private.is_session_verified(
 'b2222222-2222-4222-8222-222222222222','f2222222-2222-4222-8222-222222222222'),
 'correo sin confirmar bloqueado');
select ci_helpers.assert_true(
 not cotironda_private.is_session_verified(
 'a1111111-1111-4111-8111-111111111111','f2222222-2222-4222-8222-222222222222'),
 'session id de otra persona bloqueado');
select ci_helpers.assert_true(
 not cotironda_private.is_session_verified(
 'c3333333-3333-4333-8333-333333333333','f3333333-3333-4333-8333-333333333333'),
 'sesión no-after vencida bloqueada');
select ci_helpers.assert_true(
 not cotironda_private.is_session_verified(
 'd4444444-4444-4444-8444-444444444444','f4444444-4444-4444-8444-444444444444'),
 'sesión anónima bloqueada');
update auth.users set banned_until=now()+interval '1 day'
where id='e5555555-5555-4555-8555-555555555555';
select ci_helpers.assert_true(
 not cotironda_private.is_session_verified(
 'e5555555-5555-4555-8555-555555555555','f5555555-5555-4555-8555-555555555555'),
 'cuenta suspendida bloqueada');
update auth.users set banned_until=null,deleted_at=now()
where id='e5555555-5555-4555-8555-555555555555';
select ci_helpers.assert_true(
 not cotironda_private.is_session_verified(
 'e5555555-5555-4555-8555-555555555555','f5555555-5555-4555-8555-555555555555'),
 'cuenta eliminada bloqueada');
delete from auth.sessions where id='f1111111-1111-4111-8111-111111111111';
select ci_helpers.assert_true(
 not cotironda_private.is_session_verified(
 'a1111111-1111-4111-8111-111111111111','f1111111-1111-4111-8111-111111111111'),
 'sesión revocada bloqueada');

-- Con el flag solo encendido dentro de ROLLBACK, el JWT firmado simulado
-- no permite registro si falta session_id o si sesión fue revocada.
update cotironda_private.registration_settings set enabled=true where singleton=true;
set local role authenticated;
select set_config('request.jwt.claims',
'{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
do $$
begin
 begin
  perform * from public.register_company_for_current_user(
   'f6666666-6666-4666-8666-666666666666','No session','buyer');
  raise exception 'TEST_FAILED: falta de session_id permitió alta';
 exception when insufficient_privilege then null;
 end;
end;$$;
select set_config('request.jwt.claims',
'{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f1111111-1111-4111-8111-111111111111"}',true);
do $$
begin
 begin
  perform * from public.register_company_for_current_user(
   'f6666666-6666-4666-8666-666666666666','Session revoked','buyer');
  raise exception 'TEST_FAILED: sesión borrada permitió alta';
 exception when insufficient_privilege then null;
 end;
end;$$;
reset role;
rollback;
