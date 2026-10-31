-- MVP-009 / D059: PostgreSQL17 disposable CI, 100% fictitious, ROLLBACK.
begin;
create function pg_temp.d059_fails(p_sql text,p_expected text) returns void
language plpgsql as $fn$
declare v_msg text; v_failed boolean:=false;
begin
 begin execute p_sql;
 exception when others then
  get stacked diagnostics v_msg=message_text;
  if position(p_expected in v_msg)=0
  then raise exception 'd059_wrong_error_expected_%_got_%',p_expected,v_msg;end if;
  v_failed:=true;
 end;
 if not v_failed then raise exception 'd059_missing_failure_%',p_expected;end if;
end;$fn$;
do $permissions$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_receive_writer_d059'
      and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not exists(select 1 from pg_roles where rolname='cotironda_receive_gateway_d059'
      and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not (select relrowsecurity from pg_class
     where oid='cotironda_private.whapi_received_offers_d059'::regclass)
 or has_table_privilege('anon','cotironda_private.whapi_received_offers_d059','SELECT')
 or has_table_privilege('authenticated','cotironda_private.whapi_received_offers_d059','INSERT')
 or has_table_privilege('service_role','cotironda_private.whapi_received_offers_d059','SELECT')
 or has_table_privilege('cotironda_receive_gateway_d059',
   'cotironda_private.whapi_received_offers_d059','SELECT')
 or has_function_privilege('anon','cotironda_private.whapi_receive_quote_d059(text,text,integer,jsonb)','EXECUTE')
 or has_function_privilege('authenticated','cotironda_private.whapi_receive_quote_d059(text,text,integer,jsonb)','EXECUTE')
 or has_function_privilege('service_role','cotironda_private.whapi_receive_quote_d059(text,text,integer,jsonb)','EXECUTE')
 or not has_function_privilege('cotironda_receive_gateway_d059','cotironda_private.whapi_receive_quote_d059(text,text,integer,jsonb)','EXECUTE')
 or (select pg_get_userbyid(proowner) from pg_proc
     where oid='cotironda_private.whapi_receive_quote_d059(text,text,integer,jsonb)'::regprocedure)
    <>'cotironda_receive_writer_d059'
 then raise exception 'd059_security_grants_invalid';end if;
 if exists (select 1 from information_schema.columns
  where table_schema='cotironda_private' and table_name='whapi_received_offers_d059'
    and column_name in ('phone','whatsapp','plain_text','quote_text','recipient','token'))
 then raise exception 'd059_sensitive_receipt_fields';end if;
end;$permissions$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000591','D059 comprador ficticio','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000592','D059 proveedor permitido','supplier'),
 ('cccccccc-0000-4000-8000-000000000593','D059 baja contacto','supplier'),
 ('dddddddd-0000-4000-8000-000000000594','D059 no invitado','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('bbbbbbbb-0000-4000-8000-000000000592','Corralón ficticio',true),
 ('cccccccc-0000-4000-8000-000000000593','Pinturería ficticia',true),
 ('dddddddd-0000-4000-8000-000000000594','Electricidad ficticia',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
values('eeeeeeee-0000-4000-8000-000000000595',
 'aaaaaaaa-0000-4000-8000-000000000591',
 now()-interval '2 minutes',now()+interval '3 hours');
insert into cotironda_private.round_items_v1
 (round_id,line_no,product_code,quantity,unit)
values('eeeeeeee-0000-4000-8000-000000000595',1,'cemento_001',20,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position)
values('eeeeeeee-0000-4000-8000-000000000595',
 'bbbbbbbb-0000-4000-8000-000000000592','anon_d059_corralon',1),
 ('eeeeeeee-0000-4000-8000-000000000595',
 'cccccccc-0000-4000-8000-000000000593','anon_d059_optout',2);
update cotironda_private.rounds_v1 set status='abierta'
where id='eeeeeeee-0000-4000-8000-000000000595';
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at) values
 ('d059_ci',repeat('a',64),'bbbbbbbb-0000-4000-8000-000000000592',
  now()-interval '1 day',now()-interval '1 day'),
 ('d059_ci',repeat('b',64),'cccccccc-0000-4000-8000-000000000593',
  now()-interval '1 day',now()-interval '1 day'),
 ('d059_ci',repeat('c',64),'dddddddd-0000-4000-8000-000000000594',
  now()-interval '1 day',now()-interval '1 day');
update cotironda_private.whapi_contacts_v1 set opted_out_at=clock_timestamp()
where channel_id='d059_ci' and chat_key=repeat('b',64);
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,payload_fingerprint,
  kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
select 'd059_ci',repeat(k,64),repeat(chat,64),
 case chat when 'a' then 'bbbbbbbb-0000-4000-8000-000000000592'::uuid
  when 'b' then 'cccccccc-0000-4000-8000-000000000593'::uuid
  else 'dddddddd-0000-4000-8000-000000000594'::uuid end,
 'eeeeeeee-0000-4000-8000-000000000595'::uuid,
 repeat(k,64),case when k='4' then 'image' else 'text' end,
 decode(repeat('55',32),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000
from (values ('1','a'),('2','a'),('3','b'),('4','a'),
 ('5','c'),('6','a'),('7','a')) v(k,chat);

do $tests$
declare
 partial_offer jsonb:='{"currency":"ARS","payment_method":null,"lead_days":null,
  "freight_gross":null,"min_goods_gross":null,
  "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"15",
  "net_unit_price":null,"vat_rate":null}]}'::jsonb;
 updated_offer jsonb;
 receipt jsonb;
 v_old jsonb;
 r uuid:='eeeeeeee-0000-4000-8000-000000000595';
 supplier uuid:='bbbbbbbb-0000-4000-8000-000000000592';
