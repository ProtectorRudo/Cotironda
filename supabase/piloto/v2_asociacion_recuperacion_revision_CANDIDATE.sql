-- CANDIDATE ONLY: deploy solely with PUBLICALO authorization.
-- An attempted source is eligible for one replay per semantic-model revision,
-- capped at three total attempts, with immutable prior decisions preserved.
BEGIN;
ALTER TABLE cotironda_piloto_privado.ai_supplier_quantity_review_v2
 ADD COLUMN revision text NOT NULL DEFAULT 'v2_initial';
ALTER TABLE cotironda_piloto_privado.ai_supplier_quantity_review_v2
 DROP CONSTRAINT ai_supplier_quantity_review_v2_pkey;
ALTER TABLE cotironda_piloto_privado.ai_supplier_quantity_review_v2
 ADD CONSTRAINT ai_supplier_quantity_review_v2_pkey PRIMARY KEY (source_hmac,revision);
ALTER TABLE cotironda_piloto_privado.ai_supplier_quantity_review_v2
 ADD CONSTRAINT ai_supplier_quantity_review_v2_revision_check
 CHECK(revision='v2_initial' OR revision ~ '^[a-f0-9]{40}$');
CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_revision_review_v2(p_revision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_source record;v_claim integer;
BEGIN
 IF p_revision IS NULL OR p_revision !~ '^[a-f0-9]{40}$'
 THEN RETURN jsonb_build_object('state','invalid_revision');END IF;
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
  AND m.kind='text'
  AND u.kind=m.kind
  AND m.received_at>=clock_timestamp()-interval '7 days'
  AND seller.participant_role='supplier' AND seller.consent_at IS NOT NULL
  AND seller.opted_out_at IS NULL
  -- Do not reprocess an already retried source. An earlier private
  -- recovery may have failed material fidelity BEFORE MVP349; only that
  -- exact, completed historical failure may enter ONE further retry.
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_recovery_second_attempt_mvp351 prior
   WHERE prior.source_hmac=m.message_hmac)
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292 rec
   WHERE rec.source_hmac=m.message_hmac AND rec.supplier_key=m.participant_key
    AND rec.state='review' AND rec.reason_code='multiple_indistinguishable_rounds'
    AND rec.finished_at IS NOT NULL)
  AND EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 log
   WHERE log.source_hmac=m.message_hmac
    AND log.supplier_key=m.participant_key
    AND log.source_sha256=u.source_sha256
    AND log.state='review' AND log.reason IN ('non_unique_material','model_abstained')
    AND log.finished_at IS NOT NULL)
  AND EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_correlation_retries_v2 prior
   WHERE prior.source_hmac=m.message_hmac AND prior.supplier_key=m.participant_key
    AND prior.source_sha256=u.source_sha256)
  AND EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_quantity_review_v2 initial
   WHERE initial.source_hmac=m.message_hmac AND initial.revision='v2_initial')
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_quantity_review_v2 audit
   WHERE audit.source_hmac=m.message_hmac AND audit.revision=p_revision)
  AND (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_quantity_review_v2 audit
   WHERE audit.source_hmac=m.message_hmac)<3
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
 INSERT INTO cotironda_piloto_privado.ai_supplier_quantity_review_v2(
  source_hmac,supplier_key,source_sha256,previous_correlation_reason,
  previous_recovery_reason,previous_recovery_finished_at,revision)
 SELECT v_source.message_hmac,v_source.participant_key,v_source.source_sha256,
  prev.reason,rec.reason_code,rec.finished_at,p_revision
 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 prev
 JOIN cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292 rec
  ON rec.source_hmac=prev.source_hmac AND rec.supplier_key=prev.supplier_key
 WHERE prev.source_hmac=v_source.message_hmac
  AND prev.supplier_key=v_source.participant_key
  AND prev.state='review' AND prev.reason IN ('non_unique_material','model_abstained')
  AND prev.finished_at IS NOT NULL
  AND rec.state='review' AND rec.reason_code='multiple_indistinguishable_rounds'
  AND rec.finished_at IS NOT NULL
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_claim=ROW_COUNT;
 IF v_claim<>1 THEN RETURN jsonb_build_object('state','busy');END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292
 SET state='leased',reason_code=NULL,claimed_at=clock_timestamp(),finished_at=NULL
 WHERE source_hmac=v_source.message_hmac AND supplier_key=v_source.participant_key
  AND state='review' AND reason_code='multiple_indistinguishable_rounds'
  AND finished_at IS NOT NULL;
 GET DIAGNOSTICS v_claim=ROW_COUNT;
 IF v_claim<>1 THEN RAISE EXCEPTION 'revision_review_claim_race';END IF;
 RETURN jsonb_build_object('state','claimed','retry_reviewed',false,'retry_quantity',true,'source_hmac',v_source.message_hmac,
  'chat_hmac',v_source.chat_hmac,'source_sha256',v_source.source_sha256,
  'kind',v_source.kind,
  'nonce',CASE WHEN v_source.kind='text' THEN v_source.nonce_b64 ELSE NULL END,
  'ciphertext',CASE WHEN v_source.kind='text' THEN v_source.ciphertext_b64 ELSE NULL END,
  'mime',CASE WHEN v_source.kind='text' THEN NULL ELSE v_source.mime END,
  'size_bytes',CASE WHEN v_source.kind='text' THEN NULL ELSE v_source.size_bytes END,
  'draft',CASE WHEN v_source.kind='text' THEN NULL ELSE v_source.proposal END);
