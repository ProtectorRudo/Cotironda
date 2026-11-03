-- MVP131: return only an eligible trigger CHAT HMAC to an authenticated server.
-- The existing MVP128 RPC still reserves/locks the actual document and checks
-- consent, invitation, deadline, size, source hash and rate limits again.
create or replace function public.cotironda_piloto_system_document_trigger_mvp131()
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare v_chat text;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row and whatsapp_inbound_enabled)
 then return jsonb_build_object('state','disabled'); end if;
 if (select count(*) from cotironda_piloto_privado.media_archive_mvp095
     where ai_reserved_at >= clock_timestamp()-interval '24 hours')
  + (select count(*) from cotironda_piloto_privado.document_ai_diagnostics_mvp127
     where last_attempt_at >= clock_timestamp()-interval '24 hours')
  >= (select max_document_ai_per_24h from cotironda_piloto_privado.operational_caps_mvp097
     where only_row)
 then return jsonb_build_object('state','quota');end if;
 select p.chat_hmac into v_chat
 from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants p
  on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 left join cotironda_piloto_privado.document_ai_diagnostics_mvp127 d
  on d.message_hmac=m.message_hmac
 where m.state='stored' and m.review_state='review_required'
  and m.proposal is null
  and m.storage_path='media/'||m.message_hmac
  and m.content_sha256 ~ '^[a-f0-9]{64}$'
  and m.ai_reserved_at < clock_timestamp()-interval '3 minutes'
  and m.size_bytes between 8 and 8388608
  and m.mime in ('application/pdf','image/jpeg','image/png','image/webp',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'text/plain','text/csv')
  and p.participant_role in ('buyer','supplier')
  and p.consent_at is not null and p.opted_out_at is null
  and (p.participant_role='buyer' or
   p.participant_role='supplier' and m.request_id is not null and
   exists(select 1 from cotironda_piloto_privado.invitations i
    join cotironda_piloto_privado.requests r on r.id=i.request_id
    where i.request_id=m.request_id and i.supplier_key=m.participant_key
     and i.state='prepared' and r.state='prepared'
     and r.closes_at>clock_timestamp()))
  and (d.message_hmac is null
   or d.state='failed' and d.attempt_count<3 and d.next_retry_at<=clock_timestamp()
   or d.state='pending' and d.attempt_count<3
      and d.updated_at<clock_timestamp()-interval '8 minutes')
 order by m.ai_reserved_at,m.message_hmac limit 1;
 if v_chat is null then return jsonb_build_object('state','none');end if;
 return jsonb_build_object('state','candidate','trigger_chat_hmac',v_chat);
end;$function$;
revoke all on function public.cotironda_piloto_system_document_trigger_mvp131()
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_system_document_trigger_mvp131()
 to service_role;
