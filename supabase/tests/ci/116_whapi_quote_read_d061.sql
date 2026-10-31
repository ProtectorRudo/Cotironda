-- D061 / MVP-011: read encrypted inbox and trusted round item snapshot.
-- PostgreSQL 17 disposable CI, all fictitious, ROLLBACK.
begin;
do $acl$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_quote_reader_d061'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not exists(select 1 from pg_roles where rolname='cotironda_quote_gateway_d061'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or has_function_privilege('anon',
   'cotironda_private.whapi_quote_read_d061(text,text)','EXECUTE')
 or has_function_privilege('authenticated',
   'cotironda_private.whapi_quote_read_d061(text,text)','EXECUTE')
 or has_function_privilege('service_role',
   'cotironda_private.whapi_quote_read_d061(text,text)','EXECUTE')
 or not has_function_privilege('cotironda_quote_gateway_d061',
   'cotironda_private.whapi_quote_read_d061(text,text)','EXECUTE')
 or has_table_privilege('cotironda_quote_gateway_d061',
   'cotironda_private.whapi_inbox_v1','SELECT')
 or has_table_privilege('cotironda_quote_reader_d061',
   'cotironda_private.whapi_price_lines_d060','SELECT')
 or (select pg_get_userbyid(proowner) from pg_proc
  where oid='cotironda_private.whapi_quote_read_d061(text,text)'::regprocedure)
    <>'cotironda_quote_reader_d061'
 then raise exception 'd061_inbox_security_failed';end if;
end;$acl$;
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0011-4011-8011-000000000611','Comprador CI','buyer'),
 ('bbbbbbbb-0011-4011-8011-000000000612','Corralón CI','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
values('bbbbbbbb-0011-4011-8011-000000000612','Corralón CI',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values('dddddddd-0011-4011-8011-000000000613',
 'aaaaaaaa-0011-4011-8011-000000000611',
 now()-interval '1 minute',now()+interval '45 minutes');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
 values('dddddddd-0011-4011-8011-000000000613',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
(round_id,supplier_org_id,anon_id,invite_position)
 values('dddddddd-0011-4011-8011-000000000613',
 'bbbbbbbb-0011-4011-8011-000000000612','anon_cemento_d061',1);
update cotironda_private.rounds_v1 set status='abierta'
where id='dddddddd-0011-4011-8011-000000000613';
insert into cotironda_private.whapi_contacts_v1
(channel_id,chat_key,supplier_org_id,verified_at,consented_at)
values('d061_ci',repeat('a',64),'bbbbbbbb-0011-4011-8011-000000000612',
 now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,payload_fingerprint,
  kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
select 'd061_ci',repeat(v.id,64),repeat('a',64),
 'bbbbbbbb-0011-4011-8011-000000000612'::uuid,
 'dddddddd-0011-4011-8011-000000000613'::uuid,
 repeat(v.id,64),'text',decode(repeat('66',32),'hex'),
 decode(repeat('11',12),'hex'),decode(repeat('22',16),'hex'),1793455000
from (values('1'),('2')) v(id);
do $cases$
declare v jsonb;
 q jsonb:='{"currency":"ARS","payment_method":null,"lead_days":null,
 "freight_gross":null,"min_goods_gross":null,
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":null,"vat_rate":null}]}'::jsonb;
 price jsonb:='[{"line_no":1,"quoted_unit_price":"121.00",
 "vat_basis":"no_informado","source_line_no":1,
 "source_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb;
begin
 if cotironda_private.whapi_quote_read_d061('d061_ci',repeat('f',64))
    is not null
 then raise exception 'd061_unknown_message_visible';end if;
 v:=cotironda_private.whapi_quote_read_d061('d061_ci',repeat('1',64));
 if v is null or v->>'supplierOrgId'<>'bbbbbbbb-0011-4011-8011-000000000612'
   or v->>'expectedRevision'<>'0'
   or v->>'cryptoKeyId'<>'legacy_d029'
   or jsonb_array_length(v->'roundItems')<>1
   or v->'roundItems'->0->>'itemId'<>'cemento_001'
   or v->'roundItems'->0->>'unit'<>'bag'
   or v ? 'contactPhone' or v ? 'supplierName'
 then raise exception 'd061_ledger_inbox_read_incomplete_%',v;end if;
 v:=cotironda_private.whapi_receive_with_prices_d060(
   'd061_ci',repeat('1',64),0,q,price);
 if v->>'version'<>'1' then raise exception 'd061_receive_first_failed';end if;
 v:=cotironda_private.whapi_quote_read_d061('d061_ci',repeat('1',64));
 if v->>'expectedRevision'<>'0'
 then raise exception 'd061_replay_revision_not_original';end if;
 v:=cotironda_private.whapi_quote_read_d061('d061_ci',repeat('2',64));
 if v->>'expectedRevision'<>'1'
 then raise exception 'd061_second_msg_revision_stale';end if;
 v:=cotironda_private.whapi_receive_with_prices_d060(
   'd061_ci',repeat('2',64),1,q,price);
 if v->>'version'<>'2'
 then raise exception 'd061_second_quote_not_versioned';end if;
 if (select count(*) from cotironda_private.offer_versions_v1
  where round_id='dddddddd-0011-4011-8011-000000000613')<>2
 then raise exception 'd061_versions_missing';end if;
 v:=cotironda_private.whapi_receive_with_prices_d060(
   'd061_ci',repeat('1',64),0,q,price);
 if v->>'repeated'<>'true' then raise exception 'd061_duplicate_lost';end if;
 update cotironda_private.whapi_contacts_v1
  set opted_out_at=pg_catalog.clock_timestamp()
  where channel_id='d061_ci' and chat_key=repeat('a',64);
 if cotironda_private.whapi_quote_read_d061('d061_ci',repeat('2',64))
   is not null
 then raise exception 'd061_opt_out_did_not_stop_read';end if;
end;$cases$;
rollback;
