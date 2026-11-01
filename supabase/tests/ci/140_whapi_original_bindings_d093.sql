-- MVP-064: transactional, immutable original-source anchor for quotes.
-- Disposable PostgreSQL17 CI with synthetic businesses, no Whapi sends.
begin;
do $privileges$
begin
 if not (select relrowsecurity from pg_catalog.pg_class
  where oid='cotironda_private.whapi_original_bindings_d093'::regclass)
  or has_table_privilege('anon','cotironda_private.whapi_original_bindings_d093','SELECT')
  or has_table_privilege('authenticated','cotironda_private.whapi_original_bindings_d093','SELECT')
  or has_table_privilege('service_role','cotironda_private.whapi_original_bindings_d093','SELECT')
  or has_table_privilege('cotironda_original_gateway_d093',
    'cotironda_private.whapi_original_bindings_d093','SELECT')
  or has_function_privilege('anon',
    'cotironda_private.whapi_receive_with_original_d093(text,text,integer,jsonb,jsonb,jsonb)','EXECUTE')
  or has_function_privilege('service_role',
    'cotironda_private.whapi_receive_with_original_d093(text,text,integer,jsonb,jsonb,jsonb)','EXECUTE')
  or not has_function_privilege('cotironda_original_gateway_d093',
    'cotironda_private.whapi_receive_with_original_d093(text,text,integer,jsonb,jsonb,jsonb)','EXECUTE')
 then raise exception 'd093_acl_failure';end if;
end;$privileges$;
insert into public.organizations(id,display_name,organization_type)
 values('aaaaaaaa-0093-4093-8093-000000000001','Buyer D093','buyer'),
 ('bbbbbbbb-0093-4093-8093-000000000001','Proveedor D093','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
 values('bbbbbbbb-0093-4093-8093-000000000001','Corralon D093',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values('dddddddd-0093-4093-8093-000000000001',
 'aaaaaaaa-0093-4093-8093-000000000001',
 pg_catalog.clock_timestamp()-interval '2 minutes',
 pg_catalog.clock_timestamp()+interval '2 hours');
insert into cotironda_private.round_items_v1
 (round_id,line_no,product_code,quantity,unit)
 values('dddddddd-0093-4093-8093-000000000001',1,'cemento_001',20,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position)
 values('dddddddd-0093-4093-8093-000000000001',
 'bbbbbbbb-0093-4093-8093-000000000001','anon_93',1);
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0093-4093-8093-000000000001';
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at)
 values('d093_ci',repeat('a',64),
 'bbbbbbbb-0093-4093-8093-000000000001',
 pg_catalog.clock_timestamp()-interval '1 day',
 pg_catalog.clock_timestamp()-interval '1 day');
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,
  payload_fingerprint,kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
 select 'd093_ci',repeat(x.v,64),repeat('a',64),
 'bbbbbbbb-0093-4093-8093-000000000001'::uuid,
 'dddddddd-0093-4093-8093-000000000001'::uuid,
 repeat(x.v,64),'text',pg_catalog.decode(repeat('66',32),'hex'),
 pg_catalog.decode(repeat('11',12),'hex'),pg_catalog.decode(repeat('22',16),'hex'),
 1800000000
 from (values('1'),('2')) x(v);
do $fidelity$
declare
 v_quote jsonb:='{"currency":"ARS","payment_method":null,"lead_days":null,
  "freight_gross":null,"min_goods_gross":null,
  "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"20",
   "net_unit_price":null,"vat_rate":null}]}'::jsonb;
 v_prices jsonb:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
  'line_no',1,'quoted_unit_price','9500.00','vat_basis','no_informado',
  'source_line_no',1,'source_sha256',repeat('d',64)));
 v_manifest jsonb:=pg_catalog.jsonb_build_object(
  'source_text_sha256',repeat('c',64),'source_bytes',310,'source_lines',6,
  'total_status','explicitamente_verificado',
  'total_source',pg_catalog.jsonb_build_object(
   'line_no',6,'literal_sha256',repeat('e',64)));
 v_result jsonb;
 v_cipher text;
 v_failed boolean;
