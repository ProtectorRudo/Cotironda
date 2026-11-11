-- B5h (development ONLY). Do not install until separate "Publicalo".
-- Exact prior B5g source; no old ledgers touched, no new WhatsApp/LLM.
-- B5h-only is an explicit, OFF-by-default maintenance mode.
ALTER TABLE cotironda_piloto_privado.v2_shadow_settings
 ADD COLUMN b5h_only boolean NOT NULL DEFAULT false;

CREATE TABLE cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h (
 source_hmac text NOT NULL,
 source_processor_version text NOT NULL DEFAULT 'v2_b5g_20261111'
  CHECK(source_processor_version='v2_b5g_20261111'),
 processor_version text NOT NULL DEFAULT 'v2_b5h_20261111'
  CHECK(processor_version='v2_b5h_20261111'),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 supplier_key text NOT NULL REFERENCES
  cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'leased'
  CHECK(state IN('leased','private_diagnosed','review','uncertain')),
 reason_code text NULL CHECK(
  reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{2,59}$'),
 diagnostics jsonb NULL,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz NULL,
 PRIMARY KEY(source_hmac,processor_version),
 FOREIGN KEY(source_hmac,source_processor_version)
 REFERENCES cotironda_piloto_privado.v2_pdf_reaudits_b5g
  (source_hmac,processor_version) ON DELETE RESTRICT,
 CONSTRAINT b5h_state_time CHECK (
  (state='leased')=(finished_at IS NULL)),
 CONSTRAINT b5h_state_diagnostics CHECK (
  (state='leased' AND reason_code IS NULL AND diagnostics IS NULL)
  OR (state='uncertain' AND reason_code IS NOT NULL AND diagnostics IS NULL)
  OR (state='review' AND reason_code IS NOT NULL AND diagnostics IS NULL)
  OR (state='private_diagnosed'
    AND reason_code='b5h_private_total_diagnosis'
    AND diagnostics IS NOT NULL
    AND jsonb_typeof(diagnostics)='object'
    AND octet_length(diagnostics::text)<2200))
);
ALTER TABLE cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_b5h_only_enabled()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
  WHERE only_row AND enabled AND b5h_only
 );
$fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_v2_total_b5h()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v record;n integer;
BEGIN
 IF NOT public.cotironda_piloto_v2_b5h_only_enabled()
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_inbound_enabled
   AND media_archive_enabled_mvp095)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h
     WHERE claimed_at>clock_timestamp()-interval '1 hour')>=2
 THEN RETURN jsonb_build_object('state','quota');END IF;
 SELECT g.source_hmac,g.source_sha256,g.supplier_key,
   a.size_bytes,r.candidate
 INTO v
 FROM cotironda_piloto_privado.v2_pdf_reaudits_b5g g
 JOIN cotironda_piloto_privado.v2_source_review_b5d r
   ON r.source_hmac=g.source_hmac
  AND r.processor_version='v2_b5d_20261110'
  AND r.source_sha256=g.source_sha256
  AND r.supplier_key=g.supplier_key
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
   ON a.message_hmac=g.source_hmac
  AND a.content_sha256=g.source_sha256
  AND a.participant_key=g.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox inbox
   ON inbox.message_hmac=a.message_hmac
  AND inbox.chat_hmac=a.chat_hmac
  AND inbox.participant_key=a.participant_key
 JOIN cotironda_piloto_privado.participants s
   ON s.key=g.supplier_key AND s.chat_hmac=a.chat_hmac
 WHERE g.processor_version='v2_b5g_20261111'
  AND g.state='review' AND g.finished_at IS NOT NULL
  AND g.reason_code='b5g_source_review_required'
  AND r.source_mode='historical_pdf' AND r.mime='application/pdf'
  AND r.state='candidate_private'
  AND r.request_id IS NULL AND a.request_id IS NULL
  AND a.state='stored' AND a.mime='application/pdf'
  AND a.storage_path='media/'||a.message_hmac
  AND a.size_bytes=r.size_bytes
  AND a.size_bytes BETWEEN 120 AND 8388608
  AND g.source_hmac ~ '^[a-f0-9]{64}$'
  AND g.source_sha256 ~ '^[a-f0-9]{64}$'
  AND inbox.kind=a.kind AND inbox.request_id IS NULL
  AND inbox.received_at>=clock_timestamp()-interval '14 days'
  AND s.participant_role='supplier'
  AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
  AND r.candidate IS NOT NULL
  AND jsonb_typeof(r.candidate)='object'
  AND NOT EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h seen
   WHERE seen.source_hmac=g.source_hmac
    AND seen.processor_version='v2_b5h_20261111')
 ORDER BY g.claimed_at,g.source_hmac
 LIMIT 1 FOR UPDATE OF g,a SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 INSERT INTO cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h
   (source_hmac,source_sha256,supplier_key)
 VALUES(v.source_hmac,v.source_sha256,v.supplier_key)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN jsonb_build_object('state','busy');END IF;
 RETURN jsonb_build_object('state','claimed',
   'source_hmac',v.source_hmac,'source_sha256',v.source_sha256,
   'size_bytes',v.size_bytes,'processor_version','v2_b5h_20261111',
   'historic_candidate',v.candidate);
