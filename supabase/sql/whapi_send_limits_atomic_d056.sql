-- D056 / Issue #215, POST D054/D055. PostgreSQL 17 CI ONLY; no DEV/prod.
-- Buyer is the owner of each round; provider is always free. Internal
-- reservation "units" are NOT Whapi invoices, pesos or settled charges.
-- The critical quota reservation is a BEFORE UPDATE trigger on D053's
-- not_started -> in_flight transition, within that SAME database transaction.
create role cotironda_limits_writer_d056 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to cotironda_limits_writer_d056;
grant select on cotironda_private.rounds_v1,
 cotironda_private.whapi_reply_jobs_d047,
 cotironda_private.whapi_contacts_v1,
 cotironda_private.offer_drafts_v1
 to cotironda_limits_writer_d056;
create policy d056_round_read on cotironda_private.rounds_v1
 for select to cotironda_limits_writer_d056 using(true);
create policy d056_job_read on cotironda_private.whapi_reply_jobs_d047
 for select to cotironda_limits_writer_d056 using(true);
create policy d056_contact_read on cotironda_private.whapi_contacts_v1
 for select to cotironda_limits_writer_d056 using(true);
create policy d056_draft_read on cotironda_private.offer_drafts_v1
 for select to cotironda_limits_writer_d056 using(true);

-- Provisioning is a separate admin/review task, NOT a public RPC. No row
-- means DENY, and an explicit false means DENY.
create table cotironda_private.whapi_buyer_send_policies_d056(
 buyer_org_id uuid not null references public.organizations(id) on delete restrict,
 channel_id text not null check(channel_id ~ '^[A-Za-z0-9_-]{4,64}$'),
 enabled boolean not null default false,
 daily_message_limit integer not null check(daily_message_limit between 1 and 10000),
 monthly_message_limit integer not null check(monthly_message_limit between 1 and 100000),
 monthly_budget_units bigint not null check(monthly_budget_units between 1 and 100000000000),
 estimated_units_per_message bigint not null check(estimated_units_per_message between 1 and 1000000000),
 revision integer not null default 1 check(revision>=1),
 primary key(buyer_org_id,channel_id),
 check(daily_message_limit<=monthly_message_limit),
 check(estimated_units_per_message<=monthly_budget_units)
);
alter table cotironda_private.whapi_buyer_send_policies_d056 enable row level security;
revoke all on cotironda_private.whapi_buyer_send_policies_d056
 from public,anon,authenticated,service_role,cotironda_app;
grant select,update(enabled) on cotironda_private.whapi_buyer_send_policies_d056
 to cotironda_limits_writer_d056;
create policy d056_policy_read on cotironda_private.whapi_buyer_send_policies_d056
 for select to cotironda_limits_writer_d056 using(true);
-- FOR UPDATE lock needs UPDATE privileges/policy. WITH CHECK(false)
-- forbids direct policy modification via the function-owner role.
create policy d056_policy_lock on cotironda_private.whapi_buyer_send_policies_d056
 for update to cotironda_limits_writer_d056 using(true) with check(false);

-- Append-only, one reservation per OUTBOX job. No automatic release on
-- HTTP ambiguity/cancel/timeout, so the envelope remains conservative.
create table cotironda_private.whapi_send_reservations_d056(
 job_id uuid primary key references cotironda_private.whapi_reply_jobs_d047(job_id)
  on delete restrict,
 buyer_org_id uuid not null references public.organizations(id) on delete restrict,
 supplier_org_id uuid not null references public.supplier_profiles(organization_id)
  on delete restrict,
 channel_id text not null,
 chat_key text not null check(chat_key ~ '^[a-f0-9]{64}$'),
 round_id uuid not null,
 revision integer not null check(revision between 1 and 100000),
 local_day date not null,
 local_month date not null,
 reserved_units bigint not null check(reserved_units>0),
 policy_revision integer not null check(policy_revision>=1),
 reserved_at timestamptz not null default pg_catalog.clock_timestamp(),
 foreign key(round_id,supplier_org_id)
  references cotironda_private.offer_drafts_v1(round_id,supplier_org_id)
  on delete restrict
);
create index d056_buyer_day_quota
 on cotironda_private.whapi_send_reservations_d056(buyer_org_id,channel_id,local_day);
create index d056_buyer_month_quota
 on cotironda_private.whapi_send_reservations_d056(buyer_org_id,channel_id,local_month);
