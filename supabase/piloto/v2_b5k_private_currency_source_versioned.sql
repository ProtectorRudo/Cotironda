-- B5k: DEVELOPMENT ONLY. Do not deploy without "Publicalo".
-- Target: ONE historical B5j source blocked only by currency ambiguity.
-- Original quote, historic B5d-B5j ledgers, Whapi and published offers untouched.
ALTER TABLE cotironda_piloto_privado.v2_shadow_settings
 ADD COLUMN b5k_only boolean NOT NULL DEFAULT false;
ALTER TABLE cotironda_piloto_privado.v2_shadow_settings
 ADD CONSTRAINT v2_only_one_private_audit_mode_b5k
 CHECK ((b5h_only::int+b5i_only::int+b5j_only::int+b5k_only::int)<=1);

CREATE TABLE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k(
 source_hmac text NOT NULL,
 source_processor_version text NOT NULL DEFAULT 'v2_b5j_20261111'
  CHECK (source_processor_version='v2_b5j_20261111'),
 processor_version text NOT NULL DEFAULT 'v2_b5k_20261111'
  CHECK (processor_version='v2_b5k_20261111'),
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'leased'
  CHECK (state IN('leased','private_diagnosed','review','uncertain')),
 reason_code text NULL CHECK
  (reason_code IS NULL OR reason_code ~ '^b5k_[a-z_]{3,55}$'),
 diagnostics jsonb NULL,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz NULL,
 PRIMARY KEY(source_hmac,processor_version),
 FOREIGN KEY(source_hmac,source_processor_version)
  REFERENCES cotironda_piloto_privado.v2_pdf_economic_diagnostics_b5j
  (source_hmac,processor_version) ON DELETE RESTRICT,
 CONSTRAINT b5k_state_time CHECK ((state='leased')=(finished_at IS NULL)),
 CONSTRAINT b5k_diagnostic_check CHECK (
  (state='leased' AND reason_code IS NULL AND diagnostics IS NULL)
  OR (state IN ('review','uncertain') AND reason_code IS NOT NULL AND diagnostics IS NULL)
  OR (state='private_diagnosed' AND reason_code='b5k_private_currency_diagnosis'
   AND diagnostics IS NOT NULL AND jsonb_typeof(diagnostics)='object'
   AND octet_length(diagnostics::text)<2500))
);
ALTER TABLE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_b5k_only_enabled()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $fn$
SELECT EXISTS (SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
 WHERE only_row AND enabled AND b5k_only
 AND NOT b5h_only AND NOT b5i_only AND NOT b5j_only);
$fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_v2_currency_b5k()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v record;n integer;
BEGIN
 IF NOT public.cotironda_piloto_v2_b5k_only_enabled()
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.integration_flags
   WHERE only_row AND whatsapp_inbound_enabled AND media_archive_enabled_mvp095)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
     WHERE claimed_at>clock_timestamp()-interval '1 hour')>=1
 THEN RETURN jsonb_build_object('state','quota');END IF;
 SELECT b.source_hmac,b.source_sha256,b.supplier_key,
  a.size_bytes,r.candidate INTO v
 FROM cotironda_piloto_privado.v2_pdf_economic_diagnostics_b5j b
 JOIN cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i g
  ON g.source_hmac=b.source_hmac
  AND g.processor_version='v2_b5i_20261111'
  AND g.source_sha256=b.source_sha256
  AND g.supplier_key=b.supplier_key
 JOIN cotironda_piloto_privado.v2_source_review_b5d r
  ON r.source_hmac=b.source_hmac
  AND r.processor_version='v2_b5d_20261110'
  AND r.source_sha256=b.source_sha256
  AND r.supplier_key=b.supplier_key
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=b.source_hmac
  AND a.content_sha256=b.source_sha256
  AND a.participant_key=b.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox inbox
  ON inbox.message_hmac=a.message_hmac
  AND inbox.chat_hmac=a.chat_hmac
  AND inbox.participant_key=a.participant_key
 JOIN cotironda_piloto_privado.participants s
  ON s.key=b.supplier_key AND s.chat_hmac=a.chat_hmac
 WHERE b.processor_version='v2_b5j_20261111'
 AND b.state='private_diagnosed' AND b.finished_at IS NOT NULL
 AND b.reason_code='b5j_private_economic_diagnosis'
 AND b.diagnostics->>'code'='currency_ambiguous'
 AND b.diagnostics->>'source_verified'='false'
 AND b.diagnostics->>'can_publish'='false'
 AND g.state='private_diagnosed'
 AND g.diagnostics->>'code'='amount_after_material_table'
 AND g.diagnostics->>'column'='aligned_material_total'
 AND r.source_mode='historical_pdf'
 AND r.state='candidate_private'
 AND r.mime='application/pdf'
 AND r.request_id IS NULL AND a.request_id IS NULL
 AND a.state='stored' AND a.mime='application/pdf'
 AND a.storage_path='media/'||a.message_hmac
 AND a.size_bytes=r.size_bytes
 AND a.size_bytes BETWEEN 120 AND 8388608
 AND b.source_hmac ~ '^[a-f0-9]{64}$'
 AND b.source_sha256 ~ '^[a-f0-9]{64}$'
 AND inbox.kind=a.kind AND inbox.request_id IS NULL
 AND inbox.received_at>=clock_timestamp()-interval '14 days'
 AND s.participant_role='supplier'
 AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
 AND jsonb_typeof(r.candidate)='object'
 AND NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k prior
  WHERE prior.source_hmac=b.source_hmac
   AND prior.processor_version='v2_b5k_20261111')
 ORDER BY b.claimed_at,b.source_hmac
 LIMIT 1 FOR UPDATE OF b,a SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 INSERT INTO cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
   (source_hmac,source_sha256,supplier_key)
 VALUES(v.source_hmac,v.source_sha256,v.supplier_key) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN jsonb_build_object('state','busy');END IF;
 RETURN jsonb_build_object('state','claimed','source_hmac',v.source_hmac,
  'source_sha256',v.source_sha256,'size_bytes',v.size_bytes,
  'processor_version','v2_b5k_20261111','historic_candidate',v.candidate);
