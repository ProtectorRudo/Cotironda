-- Cotironda V2 B2: isolated, versioned shadow re-read of immutable supplier
-- originals. DEVELOPMENT ONLY. Never mutate MVP292, source, offers, or tracking.
-- Do not deploy without "Publicalo". PRIVATE service-role RPCs only.
CREATE TABLE cotironda_piloto_privado.v2_shadow_settings (
 only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO cotironda_piloto_privado.v2_shadow_settings(only_row,enabled)
VALUES(true,false);
ALTER TABLE cotironda_piloto_privado.v2_shadow_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_shadow_settings
 FROM PUBLIC,anon,authenticated;

CREATE TABLE cotironda_piloto_privado.v2_supplier_shadow_runs (
 source_hmac text NOT NULL
  REFERENCES cotironda_piloto_privado.media_archive_mvp095(message_hmac)
  ON DELETE RESTRICT,
 processor_version text NOT NULL
  CHECK(processor_version='v2_b2_20261110'),
 supplier_key text NOT NULL
  REFERENCES cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 mime text NOT NULL,
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 8 AND 8388608),
 state text NOT NULL DEFAULT 'leased'
  CHECK(state IN('leased','candidate_private','review','uncertain')),
 reason_code text,
 -- PRIVATE, UNVERIFIED extracted literals. Not a buyer-facing offer.
 candidate jsonb,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 PRIMARY KEY(source_hmac,processor_version),
 CONSTRAINT v2_shadow_state_finished_ck
 CHECK ((state='leased')=(finished_at IS NULL)),
 CONSTRAINT v2_shadow_reason_ck
 CHECK(reason_code IS NULL OR reason_code ~ '^[a-z_]{3,60}$'),
 CONSTRAINT v2_shadow_candidate_ck
 CHECK (candidate IS NULL OR (
  state='candidate_private'
  AND jsonb_typeof(candidate)='object'
  AND octet_length(candidate::text)<=250000))
);
ALTER TABLE cotironda_piloto_privado.v2_supplier_shadow_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_supplier_shadow_runs
 FROM PUBLIC,anon,authenticated;
CREATE INDEX v2_shadow_runs_claimed_idx
 ON cotironda_piloto_privado.v2_supplier_shadow_runs(claimed_at);

