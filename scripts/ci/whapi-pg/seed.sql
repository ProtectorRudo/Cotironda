-- D031: SOLO PostgreSQL 17 efímero CI; usuarios e invitaciones ficticios.
-- psql -v ci_password=... -v chat_key_b=... -v chat_key_c=...
\set ON_ERROR_STOP on
create role cotironda_whapi_ci_login login inherit nobypassrls
 password :'ci_password';
grant cotironda_whapi_gateway to cotironda_whapi_ci_login
 with inherit true,set false,admin false;
grant connect on database cotironda_ci to cotironda_whapi_ci_login;

-- Rol CI sin SELECT ni DML de tablas privadas ni privilegios ampliados.
do $gate$ begin
 if (select rolbypassrls or rolsuper or rolcreaterole or rolcreatedb
   from pg_roles where rolname='cotironda_whapi_ci_login')
 or not has_function_privilege('cotironda_whapi_ci_login',
    'cotironda_private.whapi_inbox_record_v1(text,text,text,text,text,bytea,bytea,bytea,bigint)','EXECUTE')
 or has_table_privilege('cotironda_whapi_ci_login',
    'cotironda_private.whapi_inbox_v1','SELECT')
 or has_table_privilege('cotironda_whapi_ci_login',
    'cotironda_private.whapi_contacts_v1','UPDATE')
 then raise exception 'CI_LOGIN_MUST_BE_EXECUTE_ONLY'; end if;
end;$gate$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000501','Buyer CI','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000502','Supplier B CI','supplier'),
 ('cccccccc-0000-4000-8000-000000000503','Supplier C CI','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('bbbbbbbb-0000-4000-8000-000000000502','CI B',true),
 ('cccccccc-0000-4000-8000-000000000503','CI C',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
values ('dddddddd-0000-4000-8000-000000000504',
 'aaaaaaaa-0000-4000-8000-000000000501',
 now()-interval '3 minutes',now()+interval '2 hours');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
values ('dddddddd-0000-4000-8000-000000000504',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1(round_id,supplier_org_id,anon_id,invite_position)
values ('dddddddd-0000-4000-8000-000000000504',
 'bbbbbbbb-0000-4000-8000-000000000502','anon_ci_b',1);
insert into cotironda_private.whapi_contacts_v1
(channel_id,chat_key,supplier_org_id,verified_at,consented_at) values
('whapi_ci',:'chat_key_b','bbbbbbbb-0000-4000-8000-000000000502',
 now()-interval '1 day',now()-interval '1 day'),
('whapi_ci',:'chat_key_c','cccccccc-0000-4000-8000-000000000503',
 now()-interval '1 day',now()-interval '1 day');
update cotironda_private.rounds_v1 set status='abierta'
where id='dddddddd-0000-4000-8000-000000000504';
