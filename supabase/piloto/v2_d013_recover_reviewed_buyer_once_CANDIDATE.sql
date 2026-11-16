-- COTIRONDA V2/D013 — CANDIDATO. NO EJECUTAR EN PILOTO SIN «PUBLICALO».
-- Reprocesar UN origen WhatsApp ya autenticado que falló en IA de catálogos.
-- Preserva intento terminal 'review', ciphertext, HMAC y todos los originales.
-- No envía mensajes, no invita proveedores, no activa publicación ni toca V1.
CREATE TABLE cotironda_piloto_privado.v2_d013_review_recovery_receipts (
 source_hmac text PRIMARY KEY
   REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
 request_id uuid NOT NULL UNIQUE
   REFERENCES cotironda_piloto_privado.requests(id),
 original_failure_code text NOT NULL
   CHECK (original_failure_code='ia_error_de_lectura'),
 staged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.v2_d013_review_recovery_receipts
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d013_review_recovery_receipts
 FROM PUBLIC, anon, authenticated, service_role;

-- Lectura restringida a service_role: no devuelve texto plano, contacto ni número.
-- Exactamente UN candidato admisible o nada; cero cambios de estado al consultar.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d013_review_source_private()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $d013recoveryread$
DECLARE v_count integer; v_source record;
BEGIN
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.ai_central_attempts_mvp226 a
  ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
  AND a.buyer_key=m.participant_key
 JOIN cotironda_piloto_privado.participants b
  ON b.key=m.participant_key AND b.chat_hmac=m.chat_hmac
 WHERE b.participant_role='buyer' AND b.consent_at IS NOT NULL
  AND b.opted_out_at IS NULL
  AND m.kind='text' AND m.processing_state='needs_review'
  AND m.request_id IS NULL
  AND m.received_at>clock_timestamp()-interval '48 hours'
  AND m.received_at<=clock_timestamp()
  AND a.state='review' AND a.failure_code='ia_error_de_lectura'
  AND a.source_sha256=m.plaintext_sha256
  AND a.finished_at IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
                 WHERE r.source_hmac=m.message_hmac)
  AND NOT EXISTS(SELECT 1 FROM
    cotironda_piloto_privado.v2_d013_review_recovery_receipts receipt
    WHERE receipt.source_hmac=m.message_hmac);
 IF v_count<>1 THEN
  RETURN jsonb_build_object('state',
    CASE WHEN v_count=0 THEN 'empty' ELSE 'ambiguous' END);
 END IF;
 SELECT m.message_hmac,m.chat_hmac,m.nonce_b64,m.ciphertext_b64,
        m.plaintext_sha256
 INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.ai_central_attempts_mvp226 a
  ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
  AND a.buyer_key=m.participant_key
 JOIN cotironda_piloto_privado.participants b
  ON b.key=m.participant_key AND b.chat_hmac=m.chat_hmac
 WHERE b.participant_role='buyer' AND b.consent_at IS NOT NULL
  AND b.opted_out_at IS NULL
  AND m.kind='text' AND m.processing_state='needs_review'
  AND m.request_id IS NULL
  AND m.received_at>clock_timestamp()-interval '48 hours'
  AND m.received_at<=clock_timestamp()
  AND a.state='review' AND a.failure_code='ia_error_de_lectura'
  AND a.source_sha256=m.plaintext_sha256
  AND a.finished_at IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
                 WHERE r.source_hmac=m.message_hmac)
  AND NOT EXISTS(SELECT 1 FROM
   cotironda_piloto_privado.v2_d013_review_recovery_receipts receipt
   WHERE receipt.source_hmac=m.message_hmac)
 ORDER BY m.received_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 RETURN jsonb_build_object('state','ready',
  'message_hmac',v_source.message_hmac,
  'chat_hmac',v_source.chat_hmac,
  'source_sha256',v_source.plaintext_sha256,
  'nonce_b64',v_source.nonce_b64,
  'ciphertext_b64',v_source.ciphertext_b64);
END $d013recoveryread$;

-- ACID: preparación original bajo lock + constancia append-only en misma txn.
-- El RPC V2 existente coteja SHA, catálogo y autorizaciones antes de insertar.
-- NUNCA llama a publish, auto-release, Whapi ni cambia el intento 'review'.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d013_recovery_stage_private(
 p_chat_hmac text,p_message_hmac text,p_source_sha256 text,
 p_original_text text,p_city text,p_items jsonb,p_destinos jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $d013recoverystage$
DECLARE v_source record;v_result jsonb;v_request uuid;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_original_text IS NULL OR length(p_original_text) NOT BETWEEN 10 AND 4000
 OR encode(sha256(convert_to(p_original_text,'UTF8')),'hex')<>p_source_sha256
 THEN RETURN jsonb_build_object('state','invalid_source');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_business_policy p
  WHERE p.singleton AND p.enabled AND p.activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 c
  WHERE c.only_row AND c.enabled AND c.activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT m.message_hmac,m.plaintext_sha256 INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.ai_central_attempts_mvp226 a
  ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
  AND a.buyer_key=m.participant_key
 JOIN cotironda_piloto_privado.participants b
  ON b.key=m.participant_key AND b.chat_hmac=m.chat_hmac
 WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
  AND b.participant_role='buyer' AND b.consent_at IS NOT NULL
  AND b.opted_out_at IS NULL
  AND m.kind='text' AND m.processing_state='needs_review'
  AND m.request_id IS NULL AND m.plaintext_sha256=p_source_sha256
  AND m.received_at>clock_timestamp()-interval '48 hours'
  AND m.received_at<=clock_timestamp()
  AND a.state='review' AND a.failure_code='ia_error_de_lectura'
  AND a.source_sha256=p_source_sha256 AND a.finished_at IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
                 WHERE r.source_hmac=m.message_hmac)
  AND NOT EXISTS(SELECT 1 FROM
    cotironda_piloto_privado.v2_d013_review_recovery_receipts receipt
    WHERE receipt.source_hmac=m.message_hmac)
 FOR UPDATE OF m;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 v_result:=public.cotironda_piloto_v2_shadow_prepare_d013(
  p_chat_hmac,p_message_hmac,p_original_text,p_city,p_items,p_destinos);
 IF v_result->>'state'<>'shadow_staged'
 OR v_result->>'invitations_sent'<>'0'
 OR v_result->>'outbox_sent'<>'0'
 THEN RETURN jsonb_build_object('state','staging_denied');END IF;
 v_request:=(v_result->>'request_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.request_id=r.id AND m.message_hmac=r.source_hmac
  WHERE r.id=v_request AND r.source_hmac=p_message_hmac
   AND r.state='draft' AND m.chat_hmac=p_chat_hmac)
 THEN RAISE EXCEPTION 'd013_recovery_atomic_verification_failed';END IF;
 INSERT INTO cotironda_piloto_privado.v2_d013_review_recovery_receipts
  (source_hmac,source_sha256,request_id,original_failure_code)
 VALUES(p_message_hmac,p_source_sha256,v_request,'ia_error_de_lectura');
 RETURN jsonb_build_object('state','staged','request_id',v_request,
  'items_staged',v_result->'items_staged',
  'matches_staged',v_result->'matches_staged',
  'invitations_sent',0,'outbox_sent',0);
END $d013recoverystage$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d013_review_source_private()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d013_review_source_private()
 TO service_role;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d013_recovery_stage_private(
 text,text,text,text,text,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d013_recovery_stage_private(
 text,text,text,text,text,jsonb,jsonb) TO service_role;
