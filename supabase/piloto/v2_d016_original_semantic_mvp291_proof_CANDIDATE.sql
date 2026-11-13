-- Cotironda V2 D016 #838: asociación MVP291 corroborada
-- Sólo CANDIDATO. Ningún permiso legal/descarga, no despliegue Whapi.
-- NO reescribe datos históricos ni relaja las políticas V2 actuales.
ALTER TABLE cotironda_piloto_privado.v2_d016_original_reply_evidence
 DROP CONSTRAINT v2_d016_original_reply_evidence_association_check,
 ADD CONSTRAINT v2_d016_original_reply_evidence_association_check
 CHECK (association IN
  ('quoted_whapi_id','single_active_round','semantic_unique_mvp291'));


-- Motor privado que CORROBORA la resolución MVP291 después de dos lecturas
-- independientes y del commit atómico (inbox, link, unresolved, decisión).
-- No calcula rankings, no crea consentimiento, no toca precios ni archivos.
CREATE FUNCTION cotironda_piloto_privado.v2_d016_semantic_resolution_proven(
 p_message_hmac text,p_request_id uuid,p_supplier_key text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO '' AS $proof$
 SELECT EXISTS (
  SELECT 1
  FROM cotironda_piloto_privado.whapi_inbox src
  JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
   ON link.message_hmac=src.message_hmac
    AND link.request_id=src.request_id
    AND link.supplier_key=src.participant_key
    AND link.kind=src.kind
    AND link.association='semantic_unique_mvp291'
    AND link.status='awaiting_semantic_review'
  JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
   ON u.message_hmac=src.message_hmac
    AND u.supplier_key=src.participant_key
    AND u.kind=src.kind AND u.source_sha256=link.source_sha256
    AND u.state='ambiguous_round'
    AND u.resolved_request_id=link.request_id
    AND u.resolved_at IS NOT NULL
    AND u.resolved_at>=src.received_at
  JOIN cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
   ON decision.source_hmac=src.message_hmac
    AND decision.supplier_key=src.participant_key
    AND decision.source_sha256=link.source_sha256
    AND decision.state='linked'
    AND decision.reason='double_model_unique_margin'
    AND decision.selected_request_id=link.request_id
    AND decision.reserved_at IS NOT NULL
    AND decision.finished_at IS NOT NULL
    AND decision.finished_at>=decision.reserved_at
    AND decision.finished_at>=src.received_at
    AND decision.finished_at<=clock_timestamp()
  JOIN cotironda_piloto_privado.participants supplier
   ON supplier.key=src.participant_key
    AND supplier.chat_hmac=src.chat_hmac
    AND supplier.participant_role='supplier'
    AND supplier.consent_at IS NOT NULL
    AND supplier.opted_out_at IS NULL
  WHERE src.message_hmac=p_message_hmac
   AND src.request_id=p_request_id AND src.participant_key=p_supplier_key
   AND src.received_at<=clock_timestamp()
   AND link.source_sha256 ~ '^[a-f0-9]{64}$'
   AND u.resolved_at<=clock_timestamp()
   AND NOT EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 other
    WHERE other.message_hmac=src.message_hmac
     AND (other.request_id<>src.request_id
        OR other.supplier_key<>src.participant_key
        OR other.source_sha256<>link.source_sha256)
   )
 )
$proof$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.v2_d016_semantic_resolution_proven(text,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_observe_original_reply_private(
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
   AND link.association IN ('quoted_whapi_id','single_active_round','semantic_unique_mvp291')
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
  OR
  (link.association='semantic_unique_mvp291'
   AND p_quoted_whapi_message_id IS NULL
   AND cotironda_piloto_privado.v2_d016_semantic_resolution_proven(
    src.message_hmac,req.id,s.key))
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
    AND (
      bad.state IN ('media_context_conflict','context_blocked')
      OR (
       bad.state='ambiguous_round'
       AND NOT (link.association='semantic_unique_mvp291'
         AND bad.resolved_request_id=req.id
         AND bad.resolved_at IS NOT NULL
         AND cotironda_piloto_privado.v2_d016_semantic_resolution_proven(
           src.message_hmac,req.id,s.key))
      )
    )
 )
 ON CONFLICT (message_hmac) DO NOTHING;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 RETURN v_inserted=1;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_record_reply_event_private(
 p_message_hmac text,p_chat_hmac text,p_quoted_whapi_id text,
 p_is_forwarded boolean,p_is_quote boolean
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO '' AS $fn$
DECLARE v record; n integer:=0; v_request uuid; v_supplier text;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_is_forwarded IS DISTINCT FROM false
 OR p_is_quote IS DISTINCT FROM true
 OR (p_quoted_whapi_id IS NOT NULL
     AND p_quoted_whapi_id !~ '^[A-Za-z0-9._:-]{8,160}$')
 THEN RETURN 'denied';END IF;

 -- IdWhapi citado debe ser el del pedido; en ronda unica, NULL y no
 -- puede coexistir ninguna otra ronda vigente del mismo proveedor.
 -- El SQL original vuelve a validar SHA, media, plazos y bajas.
 FOR v IN
 SELECT DISTINCT link.request_id,link.supplier_key
 FROM cotironda_piloto_privado.whapi_inbox src
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
  ON link.message_hmac=src.message_hmac
  AND link.request_id=src.request_id
  AND link.supplier_key=src.participant_key
  AND link.kind=src.kind
  AND link.status='awaiting_semantic_review'
  AND link.association IN ('quoted_whapi_id','single_active_round','semantic_unique_mvp291')
 JOIN cotironda_piloto_privado.v2_d016_original_notice_ledger notice
  ON notice.request_id=link.request_id
  AND notice.supplier_key=link.supplier_key
  AND notice.chat_hmac=src.chat_hmac
  AND notice.state='api_accepted'
  AND notice.api_accepted_at IS NOT NULL
  AND src.received_at>notice.api_accepted_at
  AND (
   (link.association='quoted_whapi_id'
    AND p_quoted_whapi_id=notice.whapi_message_id)
   OR
   (link.association='single_active_round'
    AND p_quoted_whapi_id IS NULL)
   OR
   (link.association='semantic_unique_mvp291'
    AND p_quoted_whapi_id IS NULL
    AND cotironda_piloto_privado.v2_d016_semantic_resolution_proven(
      src.message_hmac,link.request_id,link.supplier_key))
  )
 WHERE src.message_hmac=p_message_hmac
  AND src.chat_hmac=p_chat_hmac
  AND src.received_at<=clock_timestamp()
 LOOP
  n:=n+1;
  IF n>1 THEN RETURN 'denied';END IF;
  v_request:=v.request_id;v_supplier:=v.supplier_key;
 END LOOP;
 IF n<>1 THEN RETURN 'denied';END IF;
 IF public.cotironda_piloto_v2_d016_observe_original_reply_private(
     v_request,v_supplier,p_message_hmac,p_quoted_whapi_id,
     false,true
 ) THEN RETURN 'verified_reply_not_authorization';END IF;
 RETURN 'denied';
END
$fn$;



REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_observe_original_reply_private(uuid,text,text,text,boolean,boolean),
 public.cotironda_piloto_v2_d016_record_reply_event_private(text,text,text,boolean,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d016_observe_original_reply_private(uuid,text,text,text,boolean,boolean),
 public.cotironda_piloto_v2_d016_record_reply_event_private(text,text,text,boolean,boolean)
 TO service_role;
