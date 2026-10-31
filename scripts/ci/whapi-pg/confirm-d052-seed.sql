-- D052 CI seed, ONLY GitHub Actions disposable PostgreSQL17.
-- Inputs: psql -v d052_password=<masked> -v d052_chat_key=<HMAC>
\set ON_ERROR_STOP on
create role cotironda_confirm_d052_ci_login login inherit nobypassrls
 password :'d052_password';
grant cotironda_whapi_gateway to cotironda_confirm_d052_ci_login
 with inherit true,set false,admin false;
grant cotironda_source_gateway to cotironda_confirm_d052_ci_login
 with inherit true,set false,admin false;
grant cotironda_reply_gateway to cotironda_confirm_d052_ci_login
 with inherit true,set false,admin false;
grant cotironda_confirm_gateway to cotironda_confirm_d052_ci_login
 with inherit true,set false,admin false;
grant connect on database cotironda_ci to cotironda_confirm_d052_ci_login;
do $security$
begin
 if exists(select 1 from pg_roles where rolname='cotironda_confirm_d052_ci_login'
  and (rolbypassrls or rolsuper or rolcreaterole or rolcreatedb))
 or not has_function_privilege('cotironda_confirm_d052_ci_login',
  'cotironda_private.whapi_confirm_load_inbox_d051(text,text)','EXECUTE')
 or not has_function_privilege('cotironda_confirm_d052_ci_login',
  'cotironda_private.whapi_confirm_from_inbox_d049(text,text,uuid,uuid,text,text)','EXECUTE')
 or not has_function_privilege('cotironda_confirm_d052_ci_login',
  'cotironda_private.whapi_save_draft_from_inbox_d048(text,text,uuid,integer,jsonb)','EXECUTE')
 or not has_function_privilege('cotironda_confirm_d052_ci_login',
  'cotironda_private.whapi_lease_reply_d047()','EXECUTE')
 or not has_function_privilege('cotironda_confirm_d052_ci_login',
  'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or has_table_privilege('cotironda_confirm_d052_ci_login',
  'cotironda_private.whapi_inbox_v1','SELECT')
 or has_table_privilege('cotironda_confirm_d052_ci_login',
  'cotironda_private.offer_versions_v1','SELECT')
 or has_table_privilege('cotironda_confirm_d052_ci_login',
  'cotironda_private.whapi_reply_jobs_d047','UPDATE')
 then raise exception 'd052_gateway_not_least_privileged';end if;
end;$security$;
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000521','Comprador sintetico D052','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000522','Proveedor sintetico D052','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
values('bbbbbbbb-0000-4000-8000-000000000522','Proveedor sintético',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
values('dddddddd-0000-4000-8000-000000000524',
 'aaaaaaaa-0000-4000-8000-000000000521',
 now()-interval '2 minutes',now()+interval '2 hours');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
values('dddddddd-0000-4000-8000-000000000524',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position)
values('dddddddd-0000-4000-8000-000000000524',
 'bbbbbbbb-0000-4000-8000-000000000522','anon_d052_ci',1);
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at)
values('whapi_d052_ci',:'d052_chat_key',
 'bbbbbbbb-0000-4000-8000-000000000522',
 now()-interval '1 day',now()-interval '1 day');
update cotironda_private.rounds_v1 set status='abierta'
where id='dddddddd-0000-4000-8000-000000000524';