END $fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_v2_total_b5h(
 p_source_hmac text,p_source_sha256 text,p_state text,
 p_reason_code text,p_diagnostics jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
  OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
  OR p_state NOT IN ('private_diagnosed','review','uncertain')
  OR p_reason_code IS NULL OR p_reason_code !~ '^b5h_[a-z_]{3,45}$'
  OR (p_state='private_diagnosed' AND
      p_reason_code<>'b5h_private_total_diagnosis')
  OR (p_state<>'private_diagnosed' AND p_diagnostics IS NOT NULL)
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF p_state='private_diagnosed' THEN
  IF p_diagnostics IS NULL OR jsonb_typeof(p_diagnostics)<>'object'
   OR octet_length(p_diagnostics::text)>=2200
   OR NOT p_diagnostics ?& ARRAY[
    'code','label_rows','header_rows','document_pages',
    'detected_amount_cells','matching_amount_cells',
    'source_verified','can_publish','can_rank','can_reveal_contacts',
    'proof_reason','matched_lines','expected_lines'
   ]
   OR EXISTS (
     SELECT 1 FROM jsonb_object_keys(p_diagnostics) AS k
     WHERE k NOT IN (
      'code','label_rows','header_rows','document_pages',
      'detected_amount_cells','matching_amount_cells',
      'source_verified','can_publish','can_rank','can_reveal_contacts',
      'proof_reason','matched_lines','expected_lines'))
   OR p_diagnostics->>'source_verified'<>'false'
   OR p_diagnostics->>'can_publish'<>'false'
   OR p_diagnostics->>'can_rank'<>'false'
   OR p_diagnostics->>'can_reveal_contacts'<>'false'
   OR p_diagnostics->>'code' NOT IN (
    'declared_total_invalid','total_label_missing','column_header_only',
    'unlabeled_amount_found','multiple_total_labels',
    'mixed_fiscal_logistics','multiple_amount_cells',
    'total_amount_differs','total_amount_missing',
    'next_row_has_other_content','same_row_corresponds_private',
    'next_row_corresponds_private','ambiguous_amounts')
   OR p_diagnostics->>'proof_reason' NOT IN (
    'rows_correspond_but_full_coverage_unchecked','invalid_file',
    'sha_mismatch','bad_candidate','pdf_unreadable','line_discrepancy',
    'reader_unavailable','source_total_unverified','unmapped_source_content')
   OR EXISTS (
    SELECT 1 FROM jsonb_each(p_diagnostics) AS e(key,value)
    WHERE key IN ('label_rows','header_rows','document_pages',
       'detected_amount_cells','matching_amount_cells',
       'matched_lines','expected_lines')
      AND (jsonb_typeof(value)<>'number'
       OR value::text !~ '^[0-9]{1,4}$'
       OR CASE WHEN value::text ~ '^[0-9]{1,4}$'
               THEN (value::text)::int>9000 ELSE true END)
   )
  THEN RETURN jsonb_build_object('state','invalid');END IF;
 END IF;
 UPDATE cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h run
 SET state=p_state,reason_code=p_reason_code,
  diagnostics=p_diagnostics,finished_at=clock_timestamp()
 FROM cotironda_piloto_privado.v2_pdf_reaudits_b5g g,
      cotironda_piloto_privado.v2_source_review_b5d r,
      cotironda_piloto_privado.media_archive_mvp095 a,
      cotironda_piloto_privado.participants s
 WHERE run.source_hmac=p_source_hmac
  AND run.processor_version='v2_b5h_20261111'
  AND run.state='leased'
  AND run.claimed_at>clock_timestamp()-interval '5 minutes'
  AND run.source_sha256=p_source_sha256
  AND g.source_hmac=run.source_hmac
  AND g.processor_version=run.source_processor_version
  AND g.state='review'
  AND g.source_sha256=run.source_sha256
  AND r.source_hmac=g.source_hmac
  AND r.processor_version='v2_b5d_20261110'
  AND r.source_mode='historical_pdf'
  AND r.state='candidate_private'
  AND r.source_sha256=run.source_sha256
  AND a.message_hmac=run.source_hmac
  AND a.content_sha256=run.source_sha256
  AND a.state='stored'
  AND a.storage_path='media/'||a.message_hmac
  AND a.participant_key=run.supplier_key
  AND s.key=run.supplier_key
  AND s.participant_role='supplier'
  AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
  AND (p_diagnostics IS NULL OR
   (p_diagnostics->>'expected_lines')::int=
   jsonb_array_length(r.candidate->'lines'));
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',
   CASE WHEN n=1 THEN 'recorded' ELSE 'not_leased' END);
END $fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_b5h_only_enabled()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_v2_total_b5h()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_v2_total_b5h(
 text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_b5h_only_enabled()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_v2_total_b5h()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_v2_total_b5h(
 text,text,text,text,jsonb) TO service_role;
