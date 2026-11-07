-- MVP292: free supplier WhatsApp text uses the SAME double-IA,
-- deterministic margin and private SQL ownership checks as PDFs.
-- No additional user action or outbound messages. Runs after MVP291.
-- Text material observations are private and source-hash tied. Only a
-- verified, signed supplier WhatsApp and two independent evidence checked
-- readings can stage this NON-COMMERCIAL, non-price snapshot.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_text_materials_mvp292(
 source_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.ai_supplier_unresolved_mvp237(message_hmac) ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 materials jsonb NOT NULL CHECK(jsonb_typeof(materials)='array' AND jsonb_array_length(materials) BETWEEN 1 AND 25),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.ai_supplier_text_materials_mvp292 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_text_materials_mvp292
 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_stage_supplier_text_mvp292(
 p_source_hmac text,p_chat_hmac text,p_source_sha256 text,p_materials jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $stage$
DECLARE v_n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_materials IS NULL OR jsonb_typeof(p_materials)<>'array'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF jsonb_array_length(p_materials) NOT BETWEEN 1 AND 25
 OR length(p_materials::text)>14000 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_materials) WITH ORDINALITY line(item,n)
  WHERE jsonb_typeof(line.item)<>'object'
   OR (SELECT count(*) FROM jsonb_object_keys(line.item))<>4
   OR jsonb_typeof(line.item->'line_no')<>'number'
   OR line.item->>'line_no'<>line.n::text
   OR jsonb_typeof(line.item->'description')<>'string'
   OR length(line.item->>'description') NOT BETWEEN 2 AND 280
   OR (line.item->>'description') ~ '[[:cntrl:]]'
   OR (line.item->>'description') ~* '(https?://|www\\.|@|\\$|precio|total)'
   OR jsonb_typeof(line.item->'quantity') NOT IN('string','null')
   OR jsonb_typeof(line.item->'unit') NOT IN('string','null')
 ) THEN RETURN jsonb_build_object('state','invalid_materials');END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.whapi_inbox m
  JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
    ON u.message_hmac=m.message_hmac AND u.supplier_key=m.participant_key
  JOIN cotironda_piloto_privado.participants supplier
    ON supplier.key=m.participant_key AND supplier.chat_hmac=m.chat_hmac
  WHERE m.message_hmac=p_source_hmac AND m.chat_hmac=p_chat_hmac
   AND m.kind='text' AND m.request_id IS NULL
   AND m.processing_state IN('needs_review','unmatched_quote')
   AND m.nonce_b64 IS NOT NULL AND m.ciphertext_b64 IS NOT NULL
   AND m.plaintext_sha256=p_source_sha256 AND u.source_sha256=p_source_sha256
   AND u.state='ambiguous_round' AND u.resolved_request_id IS NULL
   AND supplier.participant_role='supplier' AND supplier.consent_at IS NOT NULL
   AND supplier.opted_out_at IS NULL
 ) THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_text_materials_mvp292(
  source_hmac,source_sha256,materials)
 VALUES(p_source_hmac,p_source_sha256,p_materials)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN v_n=1 THEN 'staged' ELSE 'already_staged' END);
END $stage$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_stage_supplier_text_mvp292(text,text,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_stage_supplier_text_mvp292(text,text,text,jsonb)
 TO service_role;

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
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
    WHERE source_hmac=p_source_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
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
  'candidates',v_list,'note',CASE WHEN v_source.kind='text' THEN NULL ELSE v_source.proposal->>'requested_delivery_note' END);
END $body$;


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
 SELECT m.participant_key,m.received_at,m.kind,
  coalesce(a.content_sha256,m.plaintext_sha256) AS content_sha256
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
  ON u.message_hmac=decision.source_hmac AND u.supplier_key=decision.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=decision.source_hmac
  AND m.participant_key=decision.supplier_key
 LEFT JOIN cotironda_piloto_privado.media_archive_mvp095 a
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
  AND m.chat_hmac=p_chat_hmac AND m.kind IN('text','document','image')
  AND m.request_id IS NULL
  AND m.processing_state IN('needs_review','unmatched_quote')
  AND u.state='ambiguous_round' AND u.resolved_request_id IS NULL
  AND u.kind=m.kind
  AND u.source_sha256=coalesce(a.content_sha256,m.plaintext_sha256)
  AND (
   (m.kind='text' AND a.message_hmac IS NULL
    AND m.plaintext_sha256=p_source_sha256
    AND m.nonce_b64 IS NOT NULL AND m.ciphertext_b64 IS NOT NULL
    AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_text_materials_mvp292 t
      WHERE t.source_hmac=m.message_hmac AND t.source_sha256=m.plaintext_sha256))
   OR
   (m.kind IN('document','image') AND a.state='stored'
    AND a.request_id IS NULL AND a.review_state='suggested_only'
    AND a.content_sha256=p_source_sha256
    AND a.storage_path='media/'||m.message_hmac
    AND a.proposal->>'kind'='supplier_quote')
  )
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
 FOR UPDATE OF m,u,decision;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 -- Commit source and audit records atomically. Never use guessed prices.
 UPDATE cotironda_piloto_privado.whapi_inbox SET request_id=p_request,
  processing_state='needs_review'
 WHERE message_hmac=p_source_hmac AND request_id IS NULL;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp291_inbox_race';END IF;
 IF v_source.kind IN('document','image') THEN
  UPDATE cotironda_piloto_privado.media_archive_mvp095
  SET request_id=p_request WHERE message_hmac=p_source_hmac
   AND request_id IS NULL AND content_sha256=p_source_sha256
   AND state='stored';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'mvp292_archive_race';END IF;
 END IF;
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


