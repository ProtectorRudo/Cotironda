-- MVP342 — PRIVATE encrypted per-model evidence + actual token observations.
-- Never deploy without separate "Publicalo". No payment/invoice/cost claims.
-- Readable only through future service-only audited RPC. No public quote.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_lot_calls_mvp342(
 source_hmac text NOT NULL REFERENCES
  cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340(source_hmac)
  ON DELETE RESTRICT,
 lot_number smallint NOT NULL CHECK(lot_number BETWEEN 1 AND 60),
 perspective text NOT NULL CHECK(perspective IN('primary','corroboration')),
 lot_digest text NOT NULL CHECK(lot_digest ~ '^[a-f0-9]{64}$'),
 model_code text NOT NULL CHECK(model_code IN('gpt-6-luna','gpt-6.1-sol')),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','observed','unmetered')),
 reason_code text CHECK(reason_code IN('network_uncertain','http_failure',
  'response_read_failed','usage_missing','invalid_usage')),
 nonce_b64 text,
 ciphertext_b64 text,
 cleartext_sha256 text CHECK(cleartext_sha256 ~ '^[a-f0-9]{64}$'),
 response_id_sha256 text CHECK(response_id_sha256 ~ '^[a-f0-9]{64}$'),
 input_tokens integer CHECK(input_tokens BETWEEN 0 AND 300000),
 output_tokens integer CHECK(output_tokens BETWEEN 0 AND 300000),
 total_tokens integer CHECK(total_tokens BETWEEN 0 AND 600000),
 started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 finished_at timestamptz,
 PRIMARY KEY(source_hmac,lot_number,perspective),
 CHECK (
  (state='reserved' AND finished_at IS NULL AND reason_code IS NULL
   AND nonce_b64 IS NULL AND ciphertext_b64 IS NULL
   AND cleartext_sha256 IS NULL AND response_id_sha256 IS NULL
   AND input_tokens IS NULL AND output_tokens IS NULL AND total_tokens IS NULL)
  OR
  (state='unmetered' AND finished_at IS NOT NULL AND reason_code IS NOT NULL
   AND nonce_b64 IS NULL AND ciphertext_b64 IS NULL
   AND cleartext_sha256 IS NULL AND response_id_sha256 IS NULL
   AND input_tokens IS NULL AND output_tokens IS NULL AND total_tokens IS NULL)
  OR
  (state='observed' AND finished_at IS NOT NULL AND reason_code IS NULL
   AND nonce_b64 IS NOT NULL AND ciphertext_b64 IS NOT NULL
   AND cleartext_sha256 IS NOT NULL AND response_id_sha256 IS NOT NULL
   AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL
   AND total_tokens=input_tokens+output_tokens)
 )
);
CREATE INDEX IF NOT EXISTS ai_supplier_lot_calls_mvp342_24h_idx
 ON cotironda_piloto_privado.ai_supplier_lot_calls_mvp342
 (started_at DESC,source_hmac);
ALTER TABLE cotironda_piloto_privado.ai_supplier_lot_calls_mvp342
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_lot_calls_mvp342
 FROM PUBLIC,anon,authenticated,service_role;

