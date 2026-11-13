-- Cotironda D016/P0 #838 — CANDIDATO DE DESARROLLO, NO APLICAR AL PILOTO.
-- Requiere revisión jurídica: evidencia de respuesta != consentimiento legal.
-- Tablas PRIVADAS: intención ANTES de Whapi, recepción API confirmada y
-- respuesta auténtica vinculada a la ronda. NUNCA sustituye las RPC V2.
CREATE TABLE cotironda_piloto_privado.v2_d016_original_notice_ledger (
 request_id uuid NOT NULL,
 supplier_key text NOT NULL,
 chat_hmac text NOT NULL CHECK (chat_hmac ~ '^[a-f0-9]{64}$'),
 notice_version text NOT NULL
  CHECK (notice_version='cotironda-originales-v2-respuesta-20261113'),
 notice_body_sha256 text NOT NULL CHECK (notice_body_sha256 ~ '^[a-f0-9]{64}$'),
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','api_accepted')),
 whapi_message_id text,
 api_accepted_at timestamptz,
 PRIMARY KEY (request_id,supplier_key),
 CHECK (
  (state='reserved' AND whapi_message_id IS NULL AND api_accepted_at IS NULL)
  OR
  (state='api_accepted' AND whapi_message_id IS NOT NULL
   AND api_accepted_at IS NOT NULL AND api_accepted_at>=reserved_at)
 )
);
CREATE TABLE cotironda_piloto_privado.v2_d016_original_reply_evidence (
 message_hmac text PRIMARY KEY CHECK (message_hmac ~ '^[a-f0-9]{64}$'),
 request_id uuid NOT NULL,
 supplier_key text NOT NULL,
 notice_whapi_message_id text NOT NULL,
 received_at timestamptz NOT NULL,
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
 association text NOT NULL CHECK (association IN ('quoted_whapi_id','single_active_round')),
 FOREIGN KEY (request_id,supplier_key)
 REFERENCES cotironda_piloto_privado.v2_d016_original_notice_ledger(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.v2_d016_original_notice_revocations (
 request_id uuid NOT NULL,
 supplier_key text NOT NULL,
 message_hmac text NOT NULL CHECK (message_hmac ~ '^[a-f0-9]{64}$'),
 revoked_at timestamptz NOT NULL,
 PRIMARY KEY (request_id,supplier_key),
 FOREIGN KEY (request_id,supplier_key)
 REFERENCES cotironda_piloto_privado.v2_d016_original_notice_ledger(request_id,supplier_key)
);
ALTER TABLE cotironda_piloto_privado.v2_d016_original_notice_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.v2_d016_original_reply_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.v2_d016_original_notice_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
 cotironda_piloto_privado.v2_d016_original_notice_ledger,
 cotironda_piloto_privado.v2_d016_original_reply_evidence,
 cotironda_piloto_privado.v2_d016_original_notice_revocations
 FROM PUBLIC, anon, authenticated, service_role;

-- Reservar exactamente una vez, DESPUÉS de la invitación pero ANTES de enviar.
-- Al fallar la reserva, NO se envía el WhatsApp comercial.
CREATE FUNCTION public.cotironda_piloto_v2_d016_reserve_original_notice_private(
 p_request_id uuid, p_supplier_key text, p_chat_hmac text,
 p_notice_body_sha256 text, p_notice_version text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_inserted integer; v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_request_id IS NULL OR p_supplier_key IS NULL OR p_chat_hmac IS NULL
 OR p_notice_body_sha256 IS NULL OR p_notice_version IS NULL
 OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_notice_body_sha256 !~ '^[a-f0-9]{64}$'
 OR p_notice_version<>'cotironda-originales-v2-respuesta-20261113'
 THEN RETURN false; END IF;
 INSERT INTO cotironda_piloto_privado.v2_d016_original_notice_ledger
 (request_id,supplier_key,chat_hmac,notice_version,notice_body_sha256,reserved_at)
 SELECT r.id,s.key,s.chat_hmac,p_notice_version,p_notice_body_sha256,v_now
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.v2_original_share_policy pol
  ON pol.singleton=true AND pol.enabled=true
  AND pol.activated_at IS NOT NULL AND r.created_at>=pol.activated_at
 JOIN cotironda_piloto_privado.invitations inv
  ON inv.request_id=r.id AND inv.supplier_key=p_supplier_key
  AND inv.state='prepared' AND inv.created_at>=r.created_at
  AND inv.created_at<=v_now
 JOIN cotironda_piloto_privado.participants s
  ON s.key=inv.supplier_key AND s.participant_role='supplier'
  AND s.chat_hmac=p_chat_hmac AND s.consent_at IS NOT NULL
  AND s.consent_at<=v_now AND s.opted_out_at IS NULL
 WHERE r.id=p_request_id AND s.key=p_supplier_key
 AND r.state='prepared' AND r.closes_at>v_now
 AND NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
  WHERE j.request_id=r.id AND j.supplier_key=s.key
   AND j.state='api_accepted'
 )
 ON CONFLICT (request_id,supplier_key) DO NOTHING;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 RETURN v_inserted=1;
END;
$fn$;

-- Sólo registrar aceptación por API si coincide el despacho ORIGINAL de Whapi.
-- Un POST incierto, ID distinto, segundo envío o respuesta ya recibida NO autoriza.
CREATE FUNCTION public.cotironda_piloto_v2_d016_finish_original_notice_private(
 p_request_id uuid,p_supplier_key text,p_whapi_message_id text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_updated integer;v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_request_id IS NULL OR p_supplier_key IS NULL
 OR p_whapi_message_id IS NULL OR
 p_whapi_message_id !~ '^[A-Za-z0-9._:-]{8,160}$'
 THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.v2_d016_original_notice_ledger notice
 SET state='api_accepted',whapi_message_id=p_whapi_message_id,
     api_accepted_at=v_now
 WHERE notice.request_id=p_request_id AND notice.supplier_key=p_supplier_key
 AND notice.state='reserved' AND notice.reserved_at<=v_now
 AND EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 dispatch
  WHERE dispatch.request_id=notice.request_id
   AND dispatch.supplier_key=notice.supplier_key
   AND dispatch.state='api_accepted'
   AND dispatch.whapi_message_id=p_whapi_message_id
   AND dispatch.finished_at BETWEEN notice.reserved_at AND v_now
 )
 AND NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_original_notice_revocations rev
  WHERE rev.request_id=notice.request_id AND rev.supplier_key=notice.supplier_key
 );
 GET DIAGNOSTICS v_updated=ROW_COUNT;
 RETURN v_updated=1;
END;
$fn$;

-- Se invoca sólo tras validación del webhook Whapi: el mensaje archivado,
-- la fuente SHA y la correlación tienen que existir en la base. No se puede
-- afirmar aceptación jurídica sin verificación legal. No abre original alguno.
CREATE FUNCTION public.cotironda_piloto_v2_d016_observe_original_reply_private(
 p_request_id uuid,p_supplier_key text,p_message_hmac text,
 p_quoted_whapi_message_id text,p_is_forwarded boolean,p_is_quote boolean
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_inserted integer;
BEGIN
 IF p_request_id IS NULL OR p_supplier_key IS NULL OR p_message_hmac IS NULL
 OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_is_forwarded IS DISTINCT FROM false
 OR p_is_quote IS DISTINCT FROM true
 THEN RETURN false; END IF;
 INSERT INTO cotironda_piloto_privado.v2_d016_original_reply_evidence
 (message_hmac,request_id,supplier_key,notice_whapi_message_id,
  received_at,source_sha256,association)
 SELECT src.message_hmac,req.id,s.key,notice.whapi_message_id,
        src.received_at,link.source_sha256,link.association
 FROM cotironda_piloto_privado.v2_d016_original_notice_ledger notice
 JOIN cotironda_piloto_privado.requests req
  ON req.id=notice.request_id AND req.state IN ('prepared','closed')
 JOIN cotironda_piloto_privado.v2_original_share_policy pol
  ON pol.singleton=true AND pol.enabled=true
   AND pol.activated_at IS NOT NULL AND req.created_at>=pol.activated_at
 JOIN cotironda_piloto_privado.participants s
  ON s.key=notice.supplier_key AND s.participant_role='supplier'
   AND s.chat_hmac=notice.chat_hmac AND s.consent_at IS NOT NULL
   AND s.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.invitations inv
  ON inv.request_id=req.id AND inv.supplier_key=s.key
   AND inv.state='prepared' AND inv.created_at<=notice.reserved_at
 JOIN cotironda_piloto_privado.whapi_inbox src
  ON src.request_id=req.id AND src.participant_key=s.key
  AND src.chat_hmac=s.chat_hmac
  AND src.received_at>notice.api_accepted_at
  AND src.received_at<=req.closes_at
  AND src.received_at<=clock_timestamp()
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
  ON link.message_hmac=src.message_hmac
   AND link.request_id=req.id AND link.supplier_key=s.key
   AND link.kind=src.kind
   AND link.source_sha256 ~ '^[a-f0-9]{64}$'
   AND link.status='awaiting_semantic_review'
   AND link.association IN ('quoted_whapi_id','single_active_round')
 WHERE req.id=p_request_id AND s.key=p_supplier_key
 AND src.message_hmac=p_message_hmac
 AND notice.state='api_accepted' AND notice.api_accepted_at IS NOT NULL
 AND notice.api_accepted_at >= notice.reserved_at
 AND notice.notice_version='cotironda-originales-v2-respuesta-20261113'
 AND (
  (link.association='quoted_whapi_id'
   AND p_quoted_whapi_message_id=notice.whapi_message_id)
  OR
  (link.association='single_active_round'
   AND p_quoted_whapi_message_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM cotironda_piloto_privado.invitations inv2
     JOIN cotironda_piloto_privado.requests req2 ON req2.id=inv2.request_id
     WHERE inv2.supplier_key=s.key AND req2.id<>req.id
      AND inv2.state='prepared' AND req2.state='prepared'
      AND req2.created_at<=src.received_at
      AND req2.closes_at>=src.received_at
   ))
 )
 AND (
   (src.kind='text' AND src.plaintext_sha256=link.source_sha256
    AND src.plaintext_sha256 ~ '^[a-f0-9]{64}$')
   OR (src.kind IN ('document','image') AND EXISTS (
     SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 archive
     WHERE archive.message_hmac=src.message_hmac
      AND archive.request_id=req.id AND archive.participant_key=s.key
      AND archive.chat_hmac=s.chat_hmac AND archive.kind=src.kind
      AND archive.content_sha256=link.source_sha256
      AND archive.state='stored' AND archive.finished_at IS NOT NULL
      AND archive.storage_path='media/'||archive.message_hmac
      AND archive.size_bytes BETWEEN 1 AND 8388608
   ))
 )
 AND NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_original_notice_revocations rev
  WHERE rev.request_id=req.id AND rev.supplier_key=s.key
 )
 AND NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 bad
  WHERE bad.message_hmac=src.message_hmac
    AND bad.state IN ('ambiguous_round','media_context_conflict')
 )
 ON CONFLICT (message_hmac) DO NOTHING;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 RETURN v_inserted=1;
