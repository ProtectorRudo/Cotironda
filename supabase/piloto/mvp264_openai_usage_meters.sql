-- MVP264 Etapa 7: durable metering of REAL OpenAI Responses API tokens.
-- Feature flag is OFF by default in Edge. No API calls from SQL.
-- Monetary cost is ALWAYS unknown until reconciled with verified provider rates/invoices.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.ai_central_attempts_mvp226') IS NULL
 OR to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227') IS NULL
 OR to_regclass('cotironda_piloto_privado.whapi_inbox') IS NULL
 THEN RAISE EXCEPTION 'mvp264_missing_source_ledgers' USING errcode='42501';END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.ai_usage_calls_mvp264(
 message_hmac text NOT NULL REFERENCES
  cotironda_piloto_privado.whapi_inbox(message_hmac) ON DELETE RESTRICT,
 call_no smallint NOT NULL CHECK(call_no BETWEEN 1 AND 8),
 participant_key text NOT NULL REFERENCES
  cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 participant_role text NOT NULL CHECK(participant_role IN('buyer','supplier')),
 model_code text NOT NULL CHECK(model_code IN('gpt-6-luna','gpt-6.1-sol')),
 state text NOT NULL DEFAULT 'reserved'
  CHECK(state IN('reserved','observed','unmetered')),
 reason_code text CHECK(reason_code IS NULL OR reason_code IN(
  'http_failure','network_uncertain','usage_missing',
  'invalid_usage','response_read_failed')),
 input_tokens integer CHECK(input_tokens BETWEEN 0 AND 300000),
 output_tokens integer CHECK(output_tokens BETWEEN 0 AND 300000),
 total_tokens integer CHECK(total_tokens BETWEEN 0 AND 600000),
 response_id_sha256 text CHECK(response_id_sha256~'^[a-f0-9]{64}$'),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 PRIMARY KEY(message_hmac,call_no),
 CHECK(
  (state='reserved' AND finished_at IS NULL AND
   reason_code IS NULL AND input_tokens IS NULL AND output_tokens IS NULL
   AND total_tokens IS NULL AND response_id_sha256 IS NULL) OR
  (state='unmetered' AND finished_at IS NOT NULL
   AND reason_code IS NOT NULL AND input_tokens IS NULL
   AND output_tokens IS NULL AND total_tokens IS NULL
   AND response_id_sha256 IS NULL) OR
  (state='observed' AND finished_at IS NOT NULL AND
   reason_code IS NULL AND input_tokens IS NOT NULL
   AND output_tokens IS NOT NULL AND total_tokens=input_tokens+output_tokens
   AND response_id_sha256 IS NOT NULL))
);
CREATE INDEX ai_usage_calls_mvp264_person_24h
 ON cotironda_piloto_privado.ai_usage_calls_mvp264(
  participant_key,started_at DESC);
