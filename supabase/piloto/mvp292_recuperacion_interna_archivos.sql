-- MVP292: explicit INTERNAL, one-shot recovery of unlinked originals.
-- No vendor/buyer interaction, no order sending, no cron activation.
-- This migration is inert until a separately authorized Edge worker runs.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292(
 source_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.ai_supplier_unresolved_mvp237(message_hmac) ON DELETE RESTRICT,
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 state text NOT NULL CHECK(state IN('leased','linked','review','uncertain')),
 reason_code text,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CHECK((state='leased')=(finished_at IS NULL))
);
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_archive_replay_mvp292(
 source_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.media_archive_mvp095(message_hmac) ON DELETE RESTRICT,
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN('leased','published','review','uncertain')),
 reason_code text,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CHECK((state='leased')=(finished_at IS NULL))
);
ALTER TABLE cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.ai_supplier_archive_replay_mvp292 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_archive_replay_mvp292 FROM PUBLIC,anon,authenticated;

-- Claim exactly ONE unresolved source per authorized worker invocation.
-- A hash with a prior IA reservation/review is NEVER billed again.
-- Keep historical windows tight and only when the original was received
-- BEFORE at least one genuine, still-open, accepted supplier invitation.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_auto_recovery_mvp292()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $recover$
DECLARE v_source record;v_claim integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags f
  WHERE f.only_row AND f.whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292
  WHERE claimed_at>clock_timestamp()-interval '24 hours')>=12
 THEN RETURN jsonb_build_object('state','quota');END IF;

 SELECT m.message_hmac,m.chat_hmac,m.participant_key,m.kind,
  u.source_sha256,m.nonce_b64,m.ciphertext_b64,
  a.mime,a.size_bytes,a.proposal
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=u.message_hmac AND m.participant_key=u.supplier_key
 JOIN cotironda_piloto_privado.participants seller
  ON seller.key=m.participant_key AND seller.chat_hmac=m.chat_hmac
 LEFT JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
  AND a.participant_key=m.participant_key
 WHERE u.state='ambiguous_round' AND u.resolved_request_id IS NULL
  AND m.request_id IS NULL AND m.processing_state IN('needs_review','unmatched_quote')
  AND m.kind IN('text','document','image')
  AND u.kind=m.kind
  AND m.received_at>=clock_timestamp()-interval '7 days'
  AND seller.participant_role='supplier' AND seller.consent_at IS NOT NULL
  AND seller.opted_out_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292 log
   WHERE log.source_hmac=m.message_hmac)
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 log
   WHERE log.source_hmac=m.message_hmac)
  AND (
   (m.kind='text' AND a.message_hmac IS NULL
    AND m.plaintext_sha256=u.source_sha256
    AND m.nonce_b64 IS NOT NULL AND m.ciphertext_b64 IS NOT NULL)
   OR
   (m.kind IN('document','image') AND a.state='stored'
    AND a.request_id IS NULL AND a.content_sha256=u.source_sha256
    AND a.review_state='suggested_only'
    AND a.storage_path='media/'||m.message_hmac
    AND a.proposal->>'kind'='supplier_quote'
    AND jsonb_typeof(a.proposal->'lines')='array'
    AND jsonb_array_length(a.proposal->'lines') BETWEEN 1 AND 25)
  )
  AND EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.requests r
   JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.id
    AND i.supplier_key=m.participant_key AND i.state='prepared'
   JOIN cotironda_piloto_privado.participants buyer
    ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
    AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
   WHERE r.state='prepared' AND r.created_at<=m.received_at
    AND r.closes_at>clock_timestamp() AND r.closes_at>m.received_at
    AND (EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
     WHERE d.request_id=r.id AND d.supplier_key=m.participant_key
      AND d.state='api_accepted' AND d.whapi_message_id IS NOT NULL
      AND d.finished_at IS NOT NULL AND d.finished_at<=m.received_at)
     OR EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
     WHERE o.request_id=r.id AND o.supplier_key=m.participant_key
      AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
      AND o.sent_at IS NOT NULL AND o.sent_at<=m.received_at))
  )
 ORDER BY m.received_at,m.message_hmac
 LIMIT 1
 FOR UPDATE OF u,m SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292(
  source_hmac,supplier_key,state)
 VALUES(v_source.message_hmac,v_source.participant_key,'leased')
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_claim=ROW_COUNT;
 IF v_claim<>1 THEN RETURN jsonb_build_object('state','busy');END IF;
 RETURN jsonb_build_object('state','claimed','source_hmac',v_source.message_hmac,
  'chat_hmac',v_source.chat_hmac,'source_sha256',v_source.source_sha256,
  'kind',v_source.kind,
  'nonce',CASE WHEN v_source.kind='text' THEN v_source.nonce_b64 ELSE NULL END,
  'ciphertext',CASE WHEN v_source.kind='text' THEN v_source.ciphertext_b64 ELSE NULL END,
  'mime',CASE WHEN v_source.kind='text' THEN NULL ELSE v_source.mime END,
  'size_bytes',CASE WHEN v_source.kind='text' THEN NULL ELSE v_source.size_bytes END,
  'draft',CASE WHEN v_source.kind='text' THEN NULL ELSE v_source.proposal END);