-- Begin ONE paid call, atomically before making any request to OpenAI.
-- Buyer row lock serializes quota among suppliers belonging to this buyer.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_begin_lot_call_mvp342(
 p_message_hmac text,p_receipt text,p_plan_sha256 text,
 p_lot_number integer,p_perspective text,p_lot_digest text,
 p_model text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mvp342$
DECLARE v record;v_index integer;v_seen integer;v_unknown integer;
 v_tokens bigint;v_calls bigint;v_written integer;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_receipt IS NULL OR p_receipt !~ '^[a-f0-9]{32}$'
 OR p_plan_sha256 IS NULL OR p_plan_sha256 !~ '^[a-f0-9]{64}$'
 OR p_lot_number IS NULL OR p_lot_number NOT BETWEEN 1 AND 60
 OR p_perspective NOT IN('primary','corroboration')
 OR p_lot_digest IS NULL OR p_lot_digest !~ '^[a-f0-9]{64}$'
 OR p_model NOT IN('gpt-6-luna','gpt-6.1-sol')
 THEN RETURN pg_catalog.jsonb_build_object('state','not_eligible');END IF;

 SELECT ledger.planned_lots,ledger.max_model_calls,req.buyer_key
 INTO v
 FROM cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340 ledger
 JOIN cotironda_piloto_privado.requests req ON req.id=ledger.request_id
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=req.buyer_key
 WHERE ledger.source_hmac=p_message_hmac
  AND pg_catalog.replace(ledger.receipt::text,'-','')=p_receipt
  AND ledger.plan_sha256=p_plan_sha256 AND ledger.state='leased'
  AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
  AND buyer.opted_out_at IS NULL
  AND ledger.planned_lots>=p_lot_number
 FOR UPDATE OF ledger,buyer;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('state','not_eligible');END IF;

 v_index:=(p_lot_number-1)*2+
   CASE WHEN p_perspective='corroboration' THEN 2 ELSE 1 END;
 SELECT count(*), count(*) FILTER(WHERE state<>'observed')
 INTO v_seen,v_unknown
 FROM cotironda_piloto_privado.ai_supplier_lot_calls_mvp342
 WHERE source_hmac=p_message_hmac;
 IF v_seen<>v_index-1 OR v_unknown<>0
 THEN RETURN pg_catalog.jsonb_build_object('state','already_reserved_or_out_of_order');END IF;

 -- Per BUYER: observed actual tokens. Reserved or unmetered costs are
 -- UNKNOWN (not zero!) and block new model calls within the window.
 SELECT count(*),coalesce(sum(c.total_tokens),0),
  count(*) FILTER(WHERE c.state<>'observed')
 INTO v_calls,v_tokens,v_unknown
 FROM cotironda_piloto_privado.ai_supplier_lot_calls_mvp342 c
 JOIN cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340 ledger
  ON ledger.source_hmac=c.source_hmac
 JOIN cotironda_piloto_privado.requests req ON req.id=ledger.request_id
 WHERE req.buyer_key=v.buyer_key
  AND c.started_at>=pg_catalog.clock_timestamp()-INTERVAL '24 hours';
 IF v_unknown>0 OR v_calls>=24 OR v_tokens>=150000
 THEN RETURN pg_catalog.jsonb_build_object('state','buyer_usage_budget_blocked');END IF;

 INSERT INTO cotironda_piloto_privado.ai_supplier_lot_calls_mvp342(
  source_hmac,lot_number,perspective,lot_digest,model_code
 ) VALUES(p_message_hmac,p_lot_number,p_perspective,p_lot_digest,p_model)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_written=ROW_COUNT;
 RETURN pg_catalog.jsonb_build_object(
  'state',CASE WHEN v_written=1 THEN 'reserved' ELSE 'already_reserved' END);
END $mvp342$;

-- Persist ONLY AES-GCM encrypted model output and real API usage.
-- Never accept guessed prices or inferred monetary cost in this table.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_lot_call_mvp342(
 p_message_hmac text,p_receipt text,p_plan_sha256 text,
 p_lot_number integer,p_perspective text,p_lot_digest text,
 p_model text,p_state text,p_reason text,
 p_nonce_b64 text,p_ciphertext_b64 text,p_cleartext_sha256 text,
 p_response_id_sha256 text,p_input_tokens integer,
 p_output_tokens integer,p_total_tokens integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mvp342$
DECLARE v_written integer;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_receipt IS NULL OR p_receipt !~ '^[a-f0-9]{32}$'
 OR p_plan_sha256 IS NULL OR p_plan_sha256 !~ '^[a-f0-9]{64}$'
 OR p_lot_number IS NULL OR p_lot_number NOT BETWEEN 1 AND 60
 OR p_perspective NOT IN('primary','corroboration')
 OR p_lot_digest IS NULL OR p_lot_digest !~ '^[a-f0-9]{64}$'
 OR p_model NOT IN('gpt-6-luna','gpt-6.1-sol')
 OR p_state NOT IN('observed','unmetered')
 OR (
  p_state='observed' AND (
   p_reason IS NOT NULL OR p_nonce_b64 IS NULL OR
   p_nonce_b64 !~ '^[A-Za-z0-9+/]{16}$' OR
   p_ciphertext_b64 IS NULL OR
   p_ciphertext_b64 !~ '^[A-Za-z0-9+/]+={0,2}$' OR
   pg_catalog.length(p_ciphertext_b64) NOT BETWEEN 60 AND 60000 OR
   p_cleartext_sha256 IS NULL OR p_cleartext_sha256 !~ '^[a-f0-9]{64}$'
   OR p_response_id_sha256 IS NULL OR
   p_response_id_sha256 !~ '^[a-f0-9]{64}$'
   OR p_input_tokens IS NULL OR p_input_tokens NOT BETWEEN 0 AND 300000
   OR p_output_tokens IS NULL OR p_output_tokens NOT BETWEEN 0 AND 300000
   OR p_total_tokens IS NULL OR
   p_total_tokens<>p_input_tokens+p_output_tokens
   OR p_total_tokens>600000
  )
 ) OR (
  p_state='unmetered' AND (
   p_reason NOT IN('network_uncertain','http_failure',
    'response_read_failed','usage_missing','invalid_usage')
   OR p_nonce_b64 IS NOT NULL OR p_ciphertext_b64 IS NOT NULL
   OR p_cleartext_sha256 IS NOT NULL OR p_response_id_sha256 IS NOT NULL
   OR p_input_tokens IS NOT NULL OR p_output_tokens IS NOT NULL
   OR p_total_tokens IS NOT NULL
  )
 )
 THEN RETURN pg_catalog.jsonb_build_object('state','invalid');END IF;

 UPDATE cotironda_piloto_privado.ai_supplier_lot_calls_mvp342 call
 SET state=p_state,reason_code=p_reason,nonce_b64=p_nonce_b64,
  ciphertext_b64=p_ciphertext_b64,
  cleartext_sha256=p_cleartext_sha256,
  response_id_sha256=p_response_id_sha256,
  input_tokens=p_input_tokens,output_tokens=p_output_tokens,
  total_tokens=p_total_tokens,finished_at=pg_catalog.clock_timestamp()
 FROM cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340 ledger
 WHERE call.source_hmac=p_message_hmac
  AND call.source_hmac=ledger.source_hmac
  AND call.lot_number=p_lot_number AND call.perspective=p_perspective
  AND call.lot_digest=p_lot_digest AND call.model_code=p_model
  AND call.state='reserved'
  AND ledger.state='leased' AND ledger.plan_sha256=p_plan_sha256
  AND pg_catalog.replace(ledger.receipt::text,'-','')=p_receipt
 RETURNING 1 INTO v_written;
 IF v_written IS NULL THEN RETURN pg_catalog.jsonb_build_object('state','not_reserved');END IF;
 RETURN pg_catalog.jsonb_build_object('state','recorded');
END $mvp342$;

-- Private, noncommercial gate: ensures every call was observed and
-- encrypted BEFORE marking the aggregate as analysis_ready_private.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_observed_lots_mvp342(
 p_message_hmac text,p_receipt text,p_plan_sha256 text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $mvp342$
DECLARE v record;v_count integer;v_unknown integer;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_receipt IS NULL OR p_receipt !~ '^[a-f0-9]{32}$'
 OR p_plan_sha256 IS NULL OR p_plan_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN pg_catalog.jsonb_build_object('state','not_eligible');END IF;
 SELECT ledger.max_model_calls INTO v
 FROM cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340 ledger
 WHERE ledger.source_hmac=p_message_hmac
  AND pg_catalog.replace(ledger.receipt::text,'-','')=p_receipt
  AND ledger.plan_sha256=p_plan_sha256
  AND ledger.state='leased';
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('state','not_eligible');END IF;
 SELECT count(*),count(*) FILTER(WHERE state<>'observed')
 INTO v_count,v_unknown
 FROM cotironda_piloto_privado.ai_supplier_lot_calls_mvp342
 WHERE source_hmac=p_message_hmac;
 IF v_count=v.max_model_calls AND v_unknown=0
 THEN RETURN pg_catalog.jsonb_build_object('state','observed_complete');END IF;
 RETURN pg_catalog.jsonb_build_object('state','pending_or_unmetered');
END $mvp342$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_begin_lot_call_mvp342(
 text,text,text,integer,text,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_lot_call_mvp342(
 text,text,text,integer,text,text,text,text,text,text,text,text,text,
 integer,integer,integer)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_observed_lots_mvp342(
 text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_begin_lot_call_mvp342(
 text,text,text,integer,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_lot_call_mvp342(
 text,text,text,integer,text,text,text,text,text,text,text,text,text,
 integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_observed_lots_mvp342(
 text,text,text) TO service_role;
