-- Pruebas contra PostgreSQL efímero. Datos sólo dentro de ROLLBACK.
begin;
insert into auth.users(id,email_confirmed_at,is_anonymous) values
 ('a9999999-9999-4999-8999-999999999999',now(),false),
 ('b9999999-9999-4999-8999-999999999999',now(),false);
insert into auth.sessions(id,user_id,not_after) values
 ('f9999999-9999-4999-8999-999999999999','a9999999-9999-4999-8999-999999999999',null),
 ('e9999999-9999-4999-8999-999999999999','b9999999-9999-4999-8999-999999999999',null);
select ci_helpers.assert_true(
 not has_table_privilege('authenticated','cotironda_private.registration_attempt_quotas','SELECT')
 and not has_table_privilege('authenticated','cotironda_private.registration_attempt_quotas','UPDATE')
 and not has_table_privilege('anon','cotironda_private.registration_attempt_quotas','SELECT')
 and not has_table_privilege('service_role','cotironda_private.registration_attempt_quotas','SELECT'),
 'cuota no accesible directamente por rol cliente');
select ci_helpers.assert_true(
 not has_function_privilege('authenticated',
 'cotironda_private.consume_registration_attempt(uuid)','EXECUTE'),
 'contador privado sin EXECUTE de clientes');
select ci_helpers.assert_true(
 (select not prosecdef from pg_proc
 where oid='public.register_company_for_current_user(uuid,text,text,text)'::regprocedure),
 'RPC publica sigue SECURITY INVOKER');
select ci_helpers.assert_true(
 (select prosecdef and pg_get_userbyid(proowner)='cotironda_registrar' from pg_proc
 where oid='cotironda_private.register_company_with_verified_claim(uuid,text,text,text)'::regprocedure),
 'funcion privada sigue definer segregada');
-- Cerradura SQL sigue apagada y no escribe contadores.
set local role authenticated;
select set_config('request.jwt.claims',
 '{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a9999999-9999-4999-8999-999999999999","session_id":"f9999999-9999-4999-8999-999999999999"}',true);
select set_config('request.jwt.claim.sub','a9999999-9999-4999-8999-999999999999',true);
do $$
begin
 begin
  perform * from public.register_company_for_current_user(
   'a8888888-8888-4888-8888-888888888888','Empresa prueba','buyer');
  raise exception 'TEST_FAILED: registros habilitados';
 exception when insufficient_privilege then null;
 end;
end;$$;
reset role;
select ci_helpers.assert_true(
 (select count(*) from cotironda_private.registration_attempt_quotas)=0,
 'flag false no gasta contador');
update cotironda_private.registration_settings set enabled=true where singleton=true;
set local role authenticated;
select set_config('request.jwt.claims',
 '{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a9999999-9999-4999-8999-999999999999","session_id":"f9999999-9999-4999-8999-999999999999"}',true);
select set_config('request.jwt.claim.sub','a9999999-9999-4999-8999-999999999999',true);
do $$
declare v_status text;v_replay boolean;v_id uuid;
begin
 select registration_status,replay,organization_id
  into v_status,v_replay,v_id from public.register_company_for_current_user(
  'a8888888-8888-4888-8888-888888888888','Empresa prueba','buyer');
 if v_status <> 'ok' or v_replay is distinct from false or v_id is null then
   raise exception 'TEST_FAILED: alta propia: %',v_status;
 end if;
 select registration_status,replay,organization_id
  into v_status,v_replay,v_id from public.register_company_for_current_user(
  'a8888888-8888-4888-8888-888888888888','Empresa prueba','buyer');
 if v_status <> 'ok' or v_replay is distinct from true then
   raise exception 'TEST_FAILED: replay propio: %',v_status;
 end if;
 select registration_status into v_status from public.register_company_for_current_user(
  'a8888888-8888-4888-8888-888888888888','Nombre diferente','buyer');
 if v_status <> 'idempotency_conflict' then raise exception 'TEST_FAILED: conflicto: %',v_status;end if;
 -- El nombre inválido genera error interno del alta que SE ATRAPA; el
 -- contador de intentos no debe revertirse.
 select registration_status into v_status from public.register_company_for_current_user(
  'a7777777-7777-4777-8777-777777777777','X','buyer');
 if v_status <> 'invalid_request' then raise exception 'TEST_FAILED: invalido: %',v_status;end if;
 -- Llegar a 20 peticiones: 4 anteriores + 16 inválidas.
 for i in 1..16 loop
  select registration_status into v_status from public.register_company_for_current_user(
   'a7777777-7777-4777-8777-777777777777','X','buyer');
  if v_status <> 'invalid_request' then raise exception 'TEST_FAILED: petición % / %',i,v_status;end if;
 end loop;
 select registration_status into v_status from public.register_company_for_current_user(
  'a8888888-8888-4888-8888-888888888888','Empresa prueba','buyer');
 if v_status <> 'rate_limited' then raise exception 'TEST_FAILED: intento 21: %',v_status;end if;
 select registration_status into v_status from public.register_company_for_current_user(
  'a8888888-8888-4888-8888-888888888888','Empresa prueba','buyer');
 if v_status <> 'rate_limited' then raise exception 'TEST_FAILED: tope saturado: %',v_status;end if;
