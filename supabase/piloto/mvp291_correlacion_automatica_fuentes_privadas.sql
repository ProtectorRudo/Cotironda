-- MVP291: AI-assisted AUTOMATIC supplier-source correlation.
-- Two independent model readings propose links, but ONLY SQL can bind one
-- original to a dispatched round. No supplier/buyer prompt, no Whapi, no price.
-- Develop/test only until explicitly authorized for cotironda-piloto.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291(
 source_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.ai_supplier_unresolved_mvp237(message_hmac) ON DELETE RESTRICT,
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN('reserved','linked','review')),
 reason text,
 selected_request_id uuid REFERENCES cotironda_piloto_privado.requests(id),
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CHECK ((state='reserved')=(finished_at IS NULL)),
 CHECK ((state='linked')=(selected_request_id IS NOT NULL))
);
ALTER TABLE cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 FROM PUBLIC,anon,authenticated;
-- Retain all existing association values; the new one explicitly records
-- that the decision came from two model readings plus deterministic gates.
ALTER TABLE cotironda_piloto_privado.ai_supplier_links_mvp225
 DROP CONSTRAINT IF EXISTS ai_supplier_links_mvp225_association_check;
ALTER TABLE cotironda_piloto_privado.ai_supplier_links_mvp225
 ADD CONSTRAINT ai_supplier_links_mvp225_association_check
 CHECK(association IN('quoted_whapi_id','single_active_round',
  'prior_supplier_preamble','clarified_supplier_reply','semantic_unique_mvp291'));

-- Private candidate pool. Duplicated here and in commit to avoid a model
-- crossing time/consent boundaries. Legacy and central work side-by-side.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_auto_correlation_prepare_mvp291(
 p_source_hmac text,p_chat_hmac text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_source record;v_request record;v_quote jsonb;v_list jsonb:='[]'::jsonb;
 v_lines jsonb;v_count int:=0;v_candidates int;v_existing int;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags f
  WHERE f.only_row AND f.whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT m.message_hmac,m.chat_hmac,m.participant_key,m.received_at,
  a.content_sha256,a.proposal
 INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
  AND a.participant_key=m.participant_key
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
  ON u.message_hmac=m.message_hmac AND u.supplier_key=m.participant_key
  AND u.source_sha256=a.content_sha256
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=m.participant_key AND supplier.chat_hmac=m.chat_hmac
 WHERE m.message_hmac=p_source_hmac AND m.chat_hmac=p_chat_hmac
  AND m.kind IN('document','image') AND m.request_id IS NULL
  AND m.processing_state='needs_review'
  AND u.state='ambiguous_round' AND u.resolved_request_id IS NULL
  AND a.request_id IS NULL AND a.state='stored'
  AND a.review_state='suggested_only'
  AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  AND a.storage_path='media/'||m.message_hmac
  AND a.size_bytes BETWEEN 8 AND 8388608
  AND a.proposal->>'kind'='supplier_quote'
  AND a.proposal->>'status'='review_required'
  AND jsonb_typeof(a.proposal->'lines')='array'
  AND jsonb_array_length(a.proposal->'lines') BETWEEN 1 AND 25
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 FOR UPDATE OF m,a,u;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
    WHERE source_hmac=p_source_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
    WHERE supplier_key=v_source.participant_key
      AND reserved_at>=clock_timestamp()-interval '24 hours')>=10
 THEN RETURN jsonb_build_object('state','daily_quota');END IF;
 -- Exactly the lines from the supplier's original immutable draft; never
 -- pass prices, private buyer identity, phones, files, totals or hashes to IA.
 SELECT jsonb_agg(jsonb_build_object(
  'line_no',x.ordinality,'description',x.value->>'original_description',
  'quantity',x.value->>'quantity','unit',x.value->>'unit') ORDER BY x.ordinality)
 INTO v_quote
 FROM jsonb_array_elements(v_source.proposal->'lines')
  WITH ORDINALITY x(value,ordinality);
 IF v_quote IS NULL THEN RETURN jsonb_build_object('state','invalid_quote');END IF;

 FOR v_request IN
  SELECT DISTINCT r.id,r.created_at
  FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.id
   AND i.supplier_key=v_source.participant_key AND i.state='prepared'
  JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
   AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
   AND buyer.opted_out_at IS NULL
  WHERE r.state='prepared' AND r.created_at<=v_source.received_at
   AND r.closes_at>v_source.received_at AND r.closes_at>clock_timestamp()
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
   'request_id',v_request.id,'lines',v_lines));
 END LOOP;
 IF v_count<2 THEN RETURN jsonb_build_object('state','not_ambiguous_anymore');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291(
  source_hmac,supplier_key,source_sha256,state)
 VALUES(p_source_hmac,v_source.participant_key,v_source.content_sha256,'reserved')
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_existing=ROW_COUNT;
 IF v_existing<>1 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 RETURN jsonb_build_object('state','reserved',
  'source_sha256',v_source.content_sha256,'quote',v_quote,
  'candidates',v_list,'note',v_source.proposal->>'requested_delivery_note');