begin
 -- The source has SIX lines including pallets, empty bolsones, freight,
 -- discount and the provider's total; only ONE matches buyer's cement.
 v_result:=cotironda_private.whapi_receive_with_original_d093(
  'd093_ci',repeat('1',64),0,v_quote,v_prices,v_manifest);
 if v_result->>'original_preserved'<>'true'
  or v_result->>'original_encrypted'<>'true'
  or v_result->>'repeated'<>'false' then
  raise exception 'd093_first_write_failed_%',v_result;end if;
 select pg_catalog.encode(pg_catalog.sha256(
  payload_ciphertext||payload_nonce||payload_tag),'hex') into v_cipher
 from cotironda_private.whapi_inbox_v1
 where channel_id='d093_ci' and message_key=repeat('1',64);
 if not exists(select 1 from cotironda_private.whapi_original_bindings_d093
  where channel_id='d093_ci' and message_key=repeat('1',64)
   and round_id='dddddddd-0093-4093-8093-000000000001'
   and supplier_org_id='bbbbbbbb-0093-4093-8093-000000000001'
   and offer_version=1 and source_lines=6
   and source_bytes=310 and source_text_sha256=repeat('c',64)
   and encrypted_source_sha256=v_cipher
   and total_status='explicitamente_verificado'
   and total_source_line=6 and total_literal_sha256=repeat('e',64))
 then raise exception 'd093_source_or_total_missing';end if;
 -- SQL repeat: identical identity/version/manifest returns SAME version.
 v_result:=cotironda_private.whapi_receive_with_original_d093(
  'd093_ci',repeat('1',64),0,v_quote,v_prices,v_manifest);
 if v_result->>'repeated'<>'true' or v_result->>'version'<>'1' then
  raise exception 'd093_replay_not_idempotent';end if;
 -- Tampering with original hash/total after a committed write rejected.
 v_failed:=false;
 begin
 perform cotironda_private.whapi_receive_with_original_d093(
  'd093_ci',repeat('1',64),0,v_quote,v_prices,
  pg_catalog.jsonb_set(v_manifest,'{source_text_sha256}',
    pg_catalog.to_jsonb(repeat('a',64))));
 exception when others then v_failed:=true;
 end;
 if not v_failed then raise exception 'd093_replay_mutation_accepted';end if;
 -- Invalid manifest fails before D060 (no offer version, no receipt).
 v_failed:=false;
 begin
 perform cotironda_private.whapi_receive_with_original_d093(
  'd093_ci',repeat('2',64),1,v_quote,v_prices,
  pg_catalog.jsonb_set(v_manifest,'{total_source,line_no}','12'::jsonb));
 exception when others then v_failed:=true;
 end;
 if not v_failed then raise exception 'd093_invalid_total_accepted';end if;
 if exists(select 1 from cotironda_private.whapi_received_offers_d059
  where channel_id='d093_ci' and message_key=repeat('2',64)) then
  raise exception 'd093_invalid_manifest_committed_offer';end if;
 -- Missing/absent total is permitted and not fabricated.
 v_result:=cotironda_private.whapi_receive_with_original_d093(
  'd093_ci',repeat('2',64),1,v_quote,v_prices,
  pg_catalog.jsonb_set(pg_catalog.jsonb_set(v_manifest,
   '{total_status}','"no_detectado"'::jsonb),
   '{total_source}','null'::jsonb));
 if v_result->>'version'<>'2' then raise exception 'd093_second_version';end if;
 if (select count(*) from cotironda_private.whapi_original_bindings_d093
  where round_id='dddddddd-0093-4093-8093-000000000001')<>2
 then raise exception 'd093_corrections_overwrite';end if;
 -- Mutation/delete of a stored original/version strictly forbidden.
 v_failed:=false;
 begin update cotironda_private.whapi_original_bindings_d093
  set source_lines=1 where message_key=repeat('1',64);
 exception when others then v_failed:=true;end;
 if not v_failed then raise exception 'd093_mutation_allowed';end if;
 v_failed:=false;
 begin delete from cotironda_private.whapi_original_bindings_d093
  where message_key=repeat('1',64);
 exception when others then v_failed:=true;end;
 if not v_failed then raise exception 'd093_delete_allowed';end if;
end;$fidelity$;
rollback;
