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
