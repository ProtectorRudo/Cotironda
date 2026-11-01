-- MVP-050 / D084 — PostgreSQL17 isolated CI, no DEV credentials or WhatsApp.
begin;
do $security$ begin
 if not exists(select 1 from pg_catalog.pg_roles
  where rolname='cotironda_whapi_http_gateway_d084'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not has_schema_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private','USAGE')
 or has_schema_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private','CREATE')
 or has_table_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_buyer_inbox_d074','SELECT')
 or has_table_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_buyer_contacts_d074','SELECT')
 or has_table_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_inbox_v1','SELECT')
 or has_table_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.rounds_v1','INSERT')
 or has_table_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_buyer_jobs_d082','UPDATE')
 or has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_buyer_read_d076(text,text)','EXECUTE')
 or has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_zone_context_d077(text,text)','EXECUTE')
 or has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_create_buyer_round_d081(text,text,text,text,uuid,text,text,jsonb)','EXECUTE')
 or has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_claim_buyer_d082(text)','EXECUTE')
 or has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_inbox_record_v1(text,text,text,text,text,bytea,bytea,bytea,bigint)','EXECUTE')
 then raise exception 'd084_excessive_gateway_permissions';end if;
end;$security$;

do $allowed$ begin
 if not has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_resolve_active_contact_v1(text,text)','EXECUTE')
 or not has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or not has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_record_optout_v1(text,text,text,text,bigint)','EXECUTE')
 or not has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_resolve_buyer_d074(text,text)','EXECUTE')
 or not has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_record_buyer_d074(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or not has_function_privilege('cotironda_whapi_http_gateway_d084',
  'cotironda_private.whapi_buyer_optout_d074(text,text,text,text,bigint)','EXECUTE')
 then raise exception 'd084_six_required_rpcs_missing';end if;
end;$allowed$;

-- Simulate an eventual private technical login (NO password/keys, CI rollback).
-- The only inherited grants are D084's six RPCs.
create role cotironda_whapi_http_login_fixture_d084 login inherit nobypassrls;
grant cotironda_whapi_http_gateway_d084
 to cotironda_whapi_http_login_fixture_d084
 with inherit true,set false;
do $member$ begin
 if not has_function_privilege('cotironda_whapi_http_login_fixture_d084',
  'cotironda_private.whapi_resolve_buyer_d074(text,text)','EXECUTE')
 or has_function_privilege('cotironda_whapi_http_login_fixture_d084',
  'cotironda_private.whapi_claim_buyer_d082(text)','EXECUTE')
 or has_table_privilege('cotironda_whapi_http_login_fixture_d084',
  'cotironda_private.whapi_buyer_inbox_d074','SELECT')
 then raise exception 'd084_login_membership_wrong';end if;
end;$member$;

set local role cotironda_whapi_http_login_fixture_d084;
do $actual$ declare v_supplier jsonb;v_buyer jsonb;begin
 v_supplier:=cotironda_private.whapi_resolve_active_contact_v1(
  'd084_ci',repeat('a',64));
 v_buyer:=cotironda_private.whapi_resolve_buyer_d074(
  'd084_ci',repeat('a',64));
 if v_supplier is not null or v_buyer is not null
 then raise exception 'd084_unknown_contact_accepted';end if;
 -- The gateway can only resolve identities via narrowly audited functions;
 -- it cannot read any private tables, even with a valid caller identity.
 begin
  perform count(*) from cotironda_private.whapi_buyer_inbox_d074;
  raise exception 'd084_direct_buyer_inbox_read_allowed';
 exception when insufficient_privilege then null;
 end;
 begin
  perform cotironda_private.whapi_claim_buyer_d082('d084_ci');
  raise exception 'd084_worker_exec_allowed';
 exception when insufficient_privilege then null;
 end;
 begin
  perform count(*) from cotironda_private.whapi_contacts_v1;
  raise exception 'd084_direct_supplier_contact_read_allowed';
 exception when insufficient_privilege then null;
 end;
end;$actual$;
reset role;
rollback;
