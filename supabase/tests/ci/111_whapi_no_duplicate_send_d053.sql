-- D053 transactional PG17 regression; data wholly fictional; ROLLBACK.
begin;
create function pg_temp.d053_reject(p_sql text,p_error text)
returns void language plpgsql as $fn$
declare v_message text;v_failed boolean:=false;
begin
 begin execute p_sql;
 exception when others then
  get stacked diagnostics v_message=message_text;
  if pg_catalog.strpos(v_message,p_error)=0
  then raise exception 'd053_unexpected_error expected=% actual=%',p_error,v_message;end if;
  v_failed:=true;
 end;
 if not v_failed then raise exception 'd053_unexpected_success expected=%',p_error;end if;
end;$fn$;
do $audit$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_reply_writer'
  and not rolcanlogin and not rolinherit and not rolbypassrls)
 or has_function_privilege('anon',
  'cotironda_private.whapi_begin_send_d053(uuid,uuid)','EXECUTE')
 or has_function_privilege('service_role',
  'cotironda_private.whapi_reconcile_uncertain_d053(uuid,text,text,text)','EXECUTE')
 or has_function_privilege('authenticated',
  'cotironda_private.whapi_record_send_outcome_d053(uuid,uuid,text,text)','EXECUTE')
 or not has_function_privilege('cotironda_reply_gateway',
  'cotironda_private.whapi_begin_send_d053(uuid,uuid)','EXECUTE')
 or has_table_privilege('cotironda_reply_gateway',
  'cotironda_private.whapi_reply_jobs_d047','SELECT')
 then raise exception 'd053_gateway_privilege_violation';end if;
 if (select count(*) from pg_proc where oid in (
  'cotironda_private.whapi_begin_send_d053(uuid,uuid)'::regprocedure,
  'cotironda_private.whapi_record_send_outcome_d053(uuid,uuid,text,text)'::regprocedure,
  'cotironda_private.whapi_reconcile_uncertain_d053(uuid,text,text,text)'::regprocedure,
  'cotironda_private.whapi_sweep_uncertain_d053()'::regprocedure
 ) and pg_get_userbyid(proowner)='cotironda_reply_writer')<>4
 then raise exception 'd053_non_privileged_owner_required';end if;
end;$audit$;

