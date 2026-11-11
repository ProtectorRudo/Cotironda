-- B5d — NUEVO ledger PRIVADO para reauditar B2 y leer archivos ya asociados.
-- DESARROLLO; no aplicar al piloto sin "Publicalo". No toca los ledgers previos.
-- Requiere B2 (v2_shadow_settings, v2_supplier_shadow_runs).
CREATE TABLE cotironda_piloto_privado.v2_source_review_b5d (
 source_hmac text NOT NULL REFERENCES
  cotironda_piloto_privado.media_archive_mvp095(message_hmac) ON DELETE RESTRICT,
 processor_version text NOT NULL DEFAULT 'v2_b5d_20261110'
  CHECK (processor_version='v2_b5d_20261110'),
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
 supplier_key text NOT NULL REFERENCES
  cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 request_id uuid NULL REFERENCES
  cotironda_piloto_privado.requests(id) ON DELETE RESTRICT,
 source_mode text NOT NULL CHECK (source_mode IN ('historical_pdf','linked_quote')),
 mime text NOT NULL,
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 120 AND 8388608),
 state text NOT NULL DEFAULT 'leased'
  CHECK(state IN('leased','candidate_private','review','uncertain')),
 reason_code text CHECK(reason_code IS NULL OR reason_code ~ '^[a-z_]{3,60}$'),
 candidate jsonb NULL,
 diagnostics jsonb NULL,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz NULL,
 PRIMARY KEY(source_hmac,processor_version),
 CONSTRAINT b5d_finished_ck CHECK ((state='leased')=(finished_at IS NULL)),
 CONSTRAINT b5d_private_result_ck CHECK (
  (state='leased' AND candidate IS NULL AND diagnostics IS NULL)
  OR (state<>'leased' AND (
   (candidate IS NULL AND diagnostics IS NULL)
   OR (state='candidate_private' AND candidate IS NOT NULL
    AND diagnostics IS NOT NULL
    AND jsonb_typeof(candidate)='object'
    AND jsonb_typeof(diagnostics)='array'
    AND octet_length(candidate::text)<250000
    AND octet_length(diagnostics::text)<50000)))
 )
);
CREATE INDEX v2_source_review_b5d_claimed_idx ON
 cotironda_piloto_privado.v2_source_review_b5d(claimed_at);
ALTER TABLE cotironda_piloto_privado.v2_source_review_b5d ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_source_review_b5d
 FROM PUBLIC,anon,authenticated;

-- Exactly one selected original; immutable source hash; request_id is chosen
-- ONLY from preexisting archived association, never from the model or caller.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_v2_review_b5d()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v record; n integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
                WHERE only_row AND enabled)
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.integration_flags
                WHERE only_row AND whatsapp_inbound_enabled
                 AND media_archive_enabled_mvp095)
 THEN RETURN jsonb_build_object('state','disabled'); END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_source_review_b5d
     WHERE claimed_at>clock_timestamp()-interval '1 hour')>=6
 THEN RETURN jsonb_build_object('state','quota');END IF;
 SELECT a.message_hmac,a.content_sha256,a.participant_key,
        a.request_id,a.mime,a.size_bytes,
        CASE WHEN a.request_id IS NULL THEN 'historical_pdf'
             ELSE 'linked_quote' END AS source_mode,
        old.candidate AS historic_candidate
 INTO v
 FROM cotironda_piloto_privado.media_archive_mvp095 a
 JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.message_hmac=a.message_hmac
  AND m.chat_hmac=a.chat_hmac
  AND m.participant_key=a.participant_key
 JOIN cotironda_piloto_privado.participants s
   ON s.key=a.participant_key AND s.chat_hmac=a.chat_hmac
 LEFT JOIN cotironda_piloto_privado.v2_supplier_shadow_runs old
   ON old.source_hmac=a.message_hmac
  AND old.processor_version='v2_b2_20261110'
  AND old.source_sha256=a.content_sha256
  AND old.supplier_key=a.participant_key
  AND old.state='candidate_private'
 WHERE a.state='stored'
  AND a.storage_path='media/'||a.message_hmac
  AND a.message_hmac ~ '^[a-f0-9]{64}$'
  AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  AND a.size_bytes BETWEEN 120 AND 8388608
  AND a.mime IN ('application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  AND a.kind=m.kind AND m.kind IN('document','image')
  AND s.participant_role='supplier'
  AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
  AND m.received_at>=clock_timestamp()-interval '14 days'
  AND NOT EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.v2_source_review_b5d seen
    WHERE seen.source_hmac=a.message_hmac
     AND seen.processor_version='v2_b5d_20261110')
  AND (
   (a.request_id IS NULL AND a.mime='application/pdf'
    AND old.candidate IS NOT NULL
    AND jsonb_typeof(old.candidate)='object'
    AND m.request_id IS NULL)
   OR
   (a.request_id IS NOT NULL
    AND (m.request_id IS NULL OR m.request_id=a.request_id)
    AND EXISTS(
     SELECT 1
     FROM cotironda_piloto_privado.requests r
     JOIN cotironda_piloto_privado.invitations i
       ON i.request_id=r.id AND i.supplier_key=a.participant_key
      AND i.state='prepared'
     JOIN cotironda_piloto_privado.participants b
       ON b.key=r.buyer_key AND b.participant_role='buyer'
      AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
     WHERE r.id=a.request_id AND r.created_at<=m.received_at
      AND (EXISTS(
       SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
       WHERE j.request_id=r.id AND j.supplier_key=a.participant_key
        AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL
        AND j.finished_at<=m.received_at)
      OR EXISTS(
       SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
       WHERE o.request_id=r.id AND o.supplier_key=a.participant_key
        AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
        AND o.sent_at<=m.received_at))
    ))
  )
 ORDER BY CASE WHEN a.request_id IS NULL THEN 0 ELSE 1 END,
  m.received_at,a.message_hmac
 LIMIT 1 FOR UPDATE OF a,m SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 INSERT INTO cotironda_piloto_privado.v2_source_review_b5d
   (source_hmac,processor_version,source_sha256,supplier_key,request_id,
    source_mode,mime,size_bytes)
 VALUES (v.message_hmac,'v2_b5d_20261110',v.content_sha256,
  v.participant_key,v.request_id,v.source_mode,v.mime,v.size_bytes)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN jsonb_build_object('state','busy');END IF;
 -- Candidate only for historical source; never return contact/round ID.
 RETURN jsonb_build_object('state','claimed',
  'source_hmac',v.message_hmac,'source_sha256',v.content_sha256,
  'source_mode',v.source_mode,'mime',v.mime,
  'size_bytes',v.size_bytes,'processor_version','v2_b5d_20261110',
  'historic_candidate',v.historic_candidate);
