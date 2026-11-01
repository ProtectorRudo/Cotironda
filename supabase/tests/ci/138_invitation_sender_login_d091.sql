-- D091: sender LOGIN must have no password or inherited grants.
-- Only six EXECUTE RPCs are allowed after a deliberate SET ROLE.
begin;
do $audit$
declare v record;members int;pwd text;cmd text;
begin
 select * into v from pg_catalog.pg_roles
 where rolname='cotironda_invite_sender_login_d091';
 if not found or not v.rolcanlogin or v.rolinherit or v.rolsuper or
  v.rolcreaterole or v.rolcreatedb or v.rolbypassrls or
  v.rolreplication or v.rolconnlimit<>2 then
  raise exception 'd091_login_privilege_failure';end if;
 select rolpassword into pwd from pg_catalog.pg_authid
 where rolname='cotironda_invite_sender_login_d091';
 if pwd is not null then raise exception 'd091_login_has_password';end if;
 select count(*) into members from pg_catalog.pg_auth_members m
 join pg_catalog.pg_roles a on a.oid=m.member
 join pg_catalog.pg_roles b on b.oid=m.roleid
 where a.rolname='cotironda_invite_sender_login_d091'
 and b.rolname='cotironda_invite_sender_gateway_d091'
 and m.set_option and not m.inherit_option and not m.admin_option;
 if members<>1 or (select count(*) from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles a on a.oid=m.member
  where a.rolname='cotironda_invite_sender_login_d091')<>1 then
  raise exception 'd091_login_membership_failure';end if;
 if has_table_privilege('cotironda_invite_sender_login_d091',
    'cotironda_private.whapi_invite_jobs_d070','SELECT') or
    has_table_privilege('cotironda_invite_sender_login_d091',
    'cotironda_private.rounds_v1','SELECT') then
   raise exception 'd091_direct_data_access';end if;
 -- Do not inherit the endpoint rights without SET ROLE:
 if has_function_privilege('cotironda_invite_sender_login_d091',
  'cotironda_private.whapi_claim_invite_d070()','EXECUTE')
 then raise exception 'd091_login_inherits_rpc';end if;
end;$audit$;
set local role cotironda_invite_sender_login_d091;
do $identity$
begin
 if current_user<>'cotironda_invite_sender_login_d091'
 then raise exception 'd091_login_user_invalid';end if;
end;$identity$;
set local role cotironda_invite_sender_gateway_d091;
do $allowed$
declare allowed text;denied text;
begin
 if current_user<>'cotironda_invite_sender_gateway_d091'
 then raise exception 'd091_role_set_failure';end if;
 foreach allowed in array array[
  'cotironda_private.whapi_claim_invite_d070()',
  'cotironda_private.whapi_fail_preflight_invite_d070(uuid,uuid)',
  'cotironda_private.whapi_begin_invite_d070(uuid,uuid)',
  'cotironda_private.whapi_authorize_invite_d070(uuid,text,text)',
  'cotironda_private.whapi_finish_invite_d070(uuid,uuid,text,text)',
  'cotironda_private.whapi_read_recipient_packet_d068(uuid,uuid,text,text)'
 ] loop
  if not has_function_privilege(current_user,allowed,'EXECUTE')
   then raise exception 'd091_missing_function_%',allowed;end if;
 end loop;
 foreach denied in array array[
  'cotironda_private.whapi_prepare_invite_d070(uuid,uuid,text,text)',
  'cotironda_private.whapi_sweep_invite_d070()',
  'cotironda_private.whapi_prepare_commercial_round_d071(uuid,text)',
  'cotironda_private.whapi_claim_buyer_d082(text)'
 ] loop
  if has_function_privilege(current_user,denied,'EXECUTE')
   then raise exception 'd091_unexpected_rpc_%',denied;end if;
 end loop;
 if has_table_privilege(current_user,
  'cotironda_private.whapi_invite_jobs_d070','SELECT')
 then raise exception 'd091_gateway_table_permission';end if;
end;$allowed$;
reset role;
rollback;
