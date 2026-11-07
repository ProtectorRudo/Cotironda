-- MVP295: historical text auto-linked by IA Central was barred from the
-- commercial stage by MVP227's *ten-minute* live-message anti-replay gate.
-- Extend ONLY for cryptographically authenticated, unique, bound archival
-- originals (7 days, round still open); all other messages retain 10 min.
-- Never merge sources, guess conditions or send WhatsApps.
-- This migration is inert unless the restricted internal Edge worker calls it.

DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_usage_calls_mvp264') IS NULL
 THEN RAISE EXCEPTION 'mvp295_missing_dependencies' USING ERRCODE='42501'; END IF;
END $gate$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_quote_mvp227(
 p_message_hmac text,p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_source record;v_count int;v_rows int;v_items jsonb;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Source MUST be linked to a specific quoted invitation of THIS sender.
 SELECT l.message_hmac,l.supplier_key,l.request_id,l.source_sha256,
   m.nonce_b64,m.ciphertext_b64,m.plaintext_sha256,m.received_at
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=l.message_hmac
  AND m.request_id=l.request_id AND m.participant_key=l.supplier_key
 JOIN cotironda_piloto_privado.participants p ON p.key=l.supplier_key
  AND p.chat_hmac=m.chat_hmac
 JOIN cotironda_piloto_privado.requests r ON r.id=l.request_id
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
  ON shadow.request_id=r.id
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
  ON d.request_id=r.id AND d.supplier_key=l.supplier_key
 WHERE l.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
   AND l.kind='text' AND m.kind='text' AND l.status='awaiting_semantic_review'
   AND m.processing_state='needs_review'
   AND m.plaintext_sha256=l.source_sha256
   AND p.participant_role='supplier'
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND r.state='prepared' AND r.closes_at>m.received_at
   AND m.received_at>=r.created_at AND (
    m.received_at>clock_timestamp()-interval '10 minutes'
    OR (
      -- Recover only previously authenticated, hash-verified, uniquely
      -- bound ARCHIVED text. Never widen the normal live-message rule.
      m.received_at>=clock_timestamp()-interval '7 days'
      AND r.closes_at>clock_timestamp()
      AND l.association='semantic_unique_mvp291'
      AND EXISTS (
        SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292 recovered
        WHERE recovered.source_hmac=l.message_hmac
          AND recovered.supplier_key=l.supplier_key
          AND recovered.state='linked'
      )
      AND EXISTS (
        SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 corr
        WHERE corr.source_hmac=l.message_hmac
          AND corr.supplier_key=l.supplier_key
          AND corr.state='linked'
          AND corr.selected_request_id=l.request_id
      )
      AND EXISTS (
        SELECT 1 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 original
        WHERE original.message_hmac=l.message_hmac
          AND original.supplier_key=l.supplier_key
          AND original.resolved_request_id=l.request_id
      )
    )
  )
   AND d.state='api_accepted' AND d.finished_at<=m.received_at
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 a
  WHERE a.message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 a
 WHERE a.supplier_key=v_source.supplier_key
  AND a.reserved_at>clock_timestamp()-interval '24 hours';
 IF v_count>=12 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;
 SELECT jsonb_agg(jsonb_build_object(
   'id','item_'||l.line_no,'descripcion',l.original_description,
   'cantidad',l.quantity::text,'unidad',l.unit,'rubro',rub.rubro
  ) ORDER BY l.line_no) INTO v_items
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 map
 JOIN cotironda_piloto_privado.request_lines l ON
  l.request_id=map.request_id AND l.line_no=map.line_no
 JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
  ON rub.request_id=l.request_id AND rub.line_no=l.line_no
 WHERE map.request_id=v_source.request_id
  AND map.supplier_key=v_source.supplier_key;
 IF v_items IS NULL OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 25
 THEN RETURN jsonb_build_object('state','request_lines_inconsistent');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227(
  message_hmac,request_id,supplier_key,source_sha256)
 VALUES(p_message_hmac,v_source.request_id,v_source.supplier_key,
  v_source.source_sha256) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 -- Do NOT return phone, supplier name or source plain text.
 RETURN jsonb_build_object('state','reserved','source_sha256',
  v_source.source_sha256,'nonce',v_source.nonce_b64,
  'ciphertext',v_source.ciphertext_b64,'items',v_items);
END
$fn$;


CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_linked_replay_mvp295(
 source_hmac text PRIMARY KEY REFERENCES
  cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292(source_hmac)
  ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key)
  ON DELETE RESTRICT,
 state text NOT NULL CHECK(state IN('leased','processed','review','uncertain')),
 reason_code text,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CHECK ((state='leased')=(finished_at IS NULL)),
 CHECK (reason_code IS NULL OR reason_code ~ '^[a-z_]{3,64}$')
);
ALTER TABLE cotironda_piloto_privado.ai_supplier_linked_replay_mvp295 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_linked_replay_mvp295
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_linked_text_mvp295()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $claim$
DECLARE v_row record;v_count int;v_written integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags flag
  WHERE flag.only_row AND flag.whatsapp_inbound_enabled)
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

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_linked_text_mvp295(
 p_message_hmac text,p_state text,p_reason_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $finish$
DECLARE v_row record;v_updated integer;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
  OR p_state NOT IN('processed','review','uncertain')
  OR p_reason_code IS NULL OR p_reason_code !~ '^[a-z_]{3,64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT queue.source_hmac,queue.source_sha256
 INTO v_row
 FROM cotironda_piloto_privado.ai_supplier_linked_replay_mvp295 queue
 WHERE queue.source_hmac=p_message_hmac AND queue.state='leased'
 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','already_finished');END IF;
 -- A positive completion MUST be backed by the commercial SQL review
 -- tied to the very same immutable source. Never trust an Edge label.
 IF p_state='processed' AND NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 evidence
  WHERE evidence.message_hmac=v_row.source_hmac
   AND evidence.source_sha256=v_row.source_sha256
   AND evidence.state='verified' AND evidence.finished_at IS NOT NULL
 ) THEN RETURN jsonb_build_object('state','not_verified');END IF;
 IF p_state='review' AND NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 evidence
  WHERE evidence.message_hmac=v_row.source_hmac
   AND evidence.source_sha256=v_row.source_sha256
   AND evidence.state IN('verified','review')
   AND evidence.finished_at IS NOT NULL
 ) THEN RETURN jsonb_build_object('state','not_reviewed');END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_linked_replay_mvp295
 SET state=p_state,reason_code=p_reason_code,finished_at=clock_timestamp()
 WHERE source_hmac=p_message_hmac AND state='leased';
 GET DIAGNOSTICS v_updated=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN v_updated=1 THEN 'recorded'
  ELSE 'already_finished' END);
END $finish$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_linked_text_mvp295(),
 public.cotironda_piloto_finish_linked_text_mvp295(text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_linked_text_mvp295(),
 public.cotironda_piloto_finish_linked_text_mvp295(text,text,text)
 TO service_role;
