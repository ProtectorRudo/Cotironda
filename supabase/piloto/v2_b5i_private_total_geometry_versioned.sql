-- B5i — development only, DO NOT DEPLOY without "Publicalo".
-- Isolated, source SHA-checked categorical geometry recheck of B5h histories.
-- Migration must be installed BEFORE Edge, flags are OFF by default.
ALTER TABLE cotironda_piloto_privado.v2_shadow_settings
 ADD COLUMN b5i_only boolean NOT NULL DEFAULT false;
ALTER TABLE cotironda_piloto_privado.v2_shadow_settings
 ADD CONSTRAINT v2_only_one_private_audit_mode_b5i
 CHECK (NOT (b5h_only AND b5i_only));

CREATE TABLE cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i (
 source_hmac text NOT NULL,
 source_processor_version text NOT NULL DEFAULT 'v2_b5h_20261111'
  CHECK (source_processor_version='v2_b5h_20261111'),
 processor_version text NOT NULL DEFAULT 'v2_b5i_20261111'
  CHECK (processor_version='v2_b5i_20261111'),
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
 supplier_key text NOT NULL REFERENCES
   cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'leased'
  CHECK(state IN('leased','private_diagnosed','review','uncertain')),
 reason_code text NULL CHECK (
  reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{2,59}$'),
 diagnostics jsonb NULL,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz NULL,
 PRIMARY KEY(source_hmac,processor_version),
 FOREIGN KEY(source_hmac,source_processor_version)
  REFERENCES cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h
   (source_hmac,processor_version) ON DELETE RESTRICT,
 CONSTRAINT b5i_state_time CHECK (
   (state='leased')=(finished_at IS NULL)),
 CONSTRAINT b5i_diagnostics_private CHECK (
   (state='leased' AND reason_code IS NULL AND diagnostics IS NULL)
   OR (state IN ('uncertain','review')
       AND reason_code IS NOT NULL AND diagnostics IS NULL)
   OR (state='private_diagnosed'
       AND reason_code='b5i_private_geometry_diagnosis'
       AND diagnostics IS NOT NULL
       AND jsonb_typeof(diagnostics)='object'
       AND octet_length(diagnostics::text)<2400))
);
ALTER TABLE cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_b5i_only_enabled()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
  WHERE only_row AND enabled AND b5i_only AND NOT b5h_only);
$fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_v2_geometry_b5i()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v record;n integer;
BEGIN
 IF NOT public.cotironda_piloto_v2_b5i_only_enabled()
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.integration_flags
   WHERE only_row AND whatsapp_inbound_enabled
    AND media_archive_enabled_mvp095)
 THEN RETURN jsonb_build_object('state','disabled'); END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i
     WHERE claimed_at>clock_timestamp()-interval '1 hour')>=2
 THEN RETURN jsonb_build_object('state','quota'); END IF;
 SELECT h.source_hmac,h.source_sha256,h.supplier_key,
   a.size_bytes,r.candidate INTO v
 FROM cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h h
 JOIN cotironda_piloto_privado.v2_pdf_reaudits_b5g g
  ON g.source_hmac=h.source_hmac
  AND g.processor_version='v2_b5g_20261111'
  AND g.source_sha256=h.source_sha256
  AND g.supplier_key=h.supplier_key
 JOIN cotironda_piloto_privado.v2_source_review_b5d r
  ON r.source_hmac=h.source_hmac
  AND r.processor_version='v2_b5d_20261110'
  AND r.source_sha256=h.source_sha256
  AND r.supplier_key=h.supplier_key
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=h.source_hmac
  AND a.content_sha256=h.source_sha256
  AND a.participant_key=h.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox inbox
  ON inbox.message_hmac=a.message_hmac
  AND inbox.chat_hmac=a.chat_hmac
  AND inbox.participant_key=a.participant_key
 JOIN cotironda_piloto_privado.participants s
  ON s.key=h.supplier_key AND s.chat_hmac=a.chat_hmac
 WHERE h.processor_version='v2_b5h_20261111'
  AND h.state='private_diagnosed' AND h.finished_at IS NOT NULL
  AND h.reason_code='b5h_private_total_diagnosis'
  AND h.diagnostics->>'code'='unlabeled_amount_found'
  AND h.diagnostics->>'source_verified'='false'
  AND g.state='review'
  AND r.source_mode='historical_pdf' AND r.mime='application/pdf'
  AND r.state='candidate_private' AND r.request_id IS NULL
  AND a.request_id IS NULL
  AND a.state='stored' AND a.mime='application/pdf'
  AND a.storage_path='media/'||a.message_hmac
  AND a.size_bytes=r.size_bytes
  AND a.size_bytes BETWEEN 120 AND 8388608
  AND h.source_hmac ~ '^[a-f0-9]{64}$'
  AND h.source_sha256 ~ '^[a-f0-9]{64}$'
  AND inbox.kind=a.kind AND inbox.request_id IS NULL
  AND inbox.received_at>=clock_timestamp()-interval '14 days'
  AND s.participant_role='supplier'
  AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
  AND r.candidate IS NOT NULL
  AND jsonb_typeof(r.candidate)='object'
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i prior
   WHERE prior.source_hmac=h.source_hmac
    AND prior.processor_version='v2_b5i_20261111')
 ORDER BY h.claimed_at,h.source_hmac
 LIMIT 1 FOR UPDATE OF h,a SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 INSERT INTO cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i
   (source_hmac,source_sha256,supplier_key)
 VALUES(v.source_hmac,v.source_sha256,v.supplier_key)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN jsonb_build_object('state','busy');END IF;
 RETURN jsonb_build_object('state','claimed',
  'source_hmac',v.source_hmac,'source_sha256',v.source_sha256,
  'size_bytes',v.size_bytes,'processor_version','v2_b5i_20261111',
  'historic_candidate',v.candidate);
