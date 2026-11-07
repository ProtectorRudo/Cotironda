-- MVP287: delivery evidence for buyer-review notices. Does NOT send messages.
-- Exact recipient HMAC, unique Whapi ID and monotonic statuses preserved
-- from MVP119; no phone numbers, tokens or raw messages stored in receipts.
ALTER TABLE cotironda_piloto_privado.delivery_receipts_mvp119
 DROP CONSTRAINT IF EXISTS delivery_receipts_mvp119_source_kind_check;
ALTER TABLE cotironda_piloto_privado.delivery_receipts_mvp119
 ADD CONSTRAINT delivery_receipts_mvp119_source_kind_check
 CHECK (source_kind IN
 ('supplier_request','buyer_tracking','supplier_ack','finalist','buyer_review_notice'));

CREATE OR REPLACE FUNCTION public.cotironda_piloto_record_delivery_mvp119(
 p_whapi_message_id text,p_status text,p_status_code integer,
 p_recipient_chat_hmac text,p_event_unix bigint
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare matched_source_kind text; matched_request_id uuid;
 matched_recipient_key text; count_ integer; existing record;
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
 into count_,matched_source_kind,matched_request_id,matched_recipient_key
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
  union all
  -- MVP287: notice issued only to a recognized buyer, matched to the
  -- original authenticated inbound HMAC, never to arbitrary chat IDs.
  select 'buyer_review_notice'::text,NULL::uuid,m.participant_key
   from cotironda_piloto_privado.ai_buyer_review_notice_mvp286 n
   join cotironda_piloto_privado.whapi_inbox m
     ON m.message_hmac=n.message_hmac AND m.chat_hmac=n.chat_hmac
   where n.whapi_message_id=p_whapi_message_id
     and n.state='api_accepted' AND m.participant_key='arquitecto'
 ) k
 join cotironda_piloto_privado.participants p
   on p.key=k.recipient_key and p.chat_hmac=p_recipient_chat_hmac;
 if count_<>1 then return jsonb_build_object('state','unmatched');end if;

 hash_:=encode(sha256(convert_to(p_whapi_message_id,'UTF8')),'hex');
 new_rank:=case p_status
  when 'pending' then 0 when 'sent' then 1
  when 'failed' then 2 when 'deleted' then 2
  when 'delivered' then 3 when 'read' then 4 when 'played' then 5 end;

 insert into cotironda_piloto_privado.delivery_receipts_mvp119(
  message_id_sha256,source_kind,request_id,recipient_key,
  state,status_code,event_unix)
 values(hash_,matched_source_kind,matched_request_id,
  matched_recipient_key,p_status,p_status_code,p_event_unix)
 on conflict(message_id_sha256) do nothing;
 get diagnostics rows_=row_count;
 if rows_=1 then return jsonb_build_object('state','recorded');end if;

 -- Recheck identity before updating; also prevents races when two different
 -- recipient keys are found for the same reused Whapi message identifier.
 select state,source_kind,request_id,recipient_key into existing
 from cotironda_piloto_privado.delivery_receipts_mvp119
 where message_id_sha256=hash_ for update;
 if existing.source_kind is distinct from matched_source_kind or
    existing.request_id is distinct from matched_request_id or
    existing.recipient_key is distinct from matched_recipient_key
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

REVOKE ALL ON FUNCTION public.cotironda_piloto_record_delivery_mvp119(
 text,text,integer,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_record_delivery_mvp119(
 text,text,integer,text,bigint) TO service_role;
