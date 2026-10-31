-- D048 isolated Postgres 17 CI. All business data fictional, ROLLBACK.
begin;
create function pg_temp.d048_fails(p_sql text,p_needle text)
returns void language plpgsql as $fn$
declare msg text;did_fail boolean:=false;
begin
 begin execute p_sql;
 exception when others then
   get stacked diagnostics msg=message_text;
   if position(p_needle in msg)=0 then
     raise exception 'd048_wrong_failure_expected_%_actual_%',p_needle,msg;end if;
   did_fail:=true;
 end;
 if not did_fail then raise exception 'd048_did_not_fail_%',p_needle;end if;
end;$fn$;
do $check$
begin
 if not exists(select 1 from pg_roles
   where rolname='cotironda_source_writer'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not exists(select 1 from pg_roles
   where rolname='cotironda_source_gateway'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or (select count(*) from pg_class
   where oid='cotironda_private.whapi_offer_sources_d048'::regclass
    and relrowsecurity)<>1
 or has_table_privilege('anon','cotironda_private.whapi_offer_sources_d048','SELECT')
 or has_table_privilege('authenticated','cotironda_private.whapi_offer_sources_d048','INSERT')
 or has_table_privilege('service_role','cotironda_private.whapi_offer_sources_d048','SELECT')
 or has_table_privilege('cotironda_source_gateway',
   'cotironda_private.whapi_offer_sources_d048','SELECT')
 or has_function_privilege('anon',
   'cotironda_private.whapi_save_draft_from_inbox_d048(text,text,uuid,integer,jsonb)','EXECUTE')
 or has_function_privilege('service_role',
   'cotironda_private.whapi_save_draft_from_inbox_d048(text,text,uuid,integer,jsonb)','EXECUTE')
 or not has_function_privilege('cotironda_source_gateway',
   'cotironda_private.whapi_save_draft_from_inbox_d048(text,text,uuid,integer,jsonb)','EXECUTE')
 or (select pg_get_userbyid(proowner) from pg_proc
   where oid='cotironda_private.whapi_save_draft_from_inbox_d048(text,text,uuid,integer,jsonb)'::regprocedure)
   <>'cotironda_source_writer'
 then raise exception 'd048_access_leak';end if;
end;$check$;
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000481','D048 comprador DEMO','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000482','D048 proveedor A','supplier'),
 ('cccccccc-0000-4000-8000-000000000483','D048 proveedor B','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('bbbbbbbb-0000-4000-8000-000000000482','Corralón ficticio',true),
 ('cccccccc-0000-4000-8000-000000000483','Otra empresa ficticia',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
values('dddddddd-0000-4000-8000-000000000484',
       'aaaaaaaa-0000-4000-8000-000000000481',
       now()-interval '2 minutes',now()+interval '2 hours');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
values('dddddddd-0000-4000-8000-000000000484',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position)
values('dddddddd-0000-4000-8000-000000000484',
       'bbbbbbbb-0000-4000-8000-000000000482','anon_d048_ensayo',1);
update cotironda_private.rounds_v1 set status='abierta'
where id='dddddddd-0000-4000-8000-000000000484';
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at) values
 ('d048_ci',repeat('a',64),'bbbbbbbb-0000-4000-8000-000000000482',
  now()-interval '1 day',now()-interval '1 day'),
 ('d048_ci',repeat('b',64),'cccccccc-0000-4000-8000-000000000483',
  now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,payload_fingerprint,
  kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
 values
 ('d048_ci',repeat('1',64),repeat('a',64),
  'bbbbbbbb-0000-4000-8000-000000000482','dddddddd-0000-4000-8000-000000000484',
  repeat('c',64),'text',decode(repeat('44',32),'hex'),
  decode(repeat('11',12),'hex'),decode(repeat('22',16),'hex'),1800000000),
 ('d048_ci',repeat('2',64),repeat('a',64),
  'bbbbbbbb-0000-4000-8000-000000000482','dddddddd-0000-4000-8000-000000000484',
  repeat('d',64),'text',decode(repeat('55',32),'hex'),
  decode(repeat('33',12),'hex'),decode(repeat('44',16),'hex'),1800000000),
 ('d048_ci',repeat('3',64),repeat('a',64),
  'bbbbbbbb-0000-4000-8000-000000000482','dddddddd-0000-4000-8000-000000000484',
  repeat('e',64),'image',decode(repeat('66',32),'hex'),
  decode(repeat('55',12),'hex'),decode(repeat('66',16),'hex'),1800000000),
 ('d048_ci',repeat('4',64),repeat('b',64),
  'cccccccc-0000-4000-8000-000000000483','dddddddd-0000-4000-8000-000000000484',
  repeat('f',64),'text',decode(repeat('77',32),'hex'),
  decode(repeat('77',12),'hex'),decode(repeat('88',16),'hex'),1800000000);

do $cases$
declare
 offer jsonb:='{"currency":"ARS","payment_method":"transferencia",
  "lead_days":3,"freight_gross":"100.00","min_goods_gross":"0.00",
  "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
  "net_unit_price":"2500.00","vat_rate":"21"}]}'::jsonb;
 j jsonb;
 response jsonb;
begin
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_save_draft_from_inbox_d048(%L,%L,%L::uuid,%s,%L::jsonb)',
  'd048_ci',repeat('9',64),'eeeeeeee-0000-4000-8000-000000000481',
  0,offer::text),'d048_source_not_found');
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_save_draft_from_inbox_d048(%L,%L,%L::uuid,%s,%L::jsonb)',
  'd048_ci',repeat('3',64),'eeeeeeee-0000-4000-8000-000000000481',
  0,offer::text),'d048_source_not_found');
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_save_draft_from_inbox_d048(%L,%L,%L::uuid,%s,%L::jsonb)',
  'd048_ci',repeat('4',64),'eeeeeeee-0000-4000-8000-000000000481',
  0,offer::text),'supplier_not_invited');

 -- Before D048 linkage, the D047 outbox must reject ANY inbox text event.
 perform cotironda_private.save_offer_draft_atomic_v1(
  'dddddddd-0000-4000-8000-000000000484',
  'bbbbbbbb-0000-4000-8000-000000000482',
  'eeeeeeee-0000-4000-8000-000000000489',0,offer);
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_enqueue_reply_d047(%L,%L,%s)',
  'd048_ci',repeat('1',64),1),'d048_outbox_unlinked_source');

 -- A prior direct save cannot later be laundered as a D048 linked message:
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_save_draft_from_inbox_d048(%L,%L,%L::uuid,%s,%L::jsonb)',
  'd048_ci',repeat('1',64),'eeeeeeee-0000-4000-8000-000000000489',
  0,offer::text),'d048_event_preexisting_without_source');

 -- Revision 2 is now written THROUGH the D048 wrapper, all one transaction.
 response:=cotironda_private.whapi_save_draft_from_inbox_d048(
  'd048_ci',repeat('1',64),
  'eeeeeeee-0000-4000-8000-000000000482',1,offer);
 if response<> '{"state":"linked","revision":2,"repeated":false}'::jsonb
 then raise exception 'd048_link_failed';end if;
 response:=cotironda_private.whapi_save_draft_from_inbox_d048(
  'd048_ci',repeat('1',64),
  'eeeeeeee-0000-4000-8000-000000000482',1,offer);
 if response->>'repeated'<>'true' then raise exception 'd048_retry_not_idempotent';end if;
 if (select count(*) from cotironda_private.whapi_offer_sources_d048)<>1
  or (select count(*) from cotironda_private.offer_events_v1)<>2
 then raise exception 'd048_duplicate_event';end if;
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_save_draft_from_inbox_d048(%L,%L,%L::uuid,%s,%L::jsonb)',
  'd048_ci',repeat('1',64),'eeeeeeee-0000-4000-8000-000000000482',
  1,pg_catalog.jsonb_set(offer,'{freight_gross}','"1.00"')::text),
  'd048_source_reused');
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_save_draft_from_inbox_d048(%L,%L,%L::uuid,%s,%L::jsonb)',
  'd048_ci',repeat('1',64),'eeeeeeee-0000-4000-8000-000000000488',
  1,offer::text),'d048_source_reused');
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_enqueue_reply_d047(%L,%L,%s)',
  'd048_ci',repeat('2',64),2),'d048_outbox_unlinked_source');
 j:=cotironda_private.whapi_enqueue_reply_d047('d048_ci',repeat('1',64),2);
 if j->>'state'<>'queued' then raise exception 'd048_linked_outbox_not_queued';end if;
 if (cotironda_private.whapi_enqueue_reply_d047('d048_ci',repeat('1',64),2))->>'repeated'<>'true'
 then raise exception 'd048_duplicate_outbox';end if;

 response:=cotironda_private.whapi_save_draft_from_inbox_d048(
  'd048_ci',repeat('2',64),
  'eeeeeeee-0000-4000-8000-000000000483',2,offer);
 if response->>'revision'<>'3' then raise exception 'd048_second_revision_failed';end if;
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_save_draft_from_inbox_d048(%L,%L,%L::uuid,%s,%L::jsonb)',
  'd048_ci',repeat('3',64),'eeeeeeee-0000-4000-8000-000000000484',
  3,offer::text),'d048_source_not_found');
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_save_draft_from_inbox_d048(%L,%L,%L::uuid,%s,%L::jsonb)',
  'd048_ci',repeat('1',64),'eeeeeeee-0000-4000-8000-000000000485',
  3,offer::text),'d048_source_reused');
 -- After BAJA even a fresh source must not make a new draft.
 update cotironda_private.whapi_contacts_v1 set opted_out_at=clock_timestamp()
 where channel_id='d048_ci' and chat_key=repeat('a',64);
 perform pg_temp.d048_fails(format(
  'select cotironda_private.whapi_save_draft_from_inbox_d048(%L,%L,%L::uuid,%s,%L::jsonb)',
  'd048_ci',repeat('1',64),'eeeeeeee-0000-4000-8000-000000000482',
  1,offer::text),'d048_contact_not_active');
end;$cases$;
rollback;