END $fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_v2_geometry_b5i(
 p_source_hmac text,p_source_sha256 text,p_state text,
 p_reason_code text,p_diagnostics jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN ('private_diagnosed','review','uncertain')
 OR p_reason_code IS NULL OR p_reason_code !~ '^b5i_[a-z_]{3,45}$'
 OR (p_state='private_diagnosed' AND
     p_reason_code<>'b5i_private_geometry_diagnosis')
 OR (p_state<>'private_diagnosed' AND p_diagnostics IS NOT NULL)
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF p_state='private_diagnosed' THEN
  IF p_diagnostics IS NULL OR jsonb_typeof(p_diagnostics)<>'object'
   OR octet_length(p_diagnostics::text)>=2400
   OR NOT p_diagnostics ?& ARRAY[
    'code','context','column','candidate_rows','exact_cells',
    'material_rows','pages','source_verified','can_publish',
    'can_rank','can_reveal_contacts','proof_reason','matched_lines',
    'expected_lines']
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_diagnostics) AS k
    WHERE k NOT IN (
    'code','context','column','candidate_rows','exact_cells',
    'material_rows','pages','source_verified','can_publish',
    'can_rank','can_reveal_contacts','proof_reason','matched_lines',
    'expected_lines'))
   OR jsonb_typeof(p_diagnostics->'source_verified')<>'boolean'
   OR jsonb_typeof(p_diagnostics->'can_publish')<>'boolean'
   OR jsonb_typeof(p_diagnostics->'can_rank')<>'boolean'
   OR jsonb_typeof(p_diagnostics->'can_reveal_contacts')<>'boolean'
   OR p_diagnostics->>'source_verified' IS DISTINCT FROM 'false'
   OR p_diagnostics->>'can_publish' IS DISTINCT FROM 'false'
   OR p_diagnostics->>'can_rank' IS DISTINCT FROM 'false'
   OR p_diagnostics->>'can_reveal_contacts' IS DISTINCT FROM 'false'
   OR p_diagnostics->>'code' NOT IN (
    'invalid_geometry','declared_total_invalid','amount_absent',
    'multiple_matching_rows','amount_embedded_in_text_item',
    'amount_with_missing_coordinates','multiple_matching_cells',
    'amount_in_material_row','amount_in_fiscal_row',
    'amount_after_material_table','amount_within_material_band',
    'amount_before_material_table','material_band_unavailable')
   OR p_diagnostics->>'context' NOT IN (
    'alternative_commercial_label','fiscal_logistics_context',
    'no_recognizable_label')
   OR p_diagnostics->>'column' NOT IN (
    'aligned_material_total','not_aligned','unknown_material_column',
    'conflicting_columns')
   OR p_diagnostics->>'proof_reason' NOT IN (
    'rows_correspond_but_full_coverage_unchecked','invalid_file',
    'sha_mismatch','bad_candidate','pdf_unreadable','line_discrepancy',
    'reader_unavailable','source_total_unverified','unmapped_source_content')
   OR EXISTS(SELECT 1 FROM jsonb_each(p_diagnostics) e(key,value)
     WHERE key IN ('candidate_rows','exact_cells','material_rows',
        'pages','matched_lines','expected_lines')
       AND (jsonb_typeof(value)<>'number'
        OR value::text !~ '^[0-9]{1,4}$'
        OR CASE WHEN value::text ~ '^[0-9]{1,4}$'
          THEN (value::text)::integer>9000 ELSE true END))
  THEN RETURN jsonb_build_object('state','invalid');END IF;
 END IF;
 UPDATE cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i run
 SET state=p_state,reason_code=p_reason_code,
   diagnostics=p_diagnostics,finished_at=clock_timestamp()
 FROM cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h h,
      cotironda_piloto_privado.v2_source_review_b5d r,
      cotironda_piloto_privado.media_archive_mvp095 a,
      cotironda_piloto_privado.participants s
 WHERE run.source_hmac=p_source_hmac
  AND run.processor_version='v2_b5i_20261111'
  AND run.state='leased'
  AND run.claimed_at>clock_timestamp()-interval '5 minutes'
  AND run.source_sha256=p_source_sha256
  AND h.source_hmac=run.source_hmac
  AND h.processor_version=run.source_processor_version
  AND h.state='private_diagnosed'
  AND h.diagnostics->>'code'='unlabeled_amount_found'
  AND h.source_sha256=run.source_sha256
  AND r.source_hmac=h.source_hmac
  AND r.processor_version='v2_b5d_20261110'
  AND r.state='candidate_private'
  AND r.source_mode='historical_pdf'
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
    (p_diagnostics->>'expected_lines')::integer=
      jsonb_array_length(r.candidate->'lines'));
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN n=1 THEN 'recorded' ELSE 'not_leased' END);
END $fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_b5i_only_enabled()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_v2_geometry_b5i()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_v2_geometry_b5i(
 text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_b5i_only_enabled()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_v2_geometry_b5i()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_v2_geometry_b5i(
 text,text,text,text,jsonb) TO service_role;