-- A new private source candidate is never a substitute for a reviewed quote:
-- only the B2 shadow flag allows claiming, and at most one claim per source+
-- EXACT pinned version. A later version must have its own reviewed migration.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_v2_shadow_b2()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_source record;v_n int;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
               WHERE only_row AND enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
               WHERE only_row AND whatsapp_inbound_enabled
                 AND media_archive_enabled_mvp095)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 -- Bounded work, no unreviewed auto-loop or runaway API usage.
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_supplier_shadow_runs
     WHERE claimed_at>clock_timestamp()-interval '1 hour') >= 5
 THEN RETURN jsonb_build_object('state','quota');END IF;

 SELECT a.message_hmac,a.content_sha256,a.mime,a.size_bytes,a.participant_key
 INTO v_source
 FROM cotironda_piloto_privado.media_archive_mvp095 a
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=a.message_hmac AND m.chat_hmac=a.chat_hmac
   AND m.participant_key=a.participant_key
 JOIN cotironda_piloto_privado.participants s
  ON s.key=m.participant_key AND s.chat_hmac=m.chat_hmac
 JOIN cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292 old
  ON old.source_hmac=a.message_hmac AND old.supplier_key=a.participant_key
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
  ON u.message_hmac=m.message_hmac AND u.supplier_key=m.participant_key
   AND u.source_sha256=a.content_sha256
 WHERE a.state='stored' AND a.request_id IS NULL
  AND a.review_state='suggested_only'
  AND a.mime IN (
   'application/pdf','image/png','image/jpeg','image/webp',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'text/plain','text/csv')
  AND a.size_bytes BETWEEN 8 AND 8388608
  AND a.storage_path='media/'||a.message_hmac
  AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  AND m.request_id IS NULL
  AND m.processing_state IN('needs_review','unmatched_quote')
  AND m.kind IN('document','image')
  AND m.received_at>=clock_timestamp()-interval '14 days'
  AND s.participant_role='supplier' AND s.consent_at IS NOT NULL
  AND s.opted_out_at IS NULL
  AND old.state='review' AND old.finished_at IS NOT NULL
  AND u.state='ambiguous_round' AND u.resolved_request_id IS NULL
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_supplier_shadow_runs prior
   WHERE prior.source_hmac=a.message_hmac
    AND prior.processor_version='v2_b2_20261110')
  AND EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.requests r
   JOIN cotironda_piloto_privado.invitations i
    ON i.request_id=r.id AND i.supplier_key=m.participant_key
      AND i.state='prepared'
   JOIN cotironda_piloto_privado.participants b
    ON b.key=r.buyer_key AND b.participant_role='buyer'
      AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
   WHERE r.created_at<=m.received_at
    AND (EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
      WHERE j.request_id=r.id AND j.supplier_key=m.participant_key
       AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL
       AND j.finished_at<=m.received_at)
    OR EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
      WHERE o.request_id=r.id AND o.supplier_key=m.participant_key
       AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
       AND o.sent_at<=m.received_at))
  )
 ORDER BY m.received_at,a.message_hmac
 LIMIT 1 FOR UPDATE OF a,m SKIP LOCKED;

 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 INSERT INTO cotironda_piloto_privado.v2_supplier_shadow_runs(
  source_hmac,processor_version,supplier_key,source_sha256,mime,size_bytes)
 VALUES(v_source.message_hmac,'v2_b2_20261110',
  v_source.participant_key,v_source.content_sha256,v_source.mime,v_source.size_bytes)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 IF v_n<>1 THEN RETURN jsonb_build_object('state','busy');END IF;
 RETURN jsonb_build_object('state','claimed',
  'source_hmac',v_source.message_hmac,
  'source_sha256',v_source.content_sha256,
  'mime',v_source.mime,'size_bytes',v_source.size_bytes,
  'processor_version','v2_b2_20261110');
END $fn$;

-- Finalize only the exact reserved SHA/version. Do not update MVP292 or the
-- original file; no ranking or anonymous publication exists in this RPC.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_v2_shadow_b2(
 p_source_hmac text,p_source_sha256 text,p_state text,p_reason_code text,
 p_candidate jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_n int;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('candidate_private','review','uncertain')
 OR p_reason_code IS NULL OR p_reason_code !~ '^[a-z_]{3,60}$'
 OR (p_state<>'candidate_private' AND p_candidate IS NOT NULL)
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF p_state='candidate_private' AND
  (p_candidate IS NULL OR jsonb_typeof(p_candidate)<>'object'
   OR octet_length(p_candidate::text)>250000
   OR p_candidate->>'document_kind'<>'supplier_quote'
   OR jsonb_typeof(p_candidate->'lines')<>'array'
   OR jsonb_array_length(p_candidate->'lines') NOT BETWEEN 1 AND 500)
 THEN RETURN jsonb_build_object('state','invalid');END IF;

 UPDATE cotironda_piloto_privado.v2_supplier_shadow_runs run
 SET state=p_state,reason_code=p_reason_code,
  candidate=p_candidate,finished_at=clock_timestamp()
 FROM cotironda_piloto_privado.media_archive_mvp095 a
 WHERE run.source_hmac=p_source_hmac
  AND run.processor_version='v2_b2_20261110'
  AND run.state='leased'
  AND run.claimed_at>clock_timestamp()-interval '5 minutes'
  AND run.source_sha256=p_source_sha256
  AND a.message_hmac=run.source_hmac
  AND a.content_sha256=run.source_sha256
  AND a.state='stored'
  AND a.storage_path='media/'||a.message_hmac;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN v_n=1 THEN 'recorded' ELSE 'not_leased' END);
END $fn$;

-- SQL functions in public default to EXECUTE by PUBLIC unless explicitly
-- revoked; both B2 RPCs remain accessible only to service_role.
REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_v2_shadow_b2()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_v2_shadow_b2(
 text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_v2_shadow_b2()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_v2_shadow_b2(
 text,text,text,text,jsonb) TO service_role;
