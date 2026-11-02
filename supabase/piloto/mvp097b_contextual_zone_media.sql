-- MVP-097b: reduce visible friction. A verified image with material lines
-- missing delivery locality gets ONE zone-only prompt, no file re-send.
-- A later locality-only buyer text attaches to the original private document.
-- Does not convert unverified model lines to a quote or invite suppliers.
alter table cotironda_piloto_privado.media_archive_mvp095
 add column delivery_city_confirmed text,
 add column delivery_zone_source_hmac text references cotironda_piloto_privado.whapi_inbox(message_hmac),
 add constraint mvp097_city_valid check(
 delivery_city_confirmed is null or
 (length(delivery_city_confirmed) between 3 and 80 and
  delivery_city_confirmed ~ '^[[:alpha:][:space:]()'',.-]+$')),
 add constraint mvp097_city_source_pair check(
   (delivery_city_confirmed is null)=(delivery_zone_source_hmac is null));

-- Never let a model-proposed city override the buyer's later message.
create function public.cotironda_piloto_attach_zone_to_document_mvp097(
 p_chat_hmac text,p_message_hmac text,p_city text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_buyer text;v_target text;n integer;
begin
 if p_chat_hmac !~ '^[a-f0-9]{64}$' or
    p_message_hmac !~ '^[a-f0-9]{64}$' or
    p_city is null or length(btrim(p_city)) not between 3 and 80 or
    p_city !~ '^[[:alpha:][:space:]()'',.-]+$'
 then return jsonb_build_object('state','invalid_city');end if;
 select p.key into v_buyer from cotironda_piloto_privado.participants p
 join cotironda_piloto_privado.whapi_inbox m on m.chat_hmac=p.chat_hmac
   and m.participant_key=p.key
 where p.chat_hmac=p_chat_hmac and m.message_hmac=p_message_hmac
   and m.kind='text' and m.processing_state in ('needs_review','needs_zone')
   and m.received_at>clock_timestamp()-interval '15 minutes'
   and p.participant_role='buyer' and p.consent_at is not null
   and p.opted_out_at is null for update of p;
 if v_buyer is null then return jsonb_build_object('state','not_permitted');end if;
 -- Only a unique unmatched buyer document in the last 24h.
 select count(*),min(a.message_hmac) into n,v_target
 from cotironda_piloto_privado.media_archive_mvp095 a
 where a.chat_hmac=p_chat_hmac and a.participant_key=v_buyer
  and a.kind in ('image','document') and a.state='stored'
  and a.proposal->>'kind'='buyer_request'
  and (a.proposal->>'delivery_city') is null
  and a.delivery_city_confirmed is null
  and a.request_id is null
  and a.reserved_at>clock_timestamp()-interval '24 hours'
  and exists(select 1 from cotironda_piloto_privado.ai_replies_mvp094 rep
      where rep.message_hmac=a.message_hmac and rep.reply_code='zone'
       and rep.state='api_accepted');
 if n<>1 then return jsonb_build_object('state',case when n=0
    then 'no_pending_document' else 'ambiguous_pending_documents' end);end if;
 update cotironda_piloto_privado.media_archive_mvp095
 set delivery_city_confirmed=btrim(p_city),
  delivery_zone_source_hmac=p_message_hmac
 where message_hmac=v_target and delivery_city_confirmed is null;
 get diagnostics n=row_count;
 return jsonb_build_object('state',case when n=1
   then 'city_attached' else 'not_attached' end);
end;$fn$;
revoke all on function public.cotironda_piloto_attach_zone_to_document_mvp097(text,text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_attach_zone_to_document_mvp097(text,text,text)
 to service_role;

-- Reply only to the same enrolled buyer, after a successfully stored
-- document and valid AI suggestion. Use existing ledger for one send/HMAC.
create function public.cotironda_piloto_reserve_document_zone_reply_mvp097(
 p_chat_hmac text,p_message_hmac text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_chat_hmac !~ '^[a-f0-9]{64}$' or
  p_message_hmac !~ '^[a-f0-9]{64}$' then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row and whatsapp_inbound_enabled and whatsapp_outbound_enabled)
 then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.media_archive_mvp095 a
  join cotironda_piloto_privado.whapi_inbox m on m.message_hmac=a.message_hmac
  join cotironda_piloto_privado.participants p on p.key=a.participant_key
    and p.chat_hmac=a.chat_hmac
  where a.message_hmac=p_message_hmac and a.chat_hmac=p_chat_hmac
   and a.state='stored' and a.kind in('image','document')
   and a.review_state='suggested_only' and a.request_id is null
   and a.proposal->>'kind'='buyer_request'
   and a.proposal->>'delivery_city' is null
   and jsonb_array_length(a.proposal->'lines')>0
   and m.processing_state='needs_review'
   and a.reserved_at>clock_timestamp()-interval '10 minutes'
   and p.participant_role='buyer' and p.consent_at is not null
   and p.opted_out_at is null)
 then return false;end if;
 perform 1 from cotironda_piloto_privado.participants
  where chat_hmac=p_chat_hmac and participant_role='buyer' for update;
 select count(*) into n from cotironda_piloto_privado.ai_replies_mvp094
  where chat_hmac=p_chat_hmac
   and created_at>=clock_timestamp()-interval '24 hours';
 if n>=(select max_replies_per_24h
  from cotironda_piloto_privado.operational_caps_mvp097 where only_row)
 then return false;end if;
 insert into cotironda_piloto_privado.ai_replies_mvp094(
  message_hmac,chat_hmac,reply_code)
 values(p_message_hmac,p_chat_hmac,'zone') on conflict do nothing;
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_reserve_document_zone_reply_mvp097(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_reserve_document_zone_reply_mvp097(text,text)
 to service_role;
