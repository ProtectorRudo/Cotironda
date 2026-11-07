-- MVP285 CANDIDATE 2/3, SOLO ENSAYO TRANSACCIONAL. NO EJECUTAR SIN ROLLBACK.
-- INICIO mvp259_commercial_memory_scoped.sql
-- MVP259 IA Central Etapa 6: bounded verified commercial memory.
-- Purely private; no LLM summaries, raw texts, contacts or money fields.
-- Prerequisites MVP221, MVP227 and authenticated Whapi inbox.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.whapi_inbox') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_shadow_rubros_mvp221') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227') IS NULL
 THEN RAISE EXCEPTION 'mvp259_missing_sources' USING errcode='42501';END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.commercial_context_events_mvp259(
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id)
  ON DELETE RESTRICT,
 participant_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key)
  ON DELETE RESTRICT,
 source_message_hmac text NOT NULL
  REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac)
  ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 fact_kind text NOT NULL CHECK(fact_kind IN(
  'buyer_delivery_city_verified','supplier_quote_verified')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 UNIQUE(request_id,participant_key,source_message_hmac,fact_kind),
 CHECK(expires_at>recorded_at),
 CHECK(expires_at<=recorded_at+interval '30 days')
);
CREATE INDEX commercial_context_mvp259_scope_idx
 ON cotironda_piloto_privado.commercial_context_events_mvp259
 (request_id,participant_key,expires_at DESC);
ALTER TABLE cotironda_piloto_privado.commercial_context_events_mvp259
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.commercial_context_events_mvp259
 FROM public,anon,authenticated,service_role;

