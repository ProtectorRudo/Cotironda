-- MVP196 PILOTO-ONLY. PROPOSED MIGRATION, NOT INSTALLED.
-- Replace the LITERAL MVP159 planner for NEW consented rounds.
-- No outbound, no contact reveal, no ranking and never retrofit old plans.
-- Every EXECUTE restricted to service_role, fixed search_path.
--
-- Worker contract:
--  1. SELECT eligible CLOSED new rounds and same v9 private source envelope;
--  2. TS selector MVP196 evaluates technical equivalence and coverage;
--  3. this RPC REFETCHES source, checks every selected line/source and only
--     inserts an immutable private plan (does NOT queue contacts/messages).
--
-- No public/browser token, no seller IDs or raw documents in success result.
-- A source attestation is inseparable from the immutable planner row.
-- The old MVP159 SQL planner never creates this marker.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.finalist_source_plans_mvp196(
 request_id uuid PRIMARY KEY REFERENCES cotironda_piloto_privado.requests(id),
 verifier_version integer NOT NULL DEFAULT 196 CHECK(verifier_version=196),
 source_hmacs text[] NOT NULL,
 source_shas text[] NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(cardinality(source_hmacs) BETWEEN 1 AND 2),
 CHECK(cardinality(source_hmacs)=cardinality(source_shas))
);
ALTER TABLE cotironda_piloto_privado.finalist_source_plans_mvp196
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.finalist_source_plans_mvp196
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER finalist_source_immutable_mvp196
 BEFORE UPDATE OR DELETE ON cotironda_piloto_privado.finalist_source_plans_mvp196
 FOR EACH ROW EXECUTE FUNCTION
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

