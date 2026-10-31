-- MVP-021 / D070. Dedicated commercial INVITATION outbox.
-- PostgreSQL17 EPHEMERAL CI ONLY. No DEV/prod, no live WhatsApp transport.
-- Never reuse D047 reply jobs; no plain phone, message body or token in SQL.
create role cotironda_invite_owner_d070 nologin noinherit nobypassrls;
create role cotironda_invite_gateway_d070 nologin noinherit nobypassrls;
grant usage on schema cotironda_private
 to cotironda_invite_owner_d070,cotironda_invite_gateway_d070;

create table cotironda_private.whapi_invite_jobs_d070(
 job_id uuid primary key default pg_catalog.gen_random_uuid(),
 round_id uuid not null,
 supplier_org_id uuid not null,
 channel_id text not null check(channel_id ~ '^[A-Za-z0-9_-]{4,64}$'),
 chat_key text not null check(chat_key ~ '^[a-f0-9]{64}$'),
 status text not null default 'queued'
  check(status in ('queued','leased','accepted_by_transport','cancelled','exhausted')),
 send_phase text not null default 'not_started'
  check(send_phase in ('not_started','in_flight','uncertain','accepted')),
 attempts int not null default 0 check(attempts between 0 and 3),
 due_at timestamptz not null default pg_catalog.clock_timestamp(),
 lease_token uuid,
 leased_until timestamptz,
 send_started_at timestamptz,
 uncertain_at timestamptz,
 transport_ack_hmac text check(transport_ack_hmac ~ '^[a-f0-9]{64}$'),
 accepted_at timestamptz,
 created_at timestamptz not null default pg_catalog.clock_timestamp(),
 unique(round_id,supplier_org_id,channel_id),
 foreign key(round_id,supplier_org_id)
   references cotironda_private.round_invites_v1(round_id,supplier_org_id)
   on delete restrict,
 foreign key(channel_id,chat_key)
   references cotironda_private.whapi_contacts_v1(channel_id,chat_key)
   on delete restrict,
 check(
  (status='leased' and lease_token is not null and leased_until is not null)
  or (status<>'leased' and lease_token is null and leased_until is null)),
 check(
  (send_phase='not_started' and status in ('queued','leased','cancelled','exhausted'))
  or (send_phase in ('in_flight','uncertain') and status='leased')
  or (send_phase='accepted' and status='accepted_by_transport'))
);
create index d070_invites_ready on cotironda_private.whapi_invite_jobs_d070
 (due_at,created_at) where send_phase='not_started'
 and status in ('queued','leased');
alter table cotironda_private.whapi_invite_jobs_d070 enable row level security;
revoke all on cotironda_private.whapi_invite_jobs_d070
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert,update on cotironda_private.whapi_invite_jobs_d070
 to cotironda_invite_owner_d070;
create policy d070_jobs_read on cotironda_private.whapi_invite_jobs_d070
 for select to cotironda_invite_owner_d070 using(true);
create policy d070_jobs_insert on cotironda_private.whapi_invite_jobs_d070
 for insert to cotironda_invite_owner_d070 with check(true);
create policy d070_jobs_update on cotironda_private.whapi_invite_jobs_d070
 for update to cotironda_invite_owner_d070 using(true) with check(true);

