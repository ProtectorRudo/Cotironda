-- D013 / COTIRONDA V2, SOLO CANDIDATO. «LUZ VERDE»: desarrollar, NO publicar.
-- Resuelve bloqueo cuota seis/24 h sin perder autenticación, control de
-- presupuesto proveedor, deduplicación ni privacidad. Recupera sólo inbox
-- íntegro SIN intento, dando prioridad frente a errores históricos.
-- NO envía, NO abre portal, NO cambia WhatsApp, NO publica rondas.
BEGIN;
DO $guard$
DECLARE v_q text;v_r text;v_s text;v_check text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets
  WHERE name='cotironda_d016_pilot_project_ref'
   AND decrypted_secret='ilggkalaafhtiysyzlmg')
 THEN RAISE EXCEPTION 'D013_NOT_PILOT';END IF;
 IF to_regprocedure('public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text)') IS NULL
 OR to_regprocedure('public.cotironda_piloto_v2_d013_review_source_private()') IS NULL
 OR to_regprocedure('public.cotironda_piloto_v2_d013_recovery_stage_private(text,text,text,text,text,jsonb,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'D013_REQUIRED_FUNCTIONS_MISSING';END IF;
 SELECT pg_get_functiondef('public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text)'::regprocedure) INTO v_q;
 SELECT pg_get_functiondef('public.cotironda_piloto_v2_d013_review_source_private()'::regprocedure) INTO v_r;
 SELECT pg_get_functiondef('public.cotironda_piloto_v2_d013_recovery_stage_private(text,text,text,text,text,jsonb,jsonb)'::regprocedure) INTO v_s;
 SELECT pg_get_constraintdef(oid) INTO v_check FROM pg_constraint
 WHERE conrelid='cotironda_piloto_privado.v2_d013_review_recovery_receipts'::regclass
  AND conname='v2_d013_review_recovery_receipts_original_failure_code_check';
 IF v_check IS DISTINCT FROM
  'CHECK ((original_failure_code = ANY (ARRAY[''ia_error_de_lectura''::text, ''lecturas_discrepan_en_articulo''::text])))'
 THEN RAISE EXCEPTION 'D013_RECEIPT_CONSTRAINT_DRIFTED';END IF;
 IF v_q<>$quota_base$CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_buyer_mvp226(p_chat_hmac text, p_message_hmac text, p_source_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_buyer text;v_count integer;v_rows integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;

 SELECT p.key INTO v_buyer FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.participant_key=p.key AND m.chat_hmac=p.chat_hmac
 WHERE p.chat_hmac=p_chat_hmac AND p.participant_role='buyer'
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
   AND m.processing_state='needs_review'
   AND ((m.kind='text' AND m.plaintext_sha256=p_source_sha256)
      OR (m.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    m.message_hmac,m.chat_hmac,m.participant_key,p_source_sha256))
   OR (m.kind='document' AND
    cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
      m.message_hmac,m.chat_hmac,m.participant_key,
      p_source_sha256,NULL)))
   AND m.request_id IS NULL
   AND m.received_at>clock_timestamp()-interval '10 minutes'
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;

 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_attempts_mvp226
  WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.ai_central_attempts_mvp226 a
 WHERE a.buyer_key=v_buyer AND a.created_at>clock_timestamp()-interval '24 hours';
 -- Each request may trigger 4 AI calls; hard rate limit to contain costs.
 IF v_count>=6 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;
 INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226(
  message_hmac,buyer_key,chat_hmac,source_sha256)
 VALUES(p_message_hmac,v_buyer,p_chat_hmac,p_source_sha256)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN v_rows=1 THEN 'reserved' ELSE 'already_reserved' END);
END
$function$
$quota_base$
 OR v_r<>$reader_base$CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d013_review_source_private()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  AND a.state='review' AND a.failure_code IN ('ia_error_de_lectura','lecturas_discrepan_en_articulo')
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
  AND a.state='review' AND a.failure_code IN ('ia_error_de_lectura','lecturas_discrepan_en_articulo')
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
END $function$
$reader_base$
 OR v_s<>$stage_base$CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d013_recovery_stage_private(p_chat_hmac text, p_message_hmac text, p_source_sha256 text, p_original_text text, p_city text, p_items jsonb, p_destinos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 SELECT m.message_hmac,m.plaintext_sha256,a.failure_code INTO v_source
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
  AND a.state='review' AND a.failure_code IN ('ia_error_de_lectura','lecturas_discrepan_en_articulo')
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
 VALUES(p_message_hmac,p_source_sha256,v_request,v_source.failure_code);
 RETURN jsonb_build_object('state','staged','request_id',v_request,
  'items_staged',v_result->'items_staged',
  'matches_staged',v_result->'matches_staged',
  'invitations_sent',0,'outbox_sent',0);
END $function$
$stage_base$
 THEN RAISE EXCEPTION 'D013_SQL_SOURCE_DRIFTED';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text)','EXECUTE')
 OR has_function_privilege('anon','public.cotironda_piloto_v2_d013_review_source_private()','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_v2_d013_recovery_stage_private(text,text,text,text,text,jsonb,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'D013_UNSAFE_RPC_PRIVILEGES';END IF;
END $guard$;

ALTER TABLE cotironda_piloto_privado.v2_d013_review_recovery_receipts
 DROP CONSTRAINT v2_d013_review_recovery_receipts_original_failure_code_check;
ALTER TABLE cotironda_piloto_privado.v2_d013_review_recovery_receipts
 ADD CONSTRAINT v2_d013_review_recovery_receipts_original_failure_code_check
 CHECK (original_failure_code IN ('ia_error_de_lectura',
 'lecturas_discrepan_en_articulo','sin_reserva_ia'));

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_buyer_mvp226(p_chat_hmac text, p_message_hmac text, p_source_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_buyer text;v_count integer;v_rows integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;

 SELECT p.key INTO v_buyer FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.participant_key=p.key AND m.chat_hmac=p.chat_hmac
 WHERE p.chat_hmac=p_chat_hmac AND p.participant_role='buyer'
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
   AND m.processing_state='needs_review'
   AND ((m.kind='text' AND m.plaintext_sha256=p_source_sha256)
      OR (m.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    m.message_hmac,m.chat_hmac,m.participant_key,p_source_sha256))
   OR (m.kind='document' AND
    cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
      m.message_hmac,m.chat_hmac,m.participant_key,
      p_source_sha256,NULL)))
   AND m.request_id IS NULL
   AND m.received_at>clock_timestamp()-interval '10 minutes'
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;

 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_attempts_mvp226
  WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 -- No existe cuota fija por comprador; firma y unicidad persisten.
 INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226(
  message_hmac,buyer_key,chat_hmac,source_sha256)
 VALUES(p_message_hmac,v_buyer,p_chat_hmac,p_source_sha256)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN v_rows=1 THEN 'reserved' ELSE 'already_reserved' END);
