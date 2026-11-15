-- Cotironda D016 OFFLINE WORKER CANDIDATO. NO INSTALAR sin Publicalo.
-- Reusa byte por byte los JOINs de la fuente y del catálogo D016 pero la puerta
-- de comprador es identidad WhatsApp verificada + políticas V2, NO cookie.
-- No es acceso público: únicamente service_role desde Edge con secreto 2FA.
-- Requiere funciones originales D016, calendarios, consentimientos y V2-04b.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_worker_catalog_private(
 p_request_id uuid
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
 IF p_request_id IS NULL
 THEN RETURN NULL;END IF;

 -- Offline solo para ronda V2 prospectiva, comprador demostrado por Whapi,
 -- políticas activas y calendario aprobado. NO requiere navegador conectado.
 SELECT r.buyer_key,share.activated_at INTO v_buyer,v_activation
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.v2_original_share_policy share
  ON share.singleton=true AND share.enabled=true
  AND share.activated_at IS NOT NULL AND r.created_at>=share.activated_at
 JOIN cotironda_piloto_privado.v2_business_policy business
  ON business.singleton=true AND business.enabled=true
  AND business.activated_at IS NOT NULL AND r.created_at>=business.activated_at
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
  ON channel.participant_key=buyer.key AND channel.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof
  ON proof.message_hmac=channel.authenticated_message_hmac
  AND proof.participant_key=buyer.key AND proof.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.v2_business_calendar cal
  ON cal.revision=r.v2_calendar_revision
  AND lower(btrim(cal.locality))=lower(btrim(r.delivery_city))
  AND cal.year=extract(year from r.created_at
   AT TIME ZONE 'America/Argentina/Buenos_Aires')::integer
  AND cal.approved_at IS NOT NULL AND cal.approved_at<=r.created_at
 WHERE r.id=p_request_id AND r.state IN ('prepared','closed')
  AND r.timing_mode='business_two_days' AND r.round_days=2
  AND r.v2_calendar_revision IS NOT NULL
  AND r.closes_at>r.created_at
  AND NOT EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 x
   JOIN cotironda_piloto_privado.participants other
    ON other.key=x.participant_key
   WHERE x.contact_sha256=channel.contact_sha256
    AND x.participant_key<>buyer.key
    AND other.participant_role='buyer' AND other.opted_out_at IS NULL
  )
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

