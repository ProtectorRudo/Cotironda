-- MVP-012 / D062: durable queue for D028 text inbox -> D061/D060 offers.
-- ONLY ephemeral PostgreSQL17 CI. No live worker, secrets, network or DEV DDL.
-- INSERT trigger is sole enqueue path; D028 encrypted inbox is immutable.
create role cotironda_queue_writer_d062 nologin noinherit nobypassrls;
create role cotironda_queue_gateway_d062 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_queue_writer_d062,cotironda_queue_gateway_d062;

create table cotironda_private.whapi_quote_queue_d062(
 channel_id text not null,
 message_key text not null,
 round_id uuid not null,
 supplier_org_id uuid not null,
 queued_at timestamptz not null default pg_catalog.clock_timestamp(),
 status text not null default 'pending'
   check(status in('pending','leased','done','manual_review','discarded','dead')),
 attempts smallint not null default 0 check(attempts between 0 and 4),
 ready_at timestamptz not null default pg_catalog.clock_timestamp(),
 lease_token uuid,
 lease_until timestamptz,
 result_code text check(result_code in
   ('received','no_price','not_eligible','processing_failed','max_attempts')),
 finished_at timestamptz,
 primary key(channel_id,message_key),
 foreign key(channel_id,message_key)
  references cotironda_private.whapi_inbox_v1(channel_id,message_key) on delete restrict,
 foreign key(round_id,supplier_org_id)
  references cotironda_private.round_invites_v1(round_id,supplier_org_id)
  on delete restrict,
 check(
  (status='leased' and lease_token is not null and lease_until is not null
   and finished_at is null)
  or
  (status<>'leased' and lease_token is null and lease_until is null)
 ),
 check(
  (status in('done','manual_review','discarded','dead') and finished_at is not null)
  or (status in('pending','leased') and finished_at is null)
 )
);
create index d062_due on cotironda_private.whapi_quote_queue_d062
 (ready_at,queued_at) where status in('pending','leased');
create index d062_supplier_order on cotironda_private.whapi_quote_queue_d062
 (round_id,supplier_org_id,queued_at,channel_id,message_key);
alter table cotironda_private.whapi_quote_queue_d062 enable row level security;
revoke all on cotironda_private.whapi_quote_queue_d062
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert,update on cotironda_private.whapi_quote_queue_d062
 to cotironda_queue_writer_d062;
create policy d062_queue_select on cotironda_private.whapi_quote_queue_d062
 for select to cotironda_queue_writer_d062 using(true);
create policy d062_queue_insert on cotironda_private.whapi_quote_queue_d062
 for insert to cotironda_queue_writer_d062 with check(true);
create policy d062_queue_update on cotironda_private.whapi_quote_queue_d062
 for update to cotironda_queue_writer_d062 using(true) with check(true);

-- The encrypted inbox is only trusted source of supplier+round IDs.
-- Trigger runs as dedicated restricted role, not as website session.
create function cotironda_private.whapi_enqueue_quote_d062()
returns trigger language plpgsql volatile security definer set search_path='' as $fn$
begin
 if new.kind='text' and new.status='pendiente_interpretacion' then
   insert into cotironda_private.whapi_quote_queue_d062
      (channel_id,message_key,round_id,supplier_org_id)
   values(new.channel_id,new.message_key,new.round_id,new.supplier_org_id);
 end if;
 return new;
end;$fn$;
create trigger whapi_inbox_quote_enqueue_d062
 after insert on cotironda_private.whapi_inbox_v1
 for each row execute function cotironda_private.whapi_enqueue_quote_d062();

-- Queue role cannot read raw message or decrypt anything.
grant select on cotironda_private.whapi_price_sources_d060
 to cotironda_queue_writer_d062;
create policy d062_receipt_select on cotironda_private.whapi_price_sources_d060
 for select to cotironda_queue_writer_d062 using(true);

-- Claim single item. SKIP LOCKED avoids two workers claiming same row.
-- Later messages of SAME supplier/round wait for earlier ones: otherwise
-- a concurrent correction can consume draft revision ahead of first quote.
create function cotironda_private.whapi_claim_quote_d062()
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare j cotironda_private.whapi_quote_queue_d062%rowtype;
 v_token uuid;
 v_now timestamptz:=pg_catalog.clock_timestamp();
