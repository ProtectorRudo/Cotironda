-- D049 PostgreSQL17 CI. All identities, prices, hashes and messages are fictitious.
-- SQL test uses BEGIN/ROLLBACK and never contacts WhatsApp, AI or DEV.
begin;
create function pg_temp.d049_reject(p_query text,p_fragment text)
returns void language plpgsql as $fn$
declare v_msg text;v_did boolean:=false;
begin
 begin execute p_query;
 exception when others then
   get stacked diagnostics v_msg=message_text;
   if pg_catalog.strpos(v_msg,p_fragment)=0 then
     raise exception 'd049_wrong_error expected=% observed=%',p_fragment,v_msg;
   end if;
   v_did:=true;
 end;
 if not v_did then raise exception 'd049_unexpected_success expected=%',p_fragment;end if;
end;$fn$;

do $audit$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_confirm_writer'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not exists(select 1 from pg_roles where rolname='cotironda_confirm_gateway'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or (select count(*) from pg_class
   where oid='cotironda_private.whapi_confirm_sources_d049'::regclass
     and relrowsecurity)<>1
 or has_table_privilege('anon','cotironda_private.whapi_confirm_sources_d049','SELECT')
 or has_table_privilege('authenticated','cotironda_private.whapi_confirm_sources_d049','INSERT')
 or has_table_privilege('service_role','cotironda_private.whapi_confirm_sources_d049','SELECT')
 or has_table_privilege('cotironda_confirm_gateway','cotironda_private.whapi_confirm_sources_d049','SELECT')
 or has_function_privilege('anon','cotironda_private.whapi_confirm_from_inbox_d049(text,text,uuid,uuid,text,text)','EXECUTE')
 or has_function_privilege('authenticated','cotironda_private.whapi_confirm_from_inbox_d049(text,text,uuid,uuid,text,text)','EXECUTE')
 or has_function_privilege('service_role','cotironda_private.whapi_confirm_from_inbox_d049(text,text,uuid,uuid,text,text)','EXECUTE')
 or not has_function_privilege('cotironda_confirm_gateway','cotironda_private.whapi_confirm_from_inbox_d049(text,text,uuid,uuid,text,text)','EXECUTE')
 or (select pg_get_userbyid(proowner) from pg_proc where oid=
   'cotironda_private.whapi_confirm_from_inbox_d049(text,text,uuid,uuid,text,text)'::regprocedure)
    <>'cotironda_confirm_writer'
 then raise exception 'd049_permissions_insecure';end if;
 if exists(select 1 from information_schema.columns
  where table_schema='cotironda_private' and table_name='whapi_confirm_sources_d049'
   and column_name in ('phone','chat_id','message_text','message_body',
      'url','token','whatsapp_id','reply_text'))
 then raise exception 'd049_sensitive_fields';end if;
end;$audit$;

insert into public.organizations(id,display_name,organization_type)
values('aaaaaaaa-0000-4000-8000-000000000491','comprador sintético D049','buyer'),
      ('bbbbbbbb-0000-4000-8000-000000000492','proveedor sintético D049','supplier'),
      ('cccccccc-0000-4000-8000-000000000493','otro proveedor sintético D049','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
values('bbbbbbbb-0000-4000-8000-000000000492','Corralón de ensayo',true),
      ('cccccccc-0000-4000-8000-000000000493','Pinturería de ensayo',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
values('dddddddd-0000-4000-8000-000000000494',
 'aaaaaaaa-0000-4000-8000-000000000491',now()-interval '2 minutes',
 now()+interval '3 hours');
insert into cotironda_private.round_items_v1
 (round_id,line_no,product_code,quantity,unit)
 values('dddddddd-0000-4000-8000-000000000494',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position)
values('dddddddd-0000-4000-8000-000000000494',
 'bbbbbbbb-0000-4000-8000-000000000492','anon_d049_corralon',1),
 ('dddddddd-0000-4000-8000-000000000494',
 'cccccccc-0000-4000-8000-000000000493','anon_d049_otro',2);
update cotironda_private.rounds_v1 set status='abierta'
where id='dddddddd-0000-4000-8000-000000000494';
insert into cotironda_private.whapi_contacts_v1
(channel_id,chat_key,supplier_org_id,verified_at,consented_at)
values('d049_ci',repeat('a',64),'bbbbbbbb-0000-4000-8000-000000000492',
 now()-interval '1 day',now()-interval '1 day'),
 ('d049_ci',repeat('b',64),'cccccccc-0000-4000-8000-000000000493',
 now()-interval '1 day',now()-interval '1 day');
-- Separate inbox events: D048 draft origin, confirmation1, alien chat,
-- confirmation duplicate attempt, revision2 origin/confirmation and revision3.
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,payload_fingerprint,
  kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
select 'd049_ci',repeat(source_key,64),repeat(chat_k,64),
 case when chat_k='b'
 then 'cccccccc-0000-4000-8000-000000000493'::uuid
 else 'bbbbbbbb-0000-4000-8000-000000000492'::uuid end,
 'dddddddd-0000-4000-8000-000000000494'::uuid,
 repeat(source_key,64),'text',
 pg_catalog.decode(repeat('33',32),'hex'),
 pg_catalog.decode(repeat('44',12),'hex'),
 pg_catalog.decode(repeat('55',16),'hex'),1800000000
from (values ('1','a'),('2','a'),('3','b'),('4','a'),('5','a'),
             ('6','a'),('7','a'),('8','a'),('9','a')) as m(source_key,chat_k);

do $cases$
declare
 r constant uuid:='dddddddd-0000-4000-8000-000000000494';
 s constant uuid:='bbbbbbbb-0000-4000-8000-000000000492';
 normal_offer jsonb:='{"currency":"ARS","payment_method":"transferencia",
  "lead_days":3,"freight_gross":"120.00","min_goods_gross":"0.00",
  "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
  "net_unit_price":"2500.00","vat_rate":"21"}]}'::jsonb;
 missing_iva jsonb;
 receipt jsonb;
 work jsonb;
 lease jsonb;
 confirm_event1 constant uuid:='eeeeeeee-0000-4000-8000-000000000491';
 confirm_event2 constant uuid:='eeeeeeee-0000-4000-8000-000000000492';
 confirm_event3 constant uuid:='eeeeeeee-0000-4000-8000-000000000493';
 job1 uuid;
 job2 uuid;
 job3 uuid;
