-- Cotironda V2 D016 P0: consentimiento histórico + aviso y
-- respuesta D016 comprobados, con revocación ANTES de exponer originales.
-- CANDIDATO: no habilita flags ni cambia whapi/portal o datos históricos.
-- Las dos funciones conservan firma y revalidan autorización por empresa.

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_responders_private(
 p_request_id uuid,p_sesion_hmac text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $v2$
DECLARE
 v_now timestamptz:=clock_timestamp();
 v_buyer text;
 v_activation timestamptz;
 v_docs jsonb:='[]'::jsonb;
 v_rec record;
 v_hex text;
 v_doc uuid;
 v_total integer:=0;
BEGIN
 IF p_request_id IS NULL OR p_sesion_hmac IS NULL
 THEN RETURN NULL;END IF;

 -- Sesión D016 y política comercial revalidadas en base.
 SELECT r.buyer_key,policy.activated_at INTO v_buyer,v_activation
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.v2_original_share_policy policy
 ON policy.singleton=true AND policy.enabled=true
 AND policy.activated_at IS NOT NULL
 AND r.created_at>=policy.activated_at
 WHERE r.id=p_request_id AND r.state IN ('prepared','closed')
 AND r.buyer_key=(public.cotironda_piloto_v2_d016_session_context_private(
  p_sesion_hmac,p_request_id)->>'buyerKey')
 LIMIT 1;
 IF v_buyer IS NULL THEN RETURN NULL; END IF;

 FOR v_rec IN
  SELECT DISTINCT ON (link.message_hmac)
   link.message_hmac,
   CASE WHEN link.kind='text' THEN source.plaintext_sha256
        ELSE a.content_sha256 END AS content_sha256,
   CASE WHEN link.kind='text' THEN 'text/plain' ELSE a.mime END AS mime,
   link.kind,supplier.display_label,source.received_at
  FROM cotironda_piloto_privado.ai_supplier_links_mvp225 link
  JOIN cotironda_piloto_privado.requests r
   ON r.id=link.request_id AND r.buyer_key=v_buyer
   AND r.state IN ('prepared','closed')
  LEFT JOIN cotironda_piloto_privado.media_archive_mvp095 a
   ON a.message_hmac=link.message_hmac
   AND link.kind IN ('document','image')
   AND a.kind=link.kind
   AND a.request_id=link.request_id
   AND a.participant_key=link.supplier_key
   AND a.content_sha256=link.source_sha256
   AND a.state='stored' AND a.finished_at IS NOT NULL
   AND a.storage_path='media/'||a.message_hmac
   AND a.size_bytes BETWEEN 1 AND 8388608
   AND a.mime IN (
     'application/pdf','image/jpeg','image/png','image/webp',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/msword','application/vnd.ms-excel','text/plain','text/csv')
  JOIN cotironda_piloto_privado.whapi_inbox source
   ON source.message_hmac=link.message_hmac
   AND source.request_id=link.request_id
   AND source.participant_key=link.supplier_key
   AND source.kind=link.kind
   AND (link.kind='text' OR source.chat_hmac=a.chat_hmac)
  JOIN cotironda_piloto_privado.participants supplier
   ON supplier.key=link.supplier_key
   AND supplier.chat_hmac=source.chat_hmac
   AND supplier.participant_role='supplier'
   AND supplier.consent_at IS NOT NULL
   AND supplier.opted_out_at IS NULL
   AND length(btrim(supplier.display_label)) BETWEEN 3 AND 100
  JOIN cotironda_piloto_privado.invitations inv
   ON inv.request_id=r.id AND inv.supplier_key=supplier.key
   AND inv.state='prepared'
   AND inv.created_at<=source.received_at
  JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 dispatch
   ON dispatch.request_id=r.id AND dispatch.supplier_key=supplier.key
   AND dispatch.state='api_accepted' AND dispatch.whapi_message_id IS NOT NULL
   AND dispatch.finished_at<=source.received_at
   AND dispatch.finished_at>=inv.created_at
  JOIN cotironda_piloto_privado.v2_supplier_original_consents c
   ON c.supplier_key=supplier.key
   AND c.version='cotironda-originales-v2'
   AND c.revoked_at IS NULL
   AND c.accepted_at>=v_activation
   AND c.accepted_at<=inv.created_at
  JOIN cotironda_piloto_privado.whapi_inbox consent_msg
   ON consent_msg.message_hmac=c.consent_message_hmac
   AND consent_msg.participant_key=supplier.key
   AND consent_msg.chat_hmac=supplier.chat_hmac
   AND consent_msg.kind='text'
   AND consent_msg.received_at=c.accepted_at
  WHERE link.request_id=p_request_id
   AND (
    (link.kind IN ('document','image')
     AND a.message_hmac IS NOT NULL
     AND (
      link.association IN ('quoted_whapi_id','single_active_round')
      OR (
       link.association='prior_supplier_preamble'
       AND EXISTS (
        SELECT 1 FROM cotironda_piloto_privado.ai_supplier_preambles_mvp238 preamble
        JOIN cotironda_piloto_privado.whapi_inbox notice
         ON notice.message_hmac=preamble.preamble_hmac
         AND notice.chat_hmac=preamble.chat_hmac
         AND notice.participant_key=preamble.supplier_key
         AND notice.kind='text'
         AND notice.request_id=preamble.request_id
         AND notice.received_at=preamble.received_at
         AND notice.plaintext_sha256=preamble.source_sha256
        WHERE preamble.attachment_hmac=link.message_hmac
         AND preamble.request_id=link.request_id
         AND preamble.supplier_key=link.supplier_key
         AND preamble.chat_hmac=source.chat_hmac
         AND preamble.attached_at IS NOT NULL
         AND preamble.attached_at>=source.received_at
         AND preamble.received_at<source.received_at
         AND preamble.received_at>=source.received_at-interval '24 hours'
         AND preamble.source_sha256 ~ '^[a-f0-9]{64}$'
       )
      )
     )
    )
    OR
    (link.kind='text'
     AND a.message_hmac IS NULL
     AND source.kind='text'
     AND source.plaintext_sha256=link.source_sha256
     AND source.plaintext_sha256 ~ '^[a-f0-9]{64}$'
     AND source.nonce_b64 ~ '^[A-Za-z0-9+/]{16}$'
     AND length(source.ciphertext_b64) BETWEEN 24 AND 20000
     AND source.processing_state='needs_review'
     AND (
      link.association IN ('quoted_whapi_id','single_active_round')
      OR
      (link.association='semantic_unique_mvp291'
       AND EXISTS(
        SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
        WHERE decision.source_hmac=link.message_hmac
         AND decision.supplier_key=link.supplier_key
         AND decision.source_sha256=link.source_sha256
         AND decision.state='linked'
         AND decision.selected_request_id=link.request_id
         AND decision.finished_at IS NOT NULL
      ))
     )
    )
   )
   AND link.status='awaiting_semantic_review'

   -- Segundo comprobante independiente. No autoriza por sí mismo: se
   -- requiere TAMBIÉN consentimiento V2 anterior a invitación.
   AND EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.v2_d016_original_reply_evidence evidence
    WHERE evidence.message_hmac=link.message_hmac
     AND evidence.request_id=link.request_id
     AND evidence.supplier_key=link.supplier_key
     AND evidence.source_sha256=link.source_sha256
     AND public.cotironda_piloto_v2_d016_original_evidence_status_private(
      link.request_id,link.supplier_key,link.message_hmac
     )='verified_reply_not_authorization'
   )
   AND link.source_sha256 ~ '^[a-f0-9]{64}$'
   AND (link.kind='text' OR a.content_sha256 ~ '^[a-f0-9]{64}$')
   AND source.received_at>=r.created_at
   AND source.received_at<=r.closes_at
   AND source.received_at<=v_now
   AND supplier.consent_at<=dispatch.finished_at
   AND NOT EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 bad
    WHERE bad.message_hmac=link.message_hmac
      AND bad.state IN ('ambiguous_round','media_context_conflict')
   )
  ORDER BY link.message_hmac
 LOOP
  v_total:=v_total+1;
  IF v_total>100 THEN RETURN NULL; END IF;
  -- Identificador opaco estable: NO expone HMAC, ruta ni contactos.
  v_hex:=encode(extensions.digest(convert_to(
   'cotironda-v2-original|'||p_request_id::text||'|'||v_rec.message_hmac,
   'UTF8'),'sha256'),'hex');
  v_doc:=(substr(v_hex,1,8)||'-'||substr(v_hex,9,4)||'-4'||
   substr(v_hex,14,3)||'-a'||substr(v_hex,18,3)||'-'||
   substr(v_hex,21,12))::uuid;
  v_docs:=v_docs||jsonb_build_array(jsonb_build_object(
   'documentId',v_doc::text,
   'supplierName',btrim(v_rec.display_label),
   'mime',v_rec.mime,'kind',v_rec.kind,
   'receivedAt',(extract(epoch from v_rec.received_at)*1000)::bigint
  ));
 END LOOP;
 RETURN jsonb_build_object(
  'state','authorized_responders_v2','buyerKey',v_buyer,
  'total',v_total,'originals',v_docs);
