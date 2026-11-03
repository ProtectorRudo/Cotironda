-- MVP119 / PILOTO. A Whapi API response is NOT proof of recipient delivery.
-- Status webhooks are authenticated and matched to a previously API-accepted
-- outbound ID and the current recipient's authenticated chat HMAC.
-- No recipient numbers, webhook payloads, sender names or original documents
-- are stored. Never use this table for client-visible contact disclosure.
alter table cotironda_piloto_privado.buyer_tracking_mvp091
 add column whapi_message_id text
 check(whapi_message_id is null or
  (length(whapi_message_id) between 8 and 160 and
   whapi_message_id ~ '^[A-Za-z0-9_-]+$'));
alter table cotironda_piloto_privado.supplier_ack_mvp104
 add column whapi_message_id text
 check(whapi_message_id is null or
  (length(whapi_message_id) between 8 and 160 and
   whapi_message_id ~ '^[A-Za-z0-9_-]+$'));

create table cotironda_piloto_privado.delivery_receipts_mvp119(
 message_id_sha256 text primary key check(message_id_sha256 ~ '^[a-f0-9]{64}$'),
 source_kind text not null check(source_kind in
  ('supplier_request','buyer_tracking','supplier_ack','finalist')),
 request_id uuid references cotironda_piloto_privado.requests(id),
 recipient_key text not null references cotironda_piloto_privado.participants(key),
 state text not null check(state in
  ('pending','sent','failed','deleted','delivered','read','played')),
 status_code integer not null check(status_code between 0 and 6),
 event_unix bigint not null check(event_unix>0),
 first_seen_at timestamptz not null default clock_timestamp(),
 last_seen_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.delivery_receipts_mvp119
 enable row level security;
revoke all on cotironda_piloto_privado.delivery_receipts_mvp119
 from public,anon,authenticated,service_role;

-- Persist opaque API id after the already idempotent tracking send has
-- committed. The receipt can arrive earlier; in that case reconcile via
-- Whapi's GET /messages/{id}, never blindly send another WhatsApp.
create function public.cotironda_piloto_record_tracking_id_mvp119(
 p_token_hash text,p_whapi_message_id text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
  or p_whapi_message_id is null or
  p_whapi_message_id !~ '^[A-Za-z0-9_-]{8,160}$'
 then return false;end if;
 update cotironda_piloto_privado.buyer_tracking_mvp091
 set whapi_message_id=p_whapi_message_id
 where token_hash=p_token_hash and send_state='api_accepted'
  and send_attempted_at>clock_timestamp()-interval '24 hours'
  and whapi_message_id is null;
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_record_tracking_id_mvp119(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_record_tracking_id_mvp119(text,text)
 to service_role;

create function public.cotironda_piloto_record_supplier_ack_id_mvp119(
 p_message_hmac text,p_whapi_message_id text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
  or p_whapi_message_id is null or
  p_whapi_message_id !~ '^[A-Za-z0-9_-]{8,160}$'
 then return false;end if;
 update cotironda_piloto_privado.supplier_ack_mvp104
 set whapi_message_id=p_whapi_message_id
 where message_hmac=p_message_hmac and state='api_accepted'
  and finished_at>clock_timestamp()-interval '24 hours'
  and whapi_message_id is null;
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_record_supplier_ack_id_mvp119(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_record_supplier_ack_id_mvp119(text,text)
 to service_role;

-- A webhook status can affect a record ONLY if a matching Whapi API
-- outbound id already exists in exactly ONE ledger (no ambiguous IDs),
-- and the authenticated recipient is the same enrolled participant.
-- At-most-once sending is NEVER modified by this receipt routine.
create function public.cotironda_piloto_record_delivery_mvp119(
 p_whapi_message_id text,p_status text,p_status_code integer,
 p_recipient_chat_hmac text,p_event_unix bigint
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare matched record; count_ integer; existing record;
 old_rank integer;new_rank integer;hash_ text;rows_ integer;
begin
 if p_whapi_message_id is null or
    p_whapi_message_id !~ '^[A-Za-z0-9_-]{8,160}$' or
    p_recipient_chat_hmac is null or
    p_recipient_chat_hmac !~ '^[a-f0-9]{64}$' or
    p_status not in ('failed','pending','sent','delivered','read','played','deleted') or
    p_status_code not between 0 and 6 or
    p_event_unix is null or
    p_event_unix<extract(epoch from clock_timestamp()-interval '7 days')::bigint or
    p_event_unix>extract(epoch from clock_timestamp()+interval '5 minutes')::bigint
 then return jsonb_build_object('state','invalid');end if;

 select count(*),max(k.source_kind),max(k.request_id::text)::uuid,
   max(k.recipient_key)
 into count_,matched.source_kind,matched.request_id,matched.recipient_key
 from (
  select 'supplier_request'::text source_kind,o.request_id,o.supplier_key recipient_key
   from cotironda_piloto_privado.whapi_outbox o
   where o.whapi_message_id=p_whapi_message_id and o.state='api_accepted'
  union all
  select 'buyer_tracking',t.request_id,r.buyer_key
   from cotironda_piloto_privado.buyer_tracking_mvp091 t
   join cotironda_piloto_privado.requests r on r.id=t.request_id
   where t.whapi_message_id=p_whapi_message_id and t.send_state='api_accepted'
  union all
  select 'supplier_ack',m.request_id,m.participant_key
   from cotironda_piloto_privado.supplier_ack_mvp104 a
   join cotironda_piloto_privado.whapi_inbox m on m.message_hmac=a.message_hmac
   where a.whapi_message_id=p_whapi_message_id and a.state='api_accepted'
  union all
  select 'finalist',o.request_id,o.recipient_key
   from cotironda_piloto_privado.finalist_whapi_outbox_mvp110 o
   where o.whapi_message_id=p_whapi_message_id and o.state='api_accepted'
 ) k
 join cotironda_piloto_privado.participants p
   on p.key=k.recipient_key and p.chat_hmac=p_recipient_chat_hmac;
 if count_<>1 then return jsonb_build_object('state','unmatched');end if;

 hash_:=encode(extensions.digest(p_whapi_message_id,'sha256'),'hex');
 new_rank:=case p_status
  when 'pending' then 0 when 'sent' then 1
  when 'failed' then 2 when 'deleted' then 2
  when 'delivered' then 3 when 'read' then 4 when 'played' then 5 end;

 insert into cotironda_piloto_privado.delivery_receipts_mvp119(
  message_id_sha256,source_kind,request_id,recipient_key,
  state,status_code,event_unix)
 values(hash_,matched.source_kind,matched.request_id,
  matched.recipient_key,p_status,p_status_code,p_event_unix)
 on conflict(message_id_sha256) do nothing;
 get diagnostics rows_=row_count;
 if rows_=1 then return jsonb_build_object('state','recorded');end if;

 -- Recheck identity before updating; also prevents races when two different
 -- recipient keys are found for the same reused Whapi message identifier.
 select state,source_kind,request_id,recipient_key into existing
 from cotironda_piloto_privado.delivery_receipts_mvp119
 where message_id_sha256=hash_ for update;
 if existing.source_kind is distinct from matched.source_kind or
    existing.request_id is distinct from matched.request_id or
    existing.recipient_key is distinct from matched.recipient_key
 then return jsonb_build_object('state','unmatched');end if;
 old_rank:=case existing.state
  when 'pending' then 0 when 'sent' then 1
  when 'failed' then 2 when 'deleted' then 2
  when 'delivered' then 3 when 'read' then 4 when 'played' then 5 end;
 if new_rank<=old_rank
 then return jsonb_build_object('state','unchanged');end if;
 update cotironda_piloto_privado.delivery_receipts_mvp119
 set state=p_status,status_code=p_status_code,event_unix=p_event_unix,
     last_seen_at=clock_timestamp()
 where message_id_sha256=hash_;
 return jsonb_build_object('state','advanced');
end;$fn$;
revoke all on function public.cotironda_piloto_record_delivery_mvp119(
 text,text,integer,text,bigint) from public,anon,authenticated;
grant execute on function public.cotironda_piloto_record_delivery_mvp119(
 text,text,integer,text,bigint) to service_role;

-- ONLY internal operational summary (no phones, IDs or full price lines).
create function public.cotironda_piloto_delivery_summary_mvp119(
 p_request uuid
) returns jsonb language sql security definer set search_path='' as $fn$
 select jsonb_build_object(
  'state','private_delivery_summary',
  'accepted',count(*) filter(where r.state in ('pending','sent','failed',
     'deleted','delivered','read','played')),
  'delivered',count(*) filter(where r.state in ('delivered','read','played')),
  'failed',count(*) filter(where r.state in ('failed','deleted')),
  'by_kind',coalesce(jsonb_object_agg(r.source_kind, r.state) filter(
    where r.source_kind is not null), '{}'::jsonb)
 ) from cotironda_piloto_privado.delivery_receipts_mvp119 r
 where r.request_id=p_request;
$fn$;
revoke all on function public.cotironda_piloto_delivery_summary_mvp119(uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_delivery_summary_mvp119(uuid)
 to service_role;
