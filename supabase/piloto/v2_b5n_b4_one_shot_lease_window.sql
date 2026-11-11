-- Cotironda V2 B5n: bounded, single-use activation using the INSTALLED
-- Vault-authenticated cron -> auto-recovery -> B4 internal Edge bridge.
-- DEVELOPMENT ONLY. Never run under "Luz verde". Publication requires
-- explicit "Publicalo" limited to cotironda-piloto.
--
-- No Vault reads, no new secrets, endpoints, WhatsApp routes or cron jobs.
-- The private B5n reader and ledger remain unchanged.
DO $preflight$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
  WHERE only_row AND NOT enabled AND NOT b5k_only
   AND NOT b5h_only AND NOT b5i_only AND NOT b5j_only
 ) THEN RAISE EXCEPTION 'B5n one-shot preflight: all flags must be OFF';END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
  WHERE state='leased' OR processor_version='v2_b5n_20261111'
 ) THEN RAISE EXCEPTION 'B5n one-shot preflight: unexpected lease/result';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
     WHERE processor_version='v2_b5m_20261111'
      AND state='private_diagnosed'
      AND diagnostics->>'economic_total_balances'='true'
      AND diagnostics->>'coverage_conditions'='5'
      AND diagnostics->>'coverage_conditions_matched'='3'
      AND diagnostics->>'can_publish'='false')<>1
 THEN RAISE EXCEPTION 'B5n one-shot preflight: prior evidence missing';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=
  'public.cotironda_piloto_v2_shadow_enabled_b4()'::regprocedure)
  OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_shadow_enabled_b4()','EXECUTE')
  OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_shadow_enabled_b4()','EXECUTE')
 THEN RAISE EXCEPTION 'B4 private bridge is not isolated';END IF;
END $preflight$;

-- B4 remains unchanged outside exclusive B5n mode.
-- The original bridge is called by the pre-existing, Vault-authorized cron.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_shadow_enabled_b4()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $b4$
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings s
  WHERE s.only_row AND s.enabled
   AND (
    NOT s.b5k_only
    OR (
     NOT s.b5h_only AND NOT s.b5i_only AND NOT s.b5j_only
     AND s.updated_at >= clock_timestamp()-interval '8 minutes'
     AND s.updated_at <= clock_timestamp()+interval '15 seconds'
     AND NOT EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
      WHERE processor_version='v2_b5n_20261111'
     )
    )
   )
 );
$b4$;

-- The Edge B5k/B5n worker checks this *independently* of B4's bridge gate.
-- Expired authorization cannot be used by a manual/internal HTTP invocation.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_b5k_only_enabled()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $b5n$
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings s
  WHERE s.only_row AND s.enabled AND s.b5k_only
   AND NOT s.b5h_only AND NOT s.b5i_only AND NOT s.b5j_only
   AND s.updated_at >= clock_timestamp()-interval '8 minutes'
   AND s.updated_at <= clock_timestamp()+interval '15 seconds'
   AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
    WHERE processor_version='v2_b5n_20261111'
   )
 );
$b5n$;

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
     WHERE processor_version='v2_b5n_20261111'
     AND claimed_at>clock_timestamp()-interval '1 hour')>=1
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
 AND EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k old
  WHERE old.source_hmac=b.source_hmac
   AND old.processor_version='v2_b5m_20261111'
   AND old.source_sha256=b.source_sha256
   AND old.supplier_key=b.supplier_key
   AND old.state='private_diagnosed'
   AND old.finished_at IS NOT NULL
   AND old.diagnostics->>'currency_code'='uniform_dollar_symbol_iso_unstated'
   AND old.diagnostics->>'economic_code'='fiscal_or_freight_ambiguous'
   AND old.diagnostics->>'coverage_code'='line_assignment_ambiguous'
   AND old.diagnostics->>'economic_total_balances'='true'
   AND old.diagnostics->>'coverage_conditions'='5'
   AND old.diagnostics->>'coverage_conditions_matched'='3'
   AND old.diagnostics->>'iso_verified'='false'
   AND old.diagnostics->>'can_publish'='false'
 )
 AND NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k prior
  WHERE prior.source_hmac=b.source_hmac
   AND prior.processor_version='v2_b5n_20261111')
 ORDER BY b.claimed_at,b.source_hmac
 LIMIT 1 FOR UPDATE OF b,a SKIP LOCKED;
 IF NOT FOUND THEN
  -- A scheduled but ineligible tick must not leave maintenance armed.
  UPDATE cotironda_piloto_privado.v2_shadow_settings
  SET enabled=false,b5k_only=false,updated_at=clock_timestamp()
  WHERE only_row AND enabled AND b5k_only AND NOT b5h_only
   AND NOT b5i_only AND NOT b5j_only;
  RETURN jsonb_build_object('state','empty');
 END IF;
 INSERT INTO cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
   (source_hmac,source_sha256,supplier_key)
 VALUES(v.source_hmac,v.source_sha256,v.supplier_key) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN jsonb_build_object('state','busy');END IF;
 -- Single transaction: a leased B5n source disarms both SQL switches
 -- before the caller can download it. Any failed update rolls the lease back.
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=false,b5k_only=false,updated_at=clock_timestamp()
 WHERE only_row AND enabled AND b5k_only
  AND NOT b5h_only AND NOT b5i_only AND NOT b5j_only;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'b5n_gate_changed_during_claim';END IF;
 RETURN jsonb_build_object('state','claimed','source_hmac',v.source_hmac,
  'source_sha256',v.source_sha256,'size_bytes',v.size_bytes,
  'processor_version','v2_b5n_20261111','historic_candidate',v.candidate);
END $fn$;

-- Privileges remain service-only, even if defaults changed in a future SQL run.
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_shadow_enabled_b4()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_b5k_only_enabled()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_v2_currency_b5k()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_shadow_enabled_b4()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_b5k_only_enabled()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_v2_currency_b5k()
 TO service_role;
