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
