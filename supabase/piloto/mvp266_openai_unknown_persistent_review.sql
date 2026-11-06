-- MVP266: unresolved OpenAI usage cannot expire unnoticed at 24h.
-- Development-only SQL overlay. No cron, deployment, WhatsApp or paid APIs.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.ai_usage_calls_mvp264') IS NULL
 OR to_regclass('cotironda_piloto_privado.supervisor_operators_mvp265') IS NULL
 THEN RAISE EXCEPTION 'mvp266_prerequisites_missing' USING errcode='42501';END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.ai_usage_reviews_mvp266(
 message_hmac text NOT NULL,
 call_no smallint NOT NULL CHECK(call_no BETWEEN 1 AND 8),
 operator_ref uuid NOT NULL REFERENCES
  cotironda_piloto_privado.supervisor_operators_mvp265(operator_ref),
 review_basis text NOT NULL CHECK(review_basis IN(
  'provider_usage_reviewed','provider_billing_reviewed',
  'financial_exposure_accepted')),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[a-f0-9]{64}$'),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(message_hmac,call_no),
 FOREIGN KEY(message_hmac,call_no) REFERENCES
  cotironda_piloto_privado.ai_usage_calls_mvp264(message_hmac,call_no)
  ON DELETE RESTRICT
);
CREATE INDEX ai_usage_reviews_mvp266_operator_24h ON
 cotironda_piloto_privado.ai_usage_reviews_mvp266(operator_ref,reviewed_at DESC);
ALTER TABLE cotironda_piloto_privado.ai_usage_reviews_mvp266
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_usage_reviews_mvp266
 FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the MVP264 HMAC/consent checks and participant lock.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ai_usage_reserve_mvp264(
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
 -- 24h rolling quotas are separate from persistent unreviewed uncertainty.
 SELECT count(*),
  coalesce(sum(CASE WHEN state='observed' THEN total_tokens ELSE 0 END),0)
 INTO n_,used_
 FROM cotironda_piloto_privado.ai_usage_calls_mvp264
 WHERE participant_key=v_person
  AND started_at>=clock_timestamp()-interval '24 hours';
 SELECT count(*) INTO unknown_
 FROM cotironda_piloto_privado.ai_usage_calls_mvp264 a
 WHERE a.participant_key=v_person AND a.state IN('reserved','unmetered')
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_usage_reviews_mvp266 r
   WHERE r.message_hmac=a.message_hmac AND r.call_no=a.call_no
  );
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

-- MVP264 finish/summary signatures and grants are unchanged.

-- Future independently authenticated administrative backend only.
-- Operator UUID alone does not authenticate a human.
-- A SHA identifies evidence, but does not attest its truth.
-- Financial exposure acceptance is NOT billing or token verification.
CREATE FUNCTION public.cotironda_piloto_ai_usage_manual_review_mvp266(
 p_message_hmac text,p_call_no integer,p_operator_ref uuid,
 p_basis text,p_evidence_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE person_ text;usage_state_ text;started_ timestamptz;reviews_ bigint;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_call_no IS NULL OR p_call_no NOT BETWEEN 1 AND 8
 OR p_operator_ref IS NULL
 OR p_basis IS NULL OR p_basis NOT IN(
  'provider_usage_reviewed','provider_billing_reviewed',
  'financial_exposure_accepted')
 OR p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Serialize the operator's 100-reviews/24h quota and revocation checks.
 PERFORM 1 FROM cotironda_piloto_privado.supervisor_operators_mvp265 o
 WHERE o.operator_ref=p_operator_ref AND o.active AND o.revoked_at IS NULL
  AND o.role='incident_manager'
 FOR UPDATE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state','operator_not_authorized');END IF;
 -- Serialize manual review against concurrent AI call reservations.
 SELECT p.key INTO person_
 FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.ai_usage_calls_mvp264 a
  ON a.participant_key=p.key
 WHERE a.message_hmac=p_message_hmac AND a.call_no=p_call_no
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found');END IF;
 SELECT a.state,a.started_at INTO usage_state_,started_
 FROM cotironda_piloto_privado.ai_usage_calls_mvp264 a
 WHERE a.message_hmac=p_message_hmac AND a.call_no=p_call_no FOR UPDATE;
 IF usage_state_ NOT IN('reserved','unmetered')
 THEN RETURN jsonb_build_object('state','not_unknown');END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_usage_reviews_mvp266 r
  WHERE r.message_hmac=p_message_hmac AND r.call_no=p_call_no
 ) THEN RETURN jsonb_build_object('state','already_reviewed');END IF;
 IF usage_state_='reserved' AND
  started_>clock_timestamp()-interval '30 minutes'
 THEN RETURN jsonb_build_object('state','still_in_flight');END IF;
 SELECT count(*) INTO reviews_
 FROM cotironda_piloto_privado.ai_usage_reviews_mvp266 r
 WHERE r.operator_ref=p_operator_ref
  AND r.reviewed_at>=clock_timestamp()-interval '24 hours';
 IF reviews_>=100 THEN
  RETURN jsonb_build_object('state','operator_review_cap');END IF;
 INSERT INTO cotironda_piloto_privado.ai_usage_reviews_mvp266(
  message_hmac,call_no,operator_ref,review_basis,evidence_sha256)
 VALUES(p_message_hmac,p_call_no,p_operator_ref,p_basis,p_evidence_sha256);
 RETURN jsonb_build_object('state','reviewed_private',
  'usage_observed',false,'monetary_cost_verified',false,
  'unknown_usage_is_zero',false,'messages_sent',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ai_usage_manual_review_mvp266(
 text,integer,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ai_usage_manual_review_mvp266(
 text,integer,uuid,text,text) TO service_role;
