-- MVP225: vinculación de respuesta del proveedor con ronda IA Central.
-- No cambia el reader viejo, ni precios, ni rankings, ni mensajes salientes.
-- Fuente real: whapi_inbox + media_archive + ai_dispatch_jobs_mvp222.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_links_mvp225 (
 message_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac)
   ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 supplier_key text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('text','image','document')),
 association text NOT NULL CHECK (association IN ('quoted_whapi_id','single_active_round')),
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'awaiting_semantic_review'
   CHECK (status='awaiting_semantic_review'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (request_id,supplier_key)
   REFERENCES cotironda_piloto_privado.invitations(request_id,supplier_key)
   ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ai_supplier_links_mvp225_round_supplier_idx
 ON cotironda_piloto_privado.ai_supplier_links_mvp225(request_id,supplier_key);
ALTER TABLE cotironda_piloto_privado.ai_supplier_links_mvp225 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_links_mvp225
 FROM PUBLIC,anon,authenticated,service_role;

-- Nunca aceptar el mismo mensaje saliente de Whapi como identificador
-- de DOS solicitudes distintas. Null es válido si la API omitió el ID.
CREATE UNIQUE INDEX IF NOT EXISTS ai_dispatch_jobs_mvp225_unique_whapi_id
 ON cotironda_piloto_privado.ai_dispatch_jobs_mvp222(whapi_message_id)
 WHERE whapi_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_link_supplier_mvp225(
 p_message_hmac text,
 p_chat_hmac text,
 p_quoted_whapi_id text DEFAULT NULL,
 p_original_text text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
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
$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)
 TO service_role;