-- An immutable accounting record is required BEFORE a possible HTTP send.
-- Counts cross both D056 reply reservations and D070 invitation reservations.
create table cotironda_private.whapi_invite_reservations_d070(
 job_id uuid primary key references cotironda_private.whapi_invite_jobs_d070(job_id)
  on delete restrict,
 buyer_org_id uuid not null references public.organizations(id),
 channel_id text not null,
 local_day date not null,
 local_month date not null,
 reserved_units bigint not null check(reserved_units>0),
 policy_revision int not null check(policy_revision>0),
 reserved_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index d070_quota_day on cotironda_private.whapi_invite_reservations_d070
 (buyer_org_id,channel_id,local_day);
create index d070_quota_month on cotironda_private.whapi_invite_reservations_d070
 (buyer_org_id,channel_id,local_month);
alter table cotironda_private.whapi_invite_reservations_d070 enable row level security;
revoke all on cotironda_private.whapi_invite_reservations_d070
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert on cotironda_private.whapi_invite_reservations_d070
 to cotironda_invite_owner_d070;
create policy d070_res_read on cotironda_private.whapi_invite_reservations_d070
 for select to cotironda_invite_owner_d070 using(true);
create policy d070_res_insert on cotironda_private.whapi_invite_reservations_d070
 for insert to cotironda_invite_owner_d070 with check(true);
create function cotironda_private.reject_reservation_mutation_d070()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 raise exception 'd070_reservation_immutable' using errcode='42501';
end;$fn$;
create trigger d070_no_reservation_change before update or delete on
 cotironda_private.whapi_invite_reservations_d070 for each row
 execute function cotironda_private.reject_reservation_mutation_d070();

-- No RLS bypass: minimum required SELECT, and UPDATE on enabled only for
-- a FOR UPDATE lock; WITH CHECK(false) disallows policy changes.
grant select on cotironda_private.rounds_v1,
 cotironda_private.whapi_contacts_v1,
 cotironda_private.whapi_send_reservations_d056
 to cotironda_invite_owner_d070;
grant select,update(enabled) on
 cotironda_private.whapi_buyer_send_policies_d056
 to cotironda_invite_owner_d070;
create policy d070_round_read on cotironda_private.rounds_v1
 for select to cotironda_invite_owner_d070 using(true);
create policy d070_contact_read on cotironda_private.whapi_contacts_v1
 for select to cotironda_invite_owner_d070 using(true);
create policy d070_reply_res_read on cotironda_private.whapi_send_reservations_d056
 for select to cotironda_invite_owner_d070 using(true);
create policy d070_policy_read on cotironda_private.whapi_buyer_send_policies_d056
 for select to cotironda_invite_owner_d070 using(true);
create policy d070_policy_lock on cotironda_private.whapi_buyer_send_policies_d056
 for update to cotironda_invite_owner_d070 using(true) with check(false);
grant execute on function
 cotironda_private.whapi_read_recipient_packet_d068(uuid,uuid,text,text)
 to cotironda_invite_owner_d070;

-- Creation is explicit and idempotent: only already matched scope D065
-- with verified D068 recipient can create a job. No network, no sender.
create function cotironda_private.whapi_prepare_invite_d070(
 p_round uuid,p_supplier uuid,p_channel text,p_chat text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_existing cotironda_private.whapi_invite_jobs_d070%rowtype;
 v_job uuid;v_packet jsonb;
begin
 if p_round is null or p_supplier is null
    or p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
    or p_chat is null or p_chat !~ '^[a-f0-9]{64}$'
 then raise exception 'd070_invalid_prepare' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_round::text||':'||p_supplier::text||':'||p_channel,0));
 select * into v_existing from cotironda_private.whapi_invite_jobs_d070
 where round_id=p_round and supplier_org_id=p_supplier and channel_id=p_channel;
 if found then
  if v_existing.chat_key<>p_chat then
   raise exception 'd070_recipient_collision' using errcode='23505';end if;
  return pg_catalog.jsonb_build_object('state','already_prepared','jobId',v_existing.job_id);
 end if;
 v_packet:=cotironda_private.whapi_read_recipient_packet_d068(
   p_round,p_supplier,p_channel,p_chat);
 if v_packet is null then
  raise exception 'd070_scope_or_consent_denied' using errcode='42501';end if;
 insert into cotironda_private.whapi_invite_jobs_d070
 (round_id,supplier_org_id,channel_id,chat_key)
 values(p_round,p_supplier,p_channel,p_chat)
 returning job_id into v_job;
 return pg_catalog.jsonb_build_object('state','prepared','jobId',v_job);
end;$fn$;

-- Lease only never-started jobs. In-flight and uncertain are excluded forever.
create function cotironda_private.whapi_claim_invite_d070()
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_invite_jobs_d070%rowtype;
 v_token uuid;v_packet jsonb;v_now timestamptz:=pg_catalog.clock_timestamp();