END;
$v2$;


CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_original_source_private(
 p_request_id uuid,p_sesion_hmac text,p_document_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $v2$
DECLARE
 v_catalog jsonb;
 v_entry jsonb;
 v_source record;
 v_hex text;
 v_doc uuid;
 v_found integer:=0;
BEGIN
 IF p_request_id IS NULL OR p_sesion_hmac IS NULL OR p_document_id IS NULL
 THEN RETURN NULL; END IF;

 -- Catalog rechecks live PILOT Auth session, buyer phone proof, company,
 -- V2 prospective informed consent, dispatch, MVP225, source and SHA.
 v_catalog:=public.cotironda_piloto_v2_d016_responders_private(
  p_request_id,p_sesion_hmac);
 IF v_catalog IS NULL OR v_catalog->>'state'<>'authorized_responders_v2'
 OR jsonb_typeof(v_catalog->'originals')<>'array'
 THEN RETURN NULL;END IF;
 SELECT entry INTO v_entry
 FROM jsonb_array_elements(v_catalog->'originals') AS source(entry)
 WHERE entry->>'documentId'=p_document_id::text;
 IF v_entry IS NULL THEN RETURN NULL; END IF;

 -- Exactly ONE source matching the opaque catalog ID. New query double
 -- checks archive/SHA/association & current opt-out and V2 consent.
 FOR v_source IN
  SELECT a.message_hmac,a.storage_path,a.mime,a.size_bytes,
   a.content_sha256,a.participant_key,source_msg.received_at,
   c.accepted_at,inv.created_at invited_at
  FROM cotironda_piloto_privado.ai_supplier_links_mvp225 link
  JOIN cotironda_piloto_privado.media_archive_mvp095 a
   ON a.message_hmac=link.message_hmac
   AND a.request_id=link.request_id
   AND a.participant_key=link.supplier_key
   AND a.content_sha256=link.source_sha256
   AND a.state='stored'
   AND a.finished_at IS NOT NULL
   AND a.kind IN ('document','image')
   AND a.size_bytes BETWEEN 1 AND 8388608
   AND a.storage_path='media/'||a.message_hmac
  JOIN cotironda_piloto_privado.whapi_inbox source_msg
   ON source_msg.message_hmac=a.message_hmac
   AND source_msg.request_id=link.request_id
   AND source_msg.participant_key=link.supplier_key
   AND source_msg.chat_hmac=a.chat_hmac
   AND source_msg.kind=a.kind
  JOIN cotironda_piloto_privado.participants supplier
   ON supplier.key=link.supplier_key
   AND supplier.chat_hmac=a.chat_hmac
   AND supplier.participant_role='supplier'
   AND supplier.opted_out_at IS NULL
  JOIN cotironda_piloto_privado.v2_supplier_original_consents c
   ON c.supplier_key=supplier.key
   AND c.version='cotironda-originales-v2'
   AND c.revoked_at IS NULL
  JOIN cotironda_piloto_privado.invitations inv
   ON inv.request_id=link.request_id AND inv.supplier_key=link.supplier_key
   AND inv.state='prepared'
   AND c.accepted_at<=inv.created_at
  WHERE link.request_id=p_request_id
   AND link.kind IN ('document','image')
   AND link.status='awaiting_semantic_review'
   -- El catálogo previo ya revalidó la prueba de aviso MVP238,
   -- SHA del texto, proveedor, ronda y adjunto; la descarga jamás
   -- amplía permisos fuera del identificador opaco autorizado.
   AND link.association IN (
    'quoted_whapi_id','single_active_round','prior_supplier_preamble')
   AND NOT EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 bad
    WHERE bad.message_hmac=link.message_hmac
      AND bad.state IN ('ambiguous_round','media_context_conflict')
   )
 LOOP
  v_hex:=encode(extensions.digest(convert_to(
   'cotironda-v2-original|'||p_request_id::text||'|'||v_source.message_hmac,
   'UTF8'),'sha256'),'hex');
  v_doc:=(substr(v_hex,1,8)||'-'||substr(v_hex,9,4)||'-4'||
   substr(v_hex,14,3)||'-a'||substr(v_hex,18,3)||'-'||
   substr(v_hex,21,12))::uuid;
  IF v_doc=p_document_id
  AND v_entry->>'mime'=v_source.mime
  AND (v_entry->>'receivedAt')::bigint=
       (extract(epoch FROM v_source.received_at)*1000)::bigint
  THEN
   v_found:=v_found+1;
   IF v_found>1 THEN RETURN NULL;END IF;
   -- Source-only evidence: NEVER return to browser; only the Node server.
   v_catalog:=jsonb_build_object(
    'state','authorized_original_v2',
    'requestId',p_request_id::text,
    'documentId',p_document_id::text,
    'buyerKey',v_catalog->>'buyerKey',
    'supplierKey',v_source.participant_key,
    'messageHmac',v_source.message_hmac,
    'bucket','cotironda-piloto-originals',
    'path',v_source.storage_path,
    'mime',v_source.mime,
    'byteCount',v_source.size_bytes,
    'sha256',v_source.content_sha256,
    'consentAt',(extract(epoch FROM v_source.accepted_at)*1000)::bigint,
    'invitedAt',(extract(epoch FROM v_source.invited_at)*1000)::bigint
   );
  END IF;
 END LOOP;
 -- Los mensajes de texto NO están en Storage: su original fiel permanece
 -- cifrado AES-GCM en whapi_inbox. Sólo devolver el sobre al servidor
 -- que comprobó el catálogo, la sesión Auth y el consentimiento vigente.
 IF v_found=0 AND v_entry->>'kind'='text' AND v_entry->>'mime'='text/plain' THEN
  FOR v_source IN
   SELECT m.message_hmac,m.chat_hmac,m.nonce_b64,m.ciphertext_b64,
    m.plaintext_sha256,m.received_at,
    link.supplier_key,c.accepted_at,inv.created_at invited_at
   FROM cotironda_piloto_privado.ai_supplier_links_mvp225 link
   JOIN cotironda_piloto_privado.whapi_inbox m
    ON m.message_hmac=link.message_hmac
    AND m.request_id=link.request_id
    AND m.participant_key=link.supplier_key
    AND m.kind='text'
    AND m.plaintext_sha256=link.source_sha256
    AND m.processing_state='needs_review'
   JOIN cotironda_piloto_privado.v2_supplier_original_consents c
    ON c.supplier_key=link.supplier_key
    AND c.version='cotironda-originales-v2'
    AND c.revoked_at IS NULL
   JOIN cotironda_piloto_privado.invitations inv
    ON inv.request_id=link.request_id AND inv.supplier_key=link.supplier_key
    AND inv.state='prepared' AND c.accepted_at<=inv.created_at
   WHERE link.request_id=p_request_id
    AND link.kind='text'
    AND link.status='awaiting_semantic_review'
    AND m.nonce_b64 ~ '^[A-Za-z0-9+/]{16}$'
    AND length(m.ciphertext_b64) BETWEEN 24 AND 20000
    AND m.plaintext_sha256 ~ '^[a-f0-9]{64}$'
  LOOP
   v_hex:=encode(extensions.digest(convert_to(
    'cotironda-v2-original|'||p_request_id::text||'|'||v_source.message_hmac,
    'UTF8'),'sha256'),'hex');
   v_doc:=(substr(v_hex,1,8)||'-'||substr(v_hex,9,4)||'-4'||
    substr(v_hex,14,3)||'-a'||substr(v_hex,18,3)||'-'||
    substr(v_hex,21,12))::uuid;
   IF v_doc=p_document_id
    AND (v_entry->>'receivedAt')::bigint=
      (extract(epoch FROM v_source.received_at)*1000)::bigint
   THEN
    v_found:=v_found+1;
    IF v_found>1 THEN RETURN NULL;END IF;
    v_catalog:=jsonb_build_object(
     'state','authorized_text_v2',
     'requestId',p_request_id::text,
     'documentId',p_document_id::text,
     'buyerKey',v_catalog->>'buyerKey',
     'supplierKey',v_source.supplier_key,
     'messageHmac',v_source.message_hmac,
     'chatHmac',v_source.chat_hmac,
     'nonceB64',v_source.nonce_b64,
     'ciphertextB64',v_source.ciphertext_b64,
     'mime','text/plain',
     'sha256',v_source.plaintext_sha256,
     'consentAt',(extract(epoch FROM v_source.accepted_at)*1000)::bigint,
     'invitedAt',(extract(epoch FROM v_source.invited_at)*1000)::bigint
    );
   END IF;
  END LOOP;
 END IF;
 IF v_found<>1 THEN RETURN NULL;END IF;
 -- La fuente puede haber quedado revocada después de generar el catálogo.
 -- Validación final: evidencia D016 del MISMO mensaje/proveedor/sha.
 -- Nunca interpretar evidencia como autorización; la fuente anterior
 -- ya exigió consentimiento expreso, sesión, empresa, invitación y SHA.
 IF NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_original_reply_evidence evidence
  WHERE evidence.message_hmac=v_catalog->>'messageHmac'
   AND evidence.request_id=p_request_id
   AND evidence.supplier_key=v_catalog->>'supplierKey'
   AND evidence.source_sha256=v_catalog->>'sha256'
   AND public.cotironda_piloto_v2_d016_original_evidence_status_private(
    evidence.request_id,evidence.supplier_key,evidence.message_hmac
   )='verified_reply_not_authorization'
 ) THEN RETURN NULL;END IF;
 RETURN v_catalog;
END;
$v2$;



-- Idénticos permisos de siempre: sólo backend con service_role, no navegador.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_responders_private(uuid,text),
 public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d016_responders_private(uuid,text),
 public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)
 TO service_role;
