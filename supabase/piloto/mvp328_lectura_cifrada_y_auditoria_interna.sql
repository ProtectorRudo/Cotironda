-- MVP328 / DESARROLLO: NO PUBLICAR BAJO "LUZ VERDE".
-- Private source-envelope lookup and append-only review *attempt* registry.
-- This does not approve, promote, price, rank, adjudicate or send messages.
-- Both RPCs are restricted to service_role. No browser or buyer token access.
CREATE TABLE cotironda_piloto_privado.ai_reconciliation_attempts_mvp328 (
 attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 idempotency_key text NOT NULL UNIQUE CHECK(idempotency_key ~ '^[a-f0-9]{64}$'),
 request_id uuid NOT NULL,
 message_hmac text NOT NULL CHECK(message_hmac ~ '^[a-f0-9]{64}$'),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 actor_subject_sha256 text NOT NULL CHECK(actor_subject_sha256 ~ '^[a-f0-9]{64}$'),
 result_state text NOT NULL CHECK(result_state IN ('requires_evidence','candidate_only')),
 reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK(jsonb_typeof(reason_codes)='array' AND jsonb_array_length(reason_codes)<=20),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(octet_length(reason_codes::text)<2048)
);
ALTER TABLE cotironda_piloto_privado.ai_reconciliation_attempts_mvp328 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_reconciliation_attempts_mvp328 FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION cotironda_piloto_privado.prevent_reconciliation_mutation_mvp328()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $mvp328_immutable$
BEGIN
 RAISE EXCEPTION 'mvp328_append_only';
END
$mvp328_immutable$;
CREATE TRIGGER ai_reconciliation_no_update_mvp328
 BEFORE UPDATE OR DELETE ON cotironda_piloto_privado.ai_reconciliation_attempts_mvp328
 FOR EACH ROW EXECUTE FUNCTION cotironda_piloto_privado.prevent_reconciliation_mutation_mvp328();
CREATE TRIGGER ai_reconciliation_no_truncate_mvp328
 BEFORE TRUNCATE ON cotironda_piloto_privado.ai_reconciliation_attempts_mvp328
 FOR EACH STATEMENT EXECUTE FUNCTION cotironda_piloto_privado.prevent_reconciliation_mutation_mvp328();
REVOKE ALL ON FUNCTION cotironda_piloto_privado.prevent_reconciliation_mutation_mvp328() FROM PUBLIC, anon, authenticated, service_role;

