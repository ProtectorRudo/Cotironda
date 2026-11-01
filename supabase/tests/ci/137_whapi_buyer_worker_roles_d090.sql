-- MVP-060 D090: five role-specific LOGIN identities, zero password and
-- zero direct data grants. PostgreSQL17 disposable CI only.
begin;
do $audit$
declare
 x record;
 v_role record;
 v_password text;
 v_members integer;
begin
 for x in select * from (values
  ('cotironda_buyer_worker_cola_login_d090','cotironda_buyer_queue_gateway_d082'),
  ('cotironda_buyer_worker_lectura_login_d090','cotironda_buyer_gateway_d076'),
  ('cotironda_buyer_worker_zona_login_d090','cotironda_buyer_zone_gateway_d077'),
  ('cotironda_buyer_worker_ronda_login_d090','cotironda_whapi_round_gateway_d081'),
  ('cotironda_buyer_worker_invite_login_d090','cotironda_invite_gateway_d070')
 ) v(login_name,role_name) loop
  select r.rolname,r.rolcanlogin,r.rolsuper,r.rolinherit,
   r.rolcreaterole,r.rolcreatedb,r.rolbypassrls,r.rolreplication,
   r.rolconnlimit into v_role
  from pg_catalog.pg_roles r where r.rolname=x.login_name;
  if not found or not v_role.rolcanlogin or v_role.rolsuper or
     v_role.rolinherit or v_role.rolcreaterole or v_role.rolcreatedb or
     v_role.rolbypassrls or v_role.rolreplication or v_role.rolconnlimit<>2
  then raise exception 'mvp060_invalid_login_%',x.login_name;end if;
  select rolpassword into v_password from pg_catalog.pg_authid
  where rolname=x.login_name;
  if v_password is not null
  then raise exception 'mvp060_password_not_null';end if;
  select count(*) into v_members
  from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles r on r.oid=m.member
  join pg_catalog.pg_roles g on g.oid=m.roleid
  where r.rolname=x.login_name and g.rolname=x.role_name
    and m.set_option and not m.inherit_option and not m.admin_option;
  if v_members<>1 or
   (select count(*) from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles r on r.oid=m.member
    where r.rolname=x.login_name)<>1
  then raise exception 'mvp060_login_role_membership';end if;
  if has_table_privilege(x.login_name,
      'cotironda_private.rounds_v1','SELECT')
   or has_table_privilege(x.login_name,
      'cotironda_private.whapi_buyer_inbox_d074','SELECT')
  then raise exception 'mvp060_direct_table_privilege';end if;
 end loop;
end;$audit$;
set local role cotironda_buyer_worker_cola_login_d090;
do $role$ begin
 if current_user<>'cotironda_buyer_worker_cola_login_d090'
 then raise exception 'mvp060_cola_login_invalid';end if; end;$role$;
set local role cotironda_buyer_queue_gateway_d082;
do $gateway$ begin
 if current_user<>'cotironda_buyer_queue_gateway_d082'
 then raise exception 'mvp060_cola_gateway_invalid';end if; end;$gateway$;
reset role;
set local role cotironda_buyer_worker_lectura_login_d090;
set local role cotironda_buyer_gateway_d076;
do $gateway$ begin
 if current_user<>'cotironda_buyer_gateway_d076'
 then raise exception 'mvp060_lectura_gateway_invalid';end if; end;$gateway$;
reset role;
set local role cotironda_buyer_worker_zona_login_d090;
set local role cotironda_buyer_zone_gateway_d077;
do $gateway$ begin
 if current_user<>'cotironda_buyer_zone_gateway_d077'
 then raise exception 'mvp060_zona_gateway_invalid';end if; end;$gateway$;
reset role;
set local role cotironda_buyer_worker_ronda_login_d090;
set local role cotironda_whapi_round_gateway_d081;
do $gateway$ begin
 if current_user<>'cotironda_whapi_round_gateway_d081'
 then raise exception 'mvp060_ronda_gateway_invalid';end if; end;$gateway$;
reset role;
set local role cotironda_buyer_worker_invite_login_d090;
set local role cotironda_invite_gateway_d070;
do $gateway$ begin
 if current_user<>'cotironda_invite_gateway_d070'
 then raise exception 'mvp060_invite_gateway_invalid';end if; end;$gateway$;
reset role;
rollback;
