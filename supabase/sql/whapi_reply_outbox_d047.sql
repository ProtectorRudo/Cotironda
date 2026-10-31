-- D047 / Issue #197: PRIVATE OUTBOX INTENTS ONLY, PostgreSQL17 CI.
-- Depends on D024, D026, D028, D030. NO DEV MIGRATION / NO Whapi send.
-- The worker must compose message from CURRENT verified D026 draft and a
-- trusted chat mapping; no phone, WhatsApp ID, plaintext or HTTP URL is stored.
create role cotironda_reply_writer nologin noinherit nobypassrls;
create role cotironda_reply_gateway nologin noinherit nobypassrls;
grant usage on schema cotironda_private to cotironda_reply_writer,cotironda_reply_gateway;
grant select on cotironda_private.rounds_v1,
 cotironda_private.round_invites_v1,cotironda_private.offer_drafts_v1,
 cotironda_private.whapi_inbox_v1,cotironda_private.whapi_contacts_v1
 to cotironda_reply_writer;
-- FOR SHARE requires UPDATE privileges and RLS UPDATE, but WITH CHECK(false)
-- prevents any actual round changes by this role.
grant update(status) on cotironda_private.rounds_v1 to cotironda_reply_writer;
create policy d047_round_read on cotironda_private.rounds_v1
 for select to cotironda_reply_writer using (true);
create policy d047_round_lock on cotironda_private.rounds_v1
 for update to cotironda_reply_writer using (true) with check (false);
create policy d047_invite_read on cotironda_private.round_invites_v1
 for select to cotironda_reply_writer using (true);
create policy d047_draft_read on cotironda_private.offer_drafts_v1
 for select to cotironda_reply_writer using (true);
create policy d047_inbox_read on cotironda_private.whapi_inbox_v1
 for select to cotironda_reply_writer using (true);
create policy d047_contact_read on cotironda_private.whapi_contacts_v1
 for select to cotironda_reply_writer using (true);

