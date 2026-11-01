-- MVP-018 D067: two fictitious suppliers + one D064 buyer round.
-- Tested against Node/PG17 service in CI; never Supabase DEV.
begin;
do $security$
begin
 if not exists(select 1 from pg_roles
   where rolname='cotironda_scope_guard_d067'
     and not rolcanlogin and not rolinherit and not rolbypassrls)
 or has_function_privilege('anon',
    'cotironda_private.reject_foreign_quote_lines_d067()','EXECUTE')
 or has_function_privilege('authenticated',
    'cotironda_private.reject_foreign_quote_lines_d067()','EXECUTE')
 or has_function_privilege('service_role',
    'cotironda_private.reject_foreign_quote_lines_d067()','EXECUTE')
 or has_table_privilege('cotironda_scope_guard_d067',
   'cotironda_private.whapi_inbox_v1','SELECT')
 or has_table_privilege('cotironda_scope_guard_d067',
   'cotironda_private.offer_versions_v1','INSERT')
 or (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc
    where oid='cotironda_private.reject_foreign_quote_lines_d067()'::regprocedure)
    <>'cotironda_scope_guard_d067'
 then raise exception 'd067_scope_guard_permissions_insecure';end if;
end;$security$;

insert into auth.users(id,email_confirmed_at,is_anonymous)
 values('11111111-0018-4018-8018-000000000681',now(),false);
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0018-4018-8018-000000000682','Buyer demo D067','buyer'),
 ('bbbbbbbb-0018-4018-8018-000000000683','Corralon demo D067','supplier'),
 ('bbbbbbbb-0018-4018-8018-000000000684','Pintureria demo D067','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('bbbbbbbb-0018-4018-8018-000000000683','Corralon D067',true),
 ('bbbbbbbb-0018-4018-8018-000000000684','Pintureria D067',true);
insert into public.supplier_categories(organization_id,category_code,is_enabled) values
 ('bbbbbbbb-0018-4018-8018-000000000683','corralon',true),
 ('bbbbbbbb-0018-4018-8018-000000000684','pintureria',true);
insert into public.supplier_delivery_areas(organization_id,province,city,is_enabled) values
 ('bbbbbbbb-0018-4018-8018-000000000683','Buenos Aires','La Plata',true),
 ('bbbbbbbb-0018-4018-8018-000000000684','Buenos Aires','La Plata',true);
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at) values
 ('d067_ci',repeat('a',64),'bbbbbbbb-0018-4018-8018-000000000683',
    now()-interval '1 day',now()-interval '1 day'),
 ('d067_ci',repeat('b',64),'bbbbbbbb-0018-4018-8018-000000000684',
    now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values('dddddddd-0018-4018-8018-000000000685',
  'aaaaaaaa-0018-4018-8018-000000000682',
  now()-interval '1 minute',now()+interval '45 minutes');
insert into cotironda_private.round_items_v1
 (round_id,line_no,product_code,quantity,unit) values
 ('dddddddd-0018-4018-8018-000000000685',1,'cemento_018',10,'bag'),
 ('dddddddd-0018-4018-8018-000000000685',2,'pintura_018',5,'l');
insert into cotironda_private.round_requests_d064
 (round_id,buyer_org_id,created_by,request_key,content_sha256,
  delivery_zone,buyer_iva_request) values
 ('dddddddd-0018-4018-8018-000000000685',
  'aaaaaaaa-0018-4018-8018-000000000682',
  '11111111-0018-4018-8018-000000000681',
  'cccccccc-0018-4018-8018-000000000686',repeat('c',64),
  'La Plata','no_especificado');
insert into cotironda_private.delivery_localities_d065(alias_key,province,city)
 values('la plata','Buenos Aires','La Plata');
insert into cotironda_private.item_rubros_d065(product_code,category_code)
 values('cemento_018','corralon'),('pintura_018','pintureria');
-- D080: prove real declared catalog matching even in old D067 quote-scope tests.
insert into public.supplier_products
 (id,organization_id,category_code,product_name,unit_code) values
 ('eeeeeeee-0018-4018-8018-000000000683',
  'bbbbbbbb-0018-4018-8018-000000000683','corralon','Cemento CPC 50 kg','bag'),
 ('eeeeeeee-0018-4018-8018-000000000684',
  'bbbbbbbb-0018-4018-8018-000000000684','pintureria','Pintura latex','l');
insert into cotironda_private.supplier_catalog_capabilities_d080
 (catalog_product_id,product_code,fingerprint_sha256)
 select id,case when category_code='corralon' then 'cemento_018'
                else 'pintura_018' end,
  cotironda_private.catalog_fingerprint_d080(id)
 from public.supplier_products
 where id in(
  'eeeeeeee-0018-4018-8018-000000000683'::uuid,
  'eeeeeeee-0018-4018-8018-000000000684'::uuid);
set local role cotironda_match_gateway_d065;
do $prepare$
declare p jsonb;
begin
 p:=cotironda_private.prepare_supplier_invites_d065(
  'dddddddd-0018-4018-8018-000000000685','d067_ci');
 if p->>'state'<>'prepared' or p->>'invited'<>'2' or p->>'messagesSent'<>'0'
 then raise exception 'd067_matcher_wrong_%',p;end if;
end;$prepare$;
reset role;
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0018-4018-8018-000000000685';

insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,payload_fingerprint,
  kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
select 'd067_ci',repeat(m.mid,64),repeat(m.chat,64),
  m.supplier,'dddddddd-0018-4018-8018-000000000685',
  repeat(m.mid,64),'text',decode(repeat('66',32),'hex'),
  decode(repeat('11',12),'hex'),decode(repeat('22',16),'hex'),1793455000
from (values
 ('1','a','bbbbbbbb-0018-4018-8018-000000000683'::uuid),
 ('2','b','bbbbbbbb-0018-4018-8018-000000000684'::uuid)
) m(mid,chat,supplier);

set local role cotironda_quote_gateway_d061;
do $read$
declare c jsonb;p jsonb;
begin
 c:=cotironda_private.whapi_quote_read_d061('d067_ci',repeat('1',64));
 p:=cotironda_private.whapi_quote_read_d061('d067_ci',repeat('2',64));
 if c is null or p is null or jsonb_array_length(c->'roundItems')<>1
 or jsonb_array_length(p->'roundItems')<>1
 or c->'roundItems'->0->>'itemId'<>'cemento_018'
 or c->'roundItems'->0->>'line_no'<>'1'
 or p->'roundItems'->0->>'itemId'<>'pintura_018'
 or p->'roundItems'->0->>'line_no'<>'2'
 or c ? 'supplierName' or p ? 'supplierName'
 then raise exception 'd067_interpreter_out_of_scope_%_%',c,p;end if;
end;$read$;
reset role;

do $quotes$
declare
 v_wrong jsonb:='{"currency":"ARS","payment_method":null,"lead_days":null,
 "freight_gross":null,"min_goods_gross":null,
 "lines_snapshot":[{"line_no":2,"unit":"l","available_qty":"5",
 "net_unit_price":null,"vat_rate":null}]}'::jsonb;
 v_good jsonb:='{"currency":"ARS","payment_method":null,"lead_days":null,
 "freight_gross":null,"min_goods_gross":null,
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":null,"vat_rate":null}]}'::jsonb;
 v_price_wrong jsonb:='[{"line_no":2,"quoted_unit_price":"123.00",
 "vat_basis":"no_informado","source_line_no":1,
 "source_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb;
 v_price_good jsonb:='[{"line_no":1,"quoted_unit_price":"121.00",
 "vat_basis":"no_informado","source_line_no":1,
 "source_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb;
 v_err text;v_blocked boolean:=false;v_result jsonb;