-- An envelope is returned only for ONE exact original, latest associated
-- reply of the supplier in that round; the plaintext never enters SQL output.
-- Do not use this service_role-only function from a browser or generic admin UI.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_read_reconciliation_envelope_mvp328(
 p_request_id uuid, p_message_hmac text, p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $mvp328_read$
DECLARE
 v_source record;
 v_last record;
 v_items jsonb;
BEGIN
 IF p_request_id IS NULL OR
    p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$' OR
    p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','not_found');END IF;

 -- Select the latest linked, invited and known source WITHOUT restricting
 -- kind or source-SHA first. A newer document or tampered linked reply
 -- shadows any older text. A cancelled request is never eligible.
 SELECT l.message_hmac,l.request_id,l.supplier_key,l.source_sha256,
        l.kind AS linked_kind,l.status,l.association,
        m.chat_hmac,m.kind AS inbox_kind,m.plaintext_sha256,
        m.nonce_b64,m.ciphertext_b64,m.received_at,
        r.state AS round_state
 INTO v_last
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=l.message_hmac
    AND m.request_id=l.request_id AND m.participant_key=l.supplier_key
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=l.supplier_key AND supplier.chat_hmac=m.chat_hmac
 JOIN cotironda_piloto_privado.requests r ON r.id=l.request_id
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
  ON d.request_id=r.id AND d.supplier_key=l.supplier_key
 WHERE l.request_id=p_request_id
  AND l.supplier_key=(
   SELECT linked.supplier_key
   FROM cotironda_piloto_privado.ai_supplier_links_mvp225 linked
   WHERE linked.request_id=p_request_id
     AND linked.message_hmac=p_message_hmac
   LIMIT 1
  )
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND r.state IN('prepared','closed')
  AND m.received_at>=r.created_at AND m.received_at<=r.closes_at
  AND d.state='api_accepted' AND d.finished_at<=m.received_at
 ORDER BY m.received_at DESC,l.message_hmac DESC
 LIMIT 1;
 IF NOT FOUND OR v_last.message_hmac IS DISTINCT FROM p_message_hmac
 THEN RETURN jsonb_build_object('state','not_found');END IF;
 IF v_last.chat_hmac IS DISTINCT FROM p_chat_hmac OR
    v_last.linked_kind<>'text' OR v_last.inbox_kind<>'text' OR
    v_last.status<>'awaiting_semantic_review' OR
    v_last.association<>'semantic_unique_mvp291' OR
    v_last.source_sha256 IS NULL OR
    v_last.source_sha256 !~ '^[a-f0-9]{64}$' OR
    v_last.source_sha256 IS DISTINCT FROM v_last.plaintext_sha256 OR
    v_last.nonce_b64 IS NULL OR v_last.ciphertext_b64 IS NULL
 THEN RETURN jsonb_build_object('state','not_found');END IF;

 SELECT rev.message_hmac,rev.request_id,rev.supplier_key,
  rev.source_sha256,rev.state,rev.finished_at
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 rev
 WHERE rev.message_hmac=v_last.message_hmac
  AND rev.request_id=v_last.request_id
  AND rev.supplier_key=v_last.supplier_key
  AND rev.source_sha256=v_last.source_sha256
  AND rev.state='review' AND rev.finished_at IS NOT NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found');END IF;

 SELECT jsonb_agg(jsonb_build_object(
  'id','item_'||line.line_no,
  'descripcion',line.original_description,
  'cantidad',line.quantity::text,
  'unidad',line.unit,
  'rubro',rub.rubro
 ) ORDER BY line.line_no) INTO v_items
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 dest
 JOIN cotironda_piloto_privado.request_lines line
  ON line.request_id=dest.request_id AND line.line_no=dest.line_no
 JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
  ON rub.request_id=line.request_id AND rub.line_no=line.line_no
 WHERE dest.request_id=v_last.request_id
  AND dest.supplier_key=v_last.supplier_key;
 IF v_items IS NULL OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 25
 THEN RETURN jsonb_build_object('state','not_found');END IF;

 RETURN jsonb_build_object(
  'state','eligible_encrypted',
  'request_id',v_last.request_id,
  'message_hmac',v_last.message_hmac,
  'chat_hmac',v_last.chat_hmac,
  'source_sha256',v_last.source_sha256,
  'latest_message_hmac',v_last.message_hmac,
  'latest_source_sha256',v_last.source_sha256,
  'finished_at',v_source.finished_at,
  'format','text',
  'nonce',v_last.nonce_b64,
  'ciphertext',v_last.ciphertext_b64,
  'items',v_items
 );
END
$mvp328_read$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_read_reconciliation_envelope_mvp328(uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_read_reconciliation_envelope_mvp328(uuid,text,text)
 TO service_role;

-- A separate, private audit trail of a source-check attempt. NEVER an
-- economic approval, and no connection to existing verified quote tables.
-- Caller authenticates the operator OUTSIDE SQL and passes only a SHA-256
-- subject reference; do not treat the hash as proof of operator identity.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_record_reconciliation_attempt_mvp328(
 p_request_id uuid,
 p_message_hmac text,
 p_source_sha256 text,
 p_idempotency_key text,
 p_evidence_sha256 text,
 p_actor_subject_sha256 text,
 p_result_state text,
 p_reason_codes jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $mvp328_record$
DECLARE
 v_existing record;
 v_written uuid;
 v_n integer;
BEGIN
 IF p_request_id IS NULL OR
    p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$' OR
    p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$' OR
    p_idempotency_key IS NULL OR p_idempotency_key !~ '^[a-f0-9]{64}$' OR
    p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[a-f0-9]{64}$' OR
    p_actor_subject_sha256 IS NULL OR p_actor_subject_sha256 !~ '^[a-f0-9]{64}$' OR
    p_result_state NOT IN ('requires_evidence','candidate_only') OR
    p_reason_codes IS NULL OR jsonb_typeof(p_reason_codes)<>'array' OR
    jsonb_array_length(p_reason_codes)>20 OR
    octet_length(p_reason_codes::text)>=2048
 THEN RETURN jsonb_build_object('state','invalid');END IF;

 -- Only short machine codes. Reject narrative, data or amounts.
 SELECT count(*) INTO v_n FROM jsonb_array_elements_text(p_reason_codes) code
 WHERE code !~ '^[a-z][a-z0-9_]{1,63}$';
 IF v_n<>0 THEN RETURN jsonb_build_object('state','invalid');END IF;

 -- Evidence must belong to the current completed-review source. The read
 -- RPC performs even stricter custody checks before creating a candidate;
 -- this append-only record NEVER promotes or publishes that candidate.
 -- Revalidate the exact latest, consented, dispatched, source-checked
 -- encrypted envelope at the moment of append. An old quote cannot
 -- acquire a new candidate when a newer supplier reply has superseded it.
 IF NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.whapi_inbox inbox
  WHERE inbox.message_hmac=p_message_hmac AND
   inbox.request_id=p_request_id AND
   inbox.plaintext_sha256=p_source_sha256 AND
   public.cotironda_piloto_read_reconciliation_envelope_mvp328(
    p_request_id,p_message_hmac,inbox.chat_hmac
   )->>'state'='eligible_encrypted'
 ) THEN RETURN jsonb_build_object('state','not_eligible');END IF;

 INSERT INTO cotironda_piloto_privado.ai_reconciliation_attempts_mvp328
 (request_id,message_hmac,source_sha256,idempotency_key,
  evidence_sha256,actor_subject_sha256,result_state,reason_codes)
 VALUES(p_request_id,p_message_hmac,p_source_sha256,p_idempotency_key,
  p_evidence_sha256,p_actor_subject_sha256,p_result_state,p_reason_codes)
 ON CONFLICT (idempotency_key) DO NOTHING
 RETURNING attempt_id INTO v_written;
 IF v_written IS NOT NULL
 THEN RETURN jsonb_build_object('state','recorded_private');END IF;

 SELECT * INTO v_existing
 FROM cotironda_piloto_privado.ai_reconciliation_attempts_mvp328
 WHERE idempotency_key=p_idempotency_key;
 IF v_existing.request_id=p_request_id AND
    v_existing.message_hmac=p_message_hmac AND
    v_existing.source_sha256=p_source_sha256 AND
    v_existing.evidence_sha256=p_evidence_sha256 AND
    v_existing.actor_subject_sha256=p_actor_subject_sha256 AND
    v_existing.result_state=p_result_state AND
    v_existing.reason_codes=p_reason_codes
 THEN RETURN jsonb_build_object('state','already_recorded');END IF;
 RETURN jsonb_build_object('state','idempotency_conflict');
END
$mvp328_record$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_record_reconciliation_attempt_mvp328(
 uuid,text,text,text,text,text,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_record_reconciliation_attempt_mvp328(
 uuid,text,text,text,text,text,text,jsonb)
 TO service_role;
