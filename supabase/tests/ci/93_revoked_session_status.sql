-- Test posterior a migración 7, solo fixtures CI con ROLLBACK. Todos los UUID y sesiones son artificiales.
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

-- Contrato SQL actualizado tras migración 7: la RPC responde status estructurado.
-- Habilitación SOLO transaccional en PostgreSQL efímero; ROLLBACK al finalizar.
update cotironda_private.registration_settings set enabled=true where singleton=true;
-- JWT sin session_id
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
do $test$
declare v_status text; v_org uuid; v_replay boolean;
begin
 select registration_status,organization_id,replay into v_status,v_org,v_replay
 from public.register_company_for_current_user('f6666666-6666-4666-8666-666666666661','Empresa de prueba solamente','buyer');
 if v_status is distinct from 'session_invalid'
  or v_org is not null or v_replay is not null then
  raise exception 'TEST_FAILED: JWT sin session_id esperaba session_invalid, obtuvo %',v_status;
 end if;
end;
$test$;
reset role;
select ci_helpers.assert_true((select count(*) from public.organization_members where user_id='a1111111-1111-4111-8111-111111111111')<=1 and (select count(*) from public.organization_members where user_id='c3333333-3333-4333-8333-333333333333')=0,'JWT rechazado no crea miembros de ensayo adicionales');
-- JWT sesión ya revocada
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f1111111-1111-4111-8111-111111111111"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
do $test$
declare v_status text; v_org uuid; v_replay boolean;
begin
 select registration_status,organization_id,replay into v_status,v_org,v_replay
 from public.register_company_for_current_user('f6666666-6666-4666-8666-666666666662','Empresa de prueba solamente','buyer');
 if v_status is distinct from 'session_invalid'
  or v_org is not null or v_replay is not null then
  raise exception 'TEST_FAILED: JWT sesión ya revocada esperaba session_invalid, obtuvo %',v_status;
 end if;
end;
$test$;
reset role;
select ci_helpers.assert_true((select count(*) from public.organization_members where user_id='a1111111-1111-4111-8111-111111111111')<=1 and (select count(*) from public.organization_members where user_id='c3333333-3333-4333-8333-333333333333')=0,'JWT rechazado no crea miembros de ensayo adicionales');
-- Cuenta A inicia otra sesión distinta de la previamente revocada.
insert into auth.sessions(id,user_id,not_after) values ('f7777777-7777-4777-8777-777777777777','a1111111-1111-4111-8111-111111111111',null);
-- login nuevo permite registro de prueba
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f7777777-7777-4777-8777-777777777777"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
do $test$
declare v_status text; v_org uuid; v_replay boolean;
begin
 select registration_status,organization_id,replay into v_status,v_org,v_replay
 from public.register_company_for_current_user('f8888888-8888-4888-8888-888888888888','Empresa de prueba solamente','buyer');
 if v_status is distinct from 'ok'
  or v_org is null or v_replay is distinct from false then
  raise exception 'TEST_FAILED: login nuevo permite registro de prueba esperaba ok, obtuvo %',v_status;
 end if;
end;
$test$;
reset role;
-- mismo request id es idempotente
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f7777777-7777-4777-8777-777777777777"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
do $test$
declare v_status text; v_org uuid; v_replay boolean;
begin
 select registration_status,organization_id,replay into v_status,v_org,v_replay
 from public.register_company_for_current_user('f8888888-8888-4888-8888-888888888888','Empresa de prueba solamente','buyer');
 if v_status is distinct from 'ok'
  or v_org is null or v_replay is distinct from true then
  raise exception 'TEST_FAILED: mismo request id es idempotente esperaba ok, obtuvo %',v_status;
 end if;
end;
$test$;
reset role;
-- JWT revocado NO revive tras otro login
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f1111111-1111-4111-8111-111111111111"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
do $test$
declare v_status text; v_org uuid; v_replay boolean;
begin
 select registration_status,organization_id,replay into v_status,v_org,v_replay
 from public.register_company_for_current_user('f6666666-6666-4666-8666-666666666663','Empresa de prueba solamente','buyer');
 if v_status is distinct from 'session_invalid'
  or v_org is not null or v_replay is not null then
  raise exception 'TEST_FAILED: JWT revocado NO revive tras otro login esperaba session_invalid, obtuvo %',v_status;
 end if;
end;
$test$;
reset role;
select ci_helpers.assert_true((select count(*) from public.organization_members where user_id='a1111111-1111-4111-8111-111111111111')<=1 and (select count(*) from public.organization_members where user_id='c3333333-3333-4333-8333-333333333333')=0,'JWT rechazado no crea miembros de ensayo adicionales');
-- session_id de otra persona
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a1111111-1111-4111-8111-111111111111","session_id":"f2222222-2222-4222-8222-222222222222"}',true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
do $test$
declare v_status text; v_org uuid; v_replay boolean;
begin
 select registration_status,organization_id,replay into v_status,v_org,v_replay
 from public.register_company_for_current_user('f6666666-6666-4666-8666-666666666664','Empresa de prueba solamente','buyer');
 if v_status is distinct from 'session_invalid'
  or v_org is not null or v_replay is not null then
  raise exception 'TEST_FAILED: session_id de otra persona esperaba session_invalid, obtuvo %',v_status;
 end if;
end;
$test$;
reset role;
select ci_helpers.assert_true((select count(*) from public.organization_members where user_id='a1111111-1111-4111-8111-111111111111')<=1 and (select count(*) from public.organization_members where user_id='c3333333-3333-4333-8333-333333333333')=0,'JWT rechazado no crea miembros de ensayo adicionales');
-- session_id not_after caducado
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"c3333333-3333-4333-8333-333333333333","session_id":"f3333333-3333-4333-8333-333333333333"}',true);
select set_config('request.jwt.claim.sub','c3333333-3333-4333-8333-333333333333',true);
do $test$
declare v_status text; v_org uuid; v_replay boolean;
begin
 select registration_status,organization_id,replay into v_status,v_org,v_replay
 from public.register_company_for_current_user('f6666666-6666-4666-8666-666666666665','Empresa de prueba solamente','buyer');
 if v_status is distinct from 'session_invalid'
  or v_org is not null or v_replay is not null then
  raise exception 'TEST_FAILED: session_id not_after caducado esperaba session_invalid, obtuvo %',v_status;
 end if;
end;
$test$;
reset role;
select ci_helpers.assert_true((select count(*) from public.organization_members where user_id='a1111111-1111-4111-8111-111111111111')<=1 and (select count(*) from public.organization_members where user_id='c3333333-3333-4333-8333-333333333333')=0,'JWT rechazado no crea miembros de ensayo adicionales');
-- A hizo seis intentos, C uno; denegaciones también consumen cuota.
select ci_helpers.assert_true(
 (select request_count from cotironda_private.registration_attempt_quotas where user_id='a1111111-1111-4111-8111-111111111111')=6
 and (select request_count from cotironda_private.registration_attempt_quotas where user_id='c3333333-3333-4333-8333-333333333333')=1,
 'denegaciones consumen cuota y no permiten saltar limites por usuario');
select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Empresa de prueba solamente')=1 and
 (select count(*) from public.organization_members where user_id='a1111111-1111-4111-8111-111111111111')=1,
 'solo la sesion NUEVA valida registro una empresa de ensayo');
rollback;
