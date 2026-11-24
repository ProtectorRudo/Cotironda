-- COTIRONDA V2 | CANDIDATE, NOT PUBLISHED.
-- Last resort after ONE abstention by IA Central, NOT a second interpreter.
-- Absolutely no automatic winner/award or messages. Original stays private.
-- Reuse the existing, locked and consent-aware association RPC.
BEGIN;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_auto_correlation_bind_latest_unanswered_v2(
 p_source_hmac text,p_chat_hmac text,p_source_sha256 text,p_request uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_source record;
 v_round record;
 v_n integer:=0;
 v_buyer text;
 v_latest uuid;
 v_previous uuid;
 v_latest_created timestamptz;
 v_result jsonb;
 v_rows integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_request IS NULL THEN RETURN jsonb_build_object('state','invalid');END IF;

 -- Eligibility and lease are checked again with row locks before any bind.
 SELECT m.participant_key,m.received_at INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
  ON u.message_hmac=decision.source_hmac AND u.supplier_key=decision.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=decision.source_hmac AND m.participant_key=decision.supplier_key
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=m.participant_key AND supplier.chat_hmac=m.chat_hmac
 WHERE decision.source_hmac=p_source_hmac AND decision.state='reserved'
  AND decision.source_sha256=p_source_sha256
  AND decision.reserved_at>clock_timestamp()-interval '2 minutes'
  AND u.state='ambiguous_round' AND u.resolved_request_id IS NULL
  AND u.source_sha256=p_source_sha256 AND u.kind=m.kind
  AND m.chat_hmac=p_chat_hmac AND m.request_id IS NULL
  AND m.processing_state IN ('unmatched_quote','needs_review')
  AND m.kind IN('text','document','image')
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 FOR UPDATE OF m,u,decision;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;

 -- ALL relevant eligible dispatched requests at the time the source arrived:
 -- newer active requests and older requests subsequently closed. No cancelled
 -- rounds and no later-created or previously expired requests.
 FOR v_round IN
  SELECT r.id,r.buyer_key,r.created_at,r.state
  FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.invitations i
   ON i.request_id=r.id AND i.supplier_key=v_source.participant_key
   AND i.state='prepared'
  JOIN cotironda_piloto_privado.participants buyer
   ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
   AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  WHERE r.state IN('prepared','closed')
   AND r.created_at<=v_source.received_at
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
  ORDER BY r.created_at DESC,r.id DESC
 LOOP
  v_n:=v_n+1;
  IF v_n>2 THEN RETURN jsonb_build_object('state','multiple_rounds');END IF;
  IF v_n=1 THEN
   v_latest:=v_round.id; v_buyer:=v_round.buyer_key;
   v_latest_created:=v_round.created_at;
   IF v_round.state<>'prepared'
    THEN RETURN jsonb_build_object('state','latest_not_active');END IF;
  ELSE
   IF v_round.buyer_key IS DISTINCT FROM v_buyer
    THEN RETURN jsonb_build_object('state','different_buyers');END IF;
   IF v_round.created_at>=v_latest_created
    THEN RETURN jsonb_build_object('state','non_unique_order');END IF;
   v_previous:=v_round.id;
  END IF;
 END LOOP;
 IF v_n<>2 OR v_latest IS DISTINCT FROM p_request
 THEN RETURN jsonb_build_object('state','not_two_latest');END IF;

 -- Supplier ALREADY responded to the previous round BEFORE this message,
 -- and no quotation has been associated with the latest round.
 IF NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
   JOIN cotironda_piloto_privado.whapi_inbox prior
    ON prior.message_hmac=l.message_hmac
    AND prior.participant_key=l.supplier_key
   WHERE l.request_id=v_previous
    AND l.supplier_key=v_source.participant_key
    AND prior.received_at<v_source.received_at
 ) THEN RETURN jsonb_build_object('state','prior_quote_missing');END IF;
 IF EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
   WHERE l.request_id=v_latest AND l.supplier_key=v_source.participant_key
 ) OR EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.whapi_inbox seen
   WHERE seen.request_id=v_latest
    AND seen.participant_key=v_source.participant_key
 ) OR EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 q
   WHERE q.request_id=v_latest AND q.supplier_key=v_source.participant_key
 ) THEN RETURN jsonb_build_object('state','latest_already_quoted');END IF;

 -- Reuse ALL pre-existing SHA, dispatch, consent, source ownership,
 -- single-link and dedup guards: one transactional, guarded operation.
 SELECT public.cotironda_piloto_auto_correlation_bind_mvp291(
  p_source_hmac,p_chat_hmac,p_source_sha256,p_request
 ) INTO v_result;
 IF v_result->>'state'='linked_private' THEN
  UPDATE cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
  SET reason='last_resort_latest_unanswered_v2'
  WHERE source_hmac=p_source_hmac AND state='linked'
   AND selected_request_id=p_request;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'last_resort_audit_failed';END IF;
 END IF;
 RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_auto_correlation_bind_latest_unanswered_v2(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_auto_correlation_bind_latest_unanswered_v2(text,text,text,uuid) TO service_role;

-- Even a model-selected request must not cross a second buyer during
-- an ambiguous WhatsApp conversation. An explicit reply to an RFQ is
-- handled earlier by the existing deterministic quoted-message pathway.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_auto_correlation_bind_ai_selected_v2(
 p_source_hmac text,p_chat_hmac text,p_source_sha256 text,p_request uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_source record;v_buyers integer;v_candidates integer;v_bound jsonb;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_request IS NULL THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT m.participant_key,m.received_at INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 d
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=d.source_hmac AND m.participant_key=d.supplier_key
 JOIN cotironda_piloto_privado.participants s
  ON s.key=m.participant_key AND s.chat_hmac=m.chat_hmac
 WHERE d.source_hmac=p_source_hmac AND d.state='reserved'
  AND d.source_sha256=p_source_sha256
  AND d.reserved_at>clock_timestamp()-interval '2 minutes'
  AND m.chat_hmac=p_chat_hmac AND m.request_id IS NULL
  AND m.processing_state IN('unmatched_quote','needs_review')
  AND s.participant_role='supplier'
  AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 SELECT count(*),count(DISTINCT candidates.buyer_key)
 INTO v_candidates,v_buyers
 FROM (
  SELECT DISTINCT r.id,r.buyer_key
  FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.invitations i
   ON i.request_id=r.id AND i.supplier_key=v_source.participant_key
   AND i.state='prepared'
  JOIN cotironda_piloto_privado.participants buyer
   ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
   AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  WHERE r.state IN('prepared','closed')
   AND r.created_at<=v_source.received_at
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
 ) candidates;
 IF v_candidates<2 OR v_candidates>8 OR v_buyers<>1
 THEN RETURN jsonb_build_object('state','buyer_isolation_not_verified');END IF;
 SELECT public.cotironda_piloto_auto_correlation_bind_mvp291(
  p_source_hmac,p_chat_hmac,p_source_sha256,p_request
 ) INTO v_bound;
 IF v_bound->>'state'='linked_private' THEN
  UPDATE cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
  SET reason='ai_central_selected_v2'
  WHERE source_hmac=p_source_hmac AND state='linked'
   AND selected_request_id=p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'central_ia_audit_failed';END IF;
 END IF;
 RETURN v_bound;
END $function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_auto_correlation_bind_ai_selected_v2(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_auto_correlation_bind_ai_selected_v2(text,text,text,uuid) TO service_role;
COMMIT;
