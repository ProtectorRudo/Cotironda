-- MVP238: texto «te paso el presupuesto» + archivo siguiente, una sola ronda.
-- PILOTO, sin Whapi saliente, sin IA adicional, sin revelar clientes ni precios.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_preambles_mvp238(
 preamble_hmac text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 supplier_key text NOT NULL,
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 received_at timestamptz NOT NULL,
 attachment_hmac text UNIQUE
  REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac) ON DELETE RESTRICT,
 attached_at timestamptz,
 CONSTRAINT mvp238_attachment_pair CHECK(
  (attachment_hmac IS NULL)=(attached_at IS NULL)),
 FOREIGN KEY(request_id,supplier_key)
  REFERENCES cotironda_piloto_privado.invitations(request_id,supplier_key)
  ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ai_supplier_preambles_mvp238_pending_idx
 ON cotironda_piloto_privado.ai_supplier_preambles_mvp238
 (supplier_key,chat_hmac,received_at DESC)
 WHERE attachment_hmac IS NULL;
ALTER TABLE cotironda_piloto_privado.ai_supplier_preambles_mvp238
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.ai_supplier_preambles_mvp238
 FROM PUBLIC,anon,authenticated,service_role;

-- El registro MVP237 también debe explicar por qué un archivo no pudo
-- heredar el contexto del aviso, sin guardar presupuestos ni contactos.
ALTER TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 DROP CONSTRAINT IF EXISTS ai_supplier_unresolved_mvp237_state_check;
ALTER TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 ADD CONSTRAINT ai_supplier_unresolved_mvp237_state_check
 CHECK(state IN('ambiguous_round','not_matched','media_context_conflict',
  'context_blocked'));
ALTER TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 DROP CONSTRAINT IF EXISTS ai_supplier_unresolved_mvp237_association_method_check;
ALTER TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 ADD CONSTRAINT ai_supplier_unresolved_mvp237_association_method_check
 CHECK(association_method IN('quoted_whapi_id','single_active_round',
  'prior_supplier_preamble'));

-- El vínculo económico conserva la procedencia exacta en el campo association.
ALTER TABLE cotironda_piloto_privado.ai_supplier_links_mvp225
 DROP CONSTRAINT IF EXISTS ai_supplier_links_mvp225_association_check;
ALTER TABLE cotironda_piloto_privado.ai_supplier_links_mvp225
 ADD CONSTRAINT ai_supplier_links_mvp225_association_check
 CHECK(association IN ('quoted_whapi_id','single_active_round',
   'prior_supplier_preamble'));

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_note_supplier_preamble_mvp238(
 p_message_hmac text,p_chat_hmac text,p_original_text text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $notice$
DECLARE v_source record; v_rows integer;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_original_text IS NULL OR length(p_original_text) NOT BETWEEN 7 AND 150
 OR p_original_text ~ '[[:digit:][:cntrl:]$€]'
 OR lower(p_original_text) !~ '(presupuest|cotizaci|planilla|pdf|excel|archivo|documento)'
 OR lower(p_original_text) !~ '(paso|mando|env[ií]o|adjunto|comparto|dejo|ah[ií][[:space:]]+va)'
 THEN RETURN jsonb_build_object('state','invalid_notice');END IF;
 SELECT l.request_id,l.supplier_key,l.source_sha256,m.received_at
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=l.message_hmac AND m.request_id=l.request_id
  AND m.participant_key=l.supplier_key AND m.chat_hmac=p_chat_hmac
 JOIN cotironda_piloto_privado.participants p
  ON p.key=l.supplier_key AND p.chat_hmac=p_chat_hmac
 JOIN cotironda_piloto_privado.requests r ON r.id=l.request_id
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
  ON d.request_id=r.id AND d.supplier_key=l.supplier_key
 WHERE l.message_hmac=p_message_hmac AND l.kind='text'
  AND m.kind='text' AND m.processing_state='needs_review'
  AND m.plaintext_sha256=l.source_sha256
  AND m.plaintext_sha256=
   encode(sha256(convert_to(p_original_text,'UTF8')),'hex')
  AND m.received_at>=clock_timestamp()-interval '10 minutes'
  AND r.state='prepared' AND r.closes_at>m.received_at
  AND d.state='api_accepted' AND d.finished_at<=m.received_at
  AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 a
   WHERE a.message_hmac=l.message_hmac)
 FOR UPDATE OF m;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_preambles_mvp238
 (preamble_hmac,request_id,supplier_key,chat_hmac,source_sha256,received_at)
 VALUES(p_message_hmac,v_source.request_id,v_source.supplier_key,
  p_chat_hmac,v_source.source_sha256,v_source.received_at)
 ON CONFLICT (preamble_hmac) DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN v_rows=1 THEN 'noted' ELSE 'already_noted' END);