END;
$fn$;

-- Operación de baja: se registra desde mensaje REAL del proveedor (cifrado
-- y autenticado en inbox). El backend debe interpretar NO COMPARTIR y llamar.
-- Una baja anula todo el par solicitud/proveedor, incluso respuestas previas.
CREATE FUNCTION public.cotironda_piloto_v2_d016_revoke_original_notice_private(
 p_request_id uuid,p_supplier_key text,p_revocation_message_hmac text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_inserted integer;
BEGIN
 IF p_request_id IS NULL OR p_supplier_key IS NULL OR
 p_revocation_message_hmac IS NULL OR
 p_revocation_message_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN false;END IF;
 INSERT INTO cotironda_piloto_privado.v2_d016_original_notice_revocations
 (request_id,supplier_key,message_hmac,revoked_at)
 SELECT notice.request_id,notice.supplier_key,m.message_hmac,m.received_at
 FROM cotironda_piloto_privado.v2_d016_original_notice_ledger notice
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.participant_key=notice.supplier_key
  AND m.chat_hmac=notice.chat_hmac AND m.kind='text'
  AND m.received_at>=notice.reserved_at
 WHERE notice.request_id=p_request_id AND notice.supplier_key=p_supplier_key
 AND m.message_hmac=p_revocation_message_hmac
 ON CONFLICT (request_id,supplier_key) DO NOTHING;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 RETURN v_inserted=1;
END;
$fn$;

-- Sólo estado de procedencia, NO consentimiento jurídico ni fuente para
-- descargar presupuestos. El contrato completo permanece BLOQUEADO.
CREATE FUNCTION public.cotironda_piloto_v2_d016_original_evidence_status_private(
 p_request_id uuid,p_supplier_key text,p_message_hmac text
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT CASE WHEN EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.v2_d016_original_reply_evidence e
   JOIN cotironda_piloto_privado.v2_d016_original_notice_ledger n
    ON n.request_id=e.request_id AND n.supplier_key=e.supplier_key
   JOIN cotironda_piloto_privado.participants s ON s.key=e.supplier_key
   JOIN cotironda_piloto_privado.v2_original_share_policy pol ON pol.singleton=true
   WHERE e.request_id=p_request_id AND e.supplier_key=p_supplier_key
   AND e.message_hmac=p_message_hmac AND n.state='api_accepted'
   AND e.notice_whapi_message_id=n.whapi_message_id
   AND e.received_at>n.api_accepted_at
   AND s.participant_role='supplier' AND s.chat_hmac=n.chat_hmac
   AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
   AND pol.enabled=true AND pol.activated_at IS NOT NULL
   AND NOT EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.v2_d016_original_notice_revocations rev
    WHERE rev.request_id=n.request_id AND rev.supplier_key=n.supplier_key
   )
 ) THEN 'verified_reply_not_authorization' ELSE 'denied' END;
$fn$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_reserve_original_notice_private(uuid,text,text,text,text),
 public.cotironda_piloto_v2_d016_finish_original_notice_private(uuid,text,text),
 public.cotironda_piloto_v2_d016_observe_original_reply_private(uuid,text,text,text,boolean,boolean),
 public.cotironda_piloto_v2_d016_revoke_original_notice_private(uuid,text,text),
 public.cotironda_piloto_v2_d016_original_evidence_status_private(uuid,text,text)
 FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d016_reserve_original_notice_private(uuid,text,text,text,text),
 public.cotironda_piloto_v2_d016_finish_original_notice_private(uuid,text,text),
 public.cotironda_piloto_v2_d016_observe_original_reply_private(uuid,text,text,text,boolean,boolean),
 public.cotironda_piloto_v2_d016_revoke_original_notice_private(uuid,text,text),
 public.cotironda_piloto_v2_d016_original_evidence_status_private(uuid,text,text)
 TO service_role;
