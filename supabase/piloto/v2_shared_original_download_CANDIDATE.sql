-- Candidato: alcance adicional declarado por responsable, 25/11/2026.
-- NO inventar firma, mensaje ni fecha previa. Solo dos proveedores acreditados, mismo comprador.
BEGIN;
ALTER TABLE cotironda_piloto_privado.v2_buyer_shared_history ADD COLUMN originals_enabled_at timestamptz CHECK(originals_enabled_at>=created_at);
CREATE TABLE cotironda_piloto_privado.v2_shared_original_authorizations(
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 buyer_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence_kind text NOT NULL CHECK(evidence_kind='declaracion_responsable_en_conversacion'),
 declaration_sha256 text NOT NULL CHECK(declaration_sha256 ~ '^[a-f0-9]{64}$'),
 revoked_at timestamptz CHECK(revoked_at>=recorded_at),
 PRIMARY KEY(supplier_key,buyer_key)
);
ALTER TABLE cotironda_piloto_privado.v2_shared_original_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_shared_original_authorizations FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO cotironda_piloto_privado.v2_shared_original_authorizations(supplier_key,buyer_key,evidence_kind,declaration_sha256)
SELECT DISTINCT a.supplier_key,r.buyer_key,'declaracion_responsable_en_conversacion',encode(extensions.digest(convert_to('25/11/2026: ante la consulta si ambos corralones aceptaron que el comprador pueda compartir sus presupuestos originales con otras personas, el responsable respondió: Si todos aceptan. Avanza','UTF8'),'sha256'),'hex')
FROM cotironda_piloto_privado.v2_d016_owner_original_attestations a
JOIN cotironda_piloto_privado.requests r ON r.id=a.request_id
JOIN cotironda_piloto_privado.participants s ON s.key=a.supplier_key AND s.participant_role='supplier' AND s.opted_out_at IS NULL
WHERE a.revoked_at IS NULL AND a.consent_scope='comprador_original_identificado_y_analisis_v2'
AND a.supplier_key IN ('corralon_ailin','corralon_nahuel') AND r.buyer_key='arquitecto';
CREATE TABLE cotironda_piloto_privado.v2_shared_original_download_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),share_id uuid NOT NULL REFERENCES cotironda_piloto_privado.v2_buyer_shared_history(id),
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id),document_id uuid NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 byte_count integer NOT NULL CHECK(byte_count BETWEEN 1 AND 8388608),downloaded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.v2_shared_original_download_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_shared_original_download_audit FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.v2_original_source_for_catalog(p_request_id uuid, p_document_id uuid, p_catalog jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_catalog jsonb;
 v_entry jsonb;
 v_source record;
 v_hex text;
 v_doc uuid;
 v_found integer:=0;
BEGIN
 IF p_request_id IS NULL OR p_catalog IS NULL OR p_document_id IS NULL
 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_original_share_policy WHERE singleton=true AND enabled=true) THEN RETURN NULL; END IF;

 -- Catalog rechecks live PILOT Auth session, buyer phone proof, company,
 -- V2 prospective informed consent, dispatch, MVP225, source and SHA.
 v_catalog:=p_catalog;
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
  JOIN cotironda_piloto_privado.invitations inv
   ON inv.request_id=link.request_id AND inv.supplier_key=link.supplier_key
   AND inv.state='prepared'
  JOIN LATERAL (SELECT cotironda_piloto_privado.v2_d016_effective_original_consent_private(supplier.key,link.request_id,supplier.chat_hmac,inv.created_at) AS accepted_at) c ON c.accepted_at IS NOT NULL
  WHERE link.request_id=p_request_id
   AND link.kind IN ('document','image')
   AND link.status='awaiting_semantic_review'
   -- El catálogo previo ya revalidó la prueba de aviso MVP238,
   -- SHA del texto, proveedor, ronda y adjunto; la descarga jamás
   -- amplía permisos fuera del identificador opaco autorizado.
   AND (
    link.association IN (
     'quoted_whapi_id','single_active_round','prior_supplier_preamble')
    OR (
     link.association='semantic_unique_mvp291'
     AND EXISTS (
      SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
      JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
       ON u.message_hmac=decision.source_hmac
       AND u.supplier_key=decision.supplier_key
       AND u.source_sha256=decision.source_sha256
      WHERE decision.source_hmac=link.message_hmac
       AND decision.supplier_key=link.supplier_key
       AND decision.source_sha256=link.source_sha256
       AND decision.selected_request_id=link.request_id
       AND decision.state='linked'
       AND decision.finished_at IS NOT NULL
       AND u.state='ambiguous_round'
       AND u.resolved_request_id=link.request_id
     )
    )
   )
   AND NOT EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 bad
    WHERE bad.message_hmac=link.message_hmac
      AND (
       bad.state='media_context_conflict'
       OR (bad.state='ambiguous_round'
           AND (link.association IS DISTINCT FROM 'semantic_unique_mvp291'
                OR bad.resolved_request_id IS DISTINCT FROM link.request_id))
      )
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
   JOIN cotironda_piloto_privado.invitations inv
    ON inv.request_id=link.request_id AND inv.supplier_key=link.supplier_key
    AND inv.state='prepared'
   JOIN LATERAL (SELECT cotironda_piloto_privado.v2_d016_effective_original_consent_private(link.supplier_key,link.request_id,m.chat_hmac,inv.created_at) AS accepted_at) c ON c.accepted_at IS NOT NULL
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
  -- La autorización única revocable se comprueba en el catálogo y la fuente.
 RETURN v_catalog;