begin
 select * into v_job from cotironda_private.whapi_invite_jobs_d070
 where send_phase='not_started' and attempts<3 and
 ((status='queued' and due_at<=v_now) or
  (status='leased' and leased_until<=v_now))
 order by due_at,created_at for update skip locked limit 1;
 if not found then return null;end if;
 v_packet:=cotironda_private.whapi_read_recipient_packet_d068(
  v_job.round_id,v_job.supplier_org_id,v_job.channel_id,v_job.chat_key);
 if v_packet is null then
  update cotironda_private.whapi_invite_jobs_d070 set status='cancelled',
    lease_token=null,leased_until=null where job_id=v_job.job_id;
  return null;
 end if;
 v_token:=pg_catalog.gen_random_uuid();
 update cotironda_private.whapi_invite_jobs_d070
 set status='leased',lease_token=v_token,leased_until=v_now+interval '90 seconds',
  attempts=attempts+1 where job_id=v_job.job_id;
 return pg_catalog.jsonb_build_object(
  'state','leased','jobId',v_job.job_id,'leaseToken',v_token,
  'roundId',v_job.round_id,'supplierOrgId',v_job.supplier_org_id,
  'channel',v_job.channel_id,'chatKey',v_job.chat_key);
end;$fn$;

-- Safe retry only before begin. No retry after a possible HTTP invocation.
create function cotironda_private.whapi_fail_preflight_invite_d070(
 p_job uuid,p_lease uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_invite_jobs_d070%rowtype;v_state text;
begin
 select * into v_job from cotironda_private.whapi_invite_jobs_d070
 where job_id=p_job for update;
 if not found or v_job.status<>'leased'
   or v_job.send_phase<>'not_started' or v_job.lease_token<>p_lease
   or v_job.leased_until<=pg_catalog.clock_timestamp()
 then raise exception 'd070_invalid_preflight' using errcode='42501';end if;
 v_state:=case when v_job.attempts>=3 then 'exhausted' else 'queued' end;
 update cotironda_private.whapi_invite_jobs_d070
 set status=v_state,lease_token=null,leased_until=null,
  due_at=pg_catalog.clock_timestamp()+interval '5 seconds'
 where job_id=p_job;
 return pg_catalog.jsonb_build_object('state',v_state);
end;$fn$;

-- This transaction MUST COMMIT before the worker may call D055.
-- Shared buyer/channel policy row serializes reply + invitation reservations.
create function cotironda_private.whapi_begin_invite_d070(
 p_job uuid,p_lease uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_invite_jobs_d070%rowtype;
 v_buyer uuid;v_policy cotironda_private.whapi_buyer_send_policies_d056%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();v_day date;v_month date;
 v_daily bigint;v_monthly bigint;v_used numeric;v_packet jsonb;
begin
 select * into v_job from cotironda_private.whapi_invite_jobs_d070
 where job_id=p_job for update;
 if not found or v_job.status<>'leased' or v_job.send_phase<>'not_started'
    or v_job.lease_token<>p_lease or v_job.leased_until<=v_now
 then raise exception 'd070_invalid_begin' using errcode='42501';end if;
 v_packet:=cotironda_private.whapi_read_recipient_packet_d068(
  v_job.round_id,v_job.supplier_org_id,v_job.channel_id,v_job.chat_key);
 if v_packet is null then
  update cotironda_private.whapi_invite_jobs_d070
   set status='cancelled',lease_token=null,leased_until=null
   where job_id=p_job;
  return pg_catalog.jsonb_build_object('state','cancelled');
 end if;
 select buyer_org_id into v_buyer from cotironda_private.rounds_v1
  where id=v_job.round_id and status='programada' and ends_at>v_now;
 if v_buyer is null then
  update cotironda_private.whapi_invite_jobs_d070
   set status='cancelled',lease_token=null,leased_until=null
   where job_id=p_job;
  return pg_catalog.jsonb_build_object('state','cancelled');
 end if;
 select * into v_policy from cotironda_private.whapi_buyer_send_policies_d056
  where buyer_org_id=v_buyer and channel_id=v_job.channel_id for update;
 if not found or not v_policy.enabled
 then raise exception 'd070_policy_disabled' using errcode='42501';end if;
 v_day:=(v_now at time zone 'America/Argentina/Buenos_Aires')::date;
 v_month:=pg_catalog.date_trunc('month',v_day::timestamp)::date;
 select
 (select count(*) from cotironda_private.whapi_send_reservations_d056
  where buyer_org_id=v_buyer and channel_id=v_job.channel_id and local_day=v_day)
 +(select count(*) from cotironda_private.whapi_invite_reservations_d070
  where buyer_org_id=v_buyer and channel_id=v_job.channel_id and local_day=v_day)
 into v_daily;
 select
 (select count(*) from cotironda_private.whapi_send_reservations_d056
  where buyer_org_id=v_buyer and channel_id=v_job.channel_id and local_month=v_month)
 +(select count(*) from cotironda_private.whapi_invite_reservations_d070
  where buyer_org_id=v_buyer and channel_id=v_job.channel_id and local_month=v_month),
 (select coalesce(sum(reserved_units),0) from
   cotironda_private.whapi_send_reservations_d056
  where buyer_org_id=v_buyer and channel_id=v_job.channel_id and local_month=v_month)
 +(select coalesce(sum(reserved_units),0) from
   cotironda_private.whapi_invite_reservations_d070
  where buyer_org_id=v_buyer and channel_id=v_job.channel_id and local_month=v_month)
 into v_monthly,v_used;
 if v_daily>=v_policy.daily_message_limit
 or v_monthly>=v_policy.monthly_message_limit
 or v_used+v_policy.estimated_units_per_message>v_policy.monthly_budget_units
 then raise exception 'd070_quota_exceeded' using errcode='42501';end if;
 insert into cotironda_private.whapi_invite_reservations_d070
 (job_id,buyer_org_id,channel_id,local_day,local_month,reserved_units,policy_revision)
 values(p_job,v_buyer,v_job.channel_id,v_day,v_month,
   v_policy.estimated_units_per_message,v_policy.revision);
 update cotironda_private.whapi_invite_jobs_d070
 set send_phase='in_flight',send_started_at=v_now,
  leased_until=v_now+interval '120 seconds' where job_id=p_job;
 return pg_catalog.jsonb_build_object('state','in_flight','jobId',p_job);
end;$fn$;

-- Called by D055 immediately BEFORE HTTP. No clear number passes SQL.
-- It verifies *current* BAJA, recipient vault, scoped lines, zone and limits.
create function cotironda_private.whapi_authorize_invite_d070(
 p_job uuid,p_channel text,p_chat text)
returns boolean language plpgsql stable security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_invite_jobs_d070%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();v_buyer uuid;
begin
 if p_job is null or p_channel is null
  or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
  or p_chat is null or p_chat !~ '^[a-f0-9]{64}$'
 then return false;end if;
 select * into v_job from cotironda_private.whapi_invite_jobs_d070
  where job_id=p_job and channel_id=p_channel and chat_key=p_chat
   and status='leased' and send_phase='in_flight'
   and leased_until>v_now;
 if not found then return false;end if;
 select buyer_org_id into v_buyer from cotironda_private.rounds_v1
  where id=v_job.round_id and status='programada' and ends_at>v_now;
 if v_buyer is null then return false;end if;
 if not exists(select 1 from cotironda_private.whapi_invite_reservations_d070 r
   join cotironda_private.whapi_buyer_send_policies_d056 p
    on p.buyer_org_id=r.buyer_org_id and p.channel_id=r.channel_id
   where r.job_id=p_job and r.buyer_org_id=v_buyer
    and r.channel_id=p_channel and r.reserved_units>0 and p.enabled)
 then return false;end if;
 return cotironda_private.whapi_read_recipient_packet_d068(
  v_job.round_id,v_job.supplier_org_id,p_channel,p_chat) is not null;
end;$fn$;

-- Any unknown HTTP outcome is uncertain; no second claim, ever.
create function cotironda_private.whapi_finish_invite_d070(
 p_job uuid,p_lease uuid,p_state text,p_ack text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_invite_jobs_d070%rowtype;
begin
 if p_job is null or p_lease is null or p_state is null or
  p_state not in ('accepted_by_transport','uncertain') or
  (p_state='accepted_by_transport' and
   (p_ack is null or p_ack !~ '^[a-f0-9]{64}$')) or
  (p_state='uncertain' and p_ack is not null)
 then raise exception 'd070_invalid_outcome' using errcode='22023';end if;
 select * into v_job from cotironda_private.whapi_invite_jobs_d070
  where job_id=p_job for update;
 if not found or v_job.lease_token<>p_lease
   or v_job.status<>'leased' or
   v_job.send_phase not in ('in_flight','uncertain')
 then
  if v_job.job_id is not null and v_job.send_phase='accepted'
   and p_state='accepted_by_transport' and v_job.transport_ack_hmac=p_ack
  then return pg_catalog.jsonb_build_object('state','accepted_by_transport','repeated',true);end if;
  raise exception 'd070_outcome_unavailable' using errcode='42501';
 end if;
 if v_job.send_phase='uncertain' and p_state='uncertain'
 then return pg_catalog.jsonb_build_object('state','uncertain','repeated',true);end if;
 if p_state='accepted_by_transport' then
  update cotironda_private.whapi_invite_jobs_d070
   set status='accepted_by_transport',send_phase='accepted',
    lease_token=null,leased_until=null,accepted_at=pg_catalog.clock_timestamp(),
    transport_ack_hmac=p_ack where job_id=p_job;
 else
  update cotironda_private.whapi_invite_jobs_d070
   set send_phase='uncertain',uncertain_at=pg_catalog.clock_timestamp()
   where job_id=p_job;
 end if;
 return pg_catalog.jsonb_build_object('state',p_state,'repeated',false);
end;$fn$;

-- Crashed worker that began HTTP may never return to 'queued'.
create function cotironda_private.whapi_sweep_invite_d070()
returns integer language plpgsql volatile security definer set search_path='' as $fn$
declare v_count integer;
begin
 with expired as (
  select job_id from cotironda_private.whapi_invite_jobs_d070
   where status='leased' and send_phase='in_flight'
    and leased_until<=pg_catalog.clock_timestamp()
   for update skip locked limit 20
 ), changed as (
  update cotironda_private.whapi_invite_jobs_d070 j
   set send_phase='uncertain',uncertain_at=pg_catalog.clock_timestamp()
   from expired e where j.job_id=e.job_id returning j.job_id
 )
 select count(*) into v_count from changed;
 return v_count;
end;$fn$;

-- Security-definer functions have NO default PUBLIC execute access.
grant create on schema cotironda_private to cotironda_invite_owner_d070;
grant cotironda_invite_owner_d070 to postgres with set true,inherit false;
alter function cotironda_private.whapi_prepare_invite_d070(uuid,uuid,text,text)
 owner to cotironda_invite_owner_d070;
alter function cotironda_private.whapi_claim_invite_d070()
 owner to cotironda_invite_owner_d070;
alter function cotironda_private.whapi_fail_preflight_invite_d070(uuid,uuid)
 owner to cotironda_invite_owner_d070;
alter function cotironda_private.whapi_begin_invite_d070(uuid,uuid)
 owner to cotironda_invite_owner_d070;
alter function cotironda_private.whapi_authorize_invite_d070(uuid,text,text)
 owner to cotironda_invite_owner_d070;
alter function cotironda_private.whapi_finish_invite_d070(uuid,uuid,text,text)
 owner to cotironda_invite_owner_d070;
alter function cotironda_private.whapi_sweep_invite_d070()
 owner to cotironda_invite_owner_d070;
revoke cotironda_invite_owner_d070 from postgres;
revoke create on schema cotironda_private from cotironda_invite_owner_d070;
revoke all on function
 cotironda_private.whapi_prepare_invite_d070(uuid,uuid,text,text),
 cotironda_private.whapi_claim_invite_d070(),
 cotironda_private.whapi_fail_preflight_invite_d070(uuid,uuid),
 cotironda_private.whapi_begin_invite_d070(uuid,uuid),
 cotironda_private.whapi_authorize_invite_d070(uuid,text,text),
 cotironda_private.whapi_finish_invite_d070(uuid,uuid,text,text),
 cotironda_private.whapi_sweep_invite_d070()
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function
 cotironda_private.whapi_prepare_invite_d070(uuid,uuid,text,text),
 cotironda_private.whapi_claim_invite_d070(),
 cotironda_private.whapi_fail_preflight_invite_d070(uuid,uuid),
 cotironda_private.whapi_begin_invite_d070(uuid,uuid),
 cotironda_private.whapi_authorize_invite_d070(uuid,text,text),
 cotironda_private.whapi_finish_invite_d070(uuid,uuid,text,text),
 cotironda_private.whapi_sweep_invite_d070()
 to cotironda_invite_gateway_d070;
comment on table cotironda_private.whapi_invite_jobs_d070 is
 'MVP021 CI only, invite intent separate from reply outbox; no plaintext or Whapi HTTP';

-- D056 replies MUST count D070 invitations too (bidirectional shared caps).
-- Keep existing D056 definer owner, privileges and trigger identity.
grant select on cotironda_private.whapi_invite_reservations_d070
 to cotironda_limits_writer_d056;
create policy d070_old_limits_read on
 cotironda_private.whapi_invite_reservations_d070
 for select to cotironda_limits_writer_d056 using(true);
create or replace function cotironda_private.whapi_guard_begin_send_d056()
returns trigger language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_buyer uuid;
 v_policy cotironda_private.whapi_buyer_send_policies_d056%rowtype;
 v_day date;
 v_month date;
 v_day_count bigint;
 v_month_count bigint;
 v_month_units numeric;
 v_now timestamptz;
begin
 if not(old.send_phase='not_started' and new.send_phase='in_flight')
 then return new;end if;
 if old.job_id is distinct from new.job_id
    or old.status<>'leased' or new.status<>'leased'
    or old.lease_token is null or old.lease_token is distinct from new.lease_token
    or old.leased_until<=pg_catalog.clock_timestamp()
 then raise exception 'd056_invalid_begin_transition' using errcode='42501';end if;

 v_now:=pg_catalog.clock_timestamp();
 select r.buyer_org_id into v_buyer
 from cotironda_private.rounds_v1 r
 join cotironda_private.offer_drafts_v1 d
  on d.round_id=r.id and d.supplier_org_id=old.supplier_org_id
 where r.id=old.round_id and r.status='abierta'
  and v_now>=r.begins_at and v_now<r.ends_at
  and d.revision=old.revision;
 if v_buyer is null or not exists(
  select 1 from cotironda_private.whapi_contacts_v1 c
  where c.channel_id=old.channel_id and c.chat_key=old.chat_key
    and c.supplier_org_id=old.supplier_org_id
    and c.opted_out_at is null and c.consented_at<=v_now
    and c.verified_at<=v_now
 ) then raise exception 'd056_consent_or_revision_invalid' using errcode='42501';end if;

 -- Row lock serializes ALL distinct jobs of same buyer+channel, including
 -- concurrent workers. Limits can be safely changed only by privileged admin.
 select * into v_policy from cotironda_private.whapi_buyer_send_policies_d056
 where buyer_org_id=v_buyer and channel_id=old.channel_id
 for update;
 if not found or not v_policy.enabled
 then raise exception 'd056_policy_disabled_or_missing' using errcode='42501';end if;

 v_day:=(v_now at time zone 'America/Argentina/Buenos_Aires')::date;
 v_month:=pg_catalog.date_trunc('month',v_day::timestamp)::date;
 select
  (select count(*) from cotironda_private.whapi_send_reservations_d056
    where buyer_org_id=v_buyer and channel_id=old.channel_id and local_day=v_day)
  +(select count(*) from cotironda_private.whapi_invite_reservations_d070
    where buyer_org_id=v_buyer and channel_id=old.channel_id and local_day=v_day)
  into v_day_count;
 select
  (select count(*) from cotironda_private.whapi_send_reservations_d056
    where buyer_org_id=v_buyer and channel_id=old.channel_id and local_month=v_month)
  +(select count(*) from cotironda_private.whapi_invite_reservations_d070
    where buyer_org_id=v_buyer and channel_id=old.channel_id and local_month=v_month),
  (select coalesce(sum(reserved_units),0)
    from cotironda_private.whapi_send_reservations_d056
    where buyer_org_id=v_buyer and channel_id=old.channel_id and local_month=v_month)
  +(select coalesce(sum(reserved_units),0)
    from cotironda_private.whapi_invite_reservations_d070
    where buyer_org_id=v_buyer and channel_id=old.channel_id and local_month=v_month)
 into v_month_count,v_month_units;

 if v_day_count>=v_policy.daily_message_limit
 or v_month_count>=v_policy.monthly_message_limit
 or v_month_units+v_policy.estimated_units_per_message>v_policy.monthly_budget_units
 then raise exception 'd056_send_quota_exhausted' using errcode='42501';end if;
 insert into cotironda_private.whapi_send_reservations_d056
 (job_id,buyer_org_id,supplier_org_id,channel_id,chat_key,round_id,
 revision,local_day,local_month,reserved_units,policy_revision)
 values(old.job_id,v_buyer,old.supplier_org_id,old.channel_id,old.chat_key,
 old.round_id,old.revision,v_day,v_month,
 v_policy.estimated_units_per_message,v_policy.revision);
 return new;
end;$fn$;