END
$notice$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_note_supplier_preamble_mvp238(text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_note_supplier_preamble_mvp238(text,text,text)
 TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_attach_supplier_media_mvp238(
 p_media_hmac text,p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $attach$
DECLARE v_file record; v_context record; v_candidate_count integer;
 v_context_hmac text; v_rows integer; v_recent_count integer;
BEGIN
 IF p_media_hmac IS NULL OR p_media_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_preambles_mvp238 p
    WHERE p.attachment_hmac=p_media_hmac)
 THEN RETURN jsonb_build_object('state','already_attached');END IF;
 SELECT m.message_hmac,m.participant_key,m.kind,m.received_at,m.source_unix,
  a.content_sha256
 INTO v_file
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
  AND a.participant_key=m.participant_key
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=m.participant_key AND supplier.chat_hmac=m.chat_hmac
 WHERE m.message_hmac=p_media_hmac AND m.chat_hmac=p_chat_hmac
  AND m.kind IN('document','image') AND m.processing_state='needs_review'
  AND m.request_id IS NULL AND a.request_id IS NULL
  AND a.state='stored' AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  AND a.storage_path='media/'||m.message_hmac
  AND a.size_bytes BETWEEN 1 AND 8388608
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
  AND m.received_at>=clock_timestamp()-interval '15 minutes'
 FOR UPDATE OF m,a;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;

 -- Un solo aviso previo, mismo chat y proveedor, sin mensajes de por medio.
 -- Se exige evidencia de despacho IA aceptado, y que no haya nuevas invitaciones.
 SELECT count(*),min(p.preamble_hmac)
 INTO v_candidate_count,v_context_hmac
 FROM cotironda_piloto_privado.ai_supplier_preambles_mvp238 p
 JOIN cotironda_piloto_privado.whapi_inbox previous
  ON previous.message_hmac=p.preamble_hmac
  AND previous.chat_hmac=p.chat_hmac AND previous.participant_key=p.supplier_key
  AND previous.request_id=p.request_id AND previous.kind='text'
  AND previous.plaintext_sha256=p.source_sha256
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 previous_link
  ON previous_link.message_hmac=p.preamble_hmac
  AND previous_link.request_id=p.request_id
  AND previous_link.supplier_key=p.supplier_key
  AND previous_link.source_sha256=p.source_sha256
 JOIN cotironda_piloto_privado.requests r ON r.id=p.request_id
 JOIN cotironda_piloto_privado.invitations i
  ON i.request_id=p.request_id AND i.supplier_key=p.supplier_key
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
  ON d.request_id=p.request_id AND d.supplier_key=p.supplier_key
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 WHERE p.supplier_key=v_file.participant_key AND p.chat_hmac=p_chat_hmac
  AND p.attachment_hmac IS NULL
  AND p.received_at < v_file.received_at
  AND p.received_at >= v_file.received_at-interval '10 minutes'
  AND previous.received_at=p.received_at
  AND previous.source_unix <= v_file.source_unix
  AND r.state='prepared' AND r.closes_at>v_file.received_at
  AND i.state='prepared' AND d.state='api_accepted'
  AND d.finished_at<=p.received_at
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  -- Dos avisos pendientes del mismo proveedor no permiten deducir
  -- a cuál corresponde el adjunto, aunque uno sea más reciente.
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_preambles_mvp238 other
   WHERE other.supplier_key=p.supplier_key AND other.chat_hmac=p.chat_hmac
    AND other.preamble_hmac<>p.preamble_hmac
    AND other.attachment_hmac IS NULL
    AND other.received_at>=v_file.received_at-interval '10 minutes'
    AND other.received_at<v_file.received_at
  )
  -- Cualquier texto o archivo intercalado rompe la continuidad segura.
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.whapi_inbox middle
   WHERE middle.chat_hmac=p.chat_hmac
    AND middle.participant_key=p.supplier_key
    AND middle.message_hmac NOT IN(p.preamble_hmac,p_media_hmac)
    AND middle.received_at>p.received_at
    AND middle.received_at<v_file.received_at
  )
  -- Una nueva invitación cambia el contexto comercial.
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 newer
   WHERE newer.supplier_key=p.supplier_key
     AND newer.request_id<>p.request_id
     AND newer.state='api_accepted'
     AND newer.finished_at>p.received_at
     AND newer.finished_at<=v_file.received_at
  )
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.whapi_outbox newer
   WHERE newer.supplier_key=p.supplier_key
     AND newer.request_id<>p.request_id
     AND newer.state='api_accepted' AND newer.sent_at>p.received_at
     AND newer.sent_at<=v_file.received_at
  );
 IF v_candidate_count<>1 THEN
  -- Si hubo un aviso previo pero surgió un conflicto, NO caer al enlace
  -- genérico de una ronda: podría ser otra cotización distinta.
  SELECT count(*) INTO v_recent_count
  FROM cotironda_piloto_privado.ai_supplier_preambles_mvp238 p
  WHERE p.supplier_key=v_file.participant_key AND p.chat_hmac=p_chat_hmac
   AND p.attachment_hmac IS NULL
   AND p.received_at<v_file.received_at
   AND p.received_at>=v_file.received_at-interval '24 hours';
  IF v_recent_count>0 THEN
    INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237
    (message_hmac,supplier_key,source_sha256,kind,state,
     candidate_count,association_method)
    VALUES (p_media_hmac,v_file.participant_key,
      v_file.content_sha256,v_file.kind,'context_blocked',
      v_recent_count,'prior_supplier_preamble')
    ON CONFLICT (message_hmac) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('state',
   CASE WHEN v_candidate_count>1 THEN 'ambiguous'
    WHEN v_recent_count>0 THEN 'context_blocked'
    ELSE 'no_context' END);
 END IF;
 SELECT p.request_id,p.supplier_key,p.attachment_hmac
 INTO v_context FROM cotironda_piloto_privado.ai_supplier_preambles_mvp238 p
 WHERE p.preamble_hmac=v_context_hmac
 FOR UPDATE OF p;
 IF NOT FOUND OR v_context.attachment_hmac IS NOT NULL
 THEN RETURN jsonb_build_object('state','context_consumed');END IF;
 -- Persistencia atómica: no existe vínculo parcial ni duplicado.
 UPDATE cotironda_piloto_privado.whapi_inbox m
 SET request_id=v_context.request_id
 WHERE m.message_hmac=p_media_hmac AND m.chat_hmac=p_chat_hmac
  AND m.participant_key=v_context.supplier_key AND m.request_id IS NULL
  AND m.processing_state='needs_review';
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp238_inbox_changed';END IF;
 UPDATE cotironda_piloto_privado.media_archive_mvp095 a
 SET request_id=v_context.request_id
 WHERE a.message_hmac=p_media_hmac AND a.chat_hmac=p_chat_hmac
  AND a.participant_key=v_context.supplier_key
  AND a.state='stored' AND a.content_sha256=v_file.content_sha256
  AND a.request_id IS NULL;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp238_archive_changed';END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 (message_hmac,request_id,supplier_key,kind,association,source_sha256)
 VALUES (p_media_hmac,v_context.request_id,v_context.supplier_key,
  v_file.kind,'prior_supplier_preamble',v_file.content_sha256);
 UPDATE cotironda_piloto_privado.ai_supplier_preambles_mvp238 p
 SET attachment_hmac=p_media_hmac,attached_at=clock_timestamp()
 WHERE p.preamble_hmac=v_context_hmac AND p.attachment_hmac IS NULL;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp238_preamble_race';END IF;
 RETURN jsonb_build_object('state','linked_from_preamble');
END
$attach$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_attach_supplier_media_mvp238(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_attach_supplier_media_mvp238(text,text)
 TO service_role;
COMMENT ON TABLE cotironda_piloto_privado.ai_supplier_preambles_mvp238
 IS 'MVP238: un aviso de adjunto acreditado solo puede enlazar una fuente archivada posterior; sin telefonos ni precios';
