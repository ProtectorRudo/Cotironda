-- MVP341: preflight de origen para trabajador interno. SOLO DESARROLLO.
-- Return metadata necessary to read exactly ONE linked, private original.
-- Revalidate eligibility in MVP340 reserve after extracting evidence.
-- No bytes, quotes, contacts, phone or signed storage URL are returned.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_source_for_lots_mvp341(
 p_message_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mvp341$
DECLARE v record;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN pg_catalog.jsonb_build_object('state','not_eligible');END IF;
 -- Avoid even private Storage GET when source already leased, completed,
 -- or failed under uncertain billing state. No blind retries.
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340 ledger
  WHERE ledger.source_hmac=p_message_hmac
 ) THEN RETURN pg_catalog.jsonb_build_object('state','already_processed');END IF;

 SELECT m.message_hmac,m.chat_hmac,m.participant_key,m.request_id,
  a.content_sha256,a.mime,a.size_bytes,a.storage_path
 INTO v
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
  AND a.participant_key=m.participant_key
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
  ON link.message_hmac=m.message_hmac AND link.request_id=m.request_id
  AND link.supplier_key=m.participant_key
  AND link.source_sha256=a.content_sha256
 JOIN cotironda_piloto_privado.requests req ON req.id=m.request_id
 JOIN cotironda_piloto_privado.invitations i
  ON i.request_id=req.id AND i.supplier_key=m.participant_key
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=m.participant_key AND supplier.chat_hmac=m.chat_hmac
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=req.buyer_key
 WHERE m.message_hmac=p_message_hmac
  AND m.kind='document' AND m.processing_state='needs_review'
  AND a.state='stored' AND a.review_state='suggested_only'
  AND a.request_id=req.id
  AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  AND a.storage_path='media/'||m.message_hmac
  AND a.size_bytes BETWEEN 8 AND 8388608
  AND a.mime IN(
   'application/pdf',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'text/plain','text/csv')
  AND req.state='prepared' AND req.created_at<=m.received_at
  AND req.closes_at>m.received_at
  AND req.closes_at>pg_catalog.clock_timestamp()
  AND i.state='prepared'
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND (
   link.association IN('quoted_whapi_id','single_active_round',
    'prior_supplier_preamble','clarified_supplier_reply')
   OR (link.association='semantic_unique_mvp291'
    AND EXISTS(SELECT 1
     FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
     WHERE decision.source_hmac=m.message_hmac
      AND decision.source_sha256=a.content_sha256
      AND decision.supplier_key=m.participant_key
      AND decision.selected_request_id=req.id
      AND decision.state='linked'))
  )
  AND (
   EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
    WHERE d.request_id=req.id AND d.supplier_key=m.participant_key
     AND d.state='api_accepted' AND d.whapi_message_id IS NOT NULL
     AND d.finished_at IS NOT NULL AND d.finished_at<=m.received_at)
   OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
    WHERE o.request_id=req.id AND o.supplier_key=m.participant_key
     AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
     AND o.sent_at IS NOT NULL AND o.sent_at<=m.received_at)
  )
 LIMIT 1;
 IF NOT FOUND THEN
  RETURN pg_catalog.jsonb_build_object('state','not_eligible');
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'state','candidate',
  'messageHmac',v.message_hmac,
  'chatHmac',v.chat_hmac,
  'supplierKey',v.participant_key,
  'roundId',v.request_id::text,
  'sourceSha256',v.content_sha256,
  'mime',v.mime,'sizeBytes',v.size_bytes,
  'storagePath',v.storage_path
 );
END $mvp341$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_source_for_lots_mvp341(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_source_for_lots_mvp341(text)
 TO service_role;