END
$function$
;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d013_review_source_private()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count integer; v_pending integer; v_source record;
BEGIN
 SELECT count(*),count(*) FILTER(WHERE a.message_hmac IS NULL) INTO v_count,v_pending
 FROM cotironda_piloto_privado.whapi_inbox m
 LEFT JOIN cotironda_piloto_privado.ai_central_attempts_mvp226 a
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
  AND (a.message_hmac IS NULL OR
   (a.state='review' AND a.failure_code IN ('ia_error_de_lectura','lecturas_discrepan_en_articulo')
    AND a.source_sha256=m.plaintext_sha256 AND a.finished_at IS NOT NULL))
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
                 WHERE r.source_hmac=m.message_hmac)
  AND NOT EXISTS(SELECT 1 FROM
    cotironda_piloto_privado.v2_d013_review_recovery_receipts receipt
    WHERE receipt.source_hmac=m.message_hmac);
 IF v_count=0 THEN RETURN jsonb_build_object('state','empty'); END IF;
 -- Un único inbox sin intento tiene prioridad sobre las revisiones antiguas.
 -- Dos pendientes son ambiguos: nunca se elige uno a ciegas.
 IF v_pending>1 OR (v_pending=0 AND v_count>1)
 THEN RETURN jsonb_build_object('state','ambiguous'); END IF;
 SELECT m.message_hmac,m.chat_hmac,m.nonce_b64,m.ciphertext_b64,
        m.plaintext_sha256
 INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 LEFT JOIN cotironda_piloto_privado.ai_central_attempts_mvp226 a
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
  AND (a.message_hmac IS NULL OR
   (a.state='review' AND a.failure_code IN ('ia_error_de_lectura','lecturas_discrepan_en_articulo')
    AND a.source_sha256=m.plaintext_sha256 AND a.finished_at IS NOT NULL))
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
                 WHERE r.source_hmac=m.message_hmac)
  AND NOT EXISTS(SELECT 1 FROM
   cotironda_piloto_privado.v2_d013_review_recovery_receipts receipt
   WHERE receipt.source_hmac=m.message_hmac)
  AND ((v_pending=1 AND a.message_hmac IS NULL)
    OR (v_pending=0 AND a.message_hmac IS NOT NULL))
 ORDER BY m.received_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 RETURN jsonb_build_object('state','ready',
  'message_hmac',v_source.message_hmac,
  'chat_hmac',v_source.chat_hmac,
  'source_sha256',v_source.plaintext_sha256,
  'nonce_b64',v_source.nonce_b64,
  'ciphertext_b64',v_source.ciphertext_b64);
END $function$
;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d013_recovery_stage_private(p_chat_hmac text, p_message_hmac text, p_source_sha256 text, p_original_text text, p_city text, p_items jsonb, p_destinos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 SELECT m.message_hmac,m.plaintext_sha256,COALESCE(a.failure_code,'sin_reserva_ia') AS failure_code INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 LEFT JOIN cotironda_piloto_privado.ai_central_attempts_mvp226 a
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
  AND (a.message_hmac IS NULL OR
   (a.state='review' AND a.failure_code IN ('ia_error_de_lectura','lecturas_discrepan_en_articulo')
    AND a.source_sha256=p_source_sha256 AND a.finished_at IS NOT NULL))
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
                 WHERE r.source_hmac=m.message_hmac)
  AND NOT EXISTS(SELECT 1 FROM
    cotironda_piloto_privado.v2_d013_review_recovery_receipts receipt
    WHERE receipt.source_hmac=m.message_hmac)
  AND (public.cotironda_piloto_v2_d013_review_source_private()->>'message_hmac')=m.message_hmac
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
 VALUES(p_message_hmac,p_source_sha256,v_request,v_source.failure_code);
 RETURN jsonb_build_object('state','staged','request_id',v_request,
  'items_staged',v_result->'items_staged',
  'matches_staged',v_result->'matches_staged',
  'invitations_sent',0,'outbox_sent',0);
END $function$
;

REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d013_review_source_private()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d013_review_source_private() TO service_role;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d013_recovery_stage_private(text,text,text,text,text,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d013_recovery_stage_private(text,text,text,text,text,jsonb,jsonb) TO service_role;
COMMIT;