insert into public.organizations(id,display_name,organization_type) values
('aaaaaaaa-0000-4000-8000-000000000531','Comprador ensayo','buyer'),
('bbbbbbbb-0000-4000-8000-000000000532','Proveedor ensayo','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
values('bbbbbbbb-0000-4000-8000-000000000532','Proveedor simulado',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
values('dddddddd-0000-4000-8000-000000000534',
 'aaaaaaaa-0000-4000-8000-000000000531',
 now()-interval '2 minutes',now()+interval '2 hours');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
values('dddddddd-0000-4000-8000-000000000534',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position)
values('dddddddd-0000-4000-8000-000000000534',
 'bbbbbbbb-0000-4000-8000-000000000532','anon_d053',1);
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0000-4000-8000-000000000534';
insert into cotironda_private.whapi_contacts_v1
(channel_id,chat_key,supplier_org_id,verified_at,consented_at)
values('d053_ci',repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000532',
 now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,
  payload_fingerprint,kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
select 'd053_ci',repeat(s,64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000532'::uuid,
 'dddddddd-0000-4000-8000-000000000534'::uuid,
 repeat(s,64),'text',pg_catalog.decode(repeat('44',32),'hex'),
 pg_catalog.decode(repeat('55',12),'hex'),
 pg_catalog.decode(repeat('66',16),'hex'),1800000000
 from (values('1'),('2'),('3'),('4')) as t(s);
do $cases$
declare
 r constant uuid:='dddddddd-0000-4000-8000-000000000534';
 offer jsonb:='{"currency":"ARS","payment_method":"transferencia",
 "lead_days":3,"freight_gross":"100.00","min_goods_gross":"0.00",
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":"2500.00","vat_rate":"21"}]}'::jsonb;
 j jsonb;l jsonb;v jsonb;other jsonb;
 id1 uuid;id2 uuid;id3 uuid;
 token1 uuid;token2 uuid;
begin
 perform cotironda_private.whapi_save_draft_from_inbox_d048(
  'd053_ci',repeat('1',64),'eeeeeeee-0000-4000-8000-000000000531',0,offer);
 j:=cotironda_private.whapi_enqueue_reply_d047('d053_ci',repeat('1',64),1);
 id1:=(j->>'jobId')::uuid;
 l:=cotironda_private.whapi_lease_reply_d047();
 token1:=(l->>'leaseToken')::uuid;
 if (l->>'jobId')::uuid<>id1 then raise exception 'd053_claim_failed';end if;
 if cotironda_private.whapi_lease_reply_d047() is not null
 then raise exception 'd053_lease_duplicate';end if;
 perform pg_temp.d053_reject(format(
  'select cotironda_private.whapi_begin_send_d053(%L,%L)',
  id1,'aaaaaaaa-0000-4000-8000-000000000599'),
 'd053_begin_lease_invalid');
 perform pg_temp.d053_reject(format(
  'select cotironda_private.whapi_finish_reply_d047(%L,%L,true,%L)',
  id1,token1,repeat('f',64)),
 'd053_use_begin_send_and_record_outcome');
 v:=cotironda_private.whapi_begin_send_d053(id1,token1);
 if v->>'state'<>'in_flight' then raise exception 'd053_pre_http_not_marked';end if;
 perform pg_temp.d053_reject(format(
  'select cotironda_private.whapi_begin_send_d053(%L,%L)',id1,token1),
 'd053_begin_lease_invalid');
 perform pg_temp.d053_reject(format(
  'select cotironda_private.whapi_finish_reply_d047(%L,%L,false,NULL)',id1,token1),
 'd053_preflight_lease_invalid');

 -- Crash/time-out after HTTP MAY have happened; direct lease expiry MUST NOT
 -- claim it again under another token.
 update cotironda_private.whapi_reply_jobs_d047
  set leased_until=pg_catalog.clock_timestamp()-interval '1 second'
  where job_id=id1;
 l:=cotironda_private.whapi_lease_reply_d047();
 if l is not null then raise exception 'd053_inflight_released_to_other_worker';end if;
 if (select send_phase from cotironda_private.whapi_reply_jobs_d047
  where job_id=id1)<>'uncertain'
 then raise exception 'd053_expired_inflight_not_uncertain';end if;
 if cotironda_private.whapi_sweep_uncertain_d053()<>0
 then raise exception 'd053_sweep_not_idempotent';end if;
 v:=cotironda_private.whapi_record_send_outcome_d053(
  id1,token1,'uncertain',null);
 if v->>'state'<>'uncertain' or v->>'repeated'<>'true'
 then raise exception 'd053_uncertain_not_idempotent';end if;
 perform pg_temp.d053_reject(format(
   'select cotironda_private.whapi_reconcile_uncertain_d053(%L,%L,%L,%L)',
   id1,'accepted_by_transport',repeat('f',64),'bad'),
  'd053_reconciliation_invalid');
 v:=cotironda_private.whapi_reconcile_uncertain_d053(
  id1,'accepted_by_transport',repeat('f',64),repeat('e',64));
 if v->>'state'<>'accepted_by_transport' then
  raise exception 'd053_reconciliation_accept_failed';end if;
 v:=cotironda_private.whapi_reconcile_uncertain_d053(
  id1,'accepted_by_transport',repeat('f',64),repeat('e',64));
 if v->>'repeated'<>'true' then
  raise exception 'd053_reconciliation_replay_wrong';end if;
 perform pg_temp.d053_reject(format(
   'select cotironda_private.whapi_reconcile_uncertain_d053(%L,%L,%L,%L)',
   id1,'cancelled',null,repeat('a',64)),
  'd053_reconciliation_not_uncertain');
 if (select send_phase from cotironda_private.whapi_reply_jobs_d047
  where job_id=id1)<>'accepted'
 then raise exception 'd053_accepted_not_immutable';end if;

 perform cotironda_private.whapi_save_draft_from_inbox_d048(
  'd053_ci',repeat('2',64),'eeeeeeee-0000-4000-8000-000000000532',1,offer);
 j:=cotironda_private.whapi_enqueue_reply_d047('d053_ci',repeat('2',64),2);
 id2:=(j->>'jobId')::uuid;
 l:=cotironda_private.whapi_lease_reply_d047();
 token2:=(l->>'leaseToken')::uuid;
 if (l->>'jobId')::uuid<>id2 then raise exception 'd053_job2_wrong';end if;
 -- Known failure BEFORE beginning HTTP is safe to retry with backoff.
 v:=cotironda_private.whapi_finish_reply_d047(id2,token2,false,null);
 if v->>'state'<>'queued'
 then raise exception 'd053_known_preflight_retry_missing';end if;
 update cotironda_private.whapi_reply_jobs_d047
  set due_at=pg_catalog.clock_timestamp()-interval '1 second'
 where job_id=id2;
 l:=cotironda_private.whapi_lease_reply_d047();
 token2:=(l->>'leaseToken')::uuid;
 if (l->>'jobId')::uuid<>id2 then raise exception 'd053_preflight_released_wrong';end if;
 perform cotironda_private.whapi_begin_send_d053(id2,token2);
 v:=cotironda_private.whapi_record_send_outcome_d053(
   id2,token2,'uncertain',null);
 if v->>'state'<>'uncertain' then raise exception 'd053_timeout_retrying';end if;
 if cotironda_private.whapi_lease_reply_d047() is not null
 then raise exception 'd053_timeout_was_requeued';end if;
 v:=cotironda_private.whapi_reconcile_uncertain_d053(
   id2,'cancelled',null,repeat('d',64));
 if v->>'state'<>'cancelled'
  or (select status from cotironda_private.whapi_reply_jobs_d047
     where job_id=id2)<>'cancelled'
 then raise exception 'd053_no_evidence_should_cancel_not_retry';end if;
 if cotironda_private.whapi_lease_reply_d047() is not null
 then raise exception 'd053_cancel_was_resend';end if;
 -- Stale/consent guard at the last safe pre-HTTP boundary.
 perform cotironda_private.whapi_save_draft_from_inbox_d048(
  'd053_ci',repeat('3',64),'eeeeeeee-0000-4000-8000-000000000533',2,offer);
 j:=cotironda_private.whapi_enqueue_reply_d047('d053_ci',repeat('3',64),3);
 id3:=(j->>'jobId')::uuid;
 l:=cotironda_private.whapi_lease_reply_d047();
 update cotironda_private.whapi_contacts_v1
  set opted_out_at=pg_catalog.clock_timestamp()
  where channel_id='d053_ci' and chat_key=repeat('a',64);
 v:=cotironda_private.whapi_begin_send_d053(id3,(l->>'leaseToken')::uuid);
 if v->>'state'<>'cancelled'
 then raise exception 'd053_optout_race_not_rechecked';end if;
 if (select status from cotironda_private.whapi_reply_jobs_d047
     where job_id=id3)<>'cancelled'
 then raise exception 'd053_optout_not_cancelled';end if;
end;$cases$;
rollback;