-- Bind scope to the SAME authorized role, request and actual chat HMAC.
-- "Remembered" is source-provenanced, not free-form model memory.
CREATE FUNCTION public.cotironda_piloto_remember_commercial_mvp259(
 p_request uuid,p_chat_hmac text,p_message_hmac text,
 p_source_sha256 text,p_fact_kind text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 scope_count_ int;participant_ text;role_ text;deadline_ timestamptz;
 inserted_ int;previous_count_ int;source_ok_ boolean;expires_ timestamptz;
BEGIN
 IF p_request IS NULL OR p_chat_hmac IS NULL OR
    p_chat_hmac !~ '^[a-f0-9]{64}$' OR
    p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$' OR
    p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$' OR
    (p_fact_kind IS NULL OR p_fact_kind NOT IN(
      'buyer_delivery_city_verified','supplier_quote_verified'))
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT count(*),min(p.key),min(p.participant_role),min(r.closes_at)
 INTO scope_count_,participant_,role_,deadline_
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants p
  ON p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL
 WHERE r.id=p_request AND r.state IN('prepared','closed')
  AND (r.closes_at+interval '14 days')>clock_timestamp()
  AND (
   (p.participant_role='buyer' AND r.buyer_key=p.key) OR
   (p.participant_role='supplier' AND EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.invitations i
    JOIN cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
     ON d.request_id=i.request_id AND d.supplier_key=i.supplier_key
    WHERE i.request_id=r.id AND i.supplier_key=p.key
     AND i.state='prepared'))
  );
 IF scope_count_<>1 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 -- Lock the participant so opt-out cannot race the memory reservation;
 -- also serializes the 40-source quota under concurrent messages.
 PERFORM 1 FROM cotironda_piloto_privado.participants p
 WHERE p.key=participant_ AND p.chat_hmac=p_chat_hmac
  AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF (role_='buyer' AND p_fact_kind<>'buyer_delivery_city_verified') OR
    (role_='supplier' AND p_fact_kind<>'supplier_quote_verified')
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.whapi_inbox m
  JOIN cotironda_piloto_privado.requests r ON r.id=p_request
  WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
   AND m.participant_key=participant_
   AND m.plaintext_sha256=p_source_sha256
   AND (
    (role_='buyer' AND m.kind='text' AND
      m.message_hmac=r.source_hmac AND
      (m.request_id IS NULL OR m.request_id=p_request) AND
      char_length(btrim(r.delivery_city)) BETWEEN 3 AND 80) OR
    (role_='supplier' AND m.request_id=p_request AND EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 q
      WHERE q.message_hmac=m.message_hmac
       AND q.request_id=p_request AND q.supplier_key=participant_
       AND q.source_sha256=p_source_sha256 AND q.state='verified'))
   )
 ) INTO source_ok_;
 IF NOT source_ok_ THEN RETURN jsonb_build_object('state','source_not_verified');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.commercial_context_events_mvp259 e
  WHERE e.request_id=p_request AND e.participant_key=participant_
   AND e.source_message_hmac=p_message_hmac AND e.fact_kind=p_fact_kind)
 THEN RETURN jsonb_build_object('state','already_remembered');END IF;
 SELECT count(*) INTO previous_count_
 FROM cotironda_piloto_privado.commercial_context_events_mvp259 e
 WHERE e.request_id=p_request AND e.participant_key=participant_;
 IF previous_count_>=40 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;
 expires_:=least(deadline_+interval '14 days',
   clock_timestamp()+interval '30 days');
 IF expires_<=clock_timestamp() THEN
  RETURN jsonb_build_object('state','expired');END IF;
 INSERT INTO cotironda_piloto_privado.commercial_context_events_mvp259(
  request_id,participant_key,source_message_hmac,
  source_sha256,fact_kind,expires_at)
 VALUES(p_request,participant_,p_message_hmac,
  p_source_sha256,p_fact_kind,expires_)
 ON CONFLICT(request_id,participant_key,source_message_hmac,fact_kind)
 DO NOTHING;
 GET DIAGNOSTICS inserted_=row_count;
 RETURN jsonb_build_object(
  'state',CASE WHEN inserted_=1 THEN 'remembered_private'
  ELSE 'already_remembered' END);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_remember_commercial_mvp259(
 uuid,text,text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_remember_commercial_mvp259(
 uuid,text,text,text,text) TO service_role;

-- Assemble a FRESH snapshot from actual round state. Never replay an
-- obsolete quote as the current one: latest source review decides.
CREATE FUNCTION public.cotironda_piloto_commercial_context_mvp259(
 p_request uuid,p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 scope_count_ int;participant_ text;role_ text;city_ text;deadline_ timestamptz;
 r_ jsonb;facts_ int;city_attested_ boolean;quote_current_ boolean;
BEGIN
 IF p_request IS NULL OR p_chat_hmac IS NULL OR
    p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT count(*),min(p.key),min(p.participant_role),
  min(r.delivery_city),min(r.closes_at)
 INTO scope_count_,participant_,role_,city_,deadline_
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants p
  ON p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL
 WHERE r.id=p_request AND r.state IN('prepared','closed')
  AND r.closes_at+interval '14 days'>clock_timestamp()
  AND ((p.participant_role='buyer' AND r.buyer_key=p.key) OR
    (p.participant_role='supplier' AND EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.invitations i
     JOIN cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
      ON d.request_id=i.request_id AND d.supplier_key=i.supplier_key
     WHERE i.request_id=r.id AND i.supplier_key=p.key AND i.state='prepared'))
  );
 IF scope_count_<>1 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('rubro',v.rubro,
  'materiales',v.n) ORDER BY v.rubro),'[]'::jsonb)
 INTO r_
 FROM (
  SELECT rub.rubro,count(*)::integer AS n
  FROM cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
  WHERE rub.request_id=p_request AND
   (role_='buyer' OR EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 dest
    WHERE dest.request_id=rub.request_id AND dest.line_no=rub.line_no
     AND dest.supplier_key=participant_))
  GROUP BY rub.rubro
 ) v;
 SELECT count(*),coalesce(bool_or(fact_kind='buyer_delivery_city_verified'),false)
 INTO facts_,city_attested_
 FROM cotironda_piloto_privado.commercial_context_events_mvp259 e
 WHERE e.request_id=p_request AND e.participant_key=participant_
  AND e.expires_at>clock_timestamp();
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 q
  JOIN cotironda_piloto_privado.commercial_context_events_mvp259 e
   ON e.source_message_hmac=q.message_hmac
    AND e.request_id=q.request_id AND e.participant_key=q.supplier_key
    AND e.source_sha256=q.source_sha256 AND
    e.fact_kind='supplier_quote_verified' AND
    e.expires_at>clock_timestamp()
  WHERE role_='supplier' AND q.request_id=p_request AND
   q.supplier_key=participant_ AND q.state='verified' AND
   q.message_hmac=(
    SELECT last_.message_hmac
    FROM cotironda_piloto_privado.ai_supplier_review_mvp227 last_
    WHERE last_.request_id=p_request AND last_.supplier_key=participant_
    ORDER BY last_.reserved_at DESC,last_.message_hmac DESC LIMIT 1)
 ) INTO quote_current_;
 RETURN jsonb_build_object(
  'state','private_commercial_context',
  'role',role_,'delivery_city',city_,'rubros',r_,
  'remembered_sources',facts_,
  'buyer_city_source_remembered',CASE WHEN role_='buyer'
   THEN city_attested_ ELSE NULL END,
  'own_latest_verified_quote_remembered',CASE WHEN role_='supplier'
   THEN quote_current_ ELSE NULL END,
  'expires_at',deadline_+interval '14 days',
  'contains_prices',false,'contains_contacts',false,
  'automatic_decisions_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_commercial_context_mvp259(
 uuid,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_commercial_context_mvp259(
 uuid,text) TO service_role;

-- FIN mvp259_commercial_memory_scoped.sql

-- INICIO mvp260_memory_broker_bridge.sql
-- MVP260 / etapa 6: Memory as a verified broker guard, never source of prices.
-- Applied only AFTER MVP259. No network, WhatsApp, or model invocation in SQL.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.commercial_context_events_mvp259') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227') IS NULL
 THEN RAISE EXCEPTION 'mvp260_missing_memory_or_reviews' USING errcode='42501';END IF;
END $gate$;