END $fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_v2_review_b5d(
 p_source_hmac text,p_source_sha256 text,p_state text,
 p_reason_code text,p_candidate jsonb DEFAULT NULL,
 p_diagnostics jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('candidate_private','review','uncertain')
 OR p_reason_code IS NULL OR p_reason_code !~ '^[a-z_]{3,60}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF p_state='candidate_private' THEN
  IF p_candidate IS NULL
   OR jsonb_typeof(p_candidate) IS DISTINCT FROM 'object'
   OR p_candidate->>'document_kind' IS DISTINCT FROM 'supplier_quote'
   OR jsonb_typeof(p_candidate->'lines') IS DISTINCT FROM 'array'
  THEN RETURN jsonb_build_object('state','invalid');END IF;
  IF jsonb_array_length(p_candidate->'lines') NOT BETWEEN 1 AND 500
  THEN RETURN jsonb_build_object('state','invalid');END IF;
  IF p_diagnostics IS NULL
   OR jsonb_typeof(p_diagnostics) IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_diagnostics)<>jsonb_array_length(p_candidate->'lines')
   OR octet_length(p_diagnostics::text)>49000
   OR octet_length(p_candidate::text)>245000
  THEN RETURN jsonb_build_object('state','invalid');END IF;
 ELSIF p_candidate IS NOT NULL OR p_diagnostics IS NOT NULL
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.v2_source_review_b5d run
 SET state=p_state,reason_code=p_reason_code,
  candidate=p_candidate,diagnostics=p_diagnostics,
  finished_at=clock_timestamp()
 FROM cotironda_piloto_privado.media_archive_mvp095 a
 JOIN cotironda_piloto_privado.participants s
  ON s.key=a.participant_key
 WHERE run.source_hmac=p_source_hmac
  AND run.processor_version='v2_b5d_20261110'
  AND run.state='leased'
  AND run.claimed_at>clock_timestamp()-interval '5 minutes'
  AND run.source_sha256=p_source_sha256
  AND a.message_hmac=run.source_hmac
  AND a.content_sha256=run.source_sha256
  AND a.state='stored'
  AND a.storage_path='media/'||a.message_hmac
  AND a.request_id IS NOT DISTINCT FROM run.request_id
  AND a.participant_key=run.supplier_key
  AND s.participant_role='supplier'
  AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN n=1 THEN 'recorded' ELSE 'not_leased' END);
END $fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_v2_review_b5d()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_v2_review_b5d(
 text,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_v2_review_b5d()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_v2_review_b5d(
 text,text,text,text,jsonb,jsonb) TO service_role;
