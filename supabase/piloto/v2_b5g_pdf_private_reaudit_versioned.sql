-- B5g — read-only source selection + NEW private versioned recheck ledger.
-- Development only, do not deploy without "Publicalo". No old leases reset.
-- Dependencies: B2 + B5d installed; native PRIVATE Storage SHA is checked
-- separately in worker. This ledger can NEVER become a public quote source.
CREATE TABLE cotironda_piloto_privado.v2_pdf_reaudits_b5g (
 source_hmac text NOT NULL,
 source_processor_version text NOT NULL DEFAULT 'v2_b5d_20261110'
  CHECK(source_processor_version='v2_b5d_20261110'),
 processor_version text NOT NULL DEFAULT 'v2_b5g_20261111'
  CHECK(processor_version='v2_b5g_20261111'),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 supplier_key text NOT NULL REFERENCES
  cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'leased'
  CHECK(state IN('leased','private_source_observed','review','uncertain')),
 reason_code text NULL CHECK(
  reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{2,59}$'),
 diagnostics jsonb NULL,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz NULL,
 PRIMARY KEY(source_hmac,processor_version),
 FOREIGN KEY(source_hmac,source_processor_version)
  REFERENCES cotironda_piloto_privado.v2_source_review_b5d
   (source_hmac,processor_version) ON DELETE RESTRICT,
 CONSTRAINT b5g_state_time CHECK (
  (state='leased')=(finished_at IS NULL)),
 CONSTRAINT b5g_private_diagnostics CHECK (
   (state='leased' AND diagnostics IS NULL AND reason_code IS NULL)
   OR (state='uncertain' AND diagnostics IS NULL AND reason_code IS NOT NULL)
   OR (state IN('private_source_observed','review')
    AND reason_code IS NOT NULL
    AND diagnostics IS NOT NULL
    AND jsonb_typeof(diagnostics)='array'
    AND octet_length(diagnostics::text)<49000)
 )
);
ALTER TABLE cotironda_piloto_privado.v2_pdf_reaudits_b5g
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_pdf_reaudits_b5g
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_v2_pdf_b5g()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v record;n integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
               WHERE only_row AND enabled)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
               WHERE only_row AND whatsapp_inbound_enabled
                AND media_archive_enabled_mvp095)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_reaudits_b5g
     WHERE claimed_at>clock_timestamp()-interval '1 hour')>=2
 THEN RETURN jsonb_build_object('state','quota');END IF;
 SELECT r.source_hmac,r.source_sha256,r.supplier_key,
        a.size_bytes,r.candidate
 INTO v
 FROM cotironda_piloto_privado.v2_source_review_b5d r
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
   ON a.message_hmac=r.source_hmac
  AND a.content_sha256=r.source_sha256
  AND a.participant_key=r.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox inbox
   ON inbox.message_hmac=a.message_hmac
  AND inbox.chat_hmac=a.chat_hmac
  AND inbox.participant_key=a.participant_key
 JOIN cotironda_piloto_privado.participants s
   ON s.key=r.supplier_key AND s.chat_hmac=a.chat_hmac
 WHERE r.processor_version='v2_b5d_20261110'
  AND r.source_mode='historical_pdf'
  AND r.mime='application/pdf'
  AND r.state='candidate_private'
  AND r.request_id IS NULL AND a.request_id IS NULL
  AND r.source_sha256=a.content_sha256
  AND r.size_bytes=a.size_bytes
  AND r.source_hmac ~ '^[a-f0-9]{64}$'
  AND r.source_sha256 ~ '^[a-f0-9]{64}$'
  AND a.storage_path='media/'||a.message_hmac
  AND a.state='stored' AND a.mime='application/pdf'
  AND a.size_bytes BETWEEN 120 AND 8388608
  AND inbox.kind=a.kind
  AND inbox.request_id IS NULL
  AND inbox.received_at>=clock_timestamp()-interval '14 days'
  AND s.participant_role='supplier'
  AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
  AND r.candidate IS NOT NULL
  AND jsonb_typeof(r.candidate)='object'
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_pdf_reaudits_b5g seen
   WHERE seen.source_hmac=r.source_hmac
    AND seen.processor_version='v2_b5g_20261111')
 ORDER BY r.claimed_at,r.source_hmac
 LIMIT 1 FOR UPDATE OF r,a SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 INSERT INTO cotironda_piloto_privado.v2_pdf_reaudits_b5g
  (source_hmac,source_sha256,supplier_key)
 VALUES(v.source_hmac,v.source_sha256,v.supplier_key)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN jsonb_build_object('state','busy');END IF;
 RETURN jsonb_build_object('state','claimed',
  'source_hmac',v.source_hmac,'source_sha256',v.source_sha256,
  'size_bytes',v.size_bytes,'processor_version','v2_b5g_20261111',
  'historic_candidate',v.candidate);
END $fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_v2_pdf_b5g(
 p_source_hmac text,p_source_sha256 text,p_state text,
 p_reason_code text,p_diagnostics jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('private_source_observed','review','uncertain')
 OR p_reason_code IS NULL OR p_reason_code !~ '^[a-z][a-z0-9_]{2,59}$'
 OR (p_state='private_source_observed'
  AND p_reason_code<>'b5g_pdf_source_private')
 OR (p_state='uncertain' AND p_diagnostics IS NOT NULL)
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF p_diagnostics IS NOT NULL THEN
  IF jsonb_typeof(p_diagnostics) IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_diagnostics) NOT BETWEEN 1 AND 500
   OR octet_length(p_diagnostics::text)>=49000
   OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(p_diagnostics) d
     WHERE d->>'source_verified' IS DISTINCT FROM 'false'
      OR d->>'can_publish' IS DISTINCT FROM 'false'
      OR d->>'can_rank' IS DISTINCT FROM 'false')
  THEN RETURN jsonb_build_object('state','invalid');END IF;
 ELSIF p_state='private_source_observed'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.v2_pdf_reaudits_b5g run
 SET state=p_state,reason_code=p_reason_code,
  diagnostics=p_diagnostics,finished_at=clock_timestamp()
 FROM cotironda_piloto_privado.media_archive_mvp095 a,
      cotironda_piloto_privado.v2_source_review_b5d source,
      cotironda_piloto_privado.participants supplier
 WHERE run.source_hmac=p_source_hmac
  AND run.processor_version='v2_b5g_20261111'
  AND run.state='leased'
  AND run.claimed_at>clock_timestamp()-interval '5 minutes'
  AND run.source_sha256=p_source_sha256
  AND source.source_hmac=run.source_hmac
  AND source.processor_version=run.source_processor_version
  AND source.state='candidate_private'
  AND source.source_sha256=run.source_sha256
  AND a.message_hmac=run.source_hmac
  AND a.content_sha256=run.source_sha256
  AND a.state='stored'
  AND a.storage_path='media/'||a.message_hmac
  AND a.participant_key=run.supplier_key
  AND supplier.key=run.supplier_key
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL
  AND supplier.opted_out_at IS NULL
  AND (p_diagnostics IS NULL OR
   jsonb_array_length(p_diagnostics)=
    jsonb_array_length(source.candidate->'lines'));
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN n=1 THEN 'recorded' ELSE 'not_leased' END);
END $fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_v2_pdf_b5g()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_v2_pdf_b5g(
 text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_v2_pdf_b5g()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_v2_pdf_b5g(
 text,text,text,text,jsonb) TO service_role;
