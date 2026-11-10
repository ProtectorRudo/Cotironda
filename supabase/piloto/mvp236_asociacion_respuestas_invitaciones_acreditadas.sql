-- MVP236 / Etapa 2: un preparado sin envío no es una invitación candidata.
-- Cambio acotado a conteo LEGACY en asociación de respuestas IA Central.
-- Fuente: definición existente en cotironda-piloto, con ajuste verificable.
-- No envía Whapi ni ejecuta acciones de ronda.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_link_supplier_mvp225(p_message_hmac text, p_chat_hmac text, p_quoted_whapi_id text DEFAULT NULL::text, p_original_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_source record; v_supplier record; v_request uuid;
 v_count integer; v_legacy_count integer; v_sha text;
 v_method text; v_media_prelinked uuid;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR (p_quoted_whapi_id IS NOT NULL
     AND p_quoted_whapi_id !~ '^[A-Za-z0-9._:-]{8,160}$')
 OR (p_original_text IS NOT NULL AND
     length(p_original_text) NOT BETWEEN 1 AND 3000)
 THEN RETURN jsonb_build_object('state','invalid_input'); END IF;

 SELECT m.message_hmac,m.participant_key,m.kind,m.chat_hmac,
        m.received_at,m.processing_state,m.plaintext_sha256
 INTO v_source FROM cotironda_piloto_privado.whapi_inbox m
 WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
  AND m.request_id IS NULL
  AND m.processing_state IN ('unmatched_quote','needs_review')
  AND m.kind IN ('text','image','document')
 FOR UPDATE OF m;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 a
    WHERE a.message_hmac=p_message_hmac)
  THEN RETURN jsonb_build_object('state','already_linked');END IF;
  RETURN jsonb_build_object('state','source_not_eligible');
 END IF;

 SELECT p.key INTO v_supplier FROM cotironda_piloto_privado.participants p
 WHERE p.key=v_source.participant_key AND p.chat_hmac=p_chat_hmac
  AND p.participant_role='supplier'
  AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
  AND p.key IN ('corralon_ailin','corralon_nahuel');
 IF NOT FOUND THEN RETURN jsonb_build_object('state','supplier_not_authorized'); END IF;

 IF v_source.kind='text' THEN
  IF p_original_text IS NULL OR
     v_source.plaintext_sha256 IS DISTINCT FROM
       encode(sha256(convert_to(p_original_text,'UTF8')),'hex')
  THEN RETURN jsonb_build_object('state','text_source_mismatch');END IF;
  v_sha:=v_source.plaintext_sha256;
 ELSE
  IF p_original_text IS NOT NULL THEN
    RETURN jsonb_build_object('state','media_requires_original_archive');END IF;
  SELECT a.content_sha256,a.request_id INTO v_sha,v_media_prelinked
  FROM cotironda_piloto_privado.media_archive_mvp095 a
  WHERE a.message_hmac=p_message_hmac AND a.chat_hmac=p_chat_hmac
   AND a.participant_key=v_supplier.key
   AND a.state='stored' AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  FOR UPDATE OF a;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','media_not_archived');END IF;
 END IF;

 -- quoted ID es la opción fuerte: exactamente 1 mensaje saliente conocido
 -- de ESTE proveedor y de una ronda aún abierta.
 SELECT count(*),min(r.id::text)::uuid INTO v_count,v_request
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
 JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
 JOIN cotironda_piloto_privado.invitations i
   ON i.request_id=r.id AND i.supplier_key=j.supplier_key
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
   ON shadow.request_id=r.id
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 WHERE j.supplier_key=v_supplier.key AND j.state='api_accepted'
   AND j.whapi_message_id IS NOT NULL
   AND j.finished_at IS NOT NULL AND j.finished_at<=v_source.received_at
   AND r.created_at<=v_source.received_at AND r.closes_at>v_source.received_at
   AND r.state='prepared' AND i.state='prepared'
   AND shadow.status='shadow'
   AND buyer.participant_role='buyer'
   AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
   AND (p_quoted_whapi_id IS NULL OR j.whapi_message_id=p_quoted_whapi_id);

 IF p_quoted_whapi_id IS NOT NULL THEN
  v_method:='quoted_whapi_id';
 ELSE
  -- Sin cita explícita, abstenerse ante más de UNA ronda posible,
  -- incluyendo rondas LEGACY. No usar similitud del contenido para
  -- resolver propiedad económica.
  v_method:='single_active_round';
  SELECT count(*) INTO v_legacy_count
  FROM cotironda_piloto_privado.invitations i
  JOIN cotironda_piloto_privado.requests r ON r.id=i.request_id
  WHERE i.supplier_key=v_supplier.key AND i.state='prepared'
    AND r.state='prepared' AND r.created_at<=v_source.received_at
    AND r.closes_at>v_source.received_at
    -- Solo invitaciones LEGACY que tienen prueba de envío aceptado
    -- por Whapi (no confundir 'prepared' con pedido efectivamente enviado).
    AND EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
      WHERE o.request_id=i.request_id AND o.supplier_key=i.supplier_key
        AND o.state='api_accepted'
        AND o.whapi_message_id IS NOT NULL
        AND o.sent_at IS NOT NULL AND o.sent_at<=v_source.received_at
    )
    AND NOT EXISTS(SELECT 1 FROM
      cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
      WHERE sh.request_id=r.id);
  v_count:=v_count+v_legacy_count;
 END IF;
 IF v_count<>1 OR v_request IS NULL THEN
  RETURN jsonb_build_object('state',
   CASE WHEN v_count>1 THEN 'ambiguous_round' ELSE 'not_matched' END);
 END IF;
 -- El archivador antiguo puede preasignar una ronda. Conservarla
 -- SOLO si coincide con la ronda acreditada por el mensaje citado.
 IF v_source.kind IN('image','document') AND
    v_media_prelinked IS NOT NULL AND v_media_prelinked<>v_request
 THEN RETURN jsonb_build_object('state','media_context_conflict');END IF;
 -- Idempotencia y cambios de estado en la misma transacción.
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225(
   message_hmac,request_id,supplier_key,kind,association,source_sha256)
 VALUES (p_message_hmac,v_request,v_supplier.key,v_source.kind,v_method,v_sha);
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET request_id=v_request,processing_state='needs_review'
 WHERE message_hmac=p_message_hmac AND request_id IS NULL;
 IF v_source.kind IN('image','document') THEN
  UPDATE cotironda_piloto_privado.media_archive_mvp095 a
  SET request_id=v_request
  WHERE a.message_hmac=p_message_hmac
    AND (a.request_id IS NULL OR a.request_id=v_request)
    AND a.content_sha256=v_sha AND a.state='stored';
  IF NOT FOUND THEN
   RAISE EXCEPTION 'mvp225_media_not_linked_atomically';
  END IF;
 END IF;
 RETURN jsonb_build_object('state','linked_for_semantic_review',
  'request_id',v_request,'supplier_key',v_supplier.key,
  'association',v_method);
END;
$function$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)
 TO service_role;
COMMENT ON FUNCTION public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)
 IS 'Piloto: atribuye respuestas unicamente a envios acreditados, o se abstiene ante ambiguedad.';