begin
 missing_iva:=pg_catalog.jsonb_set(normal_offer,'{lines_snapshot,0,vat_rate}',
   'null'::jsonb);
 -- First message creates D048-linked revision1; the reply D047 is not sent yet.
 receipt:=cotironda_private.whapi_save_draft_from_inbox_d048('d049_ci',repeat('1',64),
   'eeeeeeee-0000-4000-8000-000000000481',0,normal_offer);
 if (receipt->>'revision')::integer<>1
 then raise exception 'd049_first_draft_failed';end if;
 work:=cotironda_private.whapi_enqueue_reply_d047('d049_ci',repeat('1',64),1);
 job1:=(work->>'jobId')::uuid;

 perform pg_temp.d049_reject(format(
  'select cotironda_private.whapi_confirm_from_inbox_d049(%L,%L,%L::uuid,%L::uuid,%L,%L)',
 'd049_ci',repeat('2',64),job1,confirm_event1,repeat('a',64),repeat('c',64)),
 'd049_wrong_outbound_or_reply');

 lease:=cotironda_private.whapi_lease_reply_d047();
 if (lease->>'jobId')::uuid<>job1
 then raise exception 'd049_reply_not_leased';end if;
 perform cotironda_private.whapi_finish_reply_d047(
  job1,(lease->>'leaseToken')::uuid,true,repeat('a',64));

 -- Wrong reply-ack, wrong chat, same source message and nonexistent inbound.
 perform pg_temp.d049_reject(format(
  'select cotironda_private.whapi_confirm_from_inbox_d049(%L,%L,%L::uuid,%L::uuid,%L,%L)',
  'd049_ci',repeat('2',64),job1,confirm_event1,repeat('b',64),repeat('c',64)),
 'd049_wrong_outbound_or_reply');
 perform pg_temp.d049_reject(format(
  'select cotironda_private.whapi_confirm_from_inbox_d049(%L,%L,%L::uuid,%L::uuid,%L,%L)',
  'd049_ci',repeat('3',64),job1,confirm_event1,repeat('a',64),repeat('c',64)),
 'd049_wrong_outbound_or_reply');
 perform pg_temp.d049_reject(format(
  'select cotironda_private.whapi_confirm_from_inbox_d049(%L,%L,%L::uuid,%L::uuid,%L,%L)',
  'd049_ci',repeat('1',64),job1,confirm_event1,repeat('a',64),repeat('c',64)),
 'd049_wrong_outbound_or_reply');
 perform pg_temp.d049_reject(format(
  'select cotironda_private.whapi_confirm_from_inbox_d049(%L,%L,%L::uuid,%L::uuid,%L,%L)',
  'd049_ci',repeat('f',64),job1,confirm_event1,repeat('a',64),repeat('c',64)),
 'd049_message_not_verified');
 if (select count(*) from cotironda_private.offer_versions_v1 where round_id=r)<>0
 then raise exception 'd049_early_confirmation';end if;

 receipt:=cotironda_private.whapi_confirm_from_inbox_d049('d049_ci',repeat('2',64),
  job1,confirm_event1,repeat('a',64),repeat('c',64));
 if receipt<> '{"state":"offer_confirmed","revision":1,"version":1,"repeated":false}'::jsonb
 then raise exception 'd049_confirmation_receipt_incorrect:%',receipt;end if;
 if (select count(*) from cotironda_private.whapi_confirm_sources_d049)<>1
  or (select count(*) from cotironda_private.offer_versions_v1 where round_id=r)<>1
 then raise exception 'd049_receipt_or_version_missing';end if;

 receipt:=cotironda_private.whapi_confirm_from_inbox_d049('d049_ci',repeat('2',64),
  job1,confirm_event1,repeat('a',64),repeat('c',64));
 if receipt->>'repeated'<>'true'
 then raise exception 'd049_replay_did_not_match';end if;
 perform pg_temp.d049_reject(format(
  'select cotironda_private.whapi_confirm_from_inbox_d049(%L,%L,%L::uuid,%L::uuid,%L,%L)',
  'd049_ci',repeat('2',64),job1,confirm_event1,repeat('a',64),repeat('d',64)),
 'd049_message_replay_collision');
 perform pg_temp.d049_reject(format(
  'select cotironda_private.whapi_confirm_from_inbox_d049(%L,%L,%L::uuid,%L::uuid,%L,%L)',
  'd049_ci',repeat('4',64),job1,confirm_event2,repeat('a',64),repeat('c',64)),
 'revision_already_confirmed');

 -- A second quote changes draft to revision2, with incomplete IVA.
 receipt:=cotironda_private.whapi_save_draft_from_inbox_d048('d049_ci',repeat('5',64),
   'eeeeeeee-0000-4000-8000-000000000482',1,missing_iva);
 work:=cotironda_private.whapi_enqueue_reply_d047('d049_ci',repeat('5',64),2);
 job2:=(work->>'jobId')::uuid;
 lease:=cotironda_private.whapi_lease_reply_d047();
 if (lease->>'jobId')::uuid<>job2
 then raise exception 'd049_second_job_not_leased';end if;
 perform cotironda_private.whapi_finish_reply_d047(
  job2,(lease->>'leaseToken')::uuid,true,repeat('b',64));
 perform pg_temp.d049_reject(format(
  'select cotironda_private.whapi_confirm_from_inbox_d049(%L,%L,%L::uuid,%L::uuid,%L,%L)',
  'd049_ci',repeat('6',64),job2,confirm_event2,repeat('b',64),repeat('c',64)),
 'd049_incomplete_terms');

 -- Revision3 supersedes revision2. A tardy Confirmo for revision2 is stale.
 receipt:=cotironda_private.whapi_save_draft_from_inbox_d048('d049_ci',repeat('7',64),
   'eeeeeeee-0000-4000-8000-000000000483',2,normal_offer);
 perform pg_temp.d049_reject(format(
  'select cotironda_private.whapi_confirm_from_inbox_d049(%L,%L,%L::uuid,%L::uuid,%L,%L)',
  'd049_ci',repeat('6',64),job2,confirm_event2,repeat('b',64),repeat('c',64)),
 'd049_stale_draft');

 work:=cotironda_private.whapi_enqueue_reply_d047('d049_ci',repeat('7',64),3);
 job3:=(work->>'jobId')::uuid;
 lease:=cotironda_private.whapi_lease_reply_d047();
 if (lease->>'jobId')::uuid<>job3
 then raise exception 'd049_third_job_not_leased';end if;
 perform cotironda_private.whapi_finish_reply_d047(
  job3,(lease->>'leaseToken')::uuid,true,repeat('d',64));

 receipt:=cotironda_private.whapi_confirm_from_inbox_d049('d049_ci',repeat('8',64),
  job3,confirm_event3,repeat('d',64),repeat('f',64));
 if (receipt->>'version')::integer<>2
  or (receipt->>'revision')::integer<>3
 then raise exception 'd049_version_after_correction_failed';end if;
 if (select count(*) from cotironda_private.offer_versions_v1
     where round_id=r and supplier_org_id=s)<>2
 then raise exception 'd049_double_or_lost_version';end if;

 -- BAJA: new confirmations fail; replay of already completed transaction
 -- is safe and does not issue a new version.
 update cotironda_private.whapi_contacts_v1
  set opted_out_at=pg_catalog.clock_timestamp()
 where channel_id='d049_ci' and chat_key=repeat('a',64);
 receipt:=cotironda_private.whapi_confirm_from_inbox_d049('d049_ci',repeat('8',64),
  job3,confirm_event3,repeat('d',64),repeat('f',64));
 if receipt->>'repeated'<>'true' then raise exception 'd049_replay_after_optout';end if;
 perform pg_temp.d049_reject(format(
  'select cotironda_private.whapi_confirm_from_inbox_d049(%L,%L,%L::uuid,%L::uuid,%L,%L)',
  'd049_ci',repeat('9',64),job3,'eeeeeeee-0000-4000-8000-000000000499',
  repeat('d',64),repeat('f',64)),
 'd049_consent_or_contact_missing');
end;$cases$;
rollback;