END $body$;

-- The sole write authority after BOTH model readings agree on a unique
-- best candidate with quantitative evidence.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_auto_correlation_bind_mvp291(
 p_source_hmac text,p_chat_hmac text,p_source_sha256 text,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_source record;v_rows int;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_request IS NULL THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT m.participant_key,m.received_at,m.kind,a.content_sha256
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
  ON u.message_hmac=decision.source_hmac AND u.supplier_key=decision.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=decision.source_hmac
  AND m.participant_key=decision.supplier_key
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
  AND a.participant_key=m.participant_key
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=m.participant_key AND supplier.chat_hmac=m.chat_hmac
 JOIN cotironda_piloto_privado.requests r ON r.id=p_request
 JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.id
  AND i.supplier_key=m.participant_key
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 WHERE decision.source_hmac=p_source_hmac AND decision.state='reserved'
  AND decision.source_sha256=p_source_sha256 AND decision.reserved_at>=clock_timestamp()-interval '2 minutes'
  AND m.chat_hmac=p_chat_hmac AND m.kind IN('document','image')
  AND m.request_id IS NULL AND m.processing_state='needs_review'
  AND u.state='ambiguous_round' AND u.resolved_request_id IS NULL
  AND u.source_sha256=a.content_sha256
  AND a.state='stored' AND a.request_id IS NULL
  AND a.review_state='suggested_only' AND a.content_sha256=p_source_sha256
  AND a.storage_path='media/'||m.message_hmac
  AND a.proposal->>'kind'='supplier_quote'
  AND r.state='prepared' AND r.created_at<=m.received_at
  AND r.closes_at>m.received_at AND r.closes_at>clock_timestamp()
  AND i.state='prepared'
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND (EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
    WHERE d.request_id=p_request AND d.supplier_key=m.participant_key
     AND d.state='api_accepted' AND d.whapi_message_id IS NOT NULL
     AND d.finished_at IS NOT NULL AND d.finished_at<=m.received_at)
   OR EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
    WHERE o.request_id=p_request AND o.supplier_key=m.participant_key
     AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
     AND o.sent_at IS NOT NULL AND o.sent_at<=m.received_at))
 FOR UPDATE OF m,a,u,decision;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 -- Commit source and audit records atomically. Never use guessed prices.
 UPDATE cotironda_piloto_privado.whapi_inbox SET request_id=p_request,
  processing_state='needs_review'
 WHERE message_hmac=p_source_hmac AND request_id IS NULL;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp291_inbox_race';END IF;
 UPDATE cotironda_piloto_privado.media_archive_mvp095
 SET request_id=p_request WHERE message_hmac=p_source_hmac
  AND request_id IS NULL AND content_sha256=p_source_sha256
  AND state='stored';
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp291_archive_race';END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225(
  message_hmac,request_id,supplier_key,kind,association,source_sha256)
 VALUES(p_source_hmac,p_request,v_source.participant_key,
  v_source.kind,'semantic_unique_mvp291',p_source_sha256);
 UPDATE cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 SET resolved_request_id=p_request,resolved_at=clock_timestamp()
 WHERE message_hmac=p_source_hmac AND resolved_request_id IS NULL;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp291_ledger_race';END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
 SET state='linked',selected_request_id=p_request,
  reason='double_model_unique_margin',finished_at=clock_timestamp()
 WHERE source_hmac=p_source_hmac AND state='reserved';
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp291_decision_race';END IF;
 RETURN jsonb_build_object('state','linked_private');
END $body$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_auto_correlation_finish_mvp291(
 p_source_hmac text,p_state text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_state<>'review' OR p_reason IS NULL OR p_reason !~ '^[a-z_]{3,60}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
 SET state='review',reason=p_reason,finished_at=clock_timestamp()
 WHERE source_hmac=p_source_hmac AND state='reserved';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN n=1 THEN 'recorded' ELSE 'not_reserved' END);
END $body$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_auto_correlation_prepare_mvp291(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_auto_correlation_bind_mvp291(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_auto_correlation_finish_mvp291(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_auto_correlation_prepare_mvp291(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_auto_correlation_bind_mvp291(text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_auto_correlation_finish_mvp291(text,text,text) TO service_role;
