-- Estado cifrado, nunca materiales en claro. Reutiliza el intento existente.
ALTER TABLE cotironda_piloto_privado.ai_central_attempts_mvp226
 ADD COLUMN zone_snapshot_nonce text,
 ADD COLUMN zone_snapshot_ciphertext text,
 ADD CONSTRAINT zone_snapshot_paired_v2 CHECK(
 (zone_snapshot_nonce IS NULL AND zone_snapshot_ciphertext IS NULL) OR
 (zone_snapshot_nonce IS NOT NULL AND zone_snapshot_ciphertext IS NOT NULL AND
  zone_snapshot_nonce ~ '^[A-Za-z0-9+/]{16}$' AND
  length(zone_snapshot_ciphertext) BETWEEN 24 AND 266668 AND
  zone_snapshot_ciphertext ~ '^[A-Za-z0-9+/=]+$'));
CREATE FUNCTION public.cotironda_piloto_v2_save_zone_snapshot(
 p_chat_hmac text,p_message_hmac text,p_source_sha256 text,p_nonce text,p_ciphertext text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE n integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[0-9a-f]{64}$' OR
 p_message_hmac IS NULL OR p_message_hmac !~ '^[0-9a-f]{64}$' OR
 p_source_sha256 IS NULL OR p_source_sha256 !~ '^[0-9a-f]{64}$' OR
 p_nonce IS NULL OR p_nonce !~ '^[A-Za-z0-9+/]{16}$' OR
 p_ciphertext IS NULL OR length(p_ciphertext) NOT BETWEEN 24 AND 266668 OR
 p_ciphertext !~ '^[A-Za-z0-9+/=]+$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.ai_central_attempts_mvp226 a
 SET state='needs_zone',failure_code='delivery_city_missing',finished_at=clock_timestamp(),
 zone_snapshot_nonce=p_nonce,zone_snapshot_ciphertext=p_ciphertext
 FROM cotironda_piloto_privado.whapi_inbox i,cotironda_piloto_privado.participants b
 WHERE a.message_hmac=p_message_hmac AND a.chat_hmac=p_chat_hmac
 AND a.source_sha256=p_source_sha256 AND a.state='reserved'
 AND a.zone_snapshot_nonce IS NULL AND a.zone_snapshot_ciphertext IS NULL
 AND i.message_hmac=a.message_hmac AND i.chat_hmac=a.chat_hmac
 AND i.plaintext_sha256=a.source_sha256 AND i.participant_key=a.buyer_key
 AND i.kind='text' AND i.request_id IS NULL AND i.processing_state='needs_review'
 AND b.key=a.buyer_key AND b.chat_hmac=a.chat_hmac AND b.participant_role='buyer'
 AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN n=1 THEN 'saved' ELSE 'not_authorized' END);