CREATE OR REPLACE FUNCTION public.cotironda_piloto_commercial_due_mvp196(
 p_limit integer DEFAULT 5
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $fn$
DECLARE row_ record;v_inputs jsonb;v_rounds jsonb:='[]'::jsonb;
 v_valid integer:=0;v_skipped integer:=0;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 THEN
  RETURN jsonb_build_object('state','invalid_limit');
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.finalist_activation_mvp113 a
  WHERE a.only_row AND a.enabled AND a.activated_at<=clock_timestamp()
 ) THEN RETURN jsonb_build_object('state','pilot_finalist_off');END IF;
 FOR row_ IN
  SELECT req.id FROM cotironda_piloto_privado.requests req
  JOIN cotironda_piloto_privado.finalist_activation_mvp113 a
   ON a.only_row AND a.enabled AND a.activated_at<=clock_timestamp()
   AND req.created_at>=a.activated_at
  JOIN cotironda_piloto_privado.participants buyer
   ON buyer.key=req.buyer_key AND buyer.participant_role='buyer'
   AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  WHERE req.state='closed' AND req.closes_at<=clock_timestamp()
   -- A valid no-offer round must close normally, not poison future batches.
   AND EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 offered
    WHERE offered.request_id=req.id
   )
   AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.finalist_coverage_plans_mvp108 plan
    WHERE plan.request_id=req.id
   )
  -- Bounded wider window prevents a bad preceding source from blocking
  -- the later two verified supplier rounds indefinitely at small scale.
  ORDER BY req.closes_at,req.id LIMIT p_limit*10
 LOOP
  v_inputs:=public.cotironda_piloto_private_round_inputs_mvp172(row_.id);
  IF v_inputs IS NULL OR v_inputs->>'state' IS DISTINCT FROM 'private_inputs' THEN
   v_skipped:=v_skipped+1;
   CONTINUE;
  END IF;
  v_rounds:=v_rounds||jsonb_build_array(jsonb_build_object(
    'requestId',row_.id,'privateInputs',v_inputs,'closureChecked',true));
  v_valid:=v_valid+1;
  EXIT WHEN v_valid>=p_limit;
 END LOOP;
 IF length(v_rounds::text)>1400000 THEN
  RETURN jsonb_build_object('state','capacity_exceeded');
 END IF;
 RETURN jsonb_build_object('state','candidate_due','rounds',v_rounds,
  'skipped_unverified',v_skipped,'contacts_revealed',false,'messages_sent',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_commercial_due_mvp196(integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_commercial_due_mvp196(integer)
 TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_commit_commercial_plan_mvp196(
 p_request uuid,p_mode text,p_sources jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $fn$
DECLARE r_ record;v_snapshot jsonb;v_docs jsonb;v_items jsonb;
 v_quote jsonb;v_source jsonb;v_match jsonb;v_ref jsonb;
 v_supplier text;v_key text;v_hmac text;v_sha text;v_item text;v_line integer;
 v_all_count integer;v_n integer;v_source_count integer;v_match_count integer;
 v_keys text[]:=array[]::text[];v_shas text[]:=array[]::text[];
 v_items_per_source text[];v_item_ids text[];
 v_seen text[]:=array[]::text[];v_matrix jsonb:='[]'::jsonb;
 v_count_a integer;v_count_b integer;v_state text;
BEGIN
 IF p_request IS NULL OR p_mode IS NULL OR
  p_mode NOT IN('one_complete_alternative','two_complete_alternatives',
   'two_supplier_combination') OR
  p_sources IS NULL OR jsonb_typeof(p_sources)<>'array'
 THEN RETURN jsonb_build_object('state','invalid_plan');END IF;
 v_n:=jsonb_array_length(p_sources);
 IF v_n NOT BETWEEN 1 AND 2 OR
  (p_mode='one_complete_alternative' AND v_n<>1) OR
  (p_mode<>'one_complete_alternative' AND v_n<>2)
 THEN RETURN jsonb_build_object('state','invalid_plan');END IF;
 -- The same transaction holds an exclusive request lock. Activation is
 -- prospective: even a perfect 2026 pilot source cannot be backfilled.
 SELECT req.id,req.created_at,req.closes_at,req.state INTO r_
 FROM cotironda_piloto_privado.requests req
 JOIN cotironda_piloto_privado.finalist_activation_mvp113 a
  ON a.only_row AND a.enabled AND a.activated_at<=clock_timestamp()
  AND req.created_at>=a.activated_at
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=req.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 WHERE req.id=p_request FOR UPDATE OF req;
 IF NOT FOUND OR r_.state<>'closed' OR r_.closes_at>clock_timestamp()
 THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.finalist_coverage_plans_mvp108
           WHERE request_id=p_request)
 THEN RETURN jsonb_build_object('state','already_planned');END IF;
 v_snapshot:=public.cotironda_piloto_private_round_inputs_mvp172(p_request);
 IF v_snapshot->>'state'<>'private_inputs'
 THEN RETURN jsonb_build_object('state','unverified_source');END IF;
 v_docs:=v_snapshot->'quotations';v_items:=v_snapshot->'requestItems';
 IF jsonb_typeof(v_docs)<>'array' OR jsonb_typeof(v_items)<>'array'
 THEN RETURN jsonb_build_object('state','unverified_source');END IF;
 v_all_count:=jsonb_array_length(v_items);
 IF v_all_count NOT BETWEEN 1 AND 25
 THEN RETURN jsonb_build_object('state','invalid_items');END IF;
 SELECT array_agg(item->>'id' ORDER BY item->>'id') INTO v_item_ids
 FROM jsonb_array_elements(v_items) item;
 IF cardinality(v_item_ids)<>v_all_count OR
  cardinality(array(SELECT DISTINCT unnest(v_item_ids)))<>v_all_count
 THEN RETURN jsonb_build_object('state','duplicate_items');END IF;
 FOR v_source IN SELECT value FROM jsonb_array_elements(p_sources)
 LOOP
  IF jsonb_typeof(v_source)<>'object' OR
    (SELECT count(*) FROM jsonb_object_keys(v_source))<>4 OR
    NOT (v_source ?& array['oferta','messageHmac','sourceSha256','matches']) OR
    jsonb_typeof(v_source->'matches')<>'array'
  THEN RETURN jsonb_build_object('state','invalid_source_shape');END IF;
  v_hmac:=v_source->>'messageHmac';v_sha:=v_source->>'sourceSha256';
  IF v_hmac IS NULL OR v_hmac !~ '^[0-9a-f]{64}$' OR
     v_sha IS NULL OR v_sha !~ '^[0-9a-f]{64}$' OR
     v_hmac=ANY(v_seen)
  THEN RETURN jsonb_build_object('state','invalid_source');END IF;
  v_seen:=array_append(v_seen,v_hmac);
  SELECT q.value INTO v_quote
  FROM jsonb_array_elements(v_docs) WITH ORDINALITY AS q(value,ord)
  WHERE q.value->'doc'->>'messageHmac'=v_hmac
    AND q.value->'doc'->>'sourceSha256'=v_sha
    AND v_source->>'oferta'='oferta_'||lpad(q.ord::text,3,'0');
  IF NOT FOUND THEN RETURN jsonb_build_object('state','source_revision_changed');END IF;
  -- Database proof of immutable v9 source and no later supplier media
  -- or correction: a selection cannot swap an identity by label/index.
  SELECT q.supplier_key INTO v_supplier
  FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 q
  JOIN cotironda_piloto_privado.supplier_evidence_mvp138 ev
   ON ev.message_hmac=q.message_hmac AND ev.source_sha256=q.source_sha256
   AND ev.request_id=q.request_id AND ev.supplier_key=q.supplier_key
   AND ev.verifier_version=9 AND ev.state='verified' AND ev.reason='covered'
  JOIN cotironda_piloto_privado.invitations inv
   ON inv.request_id=q.request_id AND inv.supplier_key=q.supplier_key
   AND inv.state='prepared'
  JOIN cotironda_piloto_privado.participants supp
   ON supp.key=q.supplier_key AND supp.participant_role='supplier'
   AND supp.consent_at IS NOT NULL AND supp.opted_out_at IS NULL
  WHERE q.request_id=p_request AND q.message_hmac=v_hmac
   AND q.source_sha256=v_sha AND q.received_at<=r_.closes_at
   AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 later
    WHERE later.request_id=p_request AND later.supplier_key=q.supplier_key
     AND later.received_at<=r_.closes_at AND
     (later.received_at,later.message_hmac)>(q.received_at,q.message_hmac)
   )
   AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.offer_versions later
    WHERE later.request_id=p_request AND later.supplier_key=q.supplier_key
     AND later.created_at<=r_.closes_at AND later.created_at>=q.received_at
   );
  IF v_supplier IS NULL OR v_supplier=ANY(v_keys)
  THEN RETURN jsonb_build_object('state','supplier_not_unique_or_current');END IF;
  v_keys:=array_append(v_keys,v_supplier);
  v_shas:=array_append(v_shas,v_sha);
  v_match_count:=jsonb_array_length(v_source->'matches');
  IF v_match_count<1 OR v_match_count>v_all_count
  THEN RETURN jsonb_build_object('state','invalid_coverage');END IF;
  v_items_per_source:=array[]::text[];
  FOR v_match IN SELECT value FROM jsonb_array_elements(v_source->'matches')
  LOOP
   IF jsonb_typeof(v_match)<>'object' OR
     (SELECT count(*) FROM jsonb_object_keys(v_match))<>2 OR
     NOT (v_match ?& array['itemId','lineNo']) OR
     jsonb_typeof(v_match->'lineNo')<>'number'
   THEN RETURN jsonb_build_object('state','invalid_match_shape');END IF;
   v_item:=v_match->>'itemId';
   IF v_item IS NULL OR NOT v_item=ANY(v_item_ids) OR
      v_item=ANY(v_items_per_source)
   THEN RETURN jsonb_build_object('state','duplicate_or_unknown_item');END IF;
   v_line:=(v_match->>'lineNo')::integer;
   IF v_line<1 OR v_line>25 OR NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_quote->'doc'->'lineas') l
    JOIN jsonb_array_elements(v_quote->'fuente'->'lines') f
      ON (f->>'lineNo')::integer=(l->>'lineNo')::integer
    WHERE (l->>'lineNo')::integer=v_line
     AND jsonb_typeof(f->'page')='number'
     AND jsonb_typeof(f->'row')='number'
     AND (f->>'page')::integer>=1 AND (f->>'row')::integer>=1
   ) THEN RETURN jsonb_build_object('state','line_not_source_checked');END IF;
   IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_source->'matches') other
    WHERE other->>'itemId'<>v_item AND other->>'lineNo'=v_match->>'lineNo'
   ) THEN RETURN jsonb_build_object('state','duplicate_source_line');END IF;
   v_items_per_source:=array_append(v_items_per_source,v_item);
  END LOOP;
  v_matrix:=v_matrix||jsonb_build_array(to_jsonb(v_items_per_source));
 END LOOP;
 -- Exact source COVERAGE must be proven in the service by the v9 TS
 -- commercial diagnostic; SQL independently checks the complete matrix.
 SELECT count(*) INTO v_count_a
 FROM jsonb_array_elements(v_items) i
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_matrix->0) x
              WHERE x=i->>'id');
 v_count_b:=0;
 IF v_n=2 THEN
  SELECT count(*) INTO v_count_b FROM jsonb_array_elements(v_items) i
  WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_matrix->1) x
               WHERE x=i->>'id');
 END IF;
 IF p_mode='one_complete_alternative' AND v_count_a<>v_all_count OR
    p_mode='two_complete_alternatives' AND
     (v_count_a<>v_all_count OR v_count_b<>v_all_count) OR
    p_mode='two_supplier_combination' AND
     (v_count_a>=v_all_count OR v_count_b>=v_all_count OR
      EXISTS(SELECT 1 FROM jsonb_array_elements(v_items) i
       WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_matrix->0) x
                        WHERE x=i->>'id')
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_matrix->1) x
                        WHERE x=i->>'id')
      ) OR
      NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_matrix->0) x
       WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_matrix->1) y
                        WHERE y=x)) OR
      NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_matrix->1) x
       WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_matrix->0) y
                        WHERE y=x)))
 THEN RETURN jsonb_build_object('state','incomplete_or_ambiguous_coverage');END IF;
 v_state:=CASE p_mode WHEN 'one_complete_alternative'
  THEN 'one_complete_alternative' WHEN 'two_complete_alternatives'
  THEN 'two_complete_alternatives' ELSE 'two_supplier_combination' END;
 INSERT INTO cotironda_piloto_privado.finalist_source_plans_mvp196(
  request_id,source_hmacs,source_shas
 ) VALUES(p_request,v_seen,v_shas);
 INSERT INTO cotironda_piloto_privado.finalist_coverage_plans_mvp108(
  request_id,state,candidate_count,supplier_keys
 ) VALUES(p_request,v_state,v_n,v_keys);
 -- This only creates a PRIVATE plan. Existing contact-consent queue and
 -- Whapi outbox are never called by the selection transaction.
 RETURN jsonb_build_object('state','planned','candidate_count',v_n,
  'ranking_allowed',false,'contacts_revealed',false,'messages_sent',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_commit_commercial_plan_mvp196(
 uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_commit_commercial_plan_mvp196(
 uuid,text,jsonb) TO service_role;

-- Independent last-moment guard for the legacy Whapi claim/authorize path:
-- no attestation from this source-aware planner -> NO SEND.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_source_plan_sendable_mvp196(
 p_request uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $fn$
DECLARE v_snapshot jsonb;
BEGIN
 IF p_request IS NULL THEN RETURN false;END IF;
 -- Never accept only an old immutable HMAC marker as current consent
 -- or current source. A supplier may opt out or amend a quote after the
 -- private coverage plan is written; fail closed immediately.
 v_snapshot:=public.cotironda_piloto_private_round_inputs_mvp172(p_request);
 IF v_snapshot->>'state'<>'private_inputs' OR
    jsonb_typeof(v_snapshot->'quotations')<>'array'
 THEN RETURN false;END IF;
 RETURN EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.finalist_source_plans_mvp196 proof
  JOIN cotironda_piloto_privado.finalist_coverage_plans_mvp108 plan
   ON plan.request_id=proof.request_id
  JOIN cotironda_piloto_privado.requests r
   ON r.id=proof.request_id
  JOIN cotironda_piloto_privado.finalist_activation_mvp113 a
   ON a.only_row AND a.enabled AND a.activated_at<=clock_timestamp()
    AND r.created_at>=a.activated_at
  JOIN cotironda_piloto_privado.participants buyer
   ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
   AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  WHERE proof.request_id=p_request
   AND proof.verifier_version=196
   AND plan.candidate_count BETWEEN 1 AND 2
   AND cardinality(proof.source_hmacs)=plan.candidate_count
   AND cardinality(proof.source_shas)=plan.candidate_count
   AND cardinality(plan.supplier_keys)=plan.candidate_count
   AND cardinality(array(
    SELECT DISTINCT unnest(proof.source_hmacs)
   ))=plan.candidate_count
   AND r.state='closed' AND r.closes_at<=clock_timestamp()
   AND plan.state IN(
    'one_complete_alternative','two_complete_alternatives',
    'two_supplier_combination')
   AND NOT EXISTS(
    SELECT 1 FROM unnest(proof.source_hmacs,proof.source_shas)
      AS src(hmac,sha)
    LEFT JOIN cotironda_piloto_privado.supplier_media_quotes_mvp098 q
     ON q.message_hmac=src.hmac AND q.source_sha256=src.sha
      AND q.request_id=p_request AND q.received_at<=r.closes_at
    LEFT JOIN cotironda_piloto_privado.participants supplier
     ON supplier.key=q.supplier_key
      AND supplier.participant_role='supplier'
      AND supplier.consent_at IS NOT NULL
      AND supplier.opted_out_at IS NULL
    LEFT JOIN cotironda_piloto_privado.invitations invitation
     ON invitation.request_id=p_request
      AND invitation.supplier_key=q.supplier_key
      AND invitation.state='prepared'
    WHERE q.message_hmac IS NULL OR supplier.key IS NULL OR
     invitation.supplier_key IS NULL OR
     NOT q.supplier_key=ANY(plan.supplier_keys) OR
     NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(v_snapshot->'quotations') current_
      WHERE current_->'doc'->>'messageHmac'=src.hmac
       AND current_->'doc'->>'sourceSha256'=src.sha
       AND current_->'doc'->'prueba'->>'version'='9'
       AND current_->'doc'->'prueba'->>'revisionVigente'='true'
       AND current_->'doc'->'prueba'->>'cotizacionVigente'='true'
     ) OR
     EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 newer
      WHERE newer.request_id=p_request
       AND newer.supplier_key=q.supplier_key
       AND newer.received_at<=r.closes_at
       AND (newer.received_at,newer.message_hmac)>
           (q.received_at,q.message_hmac)
     ) OR
     EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.offer_versions later
      WHERE later.request_id=p_request
       AND later.supplier_key=q.supplier_key
       AND later.created_at<=r.closes_at
       AND later.created_at>=q.received_at
     )
   ) AND (
    SELECT count(DISTINCT selected.supplier_key)
    FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 selected
    WHERE selected.request_id=p_request AND
     selected.message_hmac=ANY(proof.source_hmacs)
   )=plan.candidate_count
 );
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_source_plan_sendable_mvp196(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_source_plan_sendable_mvp196(uuid)
 TO service_role;

-- Only prospective, v9-attested private plans are eligible for a future
-- separately authorized queue. This routine never queues or sends.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_commercial_queue_due_mvp196(
 p_limit integer DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $fn$
DECLARE v_requests jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN
  RETURN jsonb_build_object('state','invalid_limit');END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.finalist_activation_mvp113 a
  WHERE a.only_row AND a.enabled AND a.activated_at<=clock_timestamp()
 ) THEN RETURN jsonb_build_object('state','pilot_finalist_off');END IF;
 SELECT coalesce(jsonb_agg(id),'[]'::jsonb) INTO v_requests FROM (
  SELECT req.id FROM cotironda_piloto_privado.requests req
  JOIN cotironda_piloto_privado.finalist_activation_mvp113 a
   ON a.only_row AND a.enabled AND a.activated_at<=clock_timestamp()
    AND req.created_at>=a.activated_at
  JOIN cotironda_piloto_privado.finalist_source_plans_mvp196 verified
   ON verified.request_id=req.id AND verified.verifier_version=196
  JOIN cotironda_piloto_privado.finalist_coverage_plans_mvp108 p
   ON p.request_id=req.id AND cardinality(verified.source_hmacs)=p.candidate_count
  WHERE req.state='closed' AND req.closes_at<=clock_timestamp()
   AND p.state IN('one_complete_alternative','two_complete_alternatives',
                  'two_supplier_combination')
   AND public.cotironda_piloto_source_plan_sendable_mvp196(req.id)
   AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110 w
    WHERE w.request_id=req.id
   )
  ORDER BY req.closes_at,req.id LIMIT p_limit
 ) s;
 RETURN jsonb_build_object('state','queue_candidates',
  'requestIds',v_requests,'messages_sent',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_commercial_queue_due_mvp196(integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_commercial_queue_due_mvp196(integer)
 TO service_role;

-- A tracking token cannot reveal identities merely because a legacy
-- MVP159 plan exists. Repeat the buyer token/revocation and V196 attestation
-- checks on the PRIVATE Edge before calling the legacy finalist decryptor.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_tracking_source_plan_mvp196(
 p_token_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $fn$
DECLARE v_request uuid;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 THEN RETURN false;END IF;
 SELECT r.id INTO v_request
 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
 JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 WHERE t.token_hash=p_token_hash AND t.revoked_at IS NULL
  AND t.expires_at>clock_timestamp()
  AND r.state='closed' AND r.closes_at<=clock_timestamp();
 IF NOT FOUND THEN RETURN false;END IF;
 RETURN public.cotironda_piloto_source_plan_sendable_mvp196(v_request);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_tracking_source_plan_mvp196(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_tracking_source_plan_mvp196(text)
 TO service_role;
