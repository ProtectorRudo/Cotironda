-- MVP223: seleccionar un trabajo pendiente de IA Central para comprador
-- autenticado por su HMAC (no desde URL pública). OFF por defecto vía MVP222.
-- No invoca OpenAI/Whapi, no abre catálogo, no encola mensajes.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_ready_for_chat_mvp223(
 p_buyer_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $lookup$
DECLARE rid uuid; n int;
BEGIN
 IF p_buyer_chat_hmac IS NULL OR
  p_buyer_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid_input');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT count(DISTINCT r.id),min(r.id::text)::uuid INTO n,rid
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
  ON shadow.request_id=r.id AND shadow.status='shadow'
 JOIN cotironda_piloto_privado.participants b
  ON b.key=r.buyer_key
 JOIN cotironda_piloto_privado.whapi_inbox src
  ON src.message_hmac=r.source_hmac AND src.request_id=r.id
  AND src.participant_key=b.key AND src.chat_hmac=b.chat_hmac
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 job
  ON job.request_id=r.id AND job.state='pending'
 WHERE r.state='prepared' AND r.closes_at>clock_timestamp()
  AND r.created_at>clock_timestamp()-interval '30 minutes'
  AND b.participant_role='buyer'
  AND b.chat_hmac=p_buyer_chat_hmac
  AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  AND src.kind='text' AND src.processing_state='needs_review'
  AND src.plaintext_sha256=
    encode(sha256(convert_to(r.original_request,'UTF8')),'hex');
 IF n=0 THEN RETURN jsonb_build_object('state','empty');END IF;
 IF n<>1 THEN RETURN jsonb_build_object('state','ambiguous');END IF;
 RETURN jsonb_build_object('state','ready','request_id',rid);
END;
$lookup$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text)
 TO service_role;