ALTER TABLE cotironda_piloto_privado.ai_usage_calls_mvp264
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_usage_calls_mvp264
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.cotironda_piloto_ai_usage_reserve_mvp264(
 p_message_hmac text,p_chat_hmac text,p_call_no integer,p_model text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE v_person text;v_role text;n_ bigint;used_ bigint;unknown_ bigint;written_ int;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_call_no IS NULL OR p_call_no NOT BETWEEN 1 AND 8
 OR p_model IS NULL OR p_model NOT IN ('gpt-6-luna','gpt-6.1-sol')
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT p.key,p.participant_role INTO v_person,v_role
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.participants p
  ON p.key=m.participant_key AND p.chat_hmac=m.chat_hmac
 WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
  AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
  AND ((
   p.participant_role='buyer' AND p_call_no<=8 AND EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_central_attempts_mvp226 b
    WHERE b.message_hmac=m.message_hmac AND b.buyer_key=p.key
     AND b.chat_hmac=m.chat_hmac AND b.state='reserved')
  ) OR (
   p.participant_role='supplier' AND p_call_no<=2 AND EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 q
    WHERE q.message_hmac=m.message_hmac AND q.supplier_key=p.key
     AND q.state='reserved')
  ))
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_usage_calls_mvp264 a
  WHERE a.message_hmac=p_message_hmac AND a.call_no=p_call_no)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 SELECT count(*),
  coalesce(sum(CASE WHEN state='observed' THEN total_tokens ELSE 0 END),0),
  count(*) FILTER(WHERE state IN('reserved','unmetered'))
 INTO n_,used_,unknown_
 FROM cotironda_piloto_privado.ai_usage_calls_mvp264
 WHERE participant_key=v_person
  AND started_at>=clock_timestamp()-interval '24 hours';
 -- 24 calls maximum per person/24h AND no fresh paid call while previous
 -- request is of UNKNOWN spend. Includes network timeouts and missing usage.
 IF unknown_>0 THEN RETURN jsonb_build_object('state','usage_unknown_blocked');END IF;
 IF n_>=24 OR used_>=200000
 THEN RETURN jsonb_build_object('state','budget_exceeded');END IF;
 INSERT INTO cotironda_piloto_privado.ai_usage_calls_mvp264(
  message_hmac,call_no,participant_key,participant_role,model_code)
 VALUES(p_message_hmac,p_call_no,v_person,v_role,p_model)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS written_=row_count;
 RETURN jsonb_build_object('state',CASE WHEN written_=1 THEN 'reserved'
  ELSE 'already_reserved' END);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ai_usage_reserve_mvp264(
 text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ai_usage_reserve_mvp264(
 text,text,integer,text) TO service_role;

CREATE FUNCTION public.cotironda_piloto_ai_usage_finish_mvp264(
 p_message_hmac text,p_chat_hmac text,p_call_no integer,
 p_state text,p_reason_code text,
 p_input_tokens integer,p_output_tokens integer,p_total_tokens integer,
 p_response_id_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE written_ int;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_call_no IS NULL OR p_call_no NOT BETWEEN 1 AND 8
 OR p_state IS NULL OR p_state NOT IN ('observed','unmetered')
 OR (
  p_state='observed' AND (
   p_reason_code IS NOT NULL OR p_input_tokens IS NULL OR
   p_output_tokens IS NULL OR p_total_tokens IS NULL OR
   p_input_tokens NOT BETWEEN 0 AND 300000 OR
   p_output_tokens NOT BETWEEN 0 AND 300000 OR
   p_total_tokens<>p_input_tokens+p_output_tokens OR
   p_response_id_sha256 IS NULL OR
   p_response_id_sha256 !~ '^[a-f0-9]{64}$'
  )
 ) OR (
  p_state='unmetered' AND (
   p_reason_code IS NULL OR p_reason_code NOT IN(
    'http_failure','network_uncertain','usage_missing',
    'invalid_usage','response_read_failed') OR
   p_input_tokens IS NOT NULL OR p_output_tokens IS NOT NULL
   OR p_total_tokens IS NOT NULL OR p_response_id_sha256 IS NOT NULL
  )
 )
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.ai_usage_calls_mvp264 a
 SET state=p_state,reason_code=p_reason_code,input_tokens=p_input_tokens,
  output_tokens=p_output_tokens,total_tokens=p_total_tokens,
  response_id_sha256=p_response_id_sha256,finished_at=clock_timestamp()
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.participants p
  ON p.key=m.participant_key AND p.chat_hmac=m.chat_hmac
 WHERE a.message_hmac=p_message_hmac AND a.call_no=p_call_no
  AND a.message_hmac=m.message_hmac AND m.chat_hmac=p_chat_hmac
  AND a.participant_key=p.key AND a.state='reserved';
 GET DIAGNOSTICS written_=row_count;
 RETURN jsonb_build_object('state',CASE WHEN written_=1 THEN 'recorded'
  ELSE 'not_reserved' END);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ai_usage_finish_mvp264(
 text,text,integer,text,text,integer,integer,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ai_usage_finish_mvp264(
 text,text,integer,text,text,integer,integer,integer,text)
 TO service_role;

-- Operator receives only role aggregates. No per-source identifiers,
-- no monetary estimates and no claim that provider billing is reconciled.
CREATE FUNCTION public.cotironda_piloto_ai_usage_summary_mvp264(
 p_window_hours integer DEFAULT 24
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE v jsonb;
BEGIN
 IF p_window_hours IS NULL OR p_window_hours NOT BETWEEN 1 AND 168
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'role',role_,'requests',calls_,
  'usage_observed',observed_,'usage_unknown',unknown_,
  'input_tokens_observed',input_,'output_tokens_observed',output_,
  'total_tokens_observed',total_)
  ORDER BY role_),'[]'::jsonb) INTO v
 FROM (
  SELECT participant_role AS role_,
   count(*) AS calls_,
   count(*) FILTER(WHERE state='observed') AS observed_,
   count(*) FILTER(WHERE state<>'observed') AS unknown_,
   coalesce(sum(input_tokens),0) AS input_,
   coalesce(sum(output_tokens),0) AS output_,
   coalesce(sum(total_tokens),0) AS total_
  FROM cotironda_piloto_privado.ai_usage_calls_mvp264
  WHERE started_at>=clock_timestamp()-make_interval(hours=>p_window_hours)
  GROUP BY participant_role
 ) x;
 RETURN jsonb_build_object('state','private_openai_usage',
  'window_hours',p_window_hours,'roles',v,
  'pricing_verified',false,'provider_invoice_reconciled',false,
  'monetary_cost',NULL,'currency',NULL,
  'unknown_usage_is_zero',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ai_usage_summary_mvp264(
 integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ai_usage_summary_mvp264(
 integer) TO service_role;
