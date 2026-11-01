-- MVP-047 / D082: buyer encrypted inbox -> durable SERVER-ONLY job queue.
-- PostgreSQL17 isolated CI only. Do NOT install Supabase DEV before #175.
-- Trigger is the only producer; no browser/Whapi body can choose org or ID.
create role cotironda_buyer_queue_owner_d082 nologin noinherit nobypassrls;
create role cotironda_buyer_queue_gateway_d082 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_buyer_queue_owner_d082,cotironda_buyer_queue_gateway_d082;

create table cotironda_private.whapi_buyer_jobs_d082 (
 channel_id text not null check(channel_id~'^[A-Za-z0-9_-]{4,64}$'),
 message_key text not null check(message_key~'^[a-f0-9]{64}$'),
 queued_at timestamptz not null default pg_catalog.clock_timestamp(),
 status text not null default 'pending' check(status in
  ('pending','leased','done','manual_review','discarded','dead')),
 attempts smallint not null default 0 check(attempts between 0 and 4),
 ready_at timestamptz not null default pg_catalog.clock_timestamp(),
 lease_token uuid,
 leased_until timestamptz,
 outcome text check(outcome in (
  'zone_queued','round_saved','requires_review','no_auth',
  'processing_failed','max_attempts')),
 finished_at timestamptz,
 primary key(channel_id,message_key),
 foreign key(channel_id,message_key) references
  cotironda_private.whapi_buyer_inbox_d074(channel_id,message_key)
  on delete restrict,
 check(
  (status='leased' and lease_token is not null and leased_until is not null
   and finished_at is null) or
  (status<>'leased' and lease_token is null and leased_until is null)),
 check(
  (status in('done','manual_review','discarded','dead')
   and finished_at is not null) or
  (status in('pending','leased') and finished_at is null))
);
create index d082_buyer_due on cotironda_private.whapi_buyer_jobs_d082
 (ready_at,queued_at) where status in('pending','leased');
alter table cotironda_private.whapi_buyer_jobs_d082 enable row level security;
revoke all on cotironda_private.whapi_buyer_jobs_d082
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert,update on cotironda_private.whapi_buyer_jobs_d082
 to cotironda_buyer_queue_owner_d082;
create policy d082_owner_select on cotironda_private.whapi_buyer_jobs_d082
 for select to cotironda_buyer_queue_owner_d082 using(true);
create policy d082_owner_insert on cotironda_private.whapi_buyer_jobs_d082
 for insert to cotironda_buyer_queue_owner_d082 with check(true);
create policy d082_owner_update on cotironda_private.whapi_buyer_jobs_d082
 for update to cotironda_buyer_queue_owner_d082 using(true) with check(true);

create function cotironda_private.whapi_enqueue_buyer_d082()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.kind<>'opt_out' and new.status='pendiente_interpretacion' then
  insert into cotironda_private.whapi_buyer_jobs_d082(channel_id,message_key)
   values(new.channel_id,new.message_key)
   on conflict(channel_id,message_key) do nothing;
 end if;
 return new;
end;$fn$;
create trigger d082_buyer_inbox_enqueue after insert on
 cotironda_private.whapi_buyer_inbox_d074 for each row
 execute function cotironda_private.whapi_enqueue_buyer_d082();