-- Do not let Edge choose a round: determine it from the previously reserved
-- original message and verified chat, then take the existing scoped snapshot.
CREATE FUNCTION public.cotironda_piloto_memory_quote_context_mvp260(
 p_chat_hmac text,p_message_hmac text,p_source_sha256 text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE request_ uuid; participant_ text; scope_ jsonb;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$' OR
    p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$' OR
    p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT q.request_id,q.supplier_key INTO request_,participant_
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 q
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=q.message_hmac AND m.request_id=q.request_id
  AND m.participant_key=q.supplier_key
 JOIN cotironda_piloto_privado.participants p
  ON p.key=q.supplier_key AND p.chat_hmac=m.chat_hmac
 WHERE q.message_hmac=p_message_hmac AND q.state='reserved'
   AND q.source_sha256=p_source_sha256
   AND m.plaintext_sha256=p_source_sha256 AND m.chat_hmac=p_chat_hmac
   AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL;
 IF request_ IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 scope_:=public.cotironda_piloto_commercial_context_mvp259(request_,p_chat_hmac);
 IF scope_->>'state'<>'private_commercial_context'
    OR scope_->>'role'<>'supplier'
    OR scope_->>'contains_contacts'<>'false'
    OR scope_->>'contains_prices'<>'false'
    OR scope_->>'automatic_decisions_allowed'<>'false'
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 -- Strict allowlist; no request IDs, contacts, supplier names, prices or HMAC.
 RETURN jsonb_build_object(
   'state','verified_scope',
   'rubros',scope_->'rubros',
   'expires_at',scope_->>'expires_at',
   'own_latest_verified_quote_remembered',
     scope_->'own_latest_verified_quote_remembered',
   'contains_prices',false,'contains_contacts',false,
   'automatic_decisions_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_memory_quote_context_mvp260(
 text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_memory_quote_context_mvp260(
 text,text,text) TO service_role;

-- Write the memory pointer ONLY after the independent economic review has
-- persisted "verified". If database confirmation was lost, caller must
-- reconcile; never rerun the price model or the WhatsApp dispatch.
CREATE FUNCTION public.cotironda_piloto_memory_sync_quote_mvp260(
 p_chat_hmac text,p_message_hmac text,p_source_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE request_ uuid; recorded_ jsonb;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$' OR
    p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$' OR
    p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT q.request_id INTO request_
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 q
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=q.message_hmac AND m.request_id=q.request_id
  AND m.participant_key=q.supplier_key AND m.chat_hmac=p_chat_hmac
  AND m.plaintext_sha256=q.source_sha256
 JOIN cotironda_piloto_privado.participants p
  ON p.key=q.supplier_key AND p.chat_hmac=p_chat_hmac
 WHERE q.message_hmac=p_message_hmac
  AND q.state='verified' AND q.source_sha256=p_source_sha256
  AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL;
 IF request_ IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 recorded_:=public.cotironda_piloto_remember_commercial_mvp259(
  request_,p_chat_hmac,p_message_hmac,p_source_sha256,'supplier_quote_verified');
 RETURN jsonb_build_object('state',
  CASE WHEN recorded_->>'state' IN ('remembered_private','already_remembered')
   THEN recorded_->>'state' ELSE 'memory_not_saved' END);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_memory_sync_quote_mvp260(
 text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_memory_sync_quote_mvp260(
 text,text,text) TO service_role;

-- FIN mvp260_memory_broker_bridge.sql

-- INICIO mvp261_source_versions_commercial.sql
-- MVP261 / IA Central etapa 6: append-only, source-bound supplier versions.
-- A later partial correction NEVER merges with an earlier quotation;
-- the buyer's MVP227 "latest source only" rule remains authoritative.
-- No calls to OpenAI, Whapi, no automatic adjudication or price updates.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_supplier_links_mvp225') IS NULL OR
    to_regclass('cotironda_piloto_privado.whapi_inbox') IS NULL
 THEN RAISE EXCEPTION 'mvp261_sources_missing' USING errcode='42501';END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.supplier_source_versions_mvp261(
 message_hmac text PRIMARY KEY REFERENCES
  cotironda_piloto_privado.ai_supplier_review_mvp227(message_hmac)
  ON DELETE RESTRICT,
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id)
  ON DELETE RESTRICT,
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key)
  ON DELETE RESTRICT,
 revision_no smallint NOT NULL CHECK(revision_no BETWEEN 1 AND 25),
 previous_message_hmac text REFERENCES
  cotironda_piloto_privado.supplier_source_versions_mvp261(message_hmac)
  ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 review_state text NOT NULL CHECK(review_state IN('verified','review')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(request_id,supplier_key,revision_no),
 CHECK((revision_no=1 AND previous_message_hmac IS NULL)
  OR (revision_no>1 AND previous_message_hmac IS NOT NULL)),
 CHECK(previous_message_hmac IS DISTINCT FROM message_hmac)
);
CREATE INDEX supplier_source_versions_mvp261_scope
 ON cotironda_piloto_privado.supplier_source_versions_mvp261
 (request_id,supplier_key,revision_no DESC);
ALTER TABLE cotironda_piloto_privado.supplier_source_versions_mvp261
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supplier_source_versions_mvp261
 FROM PUBLIC,anon,authenticated,service_role;

-- SQL derives round + supplier exclusively from the FINISHED original
-- economic review and the encrypted inbox; no request_id supplied by AI.
-- Serializes by participant; on late/out-of-order sources, stops safely.
CREATE FUNCTION public.cotironda_piloto_record_source_version_mvp261(
 p_chat_hmac text,p_message_hmac text,p_source_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE
 q_ record;last_source_ text;previous_ text;version_ int;
 existing_ int;inserted_ int;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$' OR
    p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$' OR
    p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT q.request_id,q.supplier_key,q.state,q.source_sha256
 INTO q_
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 q
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
  ON link.message_hmac=q.message_hmac AND link.request_id=q.request_id
  AND link.supplier_key=q.supplier_key
  AND link.source_sha256=q.source_sha256
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=q.message_hmac AND m.request_id=q.request_id
  AND m.participant_key=q.supplier_key
  AND m.plaintext_sha256=q.source_sha256 AND m.chat_hmac=p_chat_hmac
 JOIN cotironda_piloto_privado.participants p
  ON p.key=q.supplier_key AND p.chat_hmac=p_chat_hmac
  AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.requests r ON r.id=q.request_id
 WHERE q.message_hmac=p_message_hmac AND q.source_sha256=p_source_sha256
  AND q.state IN('verified','review') AND q.finished_at IS NOT NULL
  AND r.state IN('prepared','closed')
  AND r.closes_at+interval '14 days'>clock_timestamp();
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 -- This row lock prevents two newly reviewed messages allocating the
 -- same revision number and ensures no concurrent opt-out wins the race.
 PERFORM 1 FROM cotironda_piloto_privado.participants p
 WHERE p.key=q_.supplier_key AND p.chat_hmac=p_chat_hmac
  AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 SELECT revision_no INTO existing_
 FROM cotironda_piloto_privado.supplier_source_versions_mvp261
 WHERE message_hmac=p_message_hmac
  AND request_id=q_.request_id AND supplier_key=q_.supplier_key
  AND source_sha256=p_source_sha256;
 IF FOUND THEN RETURN jsonb_build_object('state','already_versioned',
  'revision_no',existing_,'automatic_merge_allowed',false);END IF;
 -- Exactly the same source ordering as the private buyer view MVP227.
 SELECT l.message_hmac INTO last_source_
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=l.message_hmac
 WHERE l.request_id=q_.request_id AND l.supplier_key=q_.supplier_key
 ORDER BY m.received_at DESC,l.message_hmac DESC LIMIT 1;
 IF last_source_ IS DISTINCT FROM p_message_hmac THEN
  RETURN jsonb_build_object('state','newer_source_exists',
   'automatic_merge_allowed',false);END IF;
 SELECT v.message_hmac,v.revision_no
 INTO previous_,version_
 FROM cotironda_piloto_privado.supplier_source_versions_mvp261 v
 WHERE v.request_id=q_.request_id AND v.supplier_key=q_.supplier_key
 ORDER BY v.revision_no DESC LIMIT 1;
 version_:=coalesce(version_,0)+1;
 IF version_>25 THEN RETURN jsonb_build_object('state','quota_exceeded',
  'automatic_merge_allowed',false);END IF;
 INSERT INTO cotironda_piloto_privado.supplier_source_versions_mvp261(
  message_hmac,request_id,supplier_key,revision_no,
  previous_message_hmac,source_sha256,review_state
 ) VALUES(p_message_hmac,q_.request_id,q_.supplier_key,version_,
  previous_,p_source_sha256,q_.state)
 ON CONFLICT(message_hmac) DO NOTHING;
 GET DIAGNOSTICS inserted_=row_count;
 IF inserted_<>1 THEN RETURN jsonb_build_object('state','reconciliation_required',
  'automatic_merge_allowed',false);END IF;
 RETURN jsonb_build_object('state','version_recorded',
  'revision_no',version_,
  'has_previous_source',previous_ IS NOT NULL,
  'reviewed',q_.state='verified',
  'automatic_merge_allowed',false,'automatic_award_allowed',false);
END;$fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_record_source_version_mvp261(
 text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_record_source_version_mvp261(
 text,text,text) TO service_role;

-- FIN mvp261_source_versions_commercial.sql

-- INICIO mvp262_private_supervisor_readonly.sql
-- MVP262 / IA Central etapa 7: private, aggregate, read-only supervisor.
-- NO outbox writes, notifications, price modifications, contact reveal,
-- cron activation, payments or automatic adjudication.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.ai_dispatch_jobs_mvp222') IS NULL OR
 to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227') IS NULL OR
 to_regclass('cotironda_piloto_privado.document_ai_diagnostics_mvp127') IS NULL OR
 to_regclass('cotironda_piloto_privado.uncertain_triage_cases_mvp258') IS NULL OR
 to_regclass('cotironda_piloto_privado.uncertain_whapi_receipts_mvp257') IS NULL
 THEN RAISE EXCEPTION 'mvp262_dependency_missing' USING errcode='42501';
 END IF;
END $gate$;

-- Even service_role must invoke this function; direct access to the
-- underlying sensitive tables is not granted.
CREATE FUNCTION public.cotironda_piloto_supervisor_snapshot_mvp262(
 p_window_hours integer DEFAULT 24
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE
 t_ timestamptz:=statement_timestamp();
 uncertain_ bigint;stalled_ bigint;
 pending_ bigint;review_ bigint;quote_reserved_ bigint;
 retry_due_ bigint;manual_document_ bigint;
 triage_ bigint;new_triage_ bigint;receipt_ bigint;
 memory_expiring_ bigint;
 priority_ text;
BEGIN
 IF p_window_hours IS NULL OR p_window_hours NOT BETWEEN 1 AND 168
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT count(*) FILTER(WHERE state='uncertain'),
  count(*) FILTER(WHERE state='leased'
   AND leased_at<t_-interval '15 minutes'),
  count(*) FILTER(WHERE state='pending')
 INTO uncertain_,stalled_,pending_
 FROM (
  SELECT state,leased_at FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
  UNION ALL
  SELECT state,leased_at FROM cotironda_piloto_privado.whapi_outbox
 ) deliveries;
 SELECT count(*) FILTER(
    WHERE state='review' AND finished_at >=
     t_-make_interval(hours=>p_window_hours)),
  count(*) FILTER(
    WHERE state='reserved' AND reserved_at<t_-interval '15 minutes')
 INTO review_,quote_reserved_
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227;
 SELECT count(*) FILTER(WHERE state='failed' AND attempt_count<3
    AND next_retry_at<=t_
    AND public.cotironda_piloto_retryable_document_error_mvp256(reason_code)),
  count(*) FILTER(WHERE state='failed'
    AND last_attempt_at>=t_-make_interval(hours=>p_window_hours)
    AND NOT public.cotironda_piloto_retryable_document_error_mvp256(reason_code))
 INTO retry_due_,manual_document_
 FROM cotironda_piloto_privado.document_ai_diagnostics_mvp127;
 SELECT count(*),count(*) FILTER(WHERE n.case_id IS NULL)
 INTO triage_,new_triage_
 FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258 c
 LEFT JOIN LATERAL (
  SELECT x.case_id FROM cotironda_piloto_privado.uncertain_review_notes_mvp258 x
  WHERE x.case_id=c.case_id LIMIT 1
 ) n ON true;
 SELECT count(*) INTO receipt_
 FROM cotironda_piloto_privado.uncertain_whapi_receipts_mvp257;
 SELECT count(*) INTO memory_expiring_
 FROM cotironda_piloto_privado.commercial_context_events_mvp259
 WHERE expires_at>t_ AND expires_at<=t_+interval '24 hours';
 -- Active uncertainty is NEVER cleared on the basis of an observed receipt:
 -- original outbox status stays uncertain until independent reconciliation.
 priority_:=CASE
  WHEN uncertain_>0 OR stalled_>0 OR manual_document_>0 THEN 'blocked'
  WHEN quote_reserved_>0 OR review_>0 OR retry_due_>0
       OR new_triage_>0 THEN 'attention'
  ELSE 'ok' END;
 RETURN jsonb_build_object(
  'state','private_supervisor_snapshot',
  'severity',priority_,
  'window_hours',p_window_hours,
  'signals',jsonb_build_object(
   'outbound_uncertain',uncertain_,
   'outbound_stalled_lease',stalled_,
   'outbound_pending',pending_,
   'supplier_quotes_review',review_,
   'supplier_quotes_stale_reservation',quote_reserved_,
   'document_retry_due',retry_due_,
   'document_manual_review',manual_document_,
   'whapi_triage_cases',triage_,
   'whapi_triage_without_note',new_triage_,
   'whapi_status_evidence',receipt_,
   'commercial_memories_expiring_24h',memory_expiring_),
  'operator_actions',jsonb_build_array(
   CASE WHEN uncertain_>0 OR stalled_>0
     THEN 'investigate_uncertain_whapi_without_resend' ELSE NULL END,
   CASE WHEN manual_document_>0
     THEN 'inspect_permanent_document_failure' ELSE NULL END,
   CASE WHEN review_>0 OR quote_reserved_>0
     THEN 'review_supplier_quote_source' ELSE NULL END,
   CASE WHEN retry_due_>0
     THEN 'inspect_safe_document_retry_worker' ELSE NULL END),
  'costs_verified',false,
  'records_modified',false,
  'messages_sent',false,
  'automatic_resend_allowed',false,
  'automatic_award_allowed',false,
  'contacts_revealed',false
 );
END;$fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_supervisor_snapshot_mvp262(
 integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_supervisor_snapshot_mvp262(
 integer) TO service_role;

-- FIN mvp262_private_supervisor_readonly.sql

-- INICIO mvp263_supervisor_bounded_watchdog.sql
-- MVP263: IA Central supervisor watchdog, private/opt-in ONLY.
-- Prerequisite MVP262. The migration DOES NOT schedule cron or enable scans.
-- Zero outbound messages, zero LLM/API calls, zero award or price mutation.
DO $gate$ BEGIN
 IF to_regprocedure('public.cotironda_piloto_supervisor_snapshot_mvp262(integer)') IS NULL
 OR to_regclass('cotironda_piloto_privado.uncertain_triage_cases_mvp258') IS NULL
 THEN RAISE EXCEPTION 'mvp263_missing_supervisor_dependencies' USING errcode='42501';
 END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.supervisor_policy_mvp263(
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 max_runs_utc_day smallint NOT NULL DEFAULT 96
  CHECK(max_runs_utc_day BETWEEN 1 AND 96),
 last_run_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO cotironda_piloto_privado.supervisor_policy_mvp263(only_row,enabled)
 VALUES(true,false);
ALTER TABLE cotironda_piloto_privado.supervisor_policy_mvp263
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supervisor_policy_mvp263
 FROM PUBLIC,anon,authenticated,service_role;

-- One summary per 15-minute UTC bucket; maximum 96/day, 30-day retention.
-- No contact, source IDs, prompt or per-company prices in the snapshot.
CREATE TABLE cotironda_piloto_privado.supervisor_runs_mvp263(
 bucket_utc timestamptz PRIMARY KEY,
 severity text NOT NULL CHECK(severity IN('ok','attention','blocked')),
 signals jsonb NOT NULL CHECK(jsonb_typeof(signals)='object'),
 active_alerts smallint NOT NULL CHECK(active_alerts BETWEEN 0 AND 7),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.supervisor_runs_mvp263
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supervisor_runs_mvp263
 FROM PUBLIC,anon,authenticated,service_role;

-- A single row per allowed signal. Repeated ticks UPDATE the same row,
-- rather than inserting another alert or emitting a notification.
CREATE TABLE cotironda_piloto_privado.supervisor_alerts_mvp263(
 signal_code text PRIMARY KEY CHECK(signal_code IN(
  'outbound_uncertain','outbound_stalled_lease',
  'supplier_quotes_review','supplier_quotes_stale_reservation',
  'document_retry_due','document_manual_review',
  'whapi_triage_without_note')),
 active boolean NOT NULL,
 current_count bigint NOT NULL CHECK(current_count>=0),
 first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 resolved_at timestamptz,
 observations integer NOT NULL DEFAULT 1 CHECK(observations BETWEEN 1 AND 1000000),
 reopen_count integer NOT NULL DEFAULT 0 CHECK(reopen_count BETWEEN 0 AND 100000),
 CHECK((active AND resolved_at IS NULL AND current_count>0)
 OR (NOT active AND resolved_at IS NOT NULL AND current_count=0))
);
ALTER TABLE cotironda_piloto_privado.supervisor_alerts_mvp263
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supervisor_alerts_mvp263
 FROM PUBLIC,anon,authenticated,service_role;

-- Callable by an authorized SQL scheduler; no worker/cron is installed here.
-- The row lock + unique bucket makes duplicate and concurrent ticks inert.
CREATE FUNCTION public.cotironda_piloto_supervisor_tick_mvp263()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 policy_ record;
 now_ timestamptz:=clock_timestamp();
 bucket_ timestamptz:=date_bin('15 minutes',now_,
   '2000-01-01 00:00:00+00'::timestamptz);
 day_start_ timestamptz:=date_trunc('day',now_ AT TIME ZONE 'UTC')
   AT TIME ZONE 'UTC';
 run_count_ bigint;inserted_ integer;
 snapshot_ jsonb;signals_ jsonb;
 signal_ text;value_ bigint;
 active_count_ integer:=0;new_alerts_ integer:=0;
 reopened_ integer:=0;resolved_ integer:=0;
 had_alert_ boolean;was_active_ boolean;
 alert_codes_ text[]:=ARRAY[
  'outbound_uncertain','outbound_stalled_lease',
  'supplier_quotes_review','supplier_quotes_stale_reservation',
  'document_retry_due','document_manual_review',
  'whapi_triage_without_note'];
BEGIN
 SELECT enabled,max_runs_utc_day,last_run_at INTO policy_
 FROM cotironda_piloto_privado.supervisor_policy_mvp263
 WHERE only_row=true FOR UPDATE;
 IF NOT FOUND OR NOT policy_.enabled THEN
  RETURN jsonb_build_object('state','disabled','messages_sent',false,
   'external_api_calls',0,'automatic_resend_allowed',false);END IF;
 -- Compare fixed UTC buckets, not elapsed wall time. A job starting a few
 -- seconds late must NOT cause the next quarter-hour cron to be skipped.
 IF policy_.last_run_at IS NOT NULL AND
    date_bin('15 minutes',policy_.last_run_at,
     '2000-01-01 00:00:00+00'::timestamptz)>=bucket_ THEN
  RETURN jsonb_build_object('state','interval_guard','messages_sent',false,
   'external_api_calls',0,'automatic_resend_allowed',false);END IF;
 SELECT count(*) INTO run_count_
 FROM cotironda_piloto_privado.supervisor_runs_mvp263
 WHERE bucket_utc>=day_start_ AND bucket_utc<day_start_+interval '1 day';
 IF run_count_>=policy_.max_runs_utc_day THEN
  RETURN jsonb_build_object('state','daily_cap','messages_sent',false,
   'external_api_calls',0,'automatic_resend_allowed',false);END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.supervisor_runs_mvp263
  WHERE bucket_utc=bucket_) THEN
  RETURN jsonb_build_object('state','duplicate_bucket','messages_sent',false,
   'external_api_calls',0,'automatic_resend_allowed',false);END IF;

 snapshot_:=public.cotironda_piloto_supervisor_snapshot_mvp262(24);
 IF snapshot_->>'state'<>'private_supervisor_snapshot'
 OR snapshot_->>'severity' NOT IN('ok','attention','blocked')
 OR snapshot_->>'contacts_revealed'<>'false'
 OR snapshot_->>'automatic_award_allowed'<>'false'
 OR snapshot_->>'automatic_resend_allowed'<>'false'
 OR snapshot_->>'messages_sent'<>'false'
 OR snapshot_->>'records_modified'<>'false'
 OR snapshot_->>'costs_verified'<>'false'
 OR jsonb_typeof(snapshot_->'signals') IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'mvp263_untrusted_supervisor_snapshot'
  USING errcode='42501';END IF;
 signals_:=snapshot_->'signals';
 -- Validate every accepted signal; never trust caller-submitted alert codes.
 FOREACH signal_ IN ARRAY alert_codes_ LOOP
  IF jsonb_typeof(signals_->signal_) IS DISTINCT FROM 'number'
   OR (signals_->>signal_) !~ '^[0-9]{1,12}$'
  THEN RAISE EXCEPTION 'mvp263_invalid_signal'
   USING errcode='22023';END IF;
  value_:=(signals_->>signal_)::bigint;
  IF value_>1000000000 THEN
   RAISE EXCEPTION 'mvp263_signal_out_of_bounds' USING errcode='22023';END IF;
  IF value_>0 THEN active_count_:=active_count_+1;END IF;
 END LOOP;

 INSERT INTO cotironda_piloto_privado.supervisor_runs_mvp263(
  bucket_utc,severity,signals,active_alerts)
 VALUES(bucket_,snapshot_->>'severity',signals_,active_count_)
 ON CONFLICT(bucket_utc) DO NOTHING;
 GET DIAGNOSTICS inserted_=row_count;
 IF inserted_<>1 THEN
  RETURN jsonb_build_object('state','duplicate_bucket','messages_sent',false,
   'external_api_calls',0,'automatic_resend_allowed',false);END IF;

 FOREACH signal_ IN ARRAY alert_codes_ LOOP
  value_:=(signals_->>signal_)::bigint;
  IF value_>0 THEN
   SELECT true,a.active INTO had_alert_,was_active_
   FROM cotironda_piloto_privado.supervisor_alerts_mvp263 a
   WHERE a.signal_code=signal_;
   IF NOT FOUND THEN new_alerts_:=new_alerts_+1;
   ELSIF was_active_ IS FALSE THEN reopened_:=reopened_+1;END IF;
   INSERT INTO cotironda_piloto_privado.supervisor_alerts_mvp263(
    signal_code,active,current_count,first_seen_at,last_seen_at,
    resolved_at,observations,reopen_count)
   VALUES(signal_,true,value_,now_,now_,NULL,1,0)
   ON CONFLICT(signal_code) DO UPDATE SET
    active=true,current_count=excluded.current_count,
    first_seen_at=CASE WHEN
     cotironda_piloto_privado.supervisor_alerts_mvp263.active
     THEN cotironda_piloto_privado.supervisor_alerts_mvp263.first_seen_at
     ELSE excluded.first_seen_at END,
    last_seen_at=excluded.last_seen_at,resolved_at=NULL,
    observations=LEAST(
     cotironda_piloto_privado.supervisor_alerts_mvp263.observations+1,1000000),
    reopen_count=LEAST(
     cotironda_piloto_privado.supervisor_alerts_mvp263.reopen_count+
       CASE WHEN cotironda_piloto_privado.supervisor_alerts_mvp263.active
        THEN 0 ELSE 1 END,100000);
  ELSE
   UPDATE cotironda_piloto_privado.supervisor_alerts_mvp263
   SET active=false,current_count=0,resolved_at=now_,last_seen_at=now_
   WHERE signal_code=signal_ AND active=true;
   GET DIAGNOSTICS inserted_=row_count;
   resolved_:=resolved_+inserted_;
  END IF;
 END LOOP;
 UPDATE cotironda_piloto_privado.supervisor_policy_mvp263
 SET last_run_at=now_ WHERE only_row=true;
 -- Retention applies ONLY to the aggregate run ledger; the seven alert
 -- rows remain for manual audit. No deletion of customer or quote data.
 DELETE FROM cotironda_piloto_privado.supervisor_runs_mvp263
 WHERE bucket_utc<day_start_-interval '30 days';
 RETURN jsonb_build_object('state','recorded_private',
  'severity',snapshot_->>'severity','active_alerts',active_count_,
  'new_alerts',new_alerts_,'reopened_alerts',reopened_,
  'resolved_alerts',resolved_,
  'messages_sent',false,'external_api_calls',0,
  'model_calls',0,'costs_verified',false,
  'automatic_resend_allowed',false,
  'automatic_award_allowed',false,
  'contacts_revealed',false);
END;$fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_supervisor_tick_mvp263()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_supervisor_tick_mvp263()
 TO service_role;

-- Operator-only projection (never includes URLs, identities, phone or SHA).
CREATE FUNCTION public.cotironda_piloto_supervisor_alerts_mvp263()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT jsonb_build_object(
  'state','private_alerts',
  'enabled',(SELECT enabled FROM
    cotironda_piloto_privado.supervisor_policy_mvp263 WHERE only_row=true),
  'alerts',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'signal',signal_code,'active',active,'count',current_count,
    'first_seen_at',first_seen_at,'last_seen_at',last_seen_at,
    'resolved_at',resolved_at,'observations',observations,
    'reopens',reopen_count
    ) ORDER BY signal_code)
   FROM cotironda_piloto_privado.supervisor_alerts_mvp263
  ),'[]'::jsonb),
  'outbound_notifications_enabled',false,
  'models_called',false,'automatic_award_allowed',false)
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_supervisor_alerts_mvp263()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_supervisor_alerts_mvp263()
 TO service_role;

-- FIN mvp263_supervisor_bounded_watchdog.sql

-- INICIO mvp264_openai_usage_meters.sql
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

-- FIN mvp264_openai_usage_meters.sql

-- INICIO mvp265_supervisor_operator_casebook.sql
-- MVP265 / IA Central 7: append-only operator casebook for supervisor alerts.
-- No automated remediation, sends, contact reveal, quote updates or cron.
-- NO operator is enrolled by the migration. All actions require service_role.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.supervisor_alerts_mvp263') IS NULL
 THEN RAISE EXCEPTION 'mvp265_supervisor_missing' USING errcode='42501';END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.supervisor_operators_mvp265(
 operator_ref uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 active boolean NOT NULL DEFAULT false,
 role text NOT NULL CHECK(role IN('incident_manager')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 CHECK((active AND revoked_at IS NULL) OR (NOT active))
);
ALTER TABLE cotironda_piloto_privado.supervisor_operators_mvp265
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supervisor_operators_mvp265
 FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE cotironda_piloto_privado.supervisor_case_events_mvp265(
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 signal_code text NOT NULL REFERENCES
  cotironda_piloto_privado.supervisor_alerts_mvp263(signal_code),
 episode_started_at timestamptz NOT NULL,
 operator_ref uuid NOT NULL REFERENCES
  cotironda_piloto_privado.supervisor_operators_mvp265(operator_ref),
 action_code text NOT NULL CHECK(action_code IN(
  'acknowledge','investigate','escalate',
  'manual_reconciliation_needed','review_resolution')),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(signal_code,episode_started_at,action_code,evidence_sha256)
);
CREATE INDEX supervisor_cases_mvp265_episodes ON
 cotironda_piloto_privado.supervisor_case_events_mvp265(
  signal_code,episode_started_at,recorded_at DESC,event_id DESC);
ALTER TABLE cotironda_piloto_privado.supervisor_case_events_mvp265
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supervisor_case_events_mvp265
 FROM PUBLIC,anon,authenticated,service_role;

-- This RPC requires the calling service to have already authenticated the
-- actual operator; matching operator_ref is NOT standalone authentication.
-- The SQL verifies that operator_ref is explicitly enrolled and active.
CREATE FUNCTION public.cotironda_piloto_supervisor_case_action_mvp265(
 p_signal_code text,p_episode_started_at timestamptz,
 p_operator_ref uuid,p_action_code text,p_evidence_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE alert_ record;last_action_ text;
 count_today_ bigint;inserted_ integer;
BEGIN
 IF p_signal_code IS NULL OR p_signal_code NOT IN(
  'outbound_uncertain','outbound_stalled_lease',
  'supplier_quotes_review','supplier_quotes_stale_reservation',
  'document_retry_due','document_manual_review',
  'whapi_triage_without_note') OR
 p_episode_started_at IS NULL OR p_operator_ref IS NULL OR
 p_action_code IS NULL OR p_action_code NOT IN(
  'acknowledge','investigate','escalate',
  'manual_reconciliation_needed','review_resolution') OR
 p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Lock the alert only; never change its counts or its actual "active" flag.
 SELECT a.signal_code,a.first_seen_at,a.active INTO alert_
 FROM cotironda_piloto_privado.supervisor_alerts_mvp263 a
 WHERE a.signal_code=p_signal_code FOR UPDATE;
 IF NOT FOUND OR alert_.first_seen_at IS DISTINCT FROM p_episode_started_at
 THEN RETURN jsonb_build_object('state','stale_episode');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.supervisor_operators_mvp265 o
  WHERE o.operator_ref=p_operator_ref AND o.active
  AND o.revoked_at IS NULL AND o.role='incident_manager')
 THEN RETURN jsonb_build_object('state','operator_not_authorized');END IF;
 -- Replays must be harmless even if the incident's state has advanced.
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.supervisor_case_events_mvp265 e
  WHERE e.signal_code=p_signal_code
   AND e.episode_started_at=p_episode_started_at
   AND e.action_code=p_action_code
   AND e.evidence_sha256=p_evidence_sha256)
 THEN RETURN jsonb_build_object('state','already_recorded');END IF;
 SELECT count(*) INTO count_today_
 FROM cotironda_piloto_privado.supervisor_case_events_mvp265 e
 WHERE e.operator_ref=p_operator_ref
  AND e.recorded_at>=clock_timestamp()-interval '24 hours';
 IF count_today_>=200 THEN
  RETURN jsonb_build_object('state','operator_daily_cap');END IF;
 SELECT e.action_code INTO last_action_
 FROM cotironda_piloto_privado.supervisor_case_events_mvp265 e
 WHERE e.signal_code=p_signal_code AND
  e.episode_started_at=p_episode_started_at
 ORDER BY e.recorded_at DESC,e.event_id DESC LIMIT 1;
 IF alert_.active THEN
  IF (last_action_ IS NULL AND p_action_code<>'acknowledge') OR
    (last_action_ IS NOT NULL AND
     p_action_code NOT IN('investigate','escalate',
       'manual_reconciliation_needed')) THEN
   RETURN jsonb_build_object('state','invalid_transition');END IF;
 ELSE
  -- An operator can document review only after the actual measured signal
  -- has cleared. They cannot close an active operational incident by decree.
  IF last_action_ IS NULL OR p_action_code<>'review_resolution'
  THEN RETURN jsonb_build_object('state','requires_measured_resolution');END IF;
 END IF;
 INSERT INTO cotironda_piloto_privado.supervisor_case_events_mvp265(
  signal_code,episode_started_at,operator_ref,action_code,evidence_sha256)
 VALUES(p_signal_code,p_episode_started_at,p_operator_ref,p_action_code,p_evidence_sha256)
 ON CONFLICT(signal_code,episode_started_at,action_code,evidence_sha256)
 DO NOTHING;
 GET DIAGNOSTICS inserted_=row_count;
 RETURN jsonb_build_object('state',CASE WHEN inserted_=1
  THEN 'recorded_private' ELSE 'already_recorded' END,
  'signal_code',p_signal_code,
  'incident_resolved_by_operator',false,
  'messages_sent',false,'automatic_resend_allowed',false,
  'automatic_award_allowed',false,'contacts_revealed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_supervisor_case_action_mvp265(
 text,timestamptz,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_supervisor_case_action_mvp265(
 text,timestamptz,uuid,text,text) TO service_role;

-- Operator queue: only aggregate signal, age, SLA and documented state.
-- No operator identity, private evidence hash, request/company/phone/price.
CREATE FUNCTION public.cotironda_piloto_supervisor_case_queue_mvp265()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 WITH cases AS (
  SELECT a.signal_code,a.active,a.current_count,a.first_seen_at,
   CASE WHEN a.signal_code IN('outbound_uncertain',
     'outbound_stalled_lease','document_manual_review')
    THEN 'blocked' ELSE 'attention' END AS severity,
   GREATEST(0,floor(extract(epoch FROM (
     clock_timestamp()-a.first_seen_at))/60))::bigint AS age_minutes,
   e.action_code AS last_action,
   e.recorded_at AS last_action_at
  FROM cotironda_piloto_privado.supervisor_alerts_mvp263 a
  LEFT JOIN LATERAL(
   SELECT event_.action_code,event_.recorded_at
   FROM cotironda_piloto_privado.supervisor_case_events_mvp265 event_
   WHERE event_.signal_code=a.signal_code AND
    event_.episode_started_at=a.first_seen_at
   ORDER BY event_.recorded_at DESC,event_.event_id DESC LIMIT 1
  ) e ON true
 )
 SELECT jsonb_build_object(
  'state','private_operator_cases',
  'cases',coalesce(jsonb_agg(jsonb_build_object(
   'signal_code',signal_code,'severity',severity,
   'active',active,'count',current_count,
   'opened_at',first_seen_at,'age_minutes',age_minutes,
   'sla_minutes',CASE WHEN severity='blocked' THEN 30 ELSE 120 END,
   'unacknowledged_over_sla',active AND last_action IS NULL AND
     age_minutes>=CASE WHEN severity='blocked' THEN 30 ELSE 120 END,
   'review_state',CASE
    WHEN NOT active THEN 'source_resolved'
    WHEN last_action IS NULL THEN 'awaiting_operator'
    ELSE last_action END
   ) ORDER BY active DESC,severity,first_seen_at,signal_code),'[]'::jsonb),
  'notifications_sent',false,
  'operator_actions_execute_business_processes',false,
  'costs_verified',false
 )
 FROM cases
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_supervisor_case_queue_mvp265()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_supervisor_case_queue_mvp265()
 TO service_role;

-- FIN mvp265_supervisor_operator_casebook.sql