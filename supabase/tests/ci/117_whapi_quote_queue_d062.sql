-- MVP-012 / D062. Ephemeral PostgreSQL 17 CI, all fixtures fictitious, ROLLBACK.
begin;
create function pg_temp.denied_d062(command text,code text)
returns void language plpgsql as $fn$
declare v text;failed boolean:=false;
begin
 begin execute command;exception when others then
  get stacked diagnostics v=message_text;
  if position(code in v)=0 then
   raise exception 'd062_wrong_failure_expected_%_got_%',code,v;end if;
  failed:=true;
 end;
 if not failed then raise exception 'd062_missing_failure_%',code;end if;
end;$fn$;
do $acl$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_queue_writer_d062'
    and not rolcanlogin and not rolinherit and not rolbypassrls)
  or not exists(select 1 from pg_roles where rolname='cotironda_queue_gateway_d062'
    and not rolcanlogin and not rolinherit and not rolbypassrls)
  or not (select relrowsecurity from pg_class
   where oid='cotironda_private.whapi_quote_queue_d062'::regclass)
  or has_table_privilege('anon','cotironda_private.whapi_quote_queue_d062','SELECT')
  or has_table_privilege('authenticated','cotironda_private.whapi_quote_queue_d062','SELECT')
  or has_table_privilege('service_role','cotironda_private.whapi_quote_queue_d062','SELECT')
  or has_table_privilege('cotironda_queue_gateway_d062','cotironda_private.whapi_quote_queue_d062','SELECT')
  or has_table_privilege('cotironda_queue_writer_d062','cotironda_private.whapi_inbox_v1','SELECT')
  or has_function_privilege('anon','cotironda_private.whapi_claim_quote_d062()','EXECUTE')
  or has_function_privilege('authenticated','cotironda_private.whapi_finish_quote_d062(text,text,uuid,text)','EXECUTE')
  or has_function_privilege('service_role','cotironda_private.whapi_claim_quote_d062()','EXECUTE')
  or not has_function_privilege('cotironda_queue_gateway_d062','cotironda_private.whapi_claim_quote_d062()','EXECUTE')
  or not has_function_privilege('cotironda_queue_gateway_d062','cotironda_private.whapi_finish_quote_d062(text,text,uuid,text)','EXECUTE')
  or (select pg_get_userbyid(proowner) from pg_proc
   where oid='cotironda_private.whapi_claim_quote_d062()'::regprocedure)
   <>'cotironda_queue_writer_d062'
  or (select pg_get_userbyid(proowner) from pg_proc
   where oid='cotironda_private.whapi_enqueue_quote_d062()'::regprocedure)
   <>'cotironda_queue_writer_d062'
 then raise exception 'd062_permissions_failed';end if;
