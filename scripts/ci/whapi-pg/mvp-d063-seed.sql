-- MVP-013: synthetic only, privileged seed from GitHub Actions ephemeral PG17.
-- -v d063_password=<masked> -v d063_chat_key=<HMAC>, never stored in Git.
\set ON_ERROR_STOP on
create role cotironda_mvp_d063_ci_login login inherit nobypassrls
 password :'d063_password';
grant cotironda_whapi_gateway to cotironda_mvp_d063_ci_login
 with inherit true,set false,admin false;
grant cotironda_quote_gateway_d061 to cotironda_mvp_d063_ci_login
 with inherit true,set false,admin false;
grant cotironda_price_gateway_d060 to cotironda_mvp_d063_ci_login
 with inherit true,set false,admin false;
grant cotironda_queue_gateway_d062 to cotironda_mvp_d063_ci_login
 with inherit true,set false,admin false;
grant connect on database cotironda_ci to cotironda_mvp_d063_ci_login;
do $acl$
begin
 if exists(select 1 from pg_roles
   where rolname='cotironda_mvp_d063_ci_login' and
    (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls))
 or not has_function_privilege('cotironda_mvp_d063_ci_login',
    'cotironda_private.whapi_claim_quote_d062()','EXECUTE')
 or not has_function_privilege('cotironda_mvp_d063_ci_login',
    'cotironda_private.whapi_quote_read_d061(text,text)','EXECUTE')
 or not has_function_privilege('cotironda_mvp_d063_ci_login',
    'cotironda_private.whapi_receive_with_prices_d060(text,text,integer,jsonb,jsonb)','EXECUTE')
 or not has_function_privilege('cotironda_mvp_d063_ci_login',
    'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or has_table_privilege('cotironda_mvp_d063_ci_login',
    'cotironda_private.whapi_inbox_v1','SELECT')
 or has_table_privilege('cotironda_mvp_d063_ci_login',
    'cotironda_private.whapi_quote_queue_d062','UPDATE')
 or has_table_privilege('cotironda_mvp_d063_ci_login',
    'cotironda_private.offer_versions_v1','SELECT')
 then raise exception 'd063_ci_login_not_least_privileged';end if;
end;$acl$;
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0013-4013-8013-000000000631','Comprador ficticio D063','buyer'),
 ('bbbbbbbb-0013-4013-8013-000000000632','Corralon ficticio D063','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
 values('bbbbbbbb-0013-4013-8013-000000000632','Proveedor inventado',true);
insert into auth.users(id,email_confirmed_at,is_anonymous)
 values('11111111-0013-4013-8013-000000000634',now(),false);
insert into auth.sessions(id,user_id,not_after) values
 ('33333333-0013-4013-8013-000000000635',
 '11111111-0013-4013-8013-000000000634',now()+interval '1 day');
insert into public.organization_members(organization_id,user_id,membership_role,status)
 values('aaaaaaaa-0013-4013-8013-000000000631',
 '11111111-0013-4013-8013-000000000634','owner','active');
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values('dddddddd-0013-4013-8013-000000000633',
 'aaaaaaaa-0013-4013-8013-000000000631',
 now()-interval '1 minute',now()+interval '1 hour');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
 values('dddddddd-0013-4013-8013-000000000633',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position)
 values('dddddddd-0013-4013-8013-000000000633',
 'bbbbbbbb-0013-4013-8013-000000000632','anon_corralon_d063',1);
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at)
 values('whapi_d063_ci',:'d063_chat_key',
 'bbbbbbbb-0013-4013-8013-000000000632',
 now()-interval '1 day',now()-interval '1 day');
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0013-4013-8013-000000000633';