alter table cotironda_private.whapi_send_reservations_d056 enable row level security;
revoke all on cotironda_private.whapi_send_reservations_d056
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert on cotironda_private.whapi_send_reservations_d056
 to cotironda_limits_writer_d056;
create policy d056_reservation_read on cotironda_private.whapi_send_reservations_d056
 for select to cotironda_limits_writer_d056 using(true);
create policy d056_reservation_insert on cotironda_private.whapi_send_reservations_d056
 for insert to cotironda_limits_writer_d056 with check(true);

create function cotironda_private.whapi_guard_begin_send_d056()
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
 select count(*) into v_day_count
 from cotironda_private.whapi_send_reservations_d056
 where buyer_org_id=v_buyer and channel_id=old.channel_id and local_day=v_day;
 select count(*),coalesce(sum(reserved_units),0)
 into v_month_count,v_month_units
 from cotironda_private.whapi_send_reservations_d056
 where buyer_org_id=v_buyer and channel_id=old.channel_id and local_month=v_month;

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

-- Pre-HTTP, after D053 begin has committed: recipient must HMAC to same
-- verified chat; check consent and revision again. No plaintext phones.
create function cotironda_private.whapi_check_send_authorized_d056(
 p_job uuid,p_channel text,p_chat_key text)
returns boolean language plpgsql stable security definer set search_path='' as $fn$
declare v_now timestamptz:=pg_catalog.clock_timestamp();
begin
 if p_job is null or p_channel is null
    or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
    or p_chat_key is null or p_chat_key !~ '^[a-f0-9]{64}$'
 then return false;end if;
 return exists(
  select 1 from cotironda_private.whapi_send_reservations_d056 l
  join cotironda_private.whapi_reply_jobs_d047 j on j.job_id=l.job_id
  join cotironda_private.rounds_v1 r
   on r.id=j.round_id and r.buyer_org_id=l.buyer_org_id
  join cotironda_private.offer_drafts_v1 d
   on d.round_id=r.id and d.supplier_org_id=j.supplier_org_id
  join cotironda_private.whapi_contacts_v1 c
   on c.channel_id=j.channel_id and c.chat_key=j.chat_key
  join cotironda_private.whapi_buyer_send_policies_d056 policy
   on policy.buyer_org_id=r.buyer_org_id and policy.channel_id=j.channel_id
  where j.job_id=p_job and j.channel_id=p_channel and j.chat_key=p_chat_key
    and l.channel_id=j.channel_id and l.chat_key=j.chat_key
    and l.supplier_org_id=j.supplier_org_id and l.round_id=j.round_id
    and l.revision=j.revision and l.reserved_units>0
    and j.status='leased' and j.send_phase='in_flight'
    and j.leased_until>v_now
    and r.status='abierta' and v_now>=r.begins_at and v_now<r.ends_at
    and d.revision=j.revision and c.supplier_org_id=j.supplier_org_id
    and c.opted_out_at is null and c.verified_at<=v_now and c.consented_at<=v_now
    and policy.enabled
 );
end;$fn$;

create trigger whapi_before_begin_send_limit_d056
 before update of send_phase
 on cotironda_private.whapi_reply_jobs_d047
 for each row execute function cotironda_private.whapi_guard_begin_send_d056();

-- Lock down all functions in same DDL transaction in future deployment.
grant create on schema cotironda_private to cotironda_limits_writer_d056;
grant cotironda_limits_writer_d056 to postgres with set true,inherit false;
alter function cotironda_private.whapi_guard_begin_send_d056()
 owner to cotironda_limits_writer_d056;
alter function cotironda_private.whapi_check_send_authorized_d056(uuid,text,text)
 owner to cotironda_limits_writer_d056;
revoke cotironda_limits_writer_d056 from postgres;
revoke create on schema cotironda_private from cotironda_limits_writer_d056;
revoke all on function
 cotironda_private.whapi_guard_begin_send_d056(),
 cotironda_private.whapi_check_send_authorized_d056(uuid,text,text)
 from public,anon,authenticated,service_role,cotironda_app;
-- Sender can only ask yes/no for a job and HMAC, never read/alter policy.
grant execute on function
 cotironda_private.whapi_check_send_authorized_d056(uuid,text,text)
 to cotironda_reply_sender_d054;
