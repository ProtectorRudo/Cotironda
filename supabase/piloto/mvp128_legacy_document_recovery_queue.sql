-- MVP128/PILOTO: safely schedule a private re-read from the ORIGINAL storage bytes.
-- Trigger is a signed Whapi message from an already consented participant.
-- Only SERVICE_ROLE may call; no file content, price, contact or URL returned.
alter table cotironda_piloto_privado.document_ai_diagnostics_mvp127
 drop constraint if exists document_ai_diagnostics_mvp127_reason_code_check;
alter table cotironda_piloto_privado.document_ai_diagnostics_mvp127
 add constraint document_ai_diagnostics_mvp127_reason_code_check
 check (reason_code in (
  'not_attempted','legacy_unclassified','ai_disabled','quota_blocked',
  'api_credentials_missing','api_unauthorized','api_rate_limited',
  'api_rejected','api_server_error','api_unavailable','api_timeout',
  'response_incomplete','response_invalid','response_too_large',
  'schema_rejected','draft_persistence_failed',
  'source_review_required','internal_error'
 ));

create or replace function public.cotironda_piloto_next_document_retry_mvp128(
 p_trigger_chat_hmac text)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare job record; n int;
begin
 if p_trigger_chat_hmac is null or p_trigger_chat_hmac !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;
 if not exists(
   select 1 from cotironda_piloto_privado.participants p
   where p.chat_hmac=p_trigger_chat_hmac
   and p.consent_at is not null and p.opted_out_at is null
   and p.participant_role in ('buyer','supplier')
 ) then return jsonb_build_object('state','no_authorized_trigger');end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row and whatsapp_inbound_enabled)
 then return jsonb_build_object('state','disabled');end if;
 select m.message_hmac,m.ai_reserved_at into job
 from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants owner
  on owner.key=m.participant_key and owner.chat_hmac=m.chat_hmac
 left join cotironda_piloto_privado.document_ai_diagnostics_mvp127 d
  on d.message_hmac=m.message_hmac
 where m.state='stored' and m.review_state='review_required'
 and m.proposal is null
 and m.content_sha256 ~ '^[a-f0-9]{64}$'
 and m.ai_reserved_at < clock_timestamp()-interval '3 minutes'
 and m.size_bytes between 8 and 3145728
 and m.mime in ('application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain','text/csv')
 and owner.consent_at is not null and owner.opted_out_at is null
 and (
  owner.participant_role='buyer'
  or owner.participant_role='supplier' and m.request_id is not null
  and exists(select 1 from cotironda_piloto_privado.invitations i
   join cotironda_piloto_privado.requests r on r.id=i.request_id
   where i.request_id=m.request_id and i.supplier_key=m.participant_key
   and i.state='prepared' and r.state='prepared'
   and r.closes_at>clock_timestamp())
 )
 and (d.message_hmac is null or d.state='failed' and
  d.attempt_count<3 and d.next_retry_at<=clock_timestamp())
 order by m.ai_reserved_at,m.message_hmac
 limit 1
 for update of m skip locked;
 if not found then return jsonb_build_object('state','none');end if;
 -- Old files have no diagnostics because v37 swallowed failures; a generic
 -- LEGACY classification states explicitly that the precise cause is unknown.
 insert into cotironda_piloto_privado.document_ai_diagnostics_mvp127(
  message_hmac,state,reason_code,phase,attempt_count,first_failure_at,
  last_attempt_at,next_retry_at)
 values(job.message_hmac,'failed','legacy_unclassified','initial',1,
   job.ai_reserved_at,job.ai_reserved_at,clock_timestamp()-interval '1 second')
 on conflict(message_hmac) do nothing;
 get diagnostics n=row_count;
 -- Subsequent RPC reserves atomically and rechecks all eligibility and timing.
 return jsonb_build_object('state','candidate','message_hmac',job.message_hmac);
end;$function$;
revoke all on function public.cotironda_piloto_next_document_retry_mvp128(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_next_document_retry_mvp128(text)
 to service_role;