begin
 -- The direct D060 gateway MUST ALSO reject the wrong rubro: no trust in AI.
 begin
  perform cotironda_private.whapi_receive_with_prices_d060(
    'd067_ci',repeat('1',64),0,v_wrong,v_price_wrong);
 exception when others then
   get stacked diagnostics v_err=returned_sqlstate;
   if v_err<>'42501' then raise exception 'd067_wrong_failure_%',v_err;end if;
   v_blocked:=true;
 end;
 if not v_blocked then raise exception 'd067_wrong_rubro_written';end if;
 v_result:=cotironda_private.whapi_receive_with_prices_d060(
   'd067_ci',repeat('1',64),0,v_good,v_price_good);
 if v_result->>'version'<>'1' then raise exception 'd067_good_quote_not_saved';end if;
 -- Same source may be replayed with same evidence, no extra version.
 v_result:=cotironda_private.whapi_receive_with_prices_d060(
   'd067_ci',repeat('1',64),0,v_good,v_price_good);
 if v_result->>'repeated'<>'true' then raise exception 'd067_replay_duplicate';end if;
 if (select count(*) from cotironda_private.offer_versions_v1
   where round_id='dddddddd-0018-4018-8018-000000000685')<>1
 then raise exception 'd067_false_version_created';end if;
 if (select count(*) from cotironda_private.whapi_reply_jobs_d047
   where round_id='dddddddd-0018-4018-8018-000000000685')<>0
 then raise exception 'd067_confirmo_outbox';end if;
end;$quotes$;
update cotironda_private.whapi_contacts_v1
 set opted_out_at=now() where channel_id='d067_ci'
 and supplier_org_id='bbbbbbbb-0018-4018-8018-000000000684';
set local role cotironda_quote_gateway_d061;
do $optout$
begin
 if cotironda_private.whapi_quote_read_d061('d067_ci',repeat('2',64))
  is not null then raise exception 'd067_baja_cannot_read';end if;
end;$optout$;
reset role;
rollback;