END;
$function$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.v2_original_source_for_catalog(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Misma fuente D016 y misma autorización de sesión del propietario.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_original_source_private(p_request_id uuid,p_sesion_hmac text,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF p_request_id IS NULL OR p_sesion_hmac IS NULL OR p_document_id IS NULL THEN RETURN NULL;END IF;
 RETURN cotironda_piloto_privado.v2_original_source_for_catalog(p_request_id,p_document_id,public.cotironda_piloto_v2_d016_responders_private(p_request_id,p_sesion_hmac));
END $$;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_manage_shared_history(p_sesion_hmac text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE b text; r uuid; c jsonb; share_id uuid;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('get','create','revoke','enable-originals') THEN RETURN NULL;END IF;
 SELECT buyer_key,request_id INTO b,r FROM cotironda_piloto_privado.v2_d016_browser_sessions
 WHERE sesion_hmac=p_sesion_hmac AND revoked_at IS NULL AND expires_at>clock_timestamp() AND purpose='whatsapp_buyer_session';
 IF NOT FOUND THEN RETURN NULL;END IF;
 PERFORM 1 FROM cotironda_piloto_privado.participants WHERE key=b FOR UPDATE;
 c:=public.cotironda_piloto_v2_d016_session_context_private(p_sesion_hmac,r);
 IF c IS NULL OR c->>'buyerKey' IS DISTINCT FROM b THEN RETURN NULL;END IF;
 IF p_action='revoke' THEN
  UPDATE cotironda_piloto_privado.v2_buyer_shared_history SET revoked_at=clock_timestamp() WHERE buyer_key=b AND revoked_at IS NULL;
  RETURN jsonb_build_object('state','inactive');
 END IF;
 SELECT id INTO share_id FROM cotironda_piloto_privado.v2_buyer_shared_history WHERE buyer_key=b AND revoked_at IS NULL;
 IF share_id IS NULL AND p_action='create' THEN
  INSERT INTO cotironda_piloto_privado.v2_buyer_shared_history(buyer_key,created_at,originals_enabled_at) VALUES(b,statement_timestamp(),statement_timestamp()) RETURNING id INTO share_id;
 END IF;
 IF p_action='enable-originals' AND share_id IS NOT NULL THEN
  UPDATE cotironda_piloto_privado.v2_buyer_shared_history SET originals_enabled_at=COALESCE(originals_enabled_at,clock_timestamp()) WHERE id=share_id AND revoked_at IS NULL;
 END IF;
 RETURN CASE WHEN share_id IS NULL THEN jsonb_build_object('state','inactive') ELSE jsonb_build_object('state','active','shareId',share_id,'originalsEnabled',(SELECT originals_enabled_at IS NOT NULL FROM cotironda_piloto_privado.v2_buyer_shared_history WHERE id=share_id)) END;
END $function$;
-- Revalidar el catálogo de invitados y el nuevo alcance, nunca crear sesión D016.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.v2_shared_source_for_catalog(p_request_id uuid,p_document_id uuid,p_catalog jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
DECLARE s jsonb;
BEGIN
 s:=cotironda_piloto_privado.v2_original_source_for_catalog(p_request_id,p_document_id,p_catalog);
 IF s IS NULL OR s->>'state'<>'authorized_original_v2' THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_shared_original_authorizations a
 WHERE a.supplier_key=s->>'supplierKey' AND a.buyer_key=s->>'buyerKey'
 AND a.revoked_at IS NULL AND a.recorded_at<=clock_timestamp()) THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_d016_original_notice_revocations rev
 WHERE rev.supplier_key=s->>'supplierKey' AND rev.request_id=p_request_id) THEN RETURN NULL;END IF;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.v2_shared_source_for_catalog(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_shared_original_source(p_share_id uuid,p_request_id uuid,p_document_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c jsonb; e jsonb; s jsonb; ids jsonb:='[]'::jsonb;
BEGIN
 IF p_share_id IS NULL OR p_request_id IS NULL OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_buyer_shared_history h WHERE h.id=p_share_id AND h.revoked_at IS NULL AND h.originals_enabled_at IS NOT NULL) THEN RETURN NULL;END IF;
 c:=public.cotironda_piloto_v2_read_shared_history(p_share_id,p_request_id);
 IF c IS NULL OR c->>'state'<>'authorized_responders_v2' THEN RETURN NULL;END IF;
 IF p_document_id IS NOT NULL THEN RETURN cotironda_piloto_privado.v2_shared_source_for_catalog(p_request_id,p_document_id,c);END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(c->'originals') LOOP
  s:=cotironda_piloto_privado.v2_shared_source_for_catalog(p_request_id,(e->>'documentId')::uuid,c);
  IF s IS NOT NULL THEN ids:=ids||jsonb_build_array(e->>'documentId');END IF;
 END LOOP;
 RETURN ids;
END $$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_shared_original_source(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_shared_original_source(uuid,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_shared_record_download(p_share_id uuid,p_request_id uuid,p_document_id uuid,p_source_sha256 text,p_byte_count integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE s jsonb;
BEGIN
 IF p_document_id IS NULL OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$' OR p_byte_count IS NULL OR p_byte_count NOT BETWEEN 1 AND 8388608 THEN RETURN false;END IF;
 PERFORM 1 FROM cotironda_piloto_privado.v2_buyer_shared_history WHERE id=p_share_id AND revoked_at IS NULL AND originals_enabled_at IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RETURN false;END IF;
 s:=public.cotironda_piloto_v2_shared_original_source(p_share_id,p_request_id,p_document_id);
 IF s IS NULL THEN RETURN false;END IF;
 PERFORM 1 FROM cotironda_piloto_privado.v2_shared_original_authorizations WHERE supplier_key=s->>'supplierKey' AND buyer_key=s->>'buyerKey' AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN false;END IF;
 s:=public.cotironda_piloto_v2_shared_original_source(p_share_id,p_request_id,p_document_id);
 IF s IS NULL OR s->>'sha256' IS DISTINCT FROM p_source_sha256 OR (s->>'byteCount')::integer IS DISTINCT FROM p_byte_count THEN RETURN false;END IF;
 INSERT INTO cotironda_piloto_privado.v2_shared_original_download_audit(share_id,request_id,document_id,source_sha256,byte_count) VALUES(p_share_id,p_request_id,p_document_id,p_source_sha256,p_byte_count);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_shared_record_download(uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_shared_record_download(uuid,uuid,uuid,text,integer) TO service_role;
COMMIT;