begin
 -- Expired fourth lease cannot be claimed again; close it so it never blocks
 -- later supplier messages. If D060 did commit, record DONE instead of DEAD.
 with expired as (
   select q.channel_id,q.message_key
   from cotironda_private.whapi_quote_queue_d062 q
   where q.status='leased' and q.attempts=4 and q.lease_until<=v_now
   order by q.queued_at,q.channel_id,q.message_key
   for update of q skip locked limit 20
 )
 update cotironda_private.whapi_quote_queue_d062 q
 set status=case when exists(
    select 1 from cotironda_private.whapi_price_sources_d060 s
    where s.channel_id=q.channel_id and s.message_key=q.message_key
   ) then 'done' else 'dead' end,
   result_code=case when exists(
    select 1 from cotironda_private.whapi_price_sources_d060 s
    where s.channel_id=q.channel_id and s.message_key=q.message_key
   ) then 'received' else 'max_attempts' end,
   lease_token=null,lease_until=null,finished_at=v_now
 from expired e
 where q.channel_id=e.channel_id and q.message_key=e.message_key;
 select * into j from cotironda_private.whapi_quote_queue_d062 q
 where q.attempts<4
  and ((q.status='pending' and q.ready_at<=v_now)
    or (q.status='leased' and q.lease_until<=v_now))
  and not exists (
    select 1 from cotironda_private.whapi_quote_queue_d062 earlier
    where earlier.round_id=q.round_id
      and earlier.supplier_org_id=q.supplier_org_id
      and earlier.status in('pending','leased')
      and (earlier.queued_at,earlier.channel_id,earlier.message_key)
          <(q.queued_at,q.channel_id,q.message_key)
  )
 order by q.queued_at,q.channel_id,q.message_key
 for update of q skip locked limit 1;
 if not found then return null;end if;
 v_token:=pg_catalog.gen_random_uuid();
 update cotironda_private.whapi_quote_queue_d062
 set status='leased',attempts=j.attempts+1,lease_token=v_token,
     lease_until=v_now+interval '90 seconds',result_code=null
 where channel_id=j.channel_id and message_key=j.message_key;
 return pg_catalog.jsonb_build_object(
  'channel',j.channel_id,'messageKey',j.message_key,
  'leaseToken',v_token,'attempt',j.attempts+1);
end;$fn$;

-- ACK allowed only for current lease holder before expiry.
-- Received requires D060 evidence actually committed. Timeouts may safely
-- re-run D060 idempotently if earlier write succeeded but worker died.
create function cotironda_private.whapi_finish_quote_d062(
 p_channel text,p_message text,p_token uuid,p_result text
) returns jsonb
language plpgsql volatile security definer set search_path='' as $fn$
declare j cotironda_private.whapi_quote_queue_d062%rowtype;
 v_status text;v_code text;v_backoff integer;
 v_has_offer boolean;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
 or p_message is null or p_message !~ '^[a-f0-9]{64}$'
 or p_token is null
 or p_result is null or p_result not in('received','no_price','not_eligible','retry')
 then raise exception 'd062_bad_ack' using errcode='22023';end if;
 select * into j from cotironda_private.whapi_quote_queue_d062
 where channel_id=p_channel and message_key=p_message for update;
 if not found or j.status<>'leased' or j.lease_token<>p_token
   or j.lease_until<=pg_catalog.clock_timestamp()
 then raise exception 'd062_stale_lease' using errcode='42501';end if;
 select exists(select 1 from cotironda_private.whapi_price_sources_d060 s
  where s.channel_id=p_channel and s.message_key=p_message) into v_has_offer;
 if p_result='received' and not v_has_offer
 then raise exception 'd062_receipt_state_mismatch' using errcode='42501';end if;
 -- If D060 committed before a worker timed out, the ledger is authoritative.
 -- Even if the round subsequently closed or the contact opted out, historical
 -- versions remain recorded, so complete the queue item without reprocessing.
 if v_has_offer then
  -- The write might have committed before a transport timeout.
  -- Do not bill IA again or exhaust retries on an already recorded offer.
  v_status:='done';v_code:='received';
 elsif p_result='no_price' then
  v_status:='manual_review';v_code:='no_price';
 elsif p_result='not_eligible' then
  v_status:='discarded';v_code:='not_eligible';
 elsif j.attempts>=4 then
  v_status:='dead';v_code:='max_attempts';
 else
  v_status:='pending';v_code:='processing_failed';
 end if;
 v_backoff:=case j.attempts
   when 1 then 10 when 2 then 30 else 120 end;
 update cotironda_private.whapi_quote_queue_d062
 set status=v_status,result_code=v_code,lease_token=null,lease_until=null,
  ready_at=case when v_status='pending'
   then pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>v_backoff)
   else ready_at end,
  finished_at=case when v_status in('done','manual_review','discarded','dead')
   then pg_catalog.clock_timestamp() else null end
 where channel_id=p_channel and message_key=p_message;
 return pg_catalog.jsonb_build_object(
  'state',v_status,'attempts',j.attempts);
end;$fn$;

-- Least privilege owner; gateway has EXECUTE only, never table SELECT.
grant create on schema cotironda_private to cotironda_queue_writer_d062;
grant cotironda_queue_writer_d062 to postgres with set true,inherit false;
alter function cotironda_private.whapi_enqueue_quote_d062()
 owner to cotironda_queue_writer_d062;
alter function cotironda_private.whapi_claim_quote_d062()
 owner to cotironda_queue_writer_d062;
alter function cotironda_private.whapi_finish_quote_d062(text,text,uuid,text)
 owner to cotironda_queue_writer_d062;
revoke cotironda_queue_writer_d062 from postgres;
revoke create on schema cotironda_private from cotironda_queue_writer_d062;
revoke all on function cotironda_private.whapi_enqueue_quote_d062(),
 cotironda_private.whapi_claim_quote_d062(),
 cotironda_private.whapi_finish_quote_d062(text,text,uuid,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function
 cotironda_private.whapi_claim_quote_d062(),
 cotironda_private.whapi_finish_quote_d062(text,text,uuid,text)
 to cotironda_queue_gateway_d062;