END $fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_v2_currency_b5k(
 p_source_hmac text,p_source_sha256 text,p_state text,
 p_reason_code text,p_diagnostics jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE n integer;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN ('private_diagnosed','review','uncertain')
 OR p_reason_code IS NULL OR p_reason_code !~ '^b5k_[a-z_]{3,55}$'
 OR (p_state='private_diagnosed' AND p_reason_code<>'b5k_private_currency_diagnosis')
 OR (p_state<>'private_diagnosed' AND p_diagnostics IS NOT NULL)
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF p_state='private_diagnosed' THEN
  IF p_diagnostics IS NULL OR jsonb_typeof(p_diagnostics)<>'object'
   OR octet_length(p_diagnostics::text)>=2500
   OR NOT p_diagnostics ?& ARRAY[
    'currency_code','iso_verified','currency_material_count',
    'currency_lines_with_symbol','currency_units_with_symbol',
    'currency_footer_with_symbol','economic_code','economic_material_count',
    'economic_material_matches','economic_conditions_count',
    'economic_conditions_matches','economic_total_balances',
    'coverage_code','coverage_source_rows','coverage_attributed_rows',
    'coverage_unattributed_rows','coverage_lines','coverage_lines_matched',
    'coverage_conditions','coverage_conditions_matched','coverage_pages',
    'proof_reason','matched_lines','expected_lines',
    'source_verified','full_document_covered','can_publish','can_rank',
    'can_reveal_contacts']
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_diagnostics) AS k
      WHERE k NOT IN(
    'currency_code','iso_verified','currency_material_count',
    'currency_lines_with_symbol','currency_units_with_symbol',
    'currency_footer_with_symbol','economic_code','economic_material_count',
    'economic_material_matches','economic_conditions_count',
    'economic_conditions_matches','economic_total_balances',
    'coverage_code','coverage_source_rows','coverage_attributed_rows',
    'coverage_unattributed_rows','coverage_lines','coverage_lines_matched',
    'coverage_conditions','coverage_conditions_matched','coverage_pages',
    'proof_reason','matched_lines','expected_lines',
    'source_verified','full_document_covered','can_publish','can_rank',
    'can_reveal_contacts'))
   OR p_diagnostics->>'currency_code' NOT IN(
    'invalid_candidate','source_rows_unconfirmed','geometry_unconfirmed',
    'candidate_currency_conflict','mixed_currency_markers',
    'material_currency_unconfirmed','footer_currency_unconfirmed',
    'uniform_dollar_symbol_iso_unstated','explicit_ars_source',
    'foreign_currency_detected','no_currency_evidence')
   OR p_diagnostics->>'economic_code' NOT IN(
    'invalid_candidate','source_rows_unconfirmed','geometry_unconfirmed',
    'source_unmapped_content','currency_ambiguous','missing_line_amount',
    'invalid_charge_or_discount','discount_scope_ambiguous',
    'line_arithmetic_unconfirmed','source_conditions_unconfirmed',
    'fiscal_or_freight_ambiguous','grand_total_differs',
    'grand_total_balances_private')
   OR p_diagnostics->>'coverage_code' NOT IN(
    'candidate_invalid','reader_unconfirmed','source_lines_unconfirmed',
    'source_geometry_unconfirmed','line_assignment_ambiguous',
    'source_line_unaccounted','unmapped_fiscal_or_logistics',
    'unmapped_monetary_or_percentage','unmapped_text',
    'commercial_condition_unverified','unpriced_commercial_risk',
    'visible_rows_accounted_private')
   OR p_diagnostics->>'proof_reason' NOT IN(
    'source_total_unverified','rows_correspond_but_full_coverage_unchecked')
   OR EXISTS(SELECT 1 FROM jsonb_each(p_diagnostics) AS e(key,value)
      WHERE key IN('iso_verified','currency_footer_with_symbol',
      'economic_total_balances','source_verified','full_document_covered',
      'can_publish','can_rank','can_reveal_contacts')
      AND jsonb_typeof(value)<>'boolean')
   OR EXISTS(SELECT 1 FROM jsonb_each(p_diagnostics) AS e(key,value)
      WHERE key IN('currency_material_count','currency_lines_with_symbol',
      'currency_units_with_symbol','economic_material_count',
      'economic_material_matches','economic_conditions_count',
      'economic_conditions_matches','matched_lines','expected_lines',
      'coverage_source_rows','coverage_attributed_rows',
      'coverage_unattributed_rows','coverage_lines','coverage_lines_matched',
      'coverage_conditions','coverage_conditions_matched','coverage_pages')
      AND (jsonb_typeof(value)<>'number' OR value::text !~ '^[0-9]{1,4}$'
       OR CASE WHEN value::text ~ '^[0-9]{1,4}$'
        THEN value::text::integer>9000 ELSE true END))
   OR p_diagnostics->>'source_verified' IS DISTINCT FROM 'false'
   OR p_diagnostics->>'full_document_covered' IS DISTINCT FROM 'false'
   OR p_diagnostics->>'can_publish' IS DISTINCT FROM 'false'
   OR p_diagnostics->>'can_rank' IS DISTINCT FROM 'false'
   OR p_diagnostics->>'can_reveal_contacts' IS DISTINCT FROM 'false'
   OR (p_diagnostics->>'currency_lines_with_symbol')::int >
      (p_diagnostics->>'currency_material_count')::int
   OR (p_diagnostics->>'currency_units_with_symbol')::int >
      (p_diagnostics->>'currency_material_count')::int
   OR (p_diagnostics->>'economic_material_matches')::int >
      (p_diagnostics->>'economic_material_count')::int
   OR (p_diagnostics->>'coverage_attributed_rows')::int+
      (p_diagnostics->>'coverage_unattributed_rows')::int <>
      (p_diagnostics->>'coverage_source_rows')::int
   OR (p_diagnostics->>'coverage_lines_matched')::int >
      (p_diagnostics->>'coverage_lines')::int
   OR (p_diagnostics->>'coverage_conditions_matched')::int >
      (p_diagnostics->>'coverage_conditions')::int
   OR (p_diagnostics->>'economic_conditions_matches')::int >
      (p_diagnostics->>'economic_conditions_count')::int
   OR (p_diagnostics->>'coverage_code'='visible_rows_accounted_private'
      AND (p_diagnostics->>'coverage_unattributed_rows')::int<>0)
  THEN RETURN jsonb_build_object('state','invalid');END IF;
 END IF;
 UPDATE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k run
 SET state=p_state,reason_code=p_reason_code,
  diagnostics=p_diagnostics,finished_at=clock_timestamp()
 FROM cotironda_piloto_privado.v2_pdf_economic_diagnostics_b5j prev,
      cotironda_piloto_privado.v2_source_review_b5d r,
      cotironda_piloto_privado.media_archive_mvp095 a,
      cotironda_piloto_privado.participants s
 WHERE run.source_hmac=p_source_hmac
 AND run.processor_version='v2_b5k_20261111'
 AND run.state='leased'
 AND run.claimed_at>clock_timestamp()-interval '5 minutes'
 AND run.source_sha256=p_source_sha256
 AND prev.source_hmac=run.source_hmac
 AND prev.processor_version=run.source_processor_version
 AND prev.source_sha256=run.source_sha256
 AND prev.state='private_diagnosed'
 AND prev.diagnostics->>'code'='currency_ambiguous'
 AND r.source_hmac=run.source_hmac
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
     (p_diagnostics->>'expected_lines')::int =
       jsonb_array_length(r.candidate->'lines'));
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN n=1 THEN 'recorded' ELSE 'not_leased' END);
END $fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_b5k_only_enabled()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_v2_currency_b5k()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_v2_currency_b5k(
 text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_b5k_only_enabled() TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_v2_currency_b5k() TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_v2_currency_b5k(
 text,text,text,text,jsonb) TO service_role;