-- Funcion privilegiada visible en public SOLO por el servidor.

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_worker_catalog_private(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_worker_catalog_private(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_worker_source_private(
 p_request_id uuid,p_document_id uuid
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
 IF p_request_id IS NULL OR p_document_id IS NULL
 THEN RETURN NULL; END IF;

 -- Catalog rechecks live PILOT Auth session, buyer phone proof, company,
 -- V2 prospective informed consent, dispatch, MVP225, source and SHA.
 v_catalog:=public.cotironda_piloto_v2_d016_worker_catalog_private(
  p_request_id);
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


REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_worker_source_private(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_worker_source_private(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_worker_claim_private(
 p_request_id uuid,p_document_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $claim$
DECLARE v_source jsonb; v_token uuid; v_sha text;
BEGIN
 v_source:=public.cotironda_piloto_v2_d016_worker_source_private(
  p_request_id,p_document_id);
 IF v_source IS NULL OR v_source->>'state' NOT IN('authorized_original_v2','authorized_text_v2')
 THEN RETURN NULL;END IF;
 v_sha:=v_source->>'sha256';
 INSERT INTO cotironda_piloto_privado.v2_original_analysis(
  request_id,document_id,original_sha256,status,job_token,lease_until)
 VALUES(p_request_id,p_document_id,v_sha,'processing',
        gen_random_uuid(),clock_timestamp()+interval '90 seconds')
 ON CONFLICT(request_id,document_id) DO UPDATE
 SET job_token=gen_random_uuid(),
     attempt_count=cotironda_piloto_privado.v2_original_analysis.attempt_count+1,
     status='processing',
     text_sha256=NULL,
     points=NULL,
     lease_until=clock_timestamp()+interval '90 seconds',
     updated_at=clock_timestamp()
 WHERE (
    (cotironda_piloto_privado.v2_original_analysis.status='processing'
     AND cotironda_piloto_privado.v2_original_analysis.lease_until<clock_timestamp())
    OR
    (cotironda_piloto_privado.v2_original_analysis.status='review'
     AND cotironda_piloto_privado.v2_original_analysis.updated_at<
       clock_timestamp()-interval '5 minutes')
   )
   AND cotironda_piloto_privado.v2_original_analysis.attempt_count<3
   AND cotironda_piloto_privado.v2_original_analysis.original_sha256=v_sha
 RETURNING job_token INTO v_token;
 IF v_token IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('state','analysis_claimed_v2',
  'jobToken',v_token::text,'sourceSha256',v_sha);
END $claim$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_worker_finish_private(
 p_request_id uuid,
 p_document_id uuid,p_job_token uuid,p_source_sha256 text,
 p_text_sha256 text,p_points jsonb,p_status text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $finish$
DECLARE v_src jsonb; v_point jsonb; v_total integer;
BEGIN
 IF p_job_token IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_status NOT IN('ready','review')
 THEN RETURN false;END IF;
 v_src:=public.cotironda_piloto_v2_d016_worker_source_private(
  p_request_id,p_document_id);
 IF v_src IS NULL OR v_src->>'state' NOT IN('authorized_original_v2','authorized_text_v2')
 OR v_src->>'sha256'<>p_source_sha256 THEN RETURN false;END IF;
 IF p_status='ready' THEN
  IF p_text_sha256 IS NULL OR p_text_sha256 !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(p_points)<>'array' OR
   jsonb_array_length(p_points) NOT BETWEEN 2 AND 4 THEN RETURN false;END IF;
  FOR v_point IN SELECT value FROM jsonb_array_elements(p_points) LOOP
   IF jsonb_typeof(v_point)<>'object'
   OR length(v_point->>'categoria') NOT BETWEEN 3 AND 40
   OR v_point->>'categoria' NOT IN(
    'cobertura','precio','iva','flete','forma_pago','plazo',
    'disponibilidad','material','presentacion','aclaracion')
   OR length(v_point->>'evidencia') NOT BETWEEN 6 AND 180
   OR length(v_point->>'observacion') NOT BETWEEN 12 AND 240
   OR v_point->>'observacion' ~ '[<>]'
   OR v_point->>'observacion' ~* '[a-z0-9._%+-]+@[a-z0-9.-]+'
   THEN RETURN false; END IF;
  END LOOP;
 ELSE
  IF p_points IS NOT NULL OR p_text_sha256 IS NOT NULL THEN RETURN false;END IF;
 END IF;
 UPDATE cotironda_piloto_privado.v2_original_analysis
 SET status=p_status,points=p_points,text_sha256=p_text_sha256,
  updated_at=clock_timestamp()
 WHERE request_id=p_request_id AND document_id=p_document_id
 AND original_sha256=p_source_sha256 AND job_token=p_job_token
 AND status='processing' AND lease_until>=clock_timestamp();
 RETURN FOUND;
END $finish$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_worker_finish_private(uuid,uuid,uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_worker_finish_private(uuid,uuid,uuid,text,text,jsonb,text) TO service_role;

-- Hasta 2 documentos por tick y 20 rondas examinadas. Cero datos
-- personales o sobres cifrados en el listado de trabajo.
CREATE FUNCTION public.cotironda_piloto_v2_d016_worker_due_private(
 p_limit integer DEFAULT 2
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $worker_due$
DECLARE v_items jsonb:='[]'::jsonb;v_rec record;v_cat jsonb;v_doc jsonb;
 v_src jsonb;v_count integer:=0;v_analysis record;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 2
 THEN RETURN '[]'::jsonb;END IF;
 FOR v_rec IN
  SELECT r.id FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.v2_original_share_policy s
   ON s.singleton=true AND s.enabled=true
   AND s.activated_at IS NOT NULL AND r.created_at>=s.activated_at
  JOIN cotironda_piloto_privado.v2_business_policy b
   ON b.singleton=true AND b.enabled=true
   AND b.activated_at IS NOT NULL AND r.created_at>=b.activated_at
  WHERE r.state IN ('prepared','closed')
   AND r.timing_mode='business_two_days' AND r.round_days=2
   AND r.v2_calendar_revision IS NOT NULL
  ORDER BY r.created_at DESC,r.id LIMIT 20
 LOOP
  v_cat:=public.cotironda_piloto_v2_d016_worker_catalog_private(v_rec.id);
  IF v_cat IS NULL OR v_cat->>'state'<>'authorized_responders_v2'
   OR jsonb_typeof(v_cat->'originals')<>'array' THEN CONTINUE;END IF;
  FOR v_doc IN SELECT value FROM jsonb_array_elements(v_cat->'originals') LOOP
   v_src:=public.cotironda_piloto_v2_d016_worker_source_private(
    v_rec.id,(v_doc->>'documentId')::uuid);
   IF v_src IS NULL OR v_src->>'state' NOT IN
    ('authorized_original_v2','authorized_text_v2') THEN CONTINUE;END IF;
   IF EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.v2_original_analysis a
    WHERE a.request_id=v_rec.id
     AND a.document_id=(v_doc->>'documentId')::uuid
     AND (
      a.original_sha256<>v_src->>'sha256' OR
      a.status='ready' OR a.attempt_count>=3 OR
      (a.status='processing' AND a.lease_until>=clock_timestamp()) OR
      (a.status='review' AND a.updated_at>=
       clock_timestamp()-interval '5 minutes')
     )
   ) THEN CONTINUE;END IF;
   v_items:=v_items||jsonb_build_array(jsonb_build_object(
    'requestId',v_rec.id::text,
    'documentId',v_doc->>'documentId',
    'sourceSha256',v_src->>'sha256',
    'mime',v_src->>'mime'));
   v_count:=v_count+1;
   IF v_count>=p_limit THEN RETURN v_items;END IF;
  END LOOP;
 END LOOP;
 RETURN v_items;
END $worker_due$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_worker_due_private(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_worker_due_private(integer) TO service_role;
