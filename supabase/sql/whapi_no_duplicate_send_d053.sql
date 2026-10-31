-- D053 / Issue #209. PG17 disposable CI only; NEVER install in DEV/prod until #175.
-- A lease expiry AFTER external HTTP may have started is NOT proof of failure.
-- Safety first: NO automatic resend once send_phase leaves not_started.
alter table cotironda_private.whapi_reply_jobs_d047
 add column send_phase text not null default 'not_started'
  check(send_phase in ('not_started','in_flight','uncertain','accepted')),
 add column send_started_at timestamptz,
 add column uncertain_at timestamptz,
 add column reconciliation_evidence_hmac text
  check(reconciliation_evidence_hmac ~ '^[a-f0-9]{64}$');
-- Backfill legacy ACKs BEFORE enforcing invariants; no invented evidence.
update cotironda_private.whapi_reply_jobs_d047
 set send_phase='accepted' where status='accepted_by_transport';
alter table cotironda_private.whapi_reply_jobs_d047
 add constraint d053_consistent_send_phase check (
  (send_phase='not_started' and status in ('queued','leased','cancelled','exhausted'))
  or (send_phase in ('in_flight','uncertain') and status='leased')
  or (send_phase='accepted' and status='accepted_by_transport')
 );

-- The old D047 "false" outcome is safe ONLY before HTTP starts.
-- "true" (ack) must use whapi_record_send_outcome_d053 after begin_send.
create or replace function cotironda_private.whapi_finish_reply_d047(
 p_job uuid,p_lease uuid,p_accepted boolean,p_ack_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_reply_jobs_d047%rowtype;
 v_status text;
begin
 if p_job is null or p_lease is null or p_accepted is null or p_accepted
    or p_ack_key is not null
 then raise exception 'd053_use_begin_send_and_record_outcome' using errcode='42501';end if;
 select * into v_job from cotironda_private.whapi_reply_jobs_d047
 where job_id=p_job for update;
 if not found or v_job.status<>'leased'
    or v_job.send_phase<>'not_started' or v_job.lease_token<>p_lease
    or v_job.leased_until<=pg_catalog.clock_timestamp()
 then raise exception 'd053_preflight_lease_invalid' using errcode='42501';end if;
 v_status:=case when v_job.attempts>=3 then 'exhausted' else 'queued' end;
 update cotironda_private.whapi_reply_jobs_d047
  set status=v_status,lease_token=null,leased_until=null,
   due_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(
    secs=>case v_job.attempts when 1 then 5 when 2 then 30 else 0 end)
 where job_id=p_job;
 return pg_catalog.jsonb_build_object('state',v_status);
end;$fn$;

-- The bridge must COMMIT this transition BEFORE HTTP.
-- Marking in_flight before the send may create "uncertain" for an unsent
-- message after a crash: intentional preference over duplicate delivery.
create function cotironda_private.whapi_begin_send_d053(
 p_job uuid,p_lease uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_reply_jobs_d047%rowtype;
 v_valid boolean;
begin
 if p_job is null or p_lease is null
 then raise exception 'd053_invalid_begin' using errcode='22023';end if;
 select * into v_job from cotironda_private.whapi_reply_jobs_d047
 where job_id=p_job for update;
 if not found or v_job.status<>'leased' or v_job.send_phase<>'not_started'
   or v_job.lease_token<>p_lease
   or v_job.leased_until<=pg_catalog.clock_timestamp()
 then raise exception 'd053_begin_lease_invalid' using errcode='42501';end if;
 select exists(
   select 1 from cotironda_private.rounds_v1 r
   join cotironda_private.offer_drafts_v1 d on
     d.round_id=r.id and d.supplier_org_id=v_job.supplier_org_id
   join cotironda_private.whapi_contacts_v1 c on
     c.channel_id=v_job.channel_id and c.chat_key=v_job.chat_key
   where r.id=v_job.round_id and r.status='abierta'
     and pg_catalog.clock_timestamp()>=r.begins_at
     and pg_catalog.clock_timestamp()<r.ends_at
     and d.revision=v_job.revision
     and c.supplier_org_id=v_job.supplier_org_id
     and c.opted_out_at is null
     and c.consented_at<=pg_catalog.clock_timestamp()
     and c.verified_at<=pg_catalog.clock_timestamp()
 ) into v_valid;
 if not v_valid then
   update cotironda_private.whapi_reply_jobs_d047
    set status='cancelled',lease_token=null,leased_until=null
   where job_id=p_job;
   return pg_catalog.jsonb_build_object('state','cancelled');
 end if;
 update cotironda_private.whapi_reply_jobs_d047
  set send_phase='in_flight',send_started_at=pg_catalog.clock_timestamp(),
   -- 120 sec window is for accepting the ACK only, NEVER automatic re-lease.
   leased_until=pg_catalog.clock_timestamp()+interval '120 seconds'
 where job_id=p_job;
 return pg_catalog.jsonb_build_object('state','in_flight','jobId',p_job);
end;$fn$;

-- The single legal response to HTTP outcome after begin_send:
-- accepted HMAC or UNCERTAIN. Missing ACK / timeout is *never* queued.
create function cotironda_private.whapi_record_send_outcome_d053(
 p_job uuid,p_lease uuid,p_outcome text,p_ack_hmac text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_reply_jobs_d047%rowtype;
begin
 if p_job is null or p_lease is null
  or p_outcome is null or p_outcome not in ('accepted_by_transport','uncertain')
  or (p_outcome='accepted_by_transport' and
    (p_ack_hmac is null or p_ack_hmac !~ '^[a-f0-9]{64}$'))
  or (p_outcome='uncertain' and p_ack_hmac is not null)
 then raise exception 'd053_invalid_outcome' using errcode='22023';end if;
 select * into v_job from cotironda_private.whapi_reply_jobs_d047
 where job_id=p_job for update;
 if not found or v_job.status<>'leased' or
    v_job.send_phase not in ('in_flight','uncertain') or
    v_job.lease_token<>p_lease
 then
   if v_job.job_id is not null and v_job.send_phase='accepted'
      and p_outcome='accepted_by_transport'
      and v_job.transport_ack_key=p_ack_hmac
   then return pg_catalog.jsonb_build_object(
      'state','accepted_by_transport','repeated',true);end if;
   raise exception 'd053_inflight_token_invalid' using errcode='42501';
 end if;
 if v_job.send_phase='uncertain' and p_outcome='uncertain'
 then return pg_catalog.jsonb_build_object('state','uncertain','repeated',true);end if;
 if p_outcome='accepted_by_transport' then
   update cotironda_private.whapi_reply_jobs_d047
     set status='accepted_by_transport',send_phase='accepted',
     lease_token=null,leased_until=null,
     accepted_at=pg_catalog.clock_timestamp(),transport_ack_key=p_ack_hmac
   where job_id=p_job;
 else
   update cotironda_private.whapi_reply_jobs_d047
     set send_phase='uncertain',uncertain_at=pg_catalog.clock_timestamp()
   where job_id=p_job;
 end if;
 return pg_catalog.jsonb_build_object('state',p_outcome,'repeated',false);
end;$fn$;

-- Recover from crashed workers; leased phase remains and token is held,
-- but NO worker may pick it again. Only an authenticated reconciliation
-- process may record observed provider evidence or choose cancellation.
create function cotironda_private.whapi_sweep_uncertain_d053()
returns integer language plpgsql volatile security definer set search_path='' as $fn$
declare v_count integer;
begin
 with expired as (
   select job_id from cotironda_private.whapi_reply_jobs_d047
   where status='leased' and send_phase='in_flight'
     and leased_until<=pg_catalog.clock_timestamp()
   order by leased_until,job_id for update skip locked limit 20
 ), moved as (
   update cotironda_private.whapi_reply_jobs_d047 j
   set send_phase='uncertain',uncertain_at=pg_catalog.clock_timestamp()
   from expired e where e.job_id=j.job_id returning j.job_id
 )
 select pg_catalog.count(*) into v_count from moved;
 return v_count;
end;$fn$;

-- No automatic "retry" decision is available from uncertain.
-- An authenticated reconciler supplies a server HMAC over external evidence.
-- SQL cannot validate external truth: broker and audit logs are still needed.
create function cotironda_private.whapi_reconcile_uncertain_d053(
 p_job uuid,p_decision text,p_ack_hmac text,p_evidence_hmac text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_reply_jobs_d047%rowtype;
 v_next text;
begin
 if p_job is null or p_decision is null or p_decision not in ('accepted_by_transport','cancelled')
  or p_evidence_hmac is null or p_evidence_hmac !~ '^[a-f0-9]{64}$'
  or (p_decision='accepted_by_transport' and
      (p_ack_hmac is null or p_ack_hmac !~ '^[a-f0-9]{64}$'))
  or (p_decision='cancelled' and p_ack_hmac is not null)
 then raise exception 'd053_reconciliation_invalid' using errcode='22023';end if;
 select * into v_job from cotironda_private.whapi_reply_jobs_d047
 where job_id=p_job for update;
 if not found then raise exception 'd053_reconciliation_missing' using errcode='42501';end if;
 if v_job.reconciliation_evidence_hmac=p_evidence_hmac
  and v_job.status=p_decision
  and (p_ack_hmac is null or v_job.transport_ack_key=p_ack_hmac)
 then return pg_catalog.jsonb_build_object('state',p_decision,'repeated',true);end if;
 if v_job.status<>'leased' or v_job.send_phase<>'uncertain'
 then raise exception 'd053_reconciliation_not_uncertain' using errcode='42501';end if;
 v_next:=p_decision;
 update cotironda_private.whapi_reply_jobs_d047
  set status=v_next,
  send_phase=case when p_decision='accepted_by_transport' then 'accepted'
    else 'not_started' end,
  lease_token=null,leased_until=null,
  transport_ack_key=case when p_decision='accepted_by_transport' then p_ack_hmac
    else null end,
  accepted_at=case when p_decision='accepted_by_transport'
    then pg_catalog.clock_timestamp() else null end,
  reconciliation_evidence_hmac=p_evidence_hmac
 where job_id=p_job;
 return pg_catalog.jsonb_build_object('state',v_next,'repeated',false);
end;$fn$;

-- Replace the D047 lease operation to distinguish no-send from in-flight.
-- Expired in-flight is swept into uncertain, NEVER reclaimed for another send.
create or replace function cotironda_private.whapi_lease_reply_d047()
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_reply_jobs_d047%rowtype;
 v_token uuid;v_ok boolean;v_attempt integer;
begin
 perform cotironda_private.whapi_sweep_uncertain_d053();
 with expired as (
  select job_id from cotironda_private.whapi_reply_jobs_d047
   where status='leased' and send_phase='not_started' and attempts>=3
     and leased_until<pg_catalog.clock_timestamp()
   order by leased_until for update skip locked limit 20
 )
 update cotironda_private.whapi_reply_jobs_d047 j
 set status='exhausted',lease_token=null,leased_until=null
 from expired e where j.job_id=e.job_id;
 for v_attempt in 1..8 loop
  select * into v_job from cotironda_private.whapi_reply_jobs_d047
   where send_phase='not_started' and
     ((status='queued' and due_at<=pg_catalog.clock_timestamp())
      or (status='leased' and leased_until<pg_catalog.clock_timestamp()))
     and attempts<3
   order by due_at,created_at,job_id
   for update skip locked limit 1;
  if not found then return null;end if;
  select exists(
    select 1 from cotironda_private.rounds_v1 r
    join cotironda_private.offer_drafts_v1 d on d.round_id=r.id
       and d.supplier_org_id=v_job.supplier_org_id
    join cotironda_private.whapi_contacts_v1 c
      on c.channel_id=v_job.channel_id and c.chat_key=v_job.chat_key
    where r.id=v_job.round_id and r.status='abierta'
      and pg_catalog.clock_timestamp()>=r.begins_at
      and pg_catalog.clock_timestamp()<r.ends_at
      and d.revision=v_job.revision
      and c.supplier_org_id=v_job.supplier_org_id
      and c.opted_out_at is null
   ) into v_ok;
  if not v_ok then
    update cotironda_private.whapi_reply_jobs_d047
      set status='cancelled',lease_token=null,leased_until=null
    where job_id=v_job.job_id;
    continue;
  end if;
  v_token:=pg_catalog.gen_random_uuid();
  update cotironda_private.whapi_reply_jobs_d047
     set status='leased',lease_token=v_token,
       leased_until=pg_catalog.clock_timestamp()+interval '45 seconds',
       attempts=attempts+1
   where job_id=v_job.job_id;
  return pg_catalog.jsonb_build_object('state','leased','jobId',v_job.job_id,
    'leaseToken',v_token,'roundId',v_job.round_id,
    'supplierOrgId',v_job.supplier_org_id,'revision',v_job.revision,
    'channelId',v_job.channel_id,'chatKey',v_job.chat_key);
 end loop;
 return null;
end;$fn$;

-- All new RPCs share D047's dedicated NOLOGIN, NOINHERIT, NOBYPASSRLS
-- owner, and EXECUTE ONLY gateway role. No Supabase service_role grants.
grant create on schema cotironda_private to cotironda_reply_writer;
grant cotironda_reply_writer to postgres with set true,inherit false;
alter function cotironda_private.whapi_begin_send_d053(uuid,uuid)
 owner to cotironda_reply_writer;
alter function cotironda_private.whapi_record_send_outcome_d053(uuid,uuid,text,text)
 owner to cotironda_reply_writer;
alter function cotironda_private.whapi_sweep_uncertain_d053()
 owner to cotironda_reply_writer;
alter function cotironda_private.whapi_reconcile_uncertain_d053(uuid,text,text,text)
 owner to cotironda_reply_writer;
revoke cotironda_reply_writer from postgres;
revoke create on schema cotironda_private from cotironda_reply_writer;
revoke all on function
 cotironda_private.whapi_begin_send_d053(uuid,uuid),
 cotironda_private.whapi_record_send_outcome_d053(uuid,uuid,text,text),
 cotironda_private.whapi_sweep_uncertain_d053(),
 cotironda_private.whapi_reconcile_uncertain_d053(uuid,text,text,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function
 cotironda_private.whapi_begin_send_d053(uuid,uuid),
 cotironda_private.whapi_record_send_outcome_d053(uuid,uuid,text,text),
 cotironda_private.whapi_sweep_uncertain_d053(),
 cotironda_private.whapi_reconcile_uncertain_d053(uuid,text,text,text)
 to cotironda_reply_gateway;
