-- MVP-060 / D090 — Five isolated SQL login identities for the buyer worker.
-- CI-only until #175 backup+restore is verified. No credentials included.
-- Exactly ONE SET ROLE target per login, no direct table/data API access.
do $create$
declare
 x record;
begin
 for x in select * from (values
  ('cola','cotironda_buyer_worker_cola_login_d090','cotironda_buyer_queue_gateway_d082'),
  ('lectura','cotironda_buyer_worker_lectura_login_d090','cotironda_buyer_gateway_d076'),
  ('zona','cotironda_buyer_worker_zona_login_d090','cotironda_buyer_zone_gateway_d077'),
  ('ronda','cotironda_buyer_worker_ronda_login_d090','cotironda_whapi_round_gateway_d081'),
  ('invitacion','cotironda_buyer_worker_invite_login_d090','cotironda_invite_gateway_d070')
 ) v(port,login_name,role_name) loop
  execute pg_catalog.format(
   'create role %I login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 2 password null',x.login_name);
  execute pg_catalog.format(
   'grant %I to %I with admin false, inherit false, set true',
   x.role_name,x.login_name);
  execute pg_catalog.format(
   'alter role %I set statement_timeout = %L',x.login_name,'8s');
  execute pg_catalog.format(
   'alter role %I set lock_timeout = %L',x.login_name,'2s');
  execute pg_catalog.format(
   'alter role %I set idle_in_transaction_session_timeout = %L',
   x.login_name,'8s');
  execute pg_catalog.format(
   'comment on role %I is %L',x.login_name,
   'MVP060: private dedicated buyer worker '||x.port||
   ', password NULL until private provisioning, SET ROLE only own gateway');
 end loop;
end;$create$;
