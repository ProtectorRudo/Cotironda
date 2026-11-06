-- MVP256 · Etapa 5: sólo errores TRANSITORIOS reintentan documentos.
-- No toca Whapi OUTBOUND, no envía notificaciones, no autoriza presupuesto.
-- Migración de reemplazo posterior a MVP127, MVP128 y MVP131.
-- Dejar nota de que problemas permanentes van a revisión, no a relecturas pagas.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_retryable_document_error_mvp256(
 p_reason_code text
) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER
 SET search_path='' AS $func$
 SELECT coalesce(p_reason_code IN (
  'legacy_unclassified',
  'api_rate_limited',
  'api_server_error',
  'api_unavailable',
  'api_timeout',
  'response_incomplete'
 ),false)
$func$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_retryable_document_error_mvp256(text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_retryable_document_error_mvp256(text)
 TO service_role;

-- 1. Fallas permanentes: next_retry_at NULL. Reintentos permitidos: 3, 9 min,
--    cap de tres intentos y sin segundo intento tras el tercero.
create or replace function public.cotironda_piloto_note_document_failure_mvp127(
 p_message_hmac text,p_reason_code text,p_phase text)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare n integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
  or p_reason_code not in (
   'ai_disabled','quota_blocked','api_credentials_missing','api_unauthorized',
   'api_rate_limited','api_rejected','api_server_error','api_unavailable',
   'api_timeout','response_incomplete','response_invalid',
   'response_too_large','schema_rejected','draft_persistence_failed',
   'source_review_required','internal_error')
  or p_phase not in ('initial','primary','corroboration','storage','validation','review','retry')
 then return false;end if;
 if not exists(
  select 1 from cotironda_piloto_privado.media_archive_mvp095 a
  join cotironda_piloto_privado.participants p
   on p.key=a.participant_key and p.chat_hmac=a.chat_hmac
  where a.message_hmac=p_message_hmac and a.state='stored'
   and a.ai_reserved_at is not null
   and p.consent_at is not null and p.opted_out_at is null
 ) then return false;end if;
 insert into cotironda_piloto_privado.document_ai_diagnostics_mvp127(
   message_hmac,state,reason_code,phase,attempt_count,
   first_failure_at,last_attempt_at,next_retry_at)
 values(p_message_hmac,'failed',p_reason_code,p_phase,1,
  clock_timestamp(),clock_timestamp(),case when public.cotironda_piloto_retryable_document_error_mvp256(p_reason_code) then clock_timestamp()+interval '3 minutes' else null end)
 on conflict(message_hmac) do update
 set state='failed',reason_code=excluded.reason_code,phase=excluded.phase,
  first_failure_at=coalesce(cotironda_piloto_privado.document_ai_diagnostics_mvp127.first_failure_at,clock_timestamp()),
  attempt_count=least(3,cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count+1),
  last_attempt_at=clock_timestamp(),
  next_retry_at=case
   when not public.cotironda_piloto_retryable_document_error_mvp256(excluded.reason_code) then null
   when cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count>=2 then null
   else clock_timestamp()+make_interval(mins=>3*
     power(3,cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count)::integer)
   end,
  updated_at=clock_timestamp();
 get diagnostics n=row_count;
 return n=1;
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_note_document_failure_mvp127(text,text,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_note_document_failure_mvp127(text,text,text)
 TO service_role;
-- 2. Reserva de original: exige causa transitoria y vuelve a verificar identidad.
create or replace function public.cotironda_piloto_reserve_document_retry_mvp127(
 p_message_hmac text)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare a record; diag record;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;
 select m.message_hmac,m.kind,m.mime,m.content_sha256,m.size_bytes,
        m.request_id,p.participant_role
 into a
 from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants p
  on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.state='stored'
  and m.proposal is null and m.review_state='review_required'
  and m.ai_reserved_at is not null and m.content_sha256 ~ '^[a-f0-9]{64}$'
  and m.size_bytes between 8 and 3145728
  and m.mime in ('application/pdf','image/jpeg','image/png','image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv')
  and p.consent_at is not null and p.opted_out_at is null
  and (p.participant_role='buyer' or
   p.participant_role='supplier' and m.request_id is not null and
   exists(select 1 from cotironda_piloto_privado.invitations i
    join cotironda_piloto_privado.requests r on r.id=i.request_id
    where i.request_id=m.request_id and i.supplier_key=m.participant_key
    and r.state='prepared' and r.closes_at>clock_timestamp()))
 for update of m;
 if not found then return jsonb_build_object('state','not_eligible');end if;
 select * into diag from cotironda_piloto_privado.document_ai_diagnostics_mvp127
 where message_hmac=p_message_hmac and state='failed'
  and attempt_count<3 and next_retry_at <=clock_timestamp()
  and public.cotironda_piloto_retryable_document_error_mvp256(reason_code)
 for update;
 if not found then return jsonb_build_object('state','not_due');end if;
 update cotironda_piloto_privado.document_ai_diagnostics_mvp127
 set state='pending',phase='retry',next_retry_at=null,updated_at=clock_timestamp()
 where message_hmac=p_message_hmac and state='failed'
   and attempt_count<3 and next_retry_at<=clock_timestamp()
   and public.cotironda_piloto_retryable_document_error_mvp256(reason_code);
 if not found then return jsonb_build_object('state','already_reserved');end if;
 return jsonb_build_object('state','reserved','kind',a.kind,
  'mime',a.mime,'source_sha256',a.content_sha256,
  'size_bytes',a.size_bytes,'supplier_quote',a.participant_role='supplier');
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_reserve_document_retry_mvp127(text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_reserve_document_retry_mvp127(text)
 TO service_role;
-- 3. Descubrimiento con token de trigger verificado: sin causas permanentes.
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
 -- Do not silently multiply OpenAI calls when many messages arrive.
 if (select count(*) from cotironda_piloto_privado.media_archive_mvp095
     where ai_reserved_at >= clock_timestamp()-interval '24 hours')
  + (select count(*) from cotironda_piloto_privado.document_ai_diagnostics_mvp127
     where last_attempt_at >= clock_timestamp()-interval '24 hours')
  >= (select max_document_ai_per_24h from cotironda_piloto_privado.operational_caps_mvp097
      where only_row)
 then return jsonb_build_object('state','quota');end if;
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
 and m.size_bytes between 8 and 8388608
 and m.mime in ('application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword','application/vnd.ms-excel',
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
 and (d.message_hmac is null
  or d.state='failed' and d.attempt_count<3
   and d.next_retry_at<=clock_timestamp()
   and public.cotironda_piloto_retryable_document_error_mvp256(d.reason_code)
  or d.state='pending' and d.attempt_count<3
   and d.updated_at<clock_timestamp()-interval '8 minutes')
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
 on conflict(message_hmac) do update
 set state='failed',reason_code='api_timeout',phase='retry',
  attempt_count=least(3,cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count+1),
  next_retry_at=clock_timestamp()-interval '1 second',
  updated_at=clock_timestamp()
 where cotironda_piloto_privado.document_ai_diagnostics_mvp127.state='pending'
 and cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count<3
 and cotironda_piloto_privado.document_ai_diagnostics_mvp127.updated_at<
  clock_timestamp()-interval '8 minutes';
 get diagnostics n=row_count;
 -- Subsequent RPC reserves atomically and rechecks all eligibility and timing.
 return jsonb_build_object('state','candidate','message_hmac',job.message_hmac);
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_next_document_retry_mvp128(text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_next_document_retry_mvp128(text)
 TO service_role;
-- 4. Worker programado: mismo filtro, no acumular trabajo no recuperable.
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
      and public.cotironda_piloto_retryable_document_error_mvp256(d.reason_code)
   or d.state='pending' and d.attempt_count<3
      and d.updated_at<clock_timestamp()-interval '8 minutes')
 order by m.ai_reserved_at,m.message_hmac limit 1;
 if v_chat is null then return jsonb_build_object('state','none');end if;
 return jsonb_build_object('state','candidate','trigger_chat_hmac',v_chat);
end;$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_system_document_trigger_mvp131()
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_system_document_trigger_mvp131()
 TO service_role;