-- Claim one job under row lock. Leases expire without ACK. Fourth
-- expired attempt is dead-letter, never silently discarded or re-sent.
create function cotironda_private.whapi_claim_buyer_d082(p_channel text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_buyer_jobs_d082%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();
 v_token uuid;
begin
 if p_channel is null or p_channel!~'^[A-Za-z0-9_-]{4,64}
  set status='dead',outcome='max_attempts',finished_at=v_now,
   lease_token=null,leased_until=null
 where q.channel_id=p_channel and
   ((q.status='leased' and q.leased_until<=v_now and q.attempts>=4)
    or (q.status='pending' and q.attempts>=4));
 select * into v_job from cotironda_private.whapi_buyer_jobs_d082 q
  where q.channel_id=p_channel and q.attempts<4 and q.ready_at<=v_now
   and (q.status='pending' or (q.status='leased' and q.leased_until<=v_now))
  order by q.ready_at,q.queued_at,q.channel_id,q.message_key
  limit 1 for update skip locked;
 if not found then return null;end if;
 v_token:=pg_catalog.gen_random_uuid();
 update cotironda_private.whapi_buyer_jobs_d082
 set status='leased',attempts=attempts+1,lease_token=v_token,
  leased_until=v_now+interval '3 minutes'
 where channel_id=v_job.channel_id and message_key=v_job.message_key;
 return pg_catalog.jsonb_build_object(
  'channel',v_job.channel_id,'messageKey',v_job.message_key,
  'leaseToken',v_token::text,'attempt',v_job.attempts+1);
end;$fn$;

create function cotironda_private.whapi_finish_buyer_d082(
 p_channel text,p_message text,p_lease uuid,p_outcome text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_buyer_jobs_d082%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();
 v_status text;v_code text;
begin
 if p_channel is null or p_channel!~'^[A-Za-z0-9_-]{4,64}$'
  or p_message is null or p_message!~'^[a-f0-9]{64}$'
  or p_lease is null or p_outcome not in
   ('zone_queued','round_saved','requires_review','no_auth','retry')
 then raise exception 'd082_finish_invalid' using errcode='22023';end if;
 select * into v_job from cotironda_private.whapi_buyer_jobs_d082
  where channel_id=p_channel and message_key=p_message for update;
 if not found or v_job.status<>'leased' or v_job.lease_token<>p_lease
  or v_job.leased_until<v_now
 then raise exception 'd082_lease_not_current' using errcode='42501';end if;
 v_code:=p_outcome;
 if p_outcome='retry' then
  if v_job.attempts>=4 then
   v_status:='dead';v_code:='max_attempts';
  else v_status:='pending';v_code:='processing_failed';end if;
 elsif p_outcome='requires_review' then v_status:='manual_review';
 elsif p_outcome='no_auth' then v_status:='discarded';
 else v_status:='done';end if;
 update cotironda_private.whapi_buyer_jobs_d082 set
  status=v_status,outcome=v_code,lease_token=null,leased_until=null,
  ready_at=case when v_status='pending' then
    v_now+pg_catalog.make_interval(secs=>15*v_job.attempts*v_job.attempts)
    else ready_at end,
  finished_at=case when v_status in
   ('done','manual_review','discarded','dead') then v_now else null end
 where channel_id=p_channel and message_key=p_message;
 return pg_catalog.jsonb_build_object('state',v_status,
  'attempts',v_job.attempts);
end;$fn$;

-- Trigger owner cannot bypass RLS or SELECT buyer data.
grant create on schema cotironda_private to cotironda_buyer_queue_owner_d082;
grant cotironda_buyer_queue_owner_d082 to postgres with set true,inherit false;
alter function cotironda_private.whapi_enqueue_buyer_d082()
 owner to cotironda_buyer_queue_owner_d082;
alter function cotironda_private.whapi_claim_buyer_d082(text)
 owner to cotironda_buyer_queue_owner_d082;
alter function cotironda_private.whapi_finish_buyer_d082(text,text,uuid,text)
 owner to cotironda_buyer_queue_owner_d082;
revoke cotironda_buyer_queue_owner_d082 from postgres;
revoke create on schema cotironda_private from cotironda_buyer_queue_owner_d082;

revoke all on function cotironda_private.whapi_enqueue_buyer_d082(),
 cotironda_private.whapi_claim_buyer_d082(text),
 cotironda_private.whapi_finish_buyer_d082(text,text,uuid,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_claim_buyer_d082(text),
 cotironda_private.whapi_finish_buyer_d082(text,text,uuid,text)
 to cotironda_buyer_queue_gateway_d082;
comment on function cotironda_private.whapi_claim_buyer_d082(text) is
 'MVP047 server-only buyer queue; no plaintext/phone, no Whapi HTTP, PG17 CI only.';

 then raise exception 'd082_channel_invalid' using errcode='22023';end if;
 update cotironda_private.whapi_buyer_jobs_d082 q
  set status='dead',outcome='max_attempts',finished_at=v_now,
   lease_token=null,leased_until=null
 where (q.status='leased' and q.leased_until<=v_now and q.attempts>=4)
    or (q.status='pending' and q.attempts>=4);
 select * into v_job from cotironda_private.whapi_buyer_jobs_d082 q
  where q.attempts<4 and q.ready_at<=v_now
   and (q.status='pending' or (q.status='leased' and q.leased_until<=v_now))
  order by q.ready_at,q.queued_at,q.channel_id,q.message_key
  limit 1 for update skip locked;
 if not found then return null;end if;
 v_token:=pg_catalog.gen_random_uuid();
 update cotironda_private.whapi_buyer_jobs_d082
 set status='leased',attempts=attempts+1,lease_token=v_token,
  leased_until=v_now+interval '3 minutes'
 where channel_id=v_job.channel_id and message_key=v_job.message_key;
 return pg_catalog.jsonb_build_object(
  'channel',v_job.channel_id,'messageKey',v_job.message_key,
  'leaseToken',v_token::text,'attempt',v_job.attempts+1);
end;$fn$;

create function cotironda_private.whapi_finish_buyer_d082(
 p_channel text,p_message text,p_lease uuid,p_outcome text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_job cotironda_private.whapi_buyer_jobs_d082%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();
 v_status text;v_code text;
begin
 if p_channel is null or p_channel!~'^[A-Za-z0-9_-]{4,64}$'
  or p_message is null or p_message!~'^[a-f0-9]{64}$'
  or p_lease is null or p_outcome not in
   ('zone_queued','round_saved','requires_review','no_auth','retry')
 then raise exception 'd082_finish_invalid' using errcode='22023';end if;
 select * into v_job from cotironda_private.whapi_buyer_jobs_d082
  where channel_id=p_channel and message_key=p_message for update;
 if not found or v_job.status<>'leased' or v_job.lease_token<>p_lease
  or v_job.leased_until<v_now
 then raise exception 'd082_lease_not_current' using errcode='42501';end if;
 v_code:=p_outcome;
 if p_outcome='retry' then
  if v_job.attempts>=4 then
   v_status:='dead';v_code:='max_attempts';
  else v_status:='pending';v_code:='processing_failed';end if;
 elsif p_outcome='requires_review' then v_status:='manual_review';
 elsif p_outcome='no_auth' then v_status:='discarded';
 else v_status:='done';end if;
 update cotironda_private.whapi_buyer_jobs_d082 set
  status=v_status,outcome=v_code,lease_token=null,leased_until=null,
  ready_at=case when v_status='pending' then
    v_now+pg_catalog.make_interval(secs=>15*v_job.attempts*v_job.attempts)
    else ready_at end,
  finished_at=case when v_status in
   ('done','manual_review','discarded','dead') then v_now else null end
 where channel_id=p_channel and message_key=p_message;
 return pg_catalog.jsonb_build_object('state',v_status,
  'attempts',v_job.attempts);
end;$fn$;

-- Trigger owner cannot bypass RLS or SELECT buyer data.
grant create on schema cotironda_private to cotironda_buyer_queue_owner_d082;
grant cotironda_buyer_queue_owner_d082 to postgres with set true,inherit false;
alter function cotironda_private.whapi_enqueue_buyer_d082()
 owner to cotironda_buyer_queue_owner_d082;
alter function cotironda_private.whapi_claim_buyer_d082()
 owner to cotironda_buyer_queue_owner_d082;
alter function cotironda_private.whapi_finish_buyer_d082(text,text,uuid,text)
 owner to cotironda_buyer_queue_owner_d082;
revoke cotironda_buyer_queue_owner_d082 from postgres;
revoke create on schema cotironda_private from cotironda_buyer_queue_owner_d082;

revoke all on function cotironda_private.whapi_enqueue_buyer_d082(),
 cotironda_private.whapi_claim_buyer_d082(),
 cotironda_private.whapi_finish_buyer_d082(text,text,uuid,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_claim_buyer_d082(),
 cotironda_private.whapi_finish_buyer_d082(text,text,uuid,text)
 to cotironda_buyer_queue_gateway_d082;
comment on function cotironda_private.whapi_claim_buyer_d082() is
 'MVP047 server-only buyer queue; no plaintext/phone, no Whapi HTTP, PG17 CI only.';