end;$acl$;
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0012-4012-8012-000000000621','D062 fictitious buyer','buyer'),
 ('bbbbbbbb-0012-4012-8012-000000000622','D062 supplier A','supplier'),
 ('cccccccc-0012-4012-8012-000000000623','D062 supplier B','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('bbbbbbbb-0012-4012-8012-000000000622','Proveedor A',true),
 ('cccccccc-0012-4012-8012-000000000623','Proveedor B',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values('dddddddd-0012-4012-8012-000000000624',
  'aaaaaaaa-0012-4012-8012-000000000621',
  now()-interval '1 minute',now()+interval '1 hour');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
 values('dddddddd-0012-4012-8012-000000000624',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position)
 values
 ('dddddddd-0012-4012-8012-000000000624',
  'bbbbbbbb-0012-4012-8012-000000000622','anon_proveedor_a',1),
 ('dddddddd-0012-4012-8012-000000000624',
  'cccccccc-0012-4012-8012-000000000623','anon_proveedor_b',2);
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0012-4012-8012-000000000624';
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at)
 values
 ('d062_ci',repeat('a',64),'bbbbbbbb-0012-4012-8012-000000000622',
  now()-interval '1 day',now()-interval '1 day'),
 ('d062_ci',repeat('b',64),'cccccccc-0012-4012-8012-000000000623',
  now()-interval '1 day',now()-interval '1 day');
-- Insertion itself creates queue entries via the D062 trigger.
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,payload_fingerprint,
 kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
select 'd062_ci',repeat(m.id,64),
 repeat(m.chat,64),
 case m.chat when 'a' then 'bbbbbbbb-0012-4012-8012-000000000622'::uuid
  else 'cccccccc-0012-4012-8012-000000000623'::uuid end,
 'dddddddd-0012-4012-8012-000000000624'::uuid,
 repeat(m.id,64),'text',
 decode(repeat('66',32),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1793455000
from (values('1','a'),('2','a'),('3','b'),('4','b')) m(id,chat);
-- Test time order explicitly: DB metadata is authoritative, never webhook time.
update cotironda_private.whapi_quote_queue_d062
 set queued_at=now()-interval '4 minutes' where message_key=repeat('1',64);
update cotironda_private.whapi_quote_queue_d062
 set queued_at=now()-interval '3 minutes' where message_key=repeat('2',64);
update cotironda_private.whapi_quote_queue_d062
 set queued_at=now()-interval '2 minutes' where message_key=repeat('3',64);
update cotironda_private.whapi_quote_queue_d062
 set queued_at=now()-interval '1 minute' where message_key=repeat('4',64);

do $case$
declare a jsonb;b jsonb;c jsonb;res jsonb;
 q jsonb:='{"currency":"ARS","payment_method":null,
 "lead_days":null,"freight_gross":null,"min_goods_gross":null,
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":null,"vat_rate":null}]}'::jsonb;
 source jsonb:='[{"line_no":1,"quoted_unit_price":"121.00",
 "vat_basis":"no_informado","source_line_no":1,
 "source_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb;
 token_a uuid;token_b uuid;
begin
 if (select count(*) from cotironda_private.whapi_quote_queue_d062
  where channel_id='d062_ci' and status='pending')<>4 then
  raise exception 'd062_trigger_did_not_enqueue_four';end if;
 a:=cotironda_private.whapi_claim_quote_d062();
 if a->>'messageKey'<>repeat('1',64) or a->>'attempt'<>'1'
 then raise exception 'd062_first_claim_out_of_order_%',a;end if;
 b:=cotironda_private.whapi_claim_quote_d062();
 if b->>'messageKey'<>repeat('3',64) then
  raise exception 'd062_parallel_worker_cross_supplier_%',b;end if;
 if cotironda_private.whapi_claim_quote_d062() is not null then
  raise exception 'd062_same_supplier_concurrency_race';end if;
 -- ACK cannot claim a quote unless D060 actually committed its evidence.
 perform pg_temp.denied_d062(format(
 'select cotironda_private.whapi_finish_quote_d062(%L,%L,%L::uuid,%L)',
 'd062_ci',repeat('1',64),a->>'leaseToken','received'),
 'd062_receipt_state_mismatch');
 res:=cotironda_private.whapi_receive_with_prices_d060(
  'd062_ci',repeat('1',64),0,q,source);
 if res->>'version'<>'1' then raise exception 'd062_quote_not_saved';end if;
 res:=cotironda_private.whapi_finish_quote_d062(
  'd062_ci',repeat('1',64),(a->>'leaseToken')::uuid,'received');
 if res->>'state'<>'done' then raise exception 'd062_success_not_acked';end if;
 -- Later correction of supplier A becomes eligible only after first is DONE.
 c:=cotironda_private.whapi_claim_quote_d062();
 if c->>'messageKey'<>repeat('2',64) then
  raise exception 'd062_second_supplier_message_not_released';end if;
 res:=cotironda_private.whapi_finish_quote_d062(
  'd062_ci',repeat('2',64),(c->>'leaseToken')::uuid,'no_price');
 if res->>'state'<>'manual_review' then
  raise exception 'd062_no_price_should_be_internal_review';end if;
 -- Source B first attempt fails: scheduled with backoff; later B message waits.
 res:=cotironda_private.whapi_finish_quote_d062(
  'd062_ci',repeat('3',64),(b->>'leaseToken')::uuid,'retry');
 if res->>'state'<>'pending' then raise exception 'd062_retry_not_pending';end if;
 if cotironda_private.whapi_claim_quote_d062() is not null then
  raise exception 'd062_backoff_bypassed_or_reordered';end if;
 update cotironda_private.whapi_quote_queue_d062
 set ready_at=now()-interval '5 seconds' where message_key=repeat('3',64);
 b:=cotironda_private.whapi_claim_quote_d062();
 if b->>'attempt'<>'2' then raise exception 'd062_attempt_two_missing';end if;
 token_b:=(b->>'leaseToken')::uuid;
 -- Simulated crash: second lease expires, third claim gets a NEW token.
 update cotironda_private.whapi_quote_queue_d062
 set lease_until=now()-interval '5 seconds' where message_key=repeat('3',64);
 b:=cotironda_private.whapi_claim_quote_d062();
 if b->>'attempt'<>'3' or b->>'leaseToken'=token_b::text then
  raise exception 'd062_failed_reclaim_after_crash';end if;
 perform pg_temp.denied_d062(format(
 'select cotironda_private.whapi_finish_quote_d062(%L,%L,%L::uuid,%L)',
 'd062_ci',repeat('3',64),token_b,'retry'),'d062_stale_lease');
 res:=cotironda_private.whapi_finish_quote_d062(
  'd062_ci',repeat('3',64),(b->>'leaseToken')::uuid,'retry');
 if res->>'state'<>'pending' then raise exception 'd062_third_retry_failed';end if;
 update cotironda_private.whapi_quote_queue_d062
 set ready_at=now()-interval '5 seconds' where message_key=repeat('3',64);
 b:=cotironda_private.whapi_claim_quote_d062();
 if b->>'attempt'<>'4' then raise exception 'd062_final_attempt_missing';end if;
 res:=cotironda_private.whapi_finish_quote_d062(
  'd062_ci',repeat('3',64),(b->>'leaseToken')::uuid,'retry');
 if res->>'state'<>'dead' then raise exception 'd062_dead_letter_missing';end if;
 -- Once earlier message DEAD, next supplier message may be leased.
 b:=cotironda_private.whapi_claim_quote_d062();
 if b->>'messageKey'<>repeat('4',64) then
  raise exception 'd062_next_message_after_dead_blocked';end if;
 update cotironda_private.whapi_contacts_v1
 set opted_out_at=pg_catalog.clock_timestamp()
 where channel_id='d062_ci' and chat_key=repeat('b',64);
 if cotironda_private.whapi_quote_read_d061('d062_ci',repeat('4',64))
  is not null then raise exception 'd062_optout_unprotected';end if;
 res:=cotironda_private.whapi_finish_quote_d062(
  'd062_ci',repeat('4',64),(b->>'leaseToken')::uuid,'not_eligible');
 if res->>'state'<>'discarded' then raise exception 'd062_opt_out_not_discarded';end if;
 if cotironda_private.whapi_claim_quote_d062() is not null then
  raise exception 'd062_queue_not_empty_after_finish';end if;
 if (select count(*) from cotironda_private.whapi_reply_jobs_d047
  where round_id='dddddddd-0012-4012-8012-000000000624')<>0
 then raise exception 'd062_created_confirmo_message';end if;
end;$case$;
rollback;
