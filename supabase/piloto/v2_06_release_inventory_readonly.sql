-- COTIRONDA V2-06 · READ ONLY inventory. Run only against PILOTO database.
-- Never changes policy, calendars, Auth, RPCs, Storage, or Whapi.
-- Counts, names, and metadata ONLY: no PII, no credentials or source content.
-- This is an input for a HUMAN-reviewed preflight; not deployment permission.
WITH
 rpc AS (
  SELECT COALESCE(jsonb_agg(proname ORDER BY proname),'[]'::jsonb) AS names
  FROM (
    SELECT DISTINCT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'cotironda_piloto_v2_quoted_id_for_reference',
      'cotironda_piloto_v2_quoted_id_for_media_reference',
      'cotironda_piloto_v2_responders_private',
      'cotironda_piloto_v2_original_source_private',
      'cotironda_piloto_v2_record_download',
      'cotironda_piloto_v2_analysis_claim_private',
      'cotironda_piloto_v2_analysis_finish_private',
      'cotironda_piloto_v2_responders_with_analysis_private',
      'cotironda_piloto_ia_shadow_prepare_mvp221'
    )
  ) p
 ),
 tbl AS (
  SELECT COALESCE(jsonb_agg(relname ORDER BY relname),'[]'::jsonb) AS names
  FROM (
    SELECT DISTINCT t.relname
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='cotironda_piloto_privado'
     AND t.relkind IN ('r','p')
     AND t.relname IN (
      'v2_original_share_policy','v2_supplier_original_consents',
      'v2_original_download_audit','v2_original_analysis',
      'v2_business_policy','v2_business_calendar','v2_business_holidays'
     )
  ) t
 ),
 storage_info AS (
  SELECT COALESCE(bool_or(public=false),false) AS private,
         MIN(file_size_limit) AS bytes
  FROM storage.buckets
  WHERE id='cotironda-piloto-originals'
 ),
 historical_checks AS(
  SELECT COUNT(*) AS old_constraints
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid=t.oid
  JOIN pg_namespace n ON t.relnamespace=n.oid
  WHERE n.nspname='cotironda_piloto_privado'
   AND t.relname='requests'
   AND c.conname IN ('requests_round_days_check',
                    'requests_exact_duration_check')
 )
SELECT jsonb_build_object(
 'pg_version',current_setting('server_version'),
 'auth_users',(SELECT COUNT(*) FROM auth.users),
 'bucket_private',storage_info.private,
 'bucket_limit_bytes',storage_info.bytes,
 'rpcs',rpc.names,
 'tables',tbl.names,
 'historical_constraint_count',historical_checks.old_constraints,
 'note','Constraints may remain if rewritten conditionally for V2; inspect definitions. Policy enablement, consent, and E2E are NOT inferred.'
) AS readonly_inventory
FROM rpc,tbl,storage_info,historical_checks;
