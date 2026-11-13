-- Cotironda V2-03b: source-only original download + durable audit.
-- Development candidate. NO installation/activation until "Publicalo".
-- REQUIRE prerequisite V2-03a private catalog; reuse its complete buyer/
-- supplier/consent/source authorization rather than relaxing MVP192 v1.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.v2_original_download_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id),
 document_id uuid NOT NULL,
 auth_user_id uuid NOT NULL REFERENCES auth.users(id),
 auth_session_id uuid NOT NULL,
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
 byte_count integer NOT NULL CHECK (byte_count BETWEEN 1 AND 8388608),
 downloaded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.v2_original_download_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_original_download_audit
 FROM PUBLIC,anon,authenticated;
-- No direct INSERT to roles. Only the service-only audit RPC can write.

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_original_source_private(
 p_request_id uuid,p_auth_user_id uuid,p_auth_session_id uuid,
 p_document_id uuid
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
 IF p_request_id IS NULL OR p_auth_user_id IS NULL
 OR p_auth_session_id IS NULL OR p_document_id IS NULL
 THEN RETURN NULL; END IF;

 -- Catalog rechecks live PILOT Auth session, buyer phone proof, company,
 -- V2 prospective informed consent, dispatch, MVP225, source and SHA.
 v_catalog:=public.cotironda_piloto_v2_responders_private(
  p_request_id,p_auth_user_id,p_auth_session_id);
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
 RETURN v_catalog;
END;
$v2$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_original_source_private(uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_original_source_private(uuid,uuid,uuid,uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_record_download(
 p_request_id uuid,p_auth_user_id uuid,p_auth_session_id uuid,
 p_document_id uuid,p_source_sha256 text,p_byte_count integer
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $v2$
DECLARE
 v_src jsonb;
BEGIN
 IF p_request_id IS NULL OR p_auth_user_id IS NULL
 OR p_auth_session_id IS NULL OR p_document_id IS NULL
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_byte_count IS NULL OR p_byte_count NOT BETWEEN 1 AND 8388608
 THEN RETURN false; END IF;
 -- Audit revalidates the SAME live consent/permissions and source as
 -- the read path. If revoked meanwhile, no audit and NO bytes returned.
 v_src:=public.cotironda_piloto_v2_original_source_private(
  p_request_id,p_auth_user_id,p_auth_session_id,p_document_id);
 IF v_src IS NULL OR v_src->>'state'<>'authorized_original_v2'
 OR v_src->>'sha256'<>p_source_sha256
 OR (v_src->>'byteCount')::integer<>p_byte_count
 THEN RETURN false; END IF;
 INSERT INTO cotironda_piloto_privado.v2_original_download_audit(
  request_id,document_id,auth_user_id,auth_session_id,
  source_sha256,byte_count)
 VALUES(p_request_id,p_document_id,p_auth_user_id,p_auth_session_id,
  p_source_sha256,p_byte_count);
 RETURN true;
END;
$v2$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_record_download(uuid,uuid,uuid,uuid,text,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_record_download(uuid,uuid,uuid,uuid,text,integer)
 TO service_role;

-- Sólo el servidor que descifró, validó SHA y comprobó permisos puede
-- auditar el texto. No se expone el texto en PostgreSQL ni en URLs.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_record_text_download(
 p_request_id uuid,p_auth_user_id uuid,p_auth_session_id uuid,
 p_document_id uuid,p_source_sha256 text,p_byte_count integer
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $audit_text$
DECLARE v_source jsonb;
BEGIN
 IF p_request_id IS NULL OR p_auth_user_id IS NULL
 OR p_auth_session_id IS NULL OR p_document_id IS NULL
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_byte_count IS NULL OR p_byte_count NOT BETWEEN 5 AND 4000
 THEN RETURN false;END IF;
 v_source:=public.cotironda_piloto_v2_original_source_private(
  p_request_id,p_auth_user_id,p_auth_session_id,p_document_id);
 IF v_source IS NULL OR v_source->>'state'<>'authorized_text_v2'
 OR v_source->>'sha256'<>p_source_sha256
 THEN RETURN false;END IF;
 INSERT INTO cotironda_piloto_privado.v2_original_download_audit(
  request_id,document_id,auth_user_id,auth_session_id,
  source_sha256,byte_count)
 VALUES(p_request_id,p_document_id,p_auth_user_id,p_auth_session_id,
  p_source_sha256,p_byte_count);
 RETURN true;
END;
$audit_text$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_record_text_download(uuid,uuid,uuid,uuid,text,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_record_text_download(uuid,uuid,uuid,uuid,text,integer)
 TO service_role;
