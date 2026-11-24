-- Cotironda V2 · candidato de recuperación de original YA vinculado.
-- No publicar sin orden «Publicalo». Reutiliza el replay MVP292 vigente.
-- No almacena ni envía mensajes, no modifica original, precios ni consentimientos.
-- El SELECT es de solo lectura: el replay existente crea el único lease
-- y verifica el SHA del archivo antes de interpretar y publicar en privado.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_next_linked_supplier_document_v2()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $v2_linked_doc$
DECLARE v_src record;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.integration_flags f
  WHERE f.only_row AND f.whatsapp_inbound_enabled
 ) OR NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 c
  WHERE c.only_row AND c.enabled AND c.activated_at IS NOT NULL
 ) THEN RETURN jsonb_build_object('state','disabled'); END IF;

 SELECT m.message_hmac,m.chat_hmac INTO v_src
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 link
 JOIN cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
  ON decision.source_hmac=link.message_hmac
  AND decision.supplier_key=link.supplier_key
  AND decision.source_sha256=link.source_sha256
  AND decision.state='linked'
  AND decision.selected_request_id=link.request_id
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=link.message_hmac
  AND m.participant_key=link.supplier_key
  AND m.request_id=link.request_id
  AND m.kind=link.kind AND m.processing_state='needs_review'
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac
  AND a.chat_hmac=m.chat_hmac AND a.participant_key=m.participant_key
  AND a.request_id=m.request_id
  AND a.content_sha256=link.source_sha256
  AND a.state='stored'
  AND a.review_state='suggested_only'
  AND a.storage_path='media/'||m.message_hmac
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
  ON u.message_hmac=m.message_hmac
  AND u.supplier_key=link.supplier_key
  AND u.resolved_request_id=link.request_id
  AND u.source_sha256=link.source_sha256
 JOIN cotironda_piloto_privado.requests r
  ON r.id=m.request_id AND r.state='prepared'
 JOIN cotironda_piloto_privado.invitations i
  ON i.request_id=r.id AND i.supplier_key=link.supplier_key
  AND i.state='prepared'
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=link.supplier_key AND supplier.chat_hmac=m.chat_hmac
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 WHERE link.kind IN('document','image')
  AND link.association='semantic_unique_mvp291'
  AND link.status='awaiting_semantic_review'
  AND m.request_id IS NOT NULL
  AND m.received_at>=clock_timestamp()-interval '7 days'
  AND r.created_at<=m.received_at
  AND r.closes_at>m.received_at AND r.closes_at>clock_timestamp()
  AND a.size_bytes BETWEEN 8 AND 8388608
  AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  AND a.mime IN('application/pdf','image/jpeg','image/png','image/webp',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'text/plain','text/csv')
  AND a.proposal->>'kind'='supplier_quote'
  AND a.proposal->>'status'='review_required'
  AND jsonb_typeof(a.proposal->'lines')='array'
  AND jsonb_array_length(a.proposal->'lines') BETWEEN 1 AND 25
  -- A buyer may only see the original under the EXISTING V2 consent gates;
  -- this selector does not grant disclosure rights or alter a quote.
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_archive_replay_mvp292 used
   WHERE used.source_hmac=m.message_hmac
  )
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 used
   WHERE used.message_hmac=m.message_hmac
  )
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.offer_versions used
   WHERE used.source_message_hmac=m.message_hmac
  )
  AND (EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
   WHERE j.request_id=r.id AND j.supplier_key=link.supplier_key
    AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL
    AND j.finished_at IS NOT NULL AND j.finished_at<=m.received_at
  ) OR EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
   WHERE o.request_id=r.id AND o.supplier_key=link.supplier_key
    AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
    AND o.sent_at IS NOT NULL AND o.sent_at<=m.received_at
  ))
 ORDER BY m.received_at,m.message_hmac
 LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty'); END IF;
 RETURN jsonb_build_object('state','eligible',
  'source_hmac',v_src.message_hmac,'chat_hmac',v_src.chat_hmac);
END $v2_linked_doc$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_next_linked_supplier_document_v2()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_next_linked_supplier_document_v2()
 TO service_role;