end;$$;
reset role;
select ci_helpers.assert_true(
 (select request_count from cotironda_private.registration_attempt_quotas
 where user_id='a9999999-9999-4999-8999-999999999999')=21,
 'contador llega a 21 y se satura aun con fallos de negocio');
select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Empresa prueba')=1,
 'sólo un alta del usuario A');
-- Distinta identidad tiene su propia cuota.
set local role authenticated;
select set_config('request.jwt.claims',
 '{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"b9999999-9999-4999-8999-999999999999","session_id":"e9999999-9999-4999-8999-999999999999"}',true);
select set_config('request.jwt.claim.sub','b9999999-9999-4999-8999-999999999999',true);
select ci_helpers.assert_true(
 (select registration_status from public.register_company_for_current_user(
  'b8888888-8888-4888-8888-888888888888','Empresa B','buyer'))='ok',
 'usuario B no consume cuota de A');
reset role;
select ci_helpers.assert_true(
 (select request_count from cotironda_private.registration_attempt_quotas
 where user_id='b9999999-9999-4999-8999-999999999999')=1,
 'cuota B independiente');
-- Restauración de ventana sin borrar historial, manteniendo límites.
update cotironda_private.registration_attempt_quotas
 set window_started_at=now()-interval '61 minutes'
 where user_id='a9999999-9999-4999-8999-999999999999';
set local role authenticated;
select set_config('request.jwt.claims',
 '{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a9999999-9999-4999-8999-999999999999","session_id":"f9999999-9999-4999-8999-999999999999"}',true);
select set_config('request.jwt.claim.sub','a9999999-9999-4999-8999-999999999999',true);
select ci_helpers.assert_true(
 (select registration_status from public.register_company_for_current_user(
  'a8888888-8888-4888-8888-888888888888','Empresa prueba','buyer'))='ok',
 'cuota se reinicia 60 minutos después');
reset role;
select ci_helpers.assert_true(
 (select request_count from cotironda_private.registration_attempt_quotas
 where user_id='a9999999-9999-4999-8999-999999999999')=1,
 'ventana reiniciada exactamente a un intento');
-- Sesión revocada: se cuenta el intento y NO se registra nueva empresa.
delete from auth.sessions where id='f9999999-9999-4999-8999-999999999999';
set local role authenticated;
select set_config('request.jwt.claims',
 '{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"a9999999-9999-4999-8999-999999999999","session_id":"f9999999-9999-4999-8999-999999999999"}',true);
select ci_helpers.assert_true(
 (select registration_status from public.register_company_for_current_user(
  'a6666666-6666-4666-8666-666666666666','Empresa revocada','buyer'))='session_invalid',
 'sesión revocada bloqueada y contabilizada');
reset role;
select ci_helpers.assert_true(
 (select request_count from cotironda_private.registration_attempt_quotas
 where user_id='a9999999-9999-4999-8999-999999999999')=2,
 'sesión revocada también consume intento');
select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Empresa revocada')=0,
 'sesión revocada no crea empresa');
rollback;
