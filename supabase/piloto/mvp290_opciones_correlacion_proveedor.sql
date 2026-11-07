-- MVP290: general supplier/round disambiguation without guessing.
-- Development only. No pilot/production deployment in this migration.
-- A buyer/supplier identity is never inferred from material similarity or price.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_choice_prompts_mvp290(
 source_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.ai_supplier_unresolved_mvp237(message_hmac) ON DELETE RESTRICT,
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 state text NOT NULL CHECK(state IN('leased','api_accepted','uncertain')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 whapi_message_id text,
 CONSTRAINT mvp290_prompt_state_date CHECK ((state='leased')=(finished_at IS NULL))
);
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_choice_options_mvp290(
 source_hmac text NOT NULL REFERENCES cotironda_piloto_privado.ai_supplier_choice_prompts_mvp290(source_hmac) ON DELETE RESTRICT,
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 choice_code text NOT NULL CHECK(choice_code ~ '^[a-f0-9]{10}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(source_hmac,request_id),
 UNIQUE(choice_code),
 FOREIGN KEY(request_id,supplier_key) REFERENCES cotironda_piloto_privado.invitations(request_id,supplier_key) ON DELETE RESTRICT
);
ALTER TABLE cotironda_piloto_privado.ai_supplier_choice_prompts_mvp290 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.ai_supplier_choice_options_mvp290 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_choice_prompts_mvp290 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_choice_options_mvp290 FROM PUBLIC,anon,authenticated;

-- A prompt is reserved atomically per SHA-bound original. All targets must
-- have been independently sent before this source arrived. Never choose the
-- newest, most similar product, amount, or customer name.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_reserve_supplier_choice_mvp290(
 p_source_hmac text,p_chat_hmac text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_source record;v_candidate record;v_count integer;v_options jsonb:='[]'::jsonb;v_code text;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags f
   WHERE f.only_row AND f.whatsapp_inbound_enabled AND f.whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT u.supplier_key,u.source_sha256,m.kind,m.received_at INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
 JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.message_hmac=u.message_hmac AND m.participant_key=u.supplier_key
 JOIN cotironda_piloto_privado.participants s
   ON s.key=u.supplier_key AND s.chat_hmac=m.chat_hmac
 WHERE u.message_hmac=p_source_hmac AND m.chat_hmac=p_chat_hmac
  AND u.state='ambiguous_round' AND u.resolved_request_id IS NULL
  AND m.request_id IS NULL AND m.kind=u.kind
  AND m.processing_state IN('unmatched_quote','needs_review')
  AND m.received_at>=clock_timestamp()-interval '24 hours'
  AND s.participant_role='supplier' AND s.consent_at IS NOT NULL
  AND s.opted_out_at IS NULL
  AND ((m.kind='text' AND m.plaintext_sha256=u.source_sha256)
    OR (m.kind IN('document','image') AND EXISTS(
       SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 a
       WHERE a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
       AND a.participant_key=m.participant_key
       AND a.request_id IS NULL AND a.state='stored'
       AND a.review_state='suggested_only'
       AND a.content_sha256=u.source_sha256
       AND a.storage_path='media/'||m.message_hmac)))
 FOR UPDATE OF u,m;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_choice_prompts_mvp290
   WHERE source_hmac=p_source_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_choice_prompts_mvp290 q
    WHERE q.supplier_key=v_source.supplier_key
    AND q.created_at>=clock_timestamp()-interval '24 hours')>=8
 THEN RETURN jsonb_build_object('state','daily_quota');END IF;
 WITH candidates AS (
  SELECT DISTINCT r.id
  FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.id
   AND i.supplier_key=v_source.supplier_key AND i.state='prepared'
  JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
   AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
   AND buyer.opted_out_at IS NULL
  WHERE r.state='prepared' AND r.created_at<=v_source.received_at
   AND r.closes_at>v_source.received_at AND r.closes_at>clock_timestamp()
   AND (
    EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
      WHERE d.request_id=r.id AND d.supplier_key=v_source.supplier_key
       AND d.state='api_accepted' AND d.whapi_message_id IS NOT NULL
       AND d.finished_at IS NOT NULL AND d.finished_at<=v_source.received_at)
    OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
      WHERE o.request_id=r.id AND o.supplier_key=v_source.supplier_key
       AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
       AND o.sent_at IS NOT NULL AND o.sent_at<=v_source.received_at)
   )
 )
 SELECT count(*) INTO v_count FROM candidates;
 IF v_count=0 THEN RETURN jsonb_build_object('state','no_active_dispatched_round');END IF;
 IF v_count>24 THEN RETURN jsonb_build_object('state','quote_original_request_required');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_choice_prompts_mvp290(source_hmac,supplier_key,state)
 VALUES(p_source_hmac,v_source.supplier_key,'leased');
 FOR v_candidate IN
  SELECT r.id,r.created_at,r.delivery_city,
   (SELECT left(regexp_replace(l.original_description,'[[:cntrl:]]',' ','g'),65)
     FROM cotironda_piloto_privado.request_lines l
     WHERE l.request_id=r.id ORDER BY l.line_no LIMIT 1) AS first_line
  FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.id
   AND i.supplier_key=v_source.supplier_key AND i.state='prepared'
  JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
   AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
   AND buyer.opted_out_at IS NULL
  WHERE r.state='prepared' AND r.created_at<=v_source.received_at
   AND r.closes_at>v_source.received_at AND r.closes_at>clock_timestamp()
   AND (EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
      WHERE d.request_id=r.id AND d.supplier_key=v_source.supplier_key
       AND d.state='api_accepted' AND d.whapi_message_id IS NOT NULL
       AND d.finished_at IS NOT NULL AND d.finished_at<=v_source.received_at)
    OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
      WHERE o.request_id=r.id AND o.supplier_key=v_source.supplier_key
       AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
       AND o.sent_at IS NOT NULL AND o.sent_at<=v_source.received_at))
  ORDER BY r.created_at DESC,r.id LIMIT 24
 LOOP
  v_code:=substring(replace(gen_random_uuid()::text,'-','') from 1 for 10);
  INSERT INTO cotironda_piloto_privado.ai_supplier_choice_options_mvp290(
   source_hmac,supplier_key,request_id,choice_code)
  VALUES(p_source_hmac,v_source.supplier_key,v_candidate.id,v_code);
  v_options:=v_options||jsonb_build_array(jsonb_build_object(
   'code',v_code,'date',to_char(v_candidate.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires','DD/MM'),
   'city',left(v_candidate.delivery_city,50),
   'material',coalesce(v_candidate.first_line,'Pedido de materiales')));
 END LOOP;
 IF jsonb_array_length(v_options)<>v_count THEN
  RAISE EXCEPTION 'mvp290_candidate_count_changed' USING errcode='23514';
 END IF;
 RETURN jsonb_build_object('state','reserved','options',v_options);
END $body$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_supplier_choice_mvp290(
 p_source_hmac text,p_state text,p_whapi_message_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('api_accepted','uncertain')
 OR (p_state='api_accepted' AND
    (p_whapi_message_id IS NULL OR p_whapi_message_id !~ '^[A-Za-z0-9._:-]{8,160}$'))
 OR (p_state='uncertain' AND p_whapi_message_id IS NOT NULL)
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_choice_prompts_mvp290
 SET state=p_state,finished_at=clock_timestamp(),whapi_message_id=p_whapi_message_id
 WHERE source_hmac=p_source_hmac AND state='leased';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN n=1 THEN 'recorded' ELSE 'not_leased' END);
END $body$;

-- Supplier replies to the private per-round code, never to an unbound
-- "yes", a stale code, an LLM guess or a different WhatsApp contact.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_resolve_supplier_choice_mvp290(
 p_reply_hmac text,p_chat_hmac text,p_original_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_source record;v_reply record;v_code text;v_n integer;
BEGIN
 IF p_reply_hmac IS NULL OR p_reply_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_original_text IS NULL OR p_original_text !~ '^COTI [a-f0-9]{10}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 v_code:=substring(p_original_text from 6);
 SELECT reply.received_at,reply.participant_key INTO v_reply
 FROM cotironda_piloto_privado.whapi_inbox reply
 JOIN cotironda_piloto_privado.participants supplier ON
   supplier.key=reply.participant_key AND supplier.chat_hmac=reply.chat_hmac
 WHERE reply.message_hmac=p_reply_hmac AND reply.chat_hmac=p_chat_hmac
  AND reply.kind='text' AND reply.request_id IS NULL
  AND reply.processing_state IN('needs_review','unmatched_quote')
  AND reply.plaintext_sha256=encode(sha256(convert_to(p_original_text,'UTF8')),'hex')
  AND supplier.participant_role='supplier' AND supplier.consent_at IS NOT NULL
  AND supplier.opted_out_at IS NULL
 FOR UPDATE OF reply;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 SELECT choices.source_hmac,choices.request_id,choices.supplier_key,
  source.kind,source.received_at AS source_at,unresolved.source_sha256
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_choice_options_mvp290 choices
 JOIN cotironda_piloto_privado.ai_supplier_choice_prompts_mvp290 prompt
  ON prompt.source_hmac=choices.source_hmac AND prompt.supplier_key=choices.supplier_key
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 unresolved
  ON unresolved.message_hmac=choices.source_hmac
   AND unresolved.supplier_key=choices.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox source
  ON source.message_hmac=choices.source_hmac AND source.participant_key=choices.supplier_key
 JOIN cotironda_piloto_privado.requests r ON r.id=choices.request_id
 JOIN cotironda_piloto_privado.invitations invitation
  ON invitation.request_id=r.id AND invitation.supplier_key=choices.supplier_key
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=choices.supplier_key AND supplier.chat_hmac=source.chat_hmac
 WHERE choices.choice_code=v_code
  AND choices.supplier_key=v_reply.participant_key
  AND source.chat_hmac=p_chat_hmac AND source.kind=unresolved.kind
  AND source.request_id IS NULL AND unresolved.resolved_request_id IS NULL
  AND unresolved.state='ambiguous_round'
  AND source.processing_state IN('needs_review','unmatched_quote')
  AND prompt.state IN('api_accepted','uncertain')
  AND prompt.finished_at<=v_reply.received_at
  AND v_reply.received_at>=source.received_at
  AND v_reply.received_at<=prompt.finished_at+interval '48 hours'
  AND r.state='prepared' AND r.created_at<=source.received_at
  AND r.closes_at>v_reply.received_at AND r.closes_at>clock_timestamp()
  AND invitation.state='prepared'
  AND supplier.participant_role='supplier' AND supplier.consent_at IS NOT NULL
  AND supplier.opted_out_at IS NULL
  AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
  AND buyer.opted_out_at IS NULL
  AND ((source.kind='text' AND source.plaintext_sha256=unresolved.source_sha256)
    OR (source.kind IN('document','image') AND EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 a
     WHERE a.message_hmac=source.message_hmac AND a.participant_key=choices.supplier_key
      AND a.chat_hmac=p_chat_hmac AND a.request_id IS NULL
      AND a.state='stored' AND a.review_state='suggested_only'
      AND a.storage_path='media/'||source.message_hmac
      AND a.content_sha256=unresolved.source_sha256)))
  AND (EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
    WHERE d.request_id=r.id AND d.supplier_key=choices.supplier_key
     AND d.state='api_accepted' AND d.whapi_message_id IS NOT NULL
     AND d.finished_at IS NOT NULL AND d.finished_at<=source.received_at)
    OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
    WHERE o.request_id=r.id AND o.supplier_key=choices.supplier_key
     AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
     AND o.sent_at IS NOT NULL AND o.sent_at<=source.received_at))
 FOR UPDATE OF source,unresolved;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 UPDATE cotironda_piloto_privado.whapi_inbox source
 SET request_id=v_source.request_id,processing_state='needs_review'
 WHERE source.message_hmac=v_source.source_hmac AND source.request_id IS NULL
   AND source.participant_key=v_source.supplier_key;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 IF v_n<>1 THEN RAISE EXCEPTION 'mvp290_source_race';END IF;
 IF v_source.kind IN('document','image') THEN
  UPDATE cotironda_piloto_privado.media_archive_mvp095 a
  SET request_id=v_source.request_id
  WHERE a.message_hmac=v_source.source_hmac
    AND a.participant_key=v_source.supplier_key
    AND a.request_id IS NULL AND a.state='stored'
    AND a.content_sha256=v_source.source_sha256;
  GET DIAGNOSTICS v_n=ROW_COUNT;
  IF v_n<>1 THEN RAISE EXCEPTION 'mvp290_media_race';END IF;
 END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225(
  message_hmac,request_id,supplier_key,kind,association,source_sha256)
 VALUES(v_source.source_hmac,v_source.request_id,v_source.supplier_key,
  v_source.kind,'clarified_supplier_reply',v_source.source_sha256);
 UPDATE cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 SET resolved_request_id=v_source.request_id,resolved_at=clock_timestamp()
 WHERE message_hmac=v_source.source_hmac AND resolved_request_id IS NULL;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 IF v_n<>1 THEN RAISE EXCEPTION 'mvp290_resolution_race';END IF;
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET request_id=v_source.request_id,processing_state='needs_review'
 WHERE message_hmac=p_reply_hmac AND request_id IS NULL
  AND participant_key=v_source.supplier_key;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 IF v_n<>1 THEN RAISE EXCEPTION 'mvp290_reply_race';END IF;
 RETURN jsonb_build_object('state','resolved_private',
  'source_hmac',v_source.source_hmac,'source_kind',v_source.kind);
END $body$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_reserve_supplier_choice_mvp290(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_supplier_choice_mvp290(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_resolve_supplier_choice_mvp290(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_reserve_supplier_choice_mvp290(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_supplier_choice_mvp290(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_resolve_supplier_choice_mvp290(text,text,text) TO service_role;