create table cotironda_private.whapi_reply_jobs_d047 (
 job_id uuid primary key default pg_catalog.gen_random_uuid(),
 round_id uuid not null,
 supplier_org_id uuid not null,
 revision integer not null check(revision between 1 and 100000),
 channel_id text not null,
 message_key text not null,
 chat_key text not null check(chat_key ~ '^[a-f0-9]{64}$'),
 status text not null default 'queued'
  check(status in ('queued','leased','accepted_by_transport','exhausted','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 due_at timestamptz not null default pg_catalog.clock_timestamp(),
 lease_token uuid,
 leased_until timestamptz,
 transport_ack_key text check(transport_ack_key ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default pg_catalog.clock_timestamp(),
 accepted_at timestamptz,
 unique(round_id,supplier_org_id,revision),
 unique(channel_id,message_key),
 foreign key(round_id,supplier_org_id)
   references cotironda_private.offer_drafts_v1(round_id,supplier_org_id)
   on delete restrict,
 foreign key(channel_id,message_key)
   references cotironda_private.whapi_inbox_v1(channel_id,message_key)
   on delete restrict,
 foreign key(channel_id,chat_key)
   references cotironda_private.whapi_contacts_v1(channel_id,chat_key)
   on delete restrict,
 check ((status='leased' and lease_token is not null and leased_until is not null)
     or (status<>'leased' and lease_token is null and leased_until is null)),
 check (status<>'accepted_by_transport' or
  (transport_ack_key is not null and accepted_at is not null))
);
create index whapi_reply_due_d047
 on cotironda_private.whapi_reply_jobs_d047(due_at,created_at)
 where status in ('queued','leased');
alter table cotironda_private.whapi_reply_jobs_d047 enable row level security;
revoke all on cotironda_private.whapi_reply_jobs_d047
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert,update on cotironda_private.whapi_reply_jobs_d047
 to cotironda_reply_writer;
create policy d047_reply_select on cotironda_private.whapi_reply_jobs_d047
 for select to cotironda_reply_writer using(true);
create policy d047_reply_insert on cotironda_private.whapi_reply_jobs_d047
 for insert to cotironda_reply_writer with check(true);
create policy d047_reply_update on cotironda_private.whapi_reply_jobs_d047
 for update to cotironda_reply_writer using(true) with check(true);

-- Atomic: source message was durably saved, contact is still subscribed,
-- round is open and the EXACT draft revision is current.
create function cotironda_private.whapi_enqueue_reply_d047(
 p_channel text,p_message_key text,p_revision integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_inbox cotironda_private.whapi_inbox_v1%rowtype;
 v_round cotironda_private.rounds_v1%rowtype;
 v_existing cotironda_private.whapi_reply_jobs_d047%rowtype;
 v_id uuid;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
 or p_message_key is null or p_message_key !~ '^[a-f0-9]{64}$'
 or p_revision is null or p_revision<1 or p_revision>100000
 then raise exception 'd047_bad_request' using errcode='22023';end if;

 select * into v_inbox from cotironda_private.whapi_inbox_v1
 where channel_id=p_channel and message_key=p_message_key;
 if not found or v_inbox.kind<>'text' or v_inbox.round_id is null
 then raise exception 'd047_untrusted_source' using errcode='42501';end if;

 select * into v_round from cotironda_private.rounds_v1
 where id=v_inbox.round_id for share;
 if not found then raise exception 'd047_round_missing' using errcode='42501';end if;
 -- Under round lock, check replay FIRST. It may be safe to report a prior job
 -- even if the round has now closed, but NEVER queue a fresh response.
 select * into v_existing from cotironda_private.whapi_reply_jobs_d047
 where round_id=v_inbox.round_id and supplier_org_id=v_inbox.supplier_org_id
 and revision=p_revision;
 if found then
  if v_existing.channel_id<>p_channel or
     v_existing.message_key<>p_message_key or
     v_existing.chat_key<>v_inbox.chat_key
  then raise exception 'd047_revision_conflict' using errcode='23505';end if;
  return pg_catalog.jsonb_build_object('state','already_registered',
    'jobId',v_existing.job_id,'repeated',true);
 end if;
 if v_round.status<>'abierta' or pg_catalog.clock_timestamp()<v_round.begins_at
    or pg_catalog.clock_timestamp()>=v_round.ends_at
 then raise exception 'd047_round_closed' using errcode='42501';end if;
 if not exists(
  select 1 from cotironda_private.whapi_contacts_v1 c
  where c.channel_id=v_inbox.channel_id and c.chat_key=v_inbox.chat_key
    and c.supplier_org_id=v_inbox.supplier_org_id
    and c.opted_out_at is null and c.consented_at<=pg_catalog.clock_timestamp()
    and c.verified_at<=pg_catalog.clock_timestamp()
 ) then raise exception 'd047_no_consent' using errcode='42501';end if;
 if not exists(
  select 1 from cotironda_private.round_invites_v1 i
  where i.round_id=v_inbox.round_id and i.supplier_org_id=v_inbox.supplier_org_id
 ) then raise exception 'd047_not_invited' using errcode='42501';end if;
 if not exists(
  select 1 from cotironda_private.offer_drafts_v1 d
  where d.round_id=v_inbox.round_id and d.supplier_org_id=v_inbox.supplier_org_id
    and d.revision=p_revision
 ) then raise exception 'd047_stale_draft' using errcode='40001';end if;

 insert into cotironda_private.whapi_reply_jobs_d047
   (round_id,supplier_org_id,revision,channel_id,message_key,chat_key)
 values(v_inbox.round_id,v_inbox.supplier_org_id,p_revision,
   v_inbox.channel_id,v_inbox.message_key,v_inbox.chat_key)
 returning job_id into v_id;
 return pg_catalog.jsonb_build_object('state','queued','jobId',v_id,'repeated',false);
end;$fn$;

-- Lease at most one intent, not the plaintext message. Candidate rechecked
-- before leasing. Expired leases are recoverable for retries.
create function cotironda_private.whapi_lease_reply_d047()
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_job cotironda_private.whapi_reply_jobs_d047%rowtype;
 v_token uuid;
 v_ok boolean;
 v_attempt integer;
begin
 for v_attempt in 1..8 loop
  select * into v_job from cotironda_private.whapi_reply_jobs_d047
   where ((status='queued' and due_at<=pg_catalog.clock_timestamp())
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
   update cotironda_private.whapi_reply_jobs_d047 set status='cancelled',
     lease_token=null,leased_until=null where job_id=v_job.job_id;
   continue;
  end if;
  v_token:=pg_catalog.gen_random_uuid();
  update cotironda_private.whapi_reply_jobs_d047
    set status='leased',lease_token=v_token,
     leased_until=pg_catalog.clock_timestamp()+interval '45 seconds',
     attempts=attempts+1
   where job_id=v_job.job_id;
  return pg_catalog.jsonb_build_object(
    'state','leased','jobId',v_job.job_id,
    'leaseToken',v_token,'roundId',v_job.round_id,
    'supplierOrgId',v_job.supplier_org_id,
    'revision',v_job.revision,'channelId',v_job.channel_id,
    'chatKey',v_job.chat_key);
 end loop;
 return null;
end;$fn$;

-- ACK means accepted by Whapi TRANSPORT, NOT delivered/read by supplier.
-- p_ack_key = server HMAC of remote transport-id, never raw number or message.
-- On network uncertainty use failure => backoff; HTTP send may still have
-- succeeded, therefore this is at-least-once, not exactly-once delivery.
create function cotironda_private.whapi_finish_reply_d047(
 p_job uuid,p_lease uuid,p_accepted boolean,p_ack_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_job cotironda_private.whapi_reply_jobs_d047%rowtype;
 v_status text;
begin
 if p_job is null or p_lease is null or p_accepted is null
 or (p_accepted and (p_ack_key is null or p_ack_key !~ '^[a-f0-9]{64}$'))
 or (not p_accepted and p_ack_key is not null)
 then raise exception 'd047_ack_invalid' using errcode='22023';end if;
 select * into v_job from cotironda_private.whapi_reply_jobs_d047
  where job_id=p_job for update;
 if not found or v_job.status<>'leased' or v_job.lease_token<>p_lease
    or v_job.leased_until<=pg_catalog.clock_timestamp()
 then raise exception 'd047_lease_invalid' using errcode='42501';end if;
 if p_accepted then
  v_status:='accepted_by_transport';
 else
  v_status:=case when v_job.attempts>=3 then 'exhausted' else 'queued' end;
 end if;
 update cotironda_private.whapi_reply_jobs_d047
  set status=v_status,lease_token=null,leased_until=null,
   due_at=case when p_accepted then due_at else
     pg_catalog.clock_timestamp()+pg_catalog.make_interval(
       secs=>case v_job.attempts when 1 then 5 when 2 then 30 else 0 end) end,
   transport_ack_key=case when p_accepted then p_ack_key else null end,
   accepted_at=case when p_accepted then pg_catalog.clock_timestamp() else null end
 where job_id=p_job;
 return pg_catalog.jsonb_build_object('state',v_status);
end;$fn$;

-- SECURITY DEFINER is owned by an isolated no-login, no-bypass RLS role.
grant create on schema cotironda_private to cotironda_reply_writer;
grant cotironda_reply_writer to postgres with set true,inherit false;
alter function cotironda_private.whapi_enqueue_reply_d047(text,text,integer)
 owner to cotironda_reply_writer;
alter function cotironda_private.whapi_lease_reply_d047()
 owner to cotironda_reply_writer;
alter function cotironda_private.whapi_finish_reply_d047(uuid,uuid,boolean,text)
 owner to cotironda_reply_writer;
revoke cotironda_reply_writer from postgres;
revoke create on schema cotironda_private from cotironda_reply_writer;
revoke all on function
 cotironda_private.whapi_enqueue_reply_d047(text,text,integer),
 cotironda_private.whapi_lease_reply_d047(),
 cotironda_private.whapi_finish_reply_d047(uuid,uuid,boolean,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function
 cotironda_private.whapi_enqueue_reply_d047(text,text,integer),
 cotironda_private.whapi_lease_reply_d047(),
 cotironda_private.whapi_finish_reply_d047(uuid,uuid,boolean,text)
 to cotironda_reply_gateway;
-- Gateway is NOLOGIN. No login role with these privileges is provisioned.
