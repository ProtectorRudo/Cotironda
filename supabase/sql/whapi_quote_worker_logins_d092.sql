-- MVP-062 / D092. Disposable PostgreSQL17 CI only, until #175 recovery.
-- Three LOGINs have no password, NOINHERIT, no table privileges and
-- one SET ROLE target each. D062+D061+D060 already own the restricted RPC.
do $roles$
declare v record;
begin
 for v in select * from (values
  ('cotironda_quote_worker_queue_login_d092','cotironda_queue_gateway_d062'),
  ('cotironda_quote_worker_read_login_d092','cotironda_quote_gateway_d061'),
  ('cotironda_quote_worker_write_login_d092','cotironda_original_gateway_d093')
 ) r(login_name,role_name) loop
  execute pg_catalog.format(
   'create role %I login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 2 password null',v.login_name);
  execute pg_catalog.format(
   'grant %I to %I with admin false, inherit false, set true',v.role_name,v.login_name);
  execute pg_catalog.format(
   'alter role %I set statement_timeout=%L',v.login_name,'8s');
  execute pg_catalog.format(
   'alter role %I set lock_timeout=%L',v.login_name,'2s');
  execute pg_catalog.format(
   'alter role %I set idle_in_transaction_session_timeout=%L',v.login_name,'8s');
 end loop;
end;$roles$;
