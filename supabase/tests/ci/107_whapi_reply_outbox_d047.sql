-- D047 / Issue #197. PostgreSQL 17 REAL in GitHub CI, FICTIONAL data.
-- D047 tables/functions remain installed only in disposable CI DB.
begin;
create function pg_temp.d047_expect_error(p_sql text,p_expected text)
 returns void language plpgsql as $$
declare msg text;failed boolean:=false;
begin
 begin execute p_sql;
 exception when others then
  get stacked diagnostics msg=message_text;
  if position(p_expected in msg)=0 then
    raise exception 'd047_wrong_error_expected_%_got_%',p_expected,msg;
  end if;
  failed:=true;
 end;
 if not failed then raise exception 'd047_unexpected_success';end if;
end;$$;
do $$
begin
 if not exists (select 1 from pg_roles where rolname='cotironda_reply_writer'
  and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not exists (select 1 from pg_roles where rolname='cotironda_reply_gateway'
  and not rolcanlogin and not rolinherit and not rolbypassrls)
 or (select count(*) from pg_class where oid=
   'cotironda_private.whapi_reply_jobs_d047'::regclass and relrowsecurity)<>1
 or has_table_privilege('anon','cotironda_private.whapi_reply_jobs_d047','SELECT')
 or has_table_privilege('service_role','cotironda_private.whapi_reply_jobs_d047','INSERT')
 or has_table_privilege('authenticated','cotironda_private.whapi_reply_jobs_d047','UPDATE')
 or has_function_privilege('anon',
   'cotironda_private.whapi_enqueue_reply_d047(text,text,integer)','EXECUTE')
 or has_function_privilege('service_role',
   'cotironda_private.whapi_lease_reply_d047()','EXECUTE')
 or has_function_privilege('authenticated',
   'cotironda_private.whapi_finish_reply_d047(uuid,uuid,boolean,text)','EXECUTE')
 or not has_function_privilege('cotironda_reply_gateway',
   'cotironda_private.whapi_enqueue_reply_d047(text,text,integer)','EXECUTE')
 or has_table_privilege('cotironda_reply_gateway',
   'cotironda_private.whapi_reply_jobs_d047','SELECT')
 or (select pg_get_userbyid(proowner) from pg_proc
   where oid='cotironda_private.whapi_enqueue_reply_d047(text,text,integer)'::regprocedure)
      <>'cotironda_reply_writer'
 then raise exception 'd047_security_violation';end if;
 if exists(select 1 from information_schema.columns
   where table_schema='cotironda_private' and table_name='whapi_reply_jobs_d047'
   and column_name in ('phone','chat_id','message_body','text','wa_id','url','recipient'))
 then raise exception 'd047_plaintext_columns';end if;
end;$$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000471','Comprador ficticio D047','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000472','Proveedor ficticio D047','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
 values ('bbbbbbbb-0000-4000-8000-000000000472','Corralón ficticio',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values ('dddddddd-0000-4000-8000-000000000474',
 'aaaaaaaa-0000-4000-8000-000000000471',
 now()-interval '1 minute',now()+interval '2 hours');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
 values ('dddddddd-0000-4000-8000-000000000474',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position) values
 ('dddddddd-0000-4000-8000-000000000474',
  'bbbbbbbb-0000-4000-8000-000000000472','anon_d047_test',1);
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0000-4000-8000-000000000474';
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at)
 values('whapi_d047',repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000472',now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,
  payload_fingerprint,kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
 values
 ('whapi_d047',repeat('b',64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000472','dddddddd-0000-4000-8000-000000000474',
 repeat('c',64),'text',decode(repeat('55',18),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000),
 ('whapi_d047',repeat('d',64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000472','dddddddd-0000-4000-8000-000000000474',
 repeat('e',64),'text',decode(repeat('44',18),'hex'),decode(repeat('33',12),'hex'),
 decode(repeat('44',16),'hex'),1800000000),
 ('whapi_d047',repeat('f',64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000472','dddddddd-0000-4000-8000-000000000474',
 repeat('1',64),'text',decode(repeat('66',18),'hex'),decode(repeat('55',12),'hex'),
 decode(repeat('66',16),'hex'),1800000000);
do $$
declare
 r constant uuid:='dddddddd-0000-4000-8000-000000000474';
 s constant uuid:='bbbbbbbb-0000-4000-8000-000000000472';
 offer jsonb:='{"currency":"ARS","payment_method":"transferencia",
 "lead_days":3,"freight_gross":"100.00","min_goods_gross":"0.00",
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":"2500.00","vat_rate":"21"}]}'::jsonb;
 j jsonb;
 j2 jsonb;
 claimed jsonb;
 q jsonb;
 v integer;
begin
 perform cotironda_private.save_offer_draft_atomic_v1(r,s,
   'eeeeeeee-0000-4000-8000-000000000471',0,offer);
 perform pg_temp.d047_expect_error(format(
  'select cotironda_private.whapi_enqueue_reply_d047(%L,%L,2)',
  'whapi_d047',repeat('b',64)),'d047_stale_draft');
 perform pg_temp.d047_expect_error(format(
  'select cotironda_private.whapi_enqueue_reply_d047(%L,%L,1)',
  'whapi_d047',repeat('0',64)),'d047_untrusted_source');
 j:=cotironda_private.whapi_enqueue_reply_d047('whapi_d047',repeat('b',64),1);
 if j->>'state'<>'queued' or j->>'repeated'<>'false'
 then raise exception 'd047_enqueue_bad';end if;
 j2:=cotironda_private.whapi_enqueue_reply_d047('whapi_d047',repeat('b',64),1);
 if j2->>'state'<>'already_registered' or j2->>'jobId'<>j->>'jobId'
 then raise exception 'd047_replay_duplicate';end if;
 perform pg_temp.d047_expect_error(format(
   'select cotironda_private.whapi_enqueue_reply_d047(%L,%L,1)',
    'whapi_d047',repeat('d',64)),'d047_revision_conflict');
 if (select count(*) from cotironda_private.whapi_reply_jobs_d047)<>1
 then raise exception 'd047_duplicate_job';end if;

 claimed:=cotironda_private.whapi_lease_reply_d047();
 if claimed->>'state'<>'leased' or claimed->>'revision'<>'1'
  or claimed ? 'messageBody' or claimed ? 'phone'
 then raise exception 'd047_lease_invalid';end if;
 if cotironda_private.whapi_lease_reply_d047() is not null
 then raise exception 'd047_double_claim';end if;
 perform pg_temp.d047_expect_error(format(
 'select cotironda_private.whapi_finish_reply_d047(%L,%L,true,%L)',
 claimed->>'jobId','aaaaaaaa-0000-4000-8000-000000000499',repeat('9',64)),
 'd047_lease_invalid');
 q:=cotironda_private.whapi_finish_reply_d047(
   (claimed->>'jobId')::uuid,(claimed->>'leaseToken')::uuid,
   true,repeat('9',64));
 if q->>'state'<>'accepted_by_transport'
 then raise exception 'd047_transport_ack_wrong';end if;
 if cotironda_private.whapi_lease_reply_d047() is not null
 then raise exception 'd047_sent_leased_again';end if;

 -- When the D026 draft revision moves, a previously queued reply is obsolete.
 perform cotironda_private.save_offer_draft_atomic_v1(r,s,
   'eeeeeeee-0000-4000-8000-000000000472',1,offer);
 j:=cotironda_private.whapi_enqueue_reply_d047('whapi_d047',repeat('d',64),2);
 perform cotironda_private.save_offer_draft_atomic_v1(r,s,
   'eeeeeeee-0000-4000-8000-000000000473',2,offer);
 if cotironda_private.whapi_lease_reply_d047() is not null
 then raise exception 'd047_obsolete_reply_leased';end if;
 if (select status from cotironda_private.whapi_reply_jobs_d047
    where job_id=(j->>'jobId')::uuid)<>'cancelled'
 then raise exception 'd047_obsolete_reply_not_cancelled';end if;

 -- Lease timeout + retry budget, no repeated send while lease is held.
 j:=cotironda_private.whapi_enqueue_reply_d047('whapi_d047',repeat('f',64),3);
 for v in 1..3 loop
  claimed:=cotironda_private.whapi_lease_reply_d047();
  if claimed->>'jobId'<>j->>'jobId' then raise exception 'd047_retry_wrong_job';end if;
  q:=cotironda_private.whapi_finish_reply_d047(
    (claimed->>'jobId')::uuid,(claimed->>'leaseToken')::uuid,false,null);
  if v<3 and q->>'state'<>'queued' then raise exception 'd047_retry_not_queued';end if;
  if v=3 and q->>'state'<>'exhausted' then raise exception 'd047_attempts_not_bounded';end if;
  -- Fast-forward synthetic due_at; no sleeps or real messages.
  if v<3 then update cotironda_private.whapi_reply_jobs_d047
    set due_at=clock_timestamp()-interval '1 second'
    where job_id=(j->>'jobId')::uuid;end if;
 end loop;
 if cotironda_private.whapi_lease_reply_d047() is not null
 then raise exception 'd047_exhausted_leased';end if;
 if (select count(*) from cotironda_private.whapi_reply_jobs_d047)<>3
 then raise exception 'd047_unexpected_jobs';end if;
end;$$;

-- No jobs, fictional contacts or offers survive this test.

-- D047 edge cases: a worker dies on its FINAL lease; a provider opts out
-- while the summary is still queued. Each scenario is transactionally isolated.
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,
  payload_fingerprint,kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
 values
 ('whapi_d047',repeat('2',64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000472','dddddddd-0000-4000-8000-000000000474',
 repeat('2',64),'text',decode(repeat('77',18),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000),
 ('whapi_d047',repeat('3',64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000472','dddddddd-0000-4000-8000-000000000474',
 repeat('3',64),'text',decode(repeat('88',18),'hex'),decode(repeat('33',12),'hex'),
 decode(repeat('44',16),'hex'),1800000000);
do $$
declare
 r constant uuid:='dddddddd-0000-4000-8000-000000000474';
 s constant uuid:='bbbbbbbb-0000-4000-8000-000000000472';
 offer jsonb:='{"currency":"ARS","payment_method":"transferencia",
 "lead_days":3,"freight_gross":"100.00","min_goods_gross":"0.00",
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":"2500.00","vat_rate":"21"}]}'::jsonb;
 j jsonb;
 lease jsonb;
 ack jsonb;
 v integer;
begin
 perform cotironda_private.save_offer_draft_atomic_v1(r,s,
  'eeeeeeee-0000-4000-8000-000000000474',3,offer);
 j:=cotironda_private.whapi_enqueue_reply_d047('whapi_d047',repeat('2',64),4);
 for v in 1..3 loop
  lease:=cotironda_private.whapi_lease_reply_d047();
  if lease->>'jobId'<>j->>'jobId'
   then raise exception 'd047_crash_lease_missing';end if;
  if v<3 then
   ack:=cotironda_private.whapi_finish_reply_d047(
     (lease->>'jobId')::uuid,(lease->>'leaseToken')::uuid,false,null);
   update cotironda_private.whapi_reply_jobs_d047
     set due_at=clock_timestamp()-interval '1 second'
     where job_id=(j->>'jobId')::uuid;
  else
   -- Simulates a worker crash after taking the third lease; NO ACK.
   update cotironda_private.whapi_reply_jobs_d047
    set leased_until=clock_timestamp()-interval '1 second'
    where job_id=(j->>'jobId')::uuid;
  end if;
 end loop;
 lease:=cotironda_private.whapi_lease_reply_d047();
 if lease is not null
 then raise exception 'd047_final_lease_claimed_other';end if;
 if (select status from cotironda_private.whapi_reply_jobs_d047
     where job_id=(j->>'jobId')::uuid)<>'exhausted'
 then raise exception 'd047_final_lease_stuck';end if;

 perform cotironda_private.save_offer_draft_atomic_v1(r,s,
  'eeeeeeee-0000-4000-8000-000000000475',4,offer);
 j:=cotironda_private.whapi_enqueue_reply_d047('whapi_d047',repeat('3',64),5);
 update cotironda_private.whapi_contacts_v1
  set opted_out_at=clock_timestamp()
  where channel_id='whapi_d047' and chat_key=repeat('a',64);
 if cotironda_private.whapi_lease_reply_d047() is not null
 then raise exception 'd047_optout_job_was_leased';end if;
 if (select status from cotironda_private.whapi_reply_jobs_d047
    where job_id=(j->>'jobId')::uuid)<>'cancelled'
 then raise exception 'd047_optout_not_cancelled';end if;
end;$$;

rollback;