begin
 perform pg_temp.d059_fails(format(
  'select cotironda_private.whapi_receive_quote_d059(%L,%L,0,%L::jsonb)',
  'd059_ci',repeat('9',64),partial_offer::text),'d059_inbox_not_verified');
 perform pg_temp.d059_fails(format(
  'select cotironda_private.whapi_receive_quote_d059(%L,%L,0,%L::jsonb)',
  'd059_ci',repeat('3',64),partial_offer::text),'d048_contact_not_active');
 perform pg_temp.d059_fails(format(
  'select cotironda_private.whapi_receive_quote_d059(%L,%L,0,%L::jsonb)',
  'd059_ci',repeat('4',64),partial_offer::text),'d059_inbox_not_verified');
 perform pg_temp.d059_fails(format(
  'select cotironda_private.whapi_receive_quote_d059(%L,%L,0,%L::jsonb)',
  'd059_ci',repeat('5',64),partial_offer::text),'supplier_not_invited');
 if (select count(*) from cotironda_private.offer_versions_v1 where round_id=r)<>0
 then raise exception 'd059_invalid_inputs_created_version';end if;

 receipt:=cotironda_private.whapi_receive_quote_d059(
  'd059_ci',repeat('1',64),0,partial_offer);
 if receipt<>'{"state":"offer_received","revision":1,"version":1,"repeated":false}'::jsonb
 then raise exception 'd059_first_quote_not_received_%',receipt;end if;
 if (select count(*) from cotironda_private.offer_versions_v1
    where round_id=r and supplier_org_id=supplier and
      freight_gross is null and payment_method is null and
      lines_snapshot->0->>'net_unit_price' is null
      and lines_snapshot->0->>'vat_rate' is null)<>1
 then raise exception 'd059_incomplete_quote_not_saved';end if;
 if (select count(*) from cotironda_private.whapi_reply_jobs_d047
   where round_id=r)<>0
 then raise exception 'd059_inappropriately_requested_confirmo';end if;
 if (select count(*) from cotironda_private.whapi_confirm_sources_d049
   where round_id=r)<>0
 then raise exception 'd059_created_legacy_confirm_receipt';end if;
 receipt:=cotironda_private.whapi_receive_quote_d059(
  'd059_ci',repeat('1',64),0,partial_offer);
 if receipt->>'repeated'<>'true'
 then raise exception 'd059_duplicate_inbox_version';end if;
 perform pg_temp.d059_fails(format(
  'select cotironda_private.whapi_receive_quote_d059(%L,%L,0,%L::jsonb)',
  'd059_ci',repeat('1',64),
  pg_catalog.jsonb_set(partial_offer,'{freight_gross}','"0.00"')::text),
  'd059_replay_conflict');

 updated_offer:=pg_catalog.jsonb_set(partial_offer,
  '{lines_snapshot,0,net_unit_price}','"2500.00"');
 receipt:=cotironda_private.whapi_receive_quote_d059(
  'd059_ci',repeat('2',64),1,updated_offer);
 if receipt<>'{"state":"offer_received","revision":2,"version":2,"repeated":false}'::jsonb
 then raise exception 'd059_correction_failed_%',receipt;end if;
 if (select count(*) from cotironda_private.offer_versions_v1
  where round_id=r and supplier_org_id=supplier)<>2
 or (select count(*) from cotironda_private.offer_versions_v1
  where round_id=r and supplier_org_id=supplier and version=1
    and lines_snapshot->0->>'net_unit_price' is null)<>1
 or (select count(*) from cotironda_private.offer_versions_v1
  where round_id=r and supplier_org_id=supplier and version=2
    and lines_snapshot->0->>'net_unit_price'='2500.00')<>1
 then raise exception 'd059_versions_overwritten_or_missing';end if;
 perform pg_temp.d059_fails(format(
  'select cotironda_private.whapi_receive_quote_d059(%L,%L,0,%L::jsonb)',
  'd059_ci',repeat('6',64),partial_offer::text),'stale_draft_revision');
 perform pg_temp.d059_fails(format(
  'select cotironda_private.whapi_receive_quote_d059(%L,%L,2,%L::jsonb)',
  'd059_ci',repeat('6',64),(updated_offer || '{"supplier_org_id":"not_my_org"}'::jsonb)::text),
  'quote_payload_invalid');
 perform pg_temp.d059_fails(format(
  'update cotironda_private.whapi_received_offers_d059 set request_sha256=%L where channel_id=%L',
  repeat('0',64),'d059_ci'),'confirmed_offer_and_event_are_immutable');

 -- Close round: no new message can create a version. Exact replay still works.
 update cotironda_private.rounds_v1 set status='cerrada'
  where id=r;
 perform pg_temp.d059_fails(format(
  'select cotironda_private.whapi_receive_quote_d059(%L,%L,2,%L::jsonb)',
  'd059_ci',repeat('6',64),updated_offer::text),'round_not_accepting_quotes');
 receipt:=cotironda_private.whapi_receive_quote_d059(
  'd059_ci',repeat('1',64),0,partial_offer);
 if receipt->>'repeated'<>'true' then
  raise exception 'd059_replay_after_close_failed';end if;
 if (select count(*) from cotironda_private.whapi_received_offers_d059
   where round_id=r)<>2
 then raise exception 'd059_bad_receipt_count';end if;
end;$tests$;
rollback;
