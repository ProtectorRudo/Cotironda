-- Cotironda V2 RELEASE PREFLIGHT · SOLO SELECT, sin credenciales ni PII.
-- Ejecutar con link a Supabase cotironda-piloto, JAMAS aplicar migracion.
-- Los flags capturan bloqueos, NO conceden permisos ni habilitan envios.
WITH state AS (
 SELECT
 (SELECT count(*) FROM auth.users) AS auth_users,
 (SELECT count(*) FROM cotironda_piloto_privado.requests
    WHERE state='prepared') AS prepared_rounds,
 (SELECT count(*) FROM cotironda_piloto_privado.original_share_consents_mvp178)
    AS old_scope_consents,
 (SELECT count(*) FROM storage.buckets
    WHERE name='cotironda-piloto-originals' AND public=false
    AND file_size_limit<=8388608) AS private_buckets,
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
     'cotironda_piloto_v2_quoted_id_for_reference',
     'cotironda_piloto_v2_quoted_id_for_media_reference',
     'cotironda_piloto_v2_responders_private',
     'cotironda_piloto_v2_original_source_private',
     'cotironda_piloto_v2_record_download'
    )) AS v2_functions,
 (SELECT count(*) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='cotironda_piloto_privado'
   AND t.relname IN ('v2_original_share_policy',
    'v2_supplier_original_consents','v2_original_download_audit')) AS v2_tables,
 (SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
   JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='cotironda_piloto_privado' AND t.relname='requests'
   AND c.conname IN('requests_round_days_check',
                   'requests_exact_duration_check')) AS legacy_clock_constraints
)
SELECT jsonb_build_object(
 'project','cotironda-piloto',
 'auth_users',auth_users,'prepared_rounds',prepared_rounds,
 'private_storage_available',private_buckets=1,
 'old_consents_are_not_v2',old_scope_consents,
 'v2_functions_installed',v2_functions,
 'v2_tables_installed',v2_tables,
 'legacy_3_to_7_calendar_day_constraints',legacy_clock_constraints,
 'ready_for_v2_release',auth_users>0 AND private_buckets=1
    AND v2_functions=5 AND v2_tables=3 AND
    legacy_clock_constraints=0
) AS preflight_readonly
FROM state;
