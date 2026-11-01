-- MVP-047 D082: PostgreSQL17 disposable CI with NO actual WhatsApp.
begin;
do $acl$ begin
 if not exists(select 1 from pg_roles where rolname='cotironda_buyer_queue_owner_d082'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not exists(select 1 from pg_roles where rolname='cotironda_buyer_queue_gateway_d082'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or has_function_privilege('anon',
  'cotironda_private.whapi_claim_buyer_d082(text)','EXECUTE')
 or has_function_privilege('authenticated',
  'cotironda_private.whapi_finish_buyer_d082(text,text,uuid,text)','EXECUTE')
 or has_function_privilege('service_role',
  'cotironda_private.whapi_claim_buyer_d082(text)','EXECUTE')
 or not has_function_privilege('cotironda_buyer_queue_gateway_d082',
  'cotironda_private.whapi_claim_buyer_d082(text)','EXECUTE')
 or has_table_privilege('cotironda_buyer_queue_gateway_d082',
  'cotironda_private.whapi_buyer_jobs_d082','SELECT')
 or has_table_privilege('cotironda_buyer_queue_gateway_d082',
  'cotironda_private.whapi_buyer_inbox_d074','SELECT')
 or (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc
   where oid='cotironda_private.whapi_claim_buyer_d082(text)'::regprocedure)
   <>'cotironda_buyer_queue_owner_d082'
 then raise exception 'd082_acl_failure';end if;end;$acl$;

insert into public.organizations(id,display_name,organization_type)
 values('aaaaaaaa-0082-4082-8082-000000000821','Buyer Queue D082','buyer');
insert into cotironda_private.whapi_buyer_contacts_d074(
 channel_id,chat_key,buyer_org_id,verified_at,consented_at)
 values('d082_ci',repeat('a',64),
  'aaaaaaaa-0082-4082-8082-000000000821',
  now()-interval '1 hour',now()-interval '1 hour');
insert into cotironda_private.whapi_buyer_inbox_d074(
 channel_id,message_key,chat_key,buyer_org_id,payload_fingerprint,kind,
 crypto_key_id,payload_ciphertext,payload_nonce,payload_tag,source_unix,status)
values
 ('d082_ci',repeat('1',64),repeat('a',64),
  'aaaaaaaa-0082-4082-8082-000000000821',repeat('a',64),'text',
  'aes_2026_a',decode(repeat('ab',42),'hex'),
  decode(repeat('cd',12),'hex'),decode(repeat('ef',16),'hex'),
  1800000000,'pendiente_interpretacion'),
 ('d082_ci',repeat('2',64),repeat('a',64),
  'aaaaaaaa-0082-4082-8082-000000000821',repeat('b',64),'document',
  'aes_2026_a',decode(repeat('ac',42),'hex'),
  decode(repeat('dc',12),'hex'),decode(repeat('fe',16),'hex'),
  1800000001,'pendiente_interpretacion'),
 ('d082_ci',repeat('3',64),repeat('a',64),
  'aaaaaaaa-0082-4082-8082-000000000821',repeat('c',64),'opt_out',
  'aes_2026_a',null,null,null,
  1800000002,'opt_out_registrado'),
 ('d082_ci',repeat('4',64),repeat('a',64),
  'aaaaaaaa-0082-4082-8082-000000000821',repeat('d',64),'text',
  'aes_2026_a',decode(repeat('ac',42),'hex'),
  decode(repeat('dc',12),'hex'),decode(repeat('fe',16),'hex'),
  1800000003,'pendiente_interpretacion');

select ci_helpers.assert_true(
 (select count(*)=3 from cotironda_private.whapi_buyer_jobs_d082
  where channel_id='d082_ci' and status='pending' and attempts=0)
 and not exists(select 1 from cotironda_private.whapi_buyer_jobs_d082
  where channel_id='d082_ci' and message_key=repeat('3',64)),
 'd082_inbox_trigger_queues_only_non_baja_once');
insert into cotironda_private.whapi_buyer_inbox_d074(
 channel_id,message_key,chat_key,buyer_org_id,payload_fingerprint,kind,
 crypto_key_id,payload_ciphertext,payload_nonce,payload_tag,source_unix,status)
values('d082_ci',repeat('1',64),repeat('a',64),
 'aaaaaaaa-0082-4082-8082-000000000821',repeat('a',64),'text',
 'aes_2026_a',decode(repeat('ab',42),'hex'),
 decode(repeat('cd',12),'hex'),decode(repeat('ef',16),'hex'),
 1800000000,'pendiente_interpretacion')
 on conflict(channel_id,message_key) do nothing;
select ci_helpers.assert_true(
 (select count(*)=3 from cotironda_private.whapi_buyer_jobs_d082
  where channel_id='d082_ci'),'d082_repeat_no_duplicate_job');

set local role cotironda_buyer_queue_gateway_d082;
do $work$ declare c jsonb;r jsonb;v uuid;begin
 c:=cotironda_private.whapi_claim_buyer_d082('d082_ci');
 if c->>'channel'<>'d082_ci' or c->>'messageKey'<>repeat('1',64)
  or c->>'attempt'<>'1' then raise exception 'd082_claim_first_wrong';end if;
 v:=(c->>'leaseToken')::uuid;
 if cotironda_private.whapi_claim_buyer_d082('another_channel') is not null
  then raise exception 'd082_other_channel_job_leak';end if;
 r:=cotironda_private.whapi_finish_buyer_d082('d082_ci',repeat('1',64),
  v,'zone_queued');
 if r->>'state'<>'done' or r->>'attempts'<>'1'
 then raise exception 'd082_complete_zone_failed';end if;
 begin
  perform cotironda_private.whapi_finish_buyer_d082('d082_ci',
   repeat('1',64),v,'zone_queued');
  raise exception 'd082_double_finish_accepted';
 exception when insufficient_privilege then null;end;

 c:=cotironda_private.whapi_claim_buyer_d082('d082_ci');
 if c->>'messageKey'<>repeat('2',64) then raise exception 'd082_doc_claim_missing';end if;
 r:=cotironda_private.whapi_finish_buyer_d082('d082_ci',repeat('2',64),
  (c->>'leaseToken')::uuid,'requires_review');
 if r->>'state'<>'manual_review' then raise exception 'd082_doc_not_review';end if;

 c:=cotironda_private.whapi_claim_buyer_d082('d082_ci');
 if c->>'messageKey'<>repeat('4',64) then raise exception 'd082_third_claim_missing';end if;
 begin
  perform cotironda_private.whapi_finish_buyer_d082('d082_ci',repeat('4',64),
    'aaaaaaaa-0082-4082-8082-000000000899'::uuid,'round_saved');
  raise exception 'd082_fake_lease_accepted';
 exception when insufficient_privilege then null;end;
 r:=cotironda_private.whapi_finish_buyer_d082('d082_ci',repeat('4',64),
  (c->>'leaseToken')::uuid,'retry');
 if r->>'state'<>'pending' or r->>'attempts'<>'1'
 then raise exception 'd082_retry_not_pending';end if;

 if cotironda_private.whapi_claim_buyer_d082('d082_ci') is not null
  then raise exception 'd082_retry_no_backoff';end if;
end;$work$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.whapi_buyer_jobs_d082
  where message_key=repeat('1',64) and status='done' and outcome='zone_queued'
   and finished_at is not null and lease_token is null)
 and (select count(*)=1 from cotironda_private.whapi_buyer_jobs_d082
  where message_key=repeat('2',64) and status='manual_review'
   and outcome='requires_review')
 and (select count(*)=1 from cotironda_private.whapi_buyer_jobs_d082
  where message_key=repeat('4',64) and status='pending'
   and outcome='processing_failed' and attempts=1),
 'd082_queue_durable_states_and_backoff');
rollback;