END $recover$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_auto_recovery_mvp292(
 p_source_hmac text,p_state text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $finish$
DECLARE n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('linked','review','uncertain')
 OR p_reason IS NULL OR p_reason !~ '^[a-z_]{3,60}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292
 SET state=p_state,reason_code=p_reason,finished_at=clock_timestamp()
 WHERE source_hmac=p_source_hmac AND state='leased';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN n=1 THEN 'recorded' ELSE 'not_leased' END);
END $finish$;

-- After a PRIVATE, precisely source-bound auto association, one and only one
-- re-reading of the archived byte sequence. No original is overwritten.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_reserve_archive_replay_mvp292(
 p_source_hmac text,p_chat_hmac text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $replay$
DECLARE v_source record;v_n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT a.content_sha256,a.mime,a.size_bytes,a.proposal
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=decision.source_hmac AND a.content_sha256=decision.source_sha256
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=a.message_hmac AND m.chat_hmac=a.chat_hmac
  AND m.participant_key=a.participant_key
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
  ON link.message_hmac=m.message_hmac AND link.request_id=m.request_id
  AND link.supplier_key=m.participant_key
  AND link.association='semantic_unique_mvp291'
 JOIN cotironda_piloto_privado.requests req ON req.id=m.request_id
 JOIN cotironda_piloto_privado.invitations i
  ON i.request_id=req.id AND i.supplier_key=m.participant_key
 JOIN cotironda_piloto_privado.participants seller
  ON seller.key=m.participant_key AND seller.chat_hmac=m.chat_hmac
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=req.buyer_key
 WHERE m.message_hmac=p_source_hmac AND m.chat_hmac=p_chat_hmac
  AND decision.state='linked' AND decision.selected_request_id=m.request_id
  AND a.state='stored' AND a.request_id=req.id
  AND a.review_state='suggested_only'
  AND a.storage_path='media/'||a.message_hmac
  AND a.mime IN('application/pdf','image/jpeg','image/png','image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain','text/csv')
  AND a.size_bytes BETWEEN 8 AND 8388608
  AND a.proposal->>'kind'='supplier_quote'
  AND a.proposal->>'status'='review_required'
  AND jsonb_typeof(a.proposal->'lines')='array'
  AND jsonb_array_length(a.proposal->'lines') BETWEEN 1 AND 25
  AND req.state='prepared' AND req.closes_at>clock_timestamp()
  AND i.state='prepared'
  AND seller.participant_role='supplier' AND seller.consent_at IS NOT NULL
  AND seller.opted_out_at IS NULL
  AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
  AND buyer.opted_out_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098
   WHERE message_hmac=m.message_hmac)
 FOR UPDATE OF a;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_archive_replay_mvp292
  WHERE source_hmac=p_source_hmac) THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_archive_replay_mvp292
  WHERE claimed_at>clock_timestamp()-interval '24 hours')>=8
 THEN RETURN jsonb_build_object('state','quota');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_archive_replay_mvp292(
  source_hmac,content_sha256,state)
 VALUES(p_source_hmac,v_source.content_sha256,'leased')
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 IF v_n<>1 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 RETURN jsonb_build_object('state','reserved','sha256',v_source.content_sha256,
  'mime',v_source.mime,'size_bytes',v_source.size_bytes,'draft',v_source.proposal);
END $replay$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_archive_replay_mvp292(
 p_source_hmac text,p_state text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $finish$
DECLARE n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('published','review','uncertain')
 OR p_reason IS NULL OR p_reason !~ '^[a-z_]{3,60}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_archive_replay_mvp292
 SET state=p_state,reason_code=p_reason,finished_at=clock_timestamp()
 WHERE source_hmac=p_source_hmac AND state='leased';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN n=1 THEN 'recorded' ELSE 'not_leased' END);
END $finish$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_auto_recovery_mvp292() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_auto_recovery_mvp292(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_reserve_archive_replay_mvp292(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_archive_replay_mvp292(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_auto_recovery_mvp292() TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_auto_recovery_mvp292(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_reserve_archive_replay_mvp292(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_archive_replay_mvp292(text,text,text) TO service_role;
