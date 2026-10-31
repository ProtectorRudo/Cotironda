-- D036: auditoria de esquema CI POST D024–D035, NO SE EJECUTA EN DEV.
-- PG17 descartable; no modifica SQL ni devuelve datos comerciales.
do $guard$
declare
  n integer;
begin
 if (select count(*) from pg_class c
   join pg_namespace ns on ns.oid=c.relnamespace
   where ns.nspname='cotironda_private'
     and c.relname in ('rounds_v1','round_items_v1','round_invites_v1',
      'offer_drafts_v1','offer_events_v1','offer_versions_v1',
      'whapi_contacts_v1','whapi_inbox_v1') and c.relkind='r'
       and c.relrowsecurity)<>8
 then raise exception 'D036_PRIVATE_TABLES_MISSING_RLS';end if;

 if not exists(select 1 from pg_roles where rolname='cotironda_rounds_reader'
    and not rolcanlogin and not rolbypassrls)
 or not exists(select 1 from pg_roles where rolname='cotironda_whapi_gateway'
    and not rolcanlogin and not rolbypassrls)
 or has_schema_privilege('cotironda_rounds_reader','auth','USAGE')
 then raise exception 'D036_CUSTOM_ROLE_LEAST_PRIVILEGE_FAIL';end if;

 if has_table_privilege('authenticated',
      'cotironda_private.whapi_inbox_v1','SELECT')
 or has_table_privilege('authenticated',
      'cotironda_private.rounds_v1','SELECT')
 or has_table_privilege('cotironda_whapi_gateway',
      'cotironda_private.whapi_contacts_v1','SELECT')
 or has_function_privilege('anon',
      'public.buyer_round_overview_v1(uuid)','EXECUTE')
 or has_function_privilege('service_role',
      'public.buyer_round_overview_v1(uuid)','EXECUTE')
 or not has_function_privilege('authenticated',
      'public.buyer_round_overview_v1(uuid)','EXECUTE')
 or (select prosecdef from pg_proc
      where oid='public.buyer_round_overview_v1(uuid)'::regprocedure)
 then raise exception 'D036_DATA_API_LEAST_PRIVILEGE_FAIL';end if;

 if (select pg_get_userbyid(proowner) from pg_proc
     where oid='cotironda_private.is_session_verified(uuid,uuid)'::regprocedure)
     <> 'postgres'
 or not (select prosecdef from pg_proc
     where oid='cotironda_private.is_session_verified(uuid,uuid)'::regprocedure)
 or (select prosecdef from pg_proc
     where oid='cotironda_private.request_user_id_v035()'::regprocedure)
 or not has_function_privilege('cotironda_rounds_reader',
       'cotironda_private.request_user_id_v035()','EXECUTE')
 or has_function_privilege('anon',
       'cotironda_private.request_user_id_v035()','EXECUTE')
 then raise exception 'D036_AUTH_HELPER_REGRESSION';end if;

 if not has_function_privilege('cotironda_whapi_gateway',
   'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or has_function_privilege('authenticated',
   'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 then raise exception 'D036_WHAPI_GATEWAY_GRANTS_FAIL';end if;

 if (select enabled from cotironda_private.registration_settings where singleton=true)
    is not false
 then raise exception 'D036_REGISTRATION_FLAG_MUST_REMAIN_OFF';end if;
 raise notice 'D036_CI_PRIVATE_ROLES_RLS_AND_GRANTS_OK';
end;$guard$;
