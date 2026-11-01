-- MVP062 D092: isolated quotation receiver identities. PG17 CI only.
begin;
do $check$
declare v record;credential text;member_count integer;
begin
 for v in select * from (values
  ('cotironda_quote_worker_queue_login_d092','cotironda_queue_gateway_d062'),
  ('cotironda_quote_worker_read_login_d092','cotironda_quote_gateway_d061'),
  ('cotironda_quote_worker_write_login_d092','cotironda_price_gateway_d060')
 ) z(login_name,gateway_name) loop
  if not exists(select 1 from pg_catalog.pg_roles r
    where r.rolname=v.login_name and r.rolcanlogin and not r.rolinherit
    and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole
    and not r.rolcreatedb and not r.rolreplication and r.rolconnlimit=2)
  then raise exception 'd092_login_privileges_invalid_%',v.login_name;end if;
  select rolpassword into credential from pg_catalog.pg_authid
   where rolname=v.login_name;
  if credential is not null then raise exception 'd092_password_present';end if;
  select count(*) into member_count from pg_catalog.pg_auth_members m
   join pg_catalog.pg_roles usr on usr.oid=m.member
   join pg_catalog.pg_roles grp on grp.oid=m.roleid
   where usr.rolname=v.login_name and grp.rolname=v.gateway_name
    and m.set_option and not m.inherit_option and not m.admin_option;
  if member_count<>1 or (select count(*) from pg_catalog.pg_auth_members m
   join pg_catalog.pg_roles usr on usr.oid=m.member
   where usr.rolname=v.login_name)<>1
  then raise exception 'd092_membership_invalid';end if;
  if has_table_privilege(v.login_name,'cotironda_private.rounds_v1','SELECT')
   or has_table_privilege(v.login_name,'cotironda_private.whapi_inbox_v1','SELECT')
   or has_function_privilege(v.login_name,
    'cotironda_private.whapi_claim_quote_d062()','EXECUTE')
  then raise exception 'd092_inherits_privileges';end if;
 end loop;
end;$check$;
set local role cotironda_quote_worker_queue_login_d092;
set local role cotironda_queue_gateway_d062;
do $audit$
begin
 if current_user<>'cotironda_queue_gateway_d062'
  or not has_function_privilege(current_user,
   'cotironda_private.whapi_claim_quote_d062()','EXECUTE')
  or not has_function_privilege(current_user,
   'cotironda_private.whapi_finish_quote_d062(text,text,uuid,text)','EXECUTE')
  or has_function_privilege(current_user,
   'cotironda_private.whapi_quote_read_d061(text,text)','EXECUTE')
 then raise exception 'd092_wrong_queue_gateway';end if;
end;$audit$;
reset role;
set local role cotironda_quote_worker_read_login_d092;
set local role cotironda_quote_gateway_d061;
do $audit$
begin
 if current_user<>'cotironda_quote_gateway_d061'
  or not has_function_privilege(current_user,
   'cotironda_private.whapi_quote_read_d061(text,text)','EXECUTE')
  or has_function_privilege(current_user,
   'cotironda_private.whapi_claim_quote_d062()','EXECUTE')
 then raise exception 'd092_wrong_read_gateway';end if;
end;$audit$;
reset role;
set local role cotironda_quote_worker_write_login_d092;
set local role cotironda_price_gateway_d060;
do $audit$
begin
 if current_user<>'cotironda_price_gateway_d060'
  or not has_function_privilege(current_user,
   'cotironda_private.whapi_receive_with_prices_d060(text,text,integer,jsonb,jsonb)','EXECUTE')
  or has_function_privilege(current_user,
   'cotironda_private.whapi_claim_quote_d062()','EXECUTE')
 then raise exception 'd092_wrong_write_gateway';end if;
end;$audit$;
reset role;
rollback;