END $function$
;
REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_revision_review_v2(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_revision_review_v2(text) TO service_role;
-- Preserve original two/day supplier quota; a current, immutable
-- semantic-revision entry may use the same source's one additional lease.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_auto_correlation_retry_quantity_prepare_v2(p_source_hmac text, p_chat_hmac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_source record;v_request record;v_quote jsonb;v_list jsonb:='[]'::jsonb;
 v_lines jsonb;v_count int:=0;v_active int:=0;v_candidates int;v_existing int;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292 rec
  WHERE rec.source_hmac=p_source_hmac AND rec.state='leased'
   AND rec.claimed_at>clock_timestamp()-interval '2 minutes'
 ) THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags f
  WHERE f.only_row AND f.whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT m.message_hmac,m.chat_hmac,m.participant_key,m.received_at,
  coalesce(a.content_sha256,t.source_sha256) AS content_sha256,
  a.proposal,t.materials,m.kind
 INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 LEFT JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
  AND a.participant_key=m.participant_key
 LEFT JOIN cotironda_piloto_privado.ai_supplier_text_materials_mvp292 t
  ON t.source_hmac=m.message_hmac
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
  ON u.message_hmac=m.message_hmac AND u.supplier_key=m.participant_key
  AND u.source_sha256=coalesce(a.content_sha256,t.source_sha256)
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=m.participant_key AND supplier.chat_hmac=m.chat_hmac
 WHERE m.message_hmac=p_source_hmac AND m.chat_hmac=p_chat_hmac
  AND m.kind IN('text','document','image') AND m.request_id IS NULL
  AND m.processing_state IN('needs_review','unmatched_quote')
  AND u.state='ambiguous_round' AND u.resolved_request_id IS NULL
  AND u.kind=m.kind
  AND (
   (m.kind='text' AND a.message_hmac IS NULL AND t.source_sha256=m.plaintext_sha256
    AND m.nonce_b64 IS NOT NULL AND m.ciphertext_b64 IS NOT NULL)
   OR
   (m.kind IN('document','image') AND a.request_id IS NULL AND a.state='stored'
    AND a.review_state='suggested_only'
    AND a.content_sha256 ~ '^[a-f0-9]{64}$'
    AND a.storage_path='media/'||m.message_hmac
    AND a.size_bytes BETWEEN 8 AND 8388608
    AND a.proposal->>'kind'='supplier_quote'
    AND a.proposal->>'status'='review_required'
    AND jsonb_typeof(a.proposal->'lines')='array'
    AND jsonb_array_length(a.proposal->'lines') BETWEEN 1 AND 25)
  )
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 FOR UPDATE OF m,u;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF v_source.kind <> 'text'
 THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 prior
  WHERE prior.source_hmac=p_source_hmac
   AND prior.supplier_key=v_source.participant_key
   AND prior.source_sha256=v_source.content_sha256
   AND prior.state='review'
   AND prior.reason IN ('non_unique_material','model_abstained')
   AND prior.finished_at IS NOT NULL
 ) THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_supplier_quantity_review_v2 audit
  WHERE audit.source_hmac=p_source_hmac AND audit.supplier_key=v_source.participant_key
   AND audit.source_sha256=v_source.content_sha256
   AND audit.previous_correlation_reason IN ('non_unique_material','model_abstained')
   AND audit.previous_recovery_reason='multiple_indistinguishable_rounds'
   AND audit.recorded_at>clock_timestamp()-interval '2 minutes'
 ) THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_quantity_review_v2
  WHERE supplier_key=v_source.participant_key
  AND recorded_at>clock_timestamp()-interval '24 hours')>=2
 AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_quantity_review_v2 revision
  WHERE revision.source_hmac=p_source_hmac AND revision.supplier_key=v_source.participant_key
   AND revision.revision ~ '^[a-f0-9]{40}$'
   AND revision.recorded_at>clock_timestamp()-interval '2 minutes')
 THEN RETURN jsonb_build_object('state','retry_daily_quota');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
    WHERE supplier_key=v_source.participant_key
      AND reserved_at>=clock_timestamp()-interval '24 hours')>=10
 THEN RETURN jsonb_build_object('state','daily_quota');END IF;
 -- Text observations were independently validated against exact
 -- original WhatsApp substrings. No monetary text or contact is returned.
 IF v_source.kind='text' THEN
  v_quote:=v_source.materials;
 ELSE
  SELECT jsonb_agg(jsonb_build_object(
   'line_no',x.ordinality,'description',x.value->>'original_description',
   'quantity',x.value->>'quantity','unit',x.value->>'unit') ORDER BY x.ordinality)
  INTO v_quote
  FROM jsonb_array_elements(v_source.proposal->'lines')
   WITH ORDINALITY x(value,ordinality);
 END IF;
 IF v_quote IS NULL OR jsonb_typeof(v_quote)<>'array' OR jsonb_array_length(v_quote) NOT BETWEEN 1 AND 25
 THEN RETURN jsonb_build_object('state','invalid_quote');END IF;

 FOR v_request IN
  SELECT DISTINCT r.id,r.created_at,r.state
  FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.id
   AND i.supplier_key=v_source.participant_key AND i.state='prepared'
  JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
   AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
   AND buyer.opted_out_at IS NULL
  -- Compare against the rounds genuinely available at MESSAGE ARRIVAL.
  -- A later-closed round remains a negative control, NEVER a bind target.
  WHERE r.state IN('prepared','closed') AND r.created_at<=v_source.received_at
   AND r.closes_at>v_source.received_at
   AND ((r.state='prepared' AND r.closes_at>clock_timestamp())
     OR (r.state='closed' AND r.closed_at IS NOT NULL
         AND r.closed_at>v_source.received_at))
   AND (EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
     WHERE d.request_id=r.id AND d.supplier_key=v_source.participant_key
      AND d.state='api_accepted' AND d.whapi_message_id IS NOT NULL
      AND d.finished_at IS NOT NULL AND d.finished_at<=v_source.received_at)
    OR EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
     WHERE o.request_id=r.id AND o.supplier_key=v_source.participant_key
      AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
      AND o.sent_at IS NOT NULL AND o.sent_at<=v_source.received_at))
  ORDER BY r.created_at DESC,r.id
 LOOP
  v_count:=v_count+1;
  IF v_request.state='prepared' THEN v_active:=v_active+1;END IF;
  IF v_count>8 THEN RETURN jsonb_build_object('state','too_many_candidates');END IF;
  -- Central maps only what this supplier was actually sent.
  -- Older invitations may predate per-supplier line maps: use all request
  -- lines there only when a legacy Whapi outbox proves actual delivery.
  SELECT jsonb_agg(jsonb_build_object(
    'line_no',rl.line_no,'description',rl.original_description,
    'quantity',rl.quantity::text,'unit',rl.unit) ORDER BY rl.line_no)
  INTO v_lines
  FROM cotironda_piloto_privado.request_lines rl
  WHERE rl.request_id=v_request.id
   AND (EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
      WHERE d.request_id=rl.request_id AND d.line_no=rl.line_no
       AND d.supplier_key=v_source.participant_key)
    OR (NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
                  WHERE sh.request_id=rl.request_id)
      AND (NOT EXISTS(
       SELECT 1 FROM cotironda_piloto_privado.invitation_lines_mvp099 il
       WHERE il.request_id=rl.request_id AND il.supplier_key=v_source.participant_key)
       OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.invitation_lines_mvp099 il
       WHERE il.request_id=rl.request_id AND il.supplier_key=v_source.participant_key
         AND il.line_no=rl.line_no))));
  IF v_lines IS NULL OR jsonb_array_length(v_lines)>25
   THEN RETURN jsonb_build_object('state','incomplete_supplier_snapshot');END IF;
  v_list:=v_list||jsonb_build_array(jsonb_build_object(
   'request_id',v_request.id,'lines',v_lines,
   'bind_allowed',(v_request.state='prepared')));
 END LOOP;
 IF v_active<1 THEN RETURN jsonb_build_object('state','no_live_round');END IF;
 IF v_count<2 THEN RETURN jsonb_build_object('state','not_ambiguous_anymore');END IF;
 -- Reclaim was already recorded by the one-shot audited claim above.
 UPDATE cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
 SET state='reserved',reason=NULL,finished_at=NULL,reserved_at=clock_timestamp()
 WHERE source_hmac=p_source_hmac AND supplier_key=v_source.participant_key
  AND source_sha256=v_source.content_sha256
  AND state='review' AND reason IN ('non_unique_material','model_abstained');
 GET DIAGNOSTICS v_existing=ROW_COUNT;
 IF v_existing<>1 THEN RAISE EXCEPTION 'v2_quantity_retry_race';END IF;
 RETURN jsonb_build_object('state','reserved',
  'source_sha256',v_source.content_sha256,'quote',v_quote,
  'candidates',v_list,'note',CASE WHEN v_source.kind='text' THEN NULL ELSE v_source.proposal->>'requested_delivery_note' END);
END $function$
;
REVOKE ALL ON FUNCTION public.cotironda_piloto_auto_correlation_retry_quantity_prepare_v2(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_auto_correlation_retry_quantity_prepare_v2(text,text) TO service_role;
COMMIT;