END $fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_save_zone_snapshot(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_save_zone_snapshot(text,text,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_claim_zone_mvp233(p_chat_hmac text, p_reply_hmac text, p_reply_text text, p_city text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_buyer text;v_count integer;v_source_hmac text;
 v_source record;v_rows integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_reply_hmac IS NULL OR p_reply_hmac !~ '^[a-f0-9]{64}$'
 OR p_reply_text IS NULL OR length(p_reply_text) NOT BETWEEN 3 AND 130
 OR p_city IS NULL OR length(p_city) NOT BETWEEN 3 AND 80
 OR p_city ~ '[[:cntrl:]]'
 OR position(lower(p_city) IN lower(p_reply_text))=0
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Prohibido retomar una compra si venció la autorización de nuevos pedidos.
 IF NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.ai_trial_control_mvp229 t
  JOIN cotironda_piloto_privado.ai_central_control_mvp226 c ON c.only_row
  JOIN cotironda_piloto_privado.ai_dispatch_gate_mvp222 d ON d.only_row
  JOIN cotironda_piloto_privado.integration_flags f ON f.only_row
  WHERE t.only_row AND t.enabled AND t.activated_at<=clock_timestamp()
    AND (t.expires_at IS NULL OR t.expires_at>clock_timestamp())
    AND c.enabled AND c.activated_at IS NOT NULL
    AND d.enabled AND d.activated_at IS NOT NULL
    AND f.whatsapp_inbound_enabled AND f.whatsapp_outbound_enabled
 ) THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT p.key INTO v_buyer
 FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.whapi_inbox reply
  ON reply.participant_key=p.key AND reply.chat_hmac=p.chat_hmac
 WHERE p.chat_hmac=p_chat_hmac AND p.participant_role='buyer'
  AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL AND reply.message_hmac=p_reply_hmac
  AND reply.kind='text' AND reply.request_id IS NULL
  AND reply.processing_state='needs_review'
  AND reply.plaintext_sha256=encode(sha256(convert_to(p_reply_text,'UTF8')),'hex')
  AND reply.received_at>clock_timestamp()-interval '10 minutes'
 FOR UPDATE OF reply;
 IF v_buyer IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_zone_replies_mvp233 WHERE reply_hmac=p_reply_hmac)
 THEN RETURN jsonb_build_object('state','already_consumed');END IF;
 -- Sin adivinar contexto: exactamente UN pedido IA previo a la respuesta.
 SELECT count(*),min(a.message_hmac) INTO v_count,v_source_hmac
 FROM cotironda_piloto_privado.ai_central_attempts_mvp226 a
 JOIN cotironda_piloto_privado.whapi_inbox original ON original.message_hmac=a.message_hmac
 JOIN cotironda_piloto_privado.whapi_inbox reply ON reply.message_hmac=p_reply_hmac
 WHERE a.buyer_key=v_buyer AND a.chat_hmac=p_chat_hmac
   AND a.state='needs_zone' AND a.failure_code='delivery_city_missing'
   AND a.finished_at IS NOT NULL AND a.source_sha256=original.plaintext_sha256
   AND original.participant_key=v_buyer AND original.chat_hmac=p_chat_hmac
   AND original.kind='text' AND original.request_id IS NULL
   AND original.processing_state='needs_review'
   AND original.received_at>clock_timestamp()-interval '24 hours'
   AND original.received_at<reply.received_at;
 IF v_count<>1 OR v_source_hmac IS NULL THEN
  RETURN jsonb_build_object('state',CASE WHEN v_count>1 THEN 'ambiguous' ELSE 'no_pending' END);
 END IF;
 SELECT m.message_hmac,m.nonce_b64,m.ciphertext_b64,m.plaintext_sha256 INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m WHERE m.message_hmac=v_source_hmac
 FOR UPDATE OF m;
 IF v_source.nonce_b64 IS NULL OR v_source.ciphertext_b64 IS NULL
 OR v_source.plaintext_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','original_unavailable');END IF;
 -- Reclamar la misma fuente + marcar respuesta en una transacción indivisible.
 UPDATE cotironda_piloto_privado.ai_central_attempts_mvp226 a
 SET state='reserved',finished_at=NULL,failure_code=NULL
 WHERE a.message_hmac=v_source_hmac AND a.chat_hmac=p_chat_hmac
   AND a.state='needs_zone' AND a.buyer_key=v_buyer;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RETURN jsonb_build_object('state','already_consumed');END IF;
 INSERT INTO cotironda_piloto_privado.ai_zone_replies_mvp233
 (reply_hmac,source_hmac,buyer_key,delivery_city)
 VALUES(p_reply_hmac,v_source_hmac,v_buyer,p_city);
 RETURN jsonb_build_object('state','resumed',
  'source_hmac',v_source_hmac,'source_sha256',v_source.plaintext_sha256,
  'nonce',v_source.nonce_b64,'ciphertext',v_source.ciphertext_b64,
  'delivery_city',p_city,
  'snapshot_nonce',(SELECT zone_snapshot_nonce FROM cotironda_piloto_privado.ai_central_attempts_mvp226 WHERE message_hmac=v_source_hmac),
  'snapshot_ciphertext',(SELECT zone_snapshot_ciphertext FROM cotironda_piloto_privado.ai_central_attempts_mvp226 WHERE message_hmac=v_source_hmac),
  'usage_call_no',(SELECT coalesce(max(call_no),0) FROM cotironda_piloto_privado.ai_usage_calls_mvp264 WHERE message_hmac=v_source_hmac));
END;
$function$;
