-- MVP057 D089: PostgreSQL17 CI isolation for dedicated Whapi HTTPS login.
-- The password MUST stay NULL until a private operator provisions it.
begin;
do $check$
declare
 v_login pg_catalog.pg_roles%rowtype;
 v_members integer;
 v_pwd text;
begin
 select * into v_login from pg_catalog.pg_roles
 where rolname='cotironda_whapi_http_login_d085';
 if not found or not v_login.rolcanlogin or v_login.rolinherit
    or v_login.rolsuper or v_login.rolcreaterole
    or v_login.rolcreatedb or v_login.rolbypassrls
    or v_login.rolreplication or v_login.rolconnlimit<>3
 then raise exception 'd089_login_privileges_invalid';end if;
 select rolpassword into v_pwd from pg_catalog.pg_authid
 where rolname='cotironda_whapi_http_login_d085';
 if v_pwd is not null then raise exception 'd089_unexpected_password';end if;
 select count(*) into v_members from pg_catalog.pg_auth_members m
 join pg_catalog.pg_roles login on login.oid=m.member
 join pg_catalog.pg_roles role on role.oid=m.roleid
 where login.rolname='cotironda_whapi_http_login_d085'
 and role.rolname='cotironda_whapi_http_gateway_d084'
 and not m.inherit_option and m.set_option and not m.admin_option;
 if v_members<>1 then raise exception 'd089_set_role_grant_invalid';end if;
 if (select count(*) from pg_catalog.pg_auth_members m
     join pg_catalog.pg_roles login on login.oid=m.member
     where login.rolname='cotironda_whapi_http_login_d085')<>1
 then raise exception 'd089_extra_role_membership';end if;
 if has_table_privilege('cotironda_whapi_http_login_d085',
     'cotironda_private.rounds_v1','SELECT')
 or has_table_privilege('cotironda_whapi_http_login_d085',
     'cotironda_private.whapi_buyer_inbox_d074','SELECT')
 or has_function_privilege('cotironda_whapi_http_login_d085',
    'cotironda_private.whapi_resolve_buyer_d074(text,text)','EXECUTE')
 then raise exception 'd089_login_inherits_unexpected_privileges';end if;
 if not has_function_privilege('cotironda_whapi_http_gateway_d084',
    'cotironda_private.whapi_resolve_buyer_d074(text,text)','EXECUTE')
 then raise exception 'd089_gateway_missing_expected_execute';end if;
end;$check$;
-- Real switching through role membership, without inheriting any table rights.
set local role cotironda_whapi_http_login_d085;
do $role$
begin
 if pg_catalog.current_user<>'cotironda_whapi_http_login_d085'
 then raise exception 'd089_wrong_login_role';end if;
end;$role$;
set local role cotironda_whapi_http_gateway_d084;
do $gateway$
begin
 if pg_catalog.current_user<>'cotironda_whapi_http_gateway_d084'
 then raise exception 'd089_wrong_gateway_role';end if;
end;$gateway$;
reset role;
rollback;
