-- MVP296 — recovered buyer/supplier quote publication must honor the
-- EXACT, existing IA Central activation in SQL. Current MVP295 worker had
-- an undocumented extra Edge flag, which was not part of the three user-
-- configured gates and silently blocked a fully eligible historical quote.
-- No new secrets, no cron, no WhatsApps, no extra model calls outside budget.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.ai_central_control_mvp226') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_supplier_linked_replay_mvp295') IS NULL
 THEN RAISE EXCEPTION 'mvp296_missing_pilot_control' USING ERRCODE='42501'; END IF;
END $gate$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_linked_text_mvp295()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $claim$
DECLARE v_row record;v_count int;v_written integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags flag
  WHERE flag.only_row AND flag.whatsapp_inbound_enabled)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 central
  WHERE central.only_row AND central.enabled AND central.activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','disabled'); END IF;
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.ai_supplier_linked_replay_mvp295
 WHERE claimed_at>clock_timestamp()-interval '24 hours';
 -- In addition to the MVP264 observed-token cap: at most six originals
 -- per 24h. UNKNOWN usage is never interpreted as free usage.
 IF v_count>=6 THEN RETURN jsonb_build_object('state','quota');END IF;
 SELECT l.message_hmac,l.source_sha256,l.supplier_key,m.chat_hmac
 INTO v_row
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
 JOIN cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292 recovery
  ON recovery.source_hmac=l.message_hmac
  AND recovery.supplier_key=l.supplier_key AND recovery.state='linked'
 JOIN cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 corr
  ON corr.source_hmac=l.message_hmac AND corr.supplier_key=l.supplier_key
  AND corr.state='linked' AND corr.selected_request_id=l.request_id
  AND corr.source_sha256=l.source_sha256
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
  ON u.message_hmac=l.message_hmac AND u.supplier_key=l.supplier_key
  AND u.resolved_request_id=l.request_id AND u.source_sha256=l.source_sha256
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=l.message_hmac AND m.participant_key=l.supplier_key
  AND m.request_id=l.request_id AND m.plaintext_sha256=l.source_sha256
  AND m.kind='text' AND m.processing_state='needs_review'
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=l.supplier_key AND supplier.chat_hmac=m.chat_hmac
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.requests r
  ON r.id=l.request_id AND r.state='prepared'
  AND r.created_at<=m.received_at AND r.closes_at>m.received_at
  AND r.closes_at>clock_timestamp()
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
  ON shadow.request_id=l.request_id
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 dispatch
  ON dispatch.request_id=l.request_id AND dispatch.supplier_key=l.supplier_key
  AND dispatch.state='api_accepted' AND dispatch.whapi_message_id IS NOT NULL
  AND dispatch.finished_at IS NOT NULL AND dispatch.finished_at<=m.received_at
 WHERE l.kind='text' AND l.association='semantic_unique_mvp291'
  AND l.status='awaiting_semantic_review'
  AND m.received_at>=clock_timestamp()-interval '7 days'
  AND m.nonce_b64 IS NOT NULL AND m.ciphertext_b64 IS NOT NULL
  AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 prior
    WHERE prior.message_hmac=l.message_hmac
  )
  AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_supplier_linked_replay_mvp295 prior
    WHERE prior.source_hmac=l.message_hmac
  )
 ORDER BY m.received_at,l.message_hmac
 LIMIT 1 FOR UPDATE OF l SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_linked_replay_mvp295(
  source_hmac,source_sha256,supplier_key,state)
 VALUES(v_row.message_hmac,v_row.source_sha256,v_row.supplier_key,'leased')
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_written=ROW_COUNT;
 IF v_written<>1 THEN RETURN jsonb_build_object('state','busy');END IF;
 RETURN jsonb_build_object('state','claimed',
  'message_hmac',v_row.message_hmac,'chat_hmac',v_row.chat_hmac);
END $claim$;


-- CREATE OR REPLACE preserves the previous restricted function ACL.
-- Check anon/authenticated REVOKE in CI and during real deployment.
