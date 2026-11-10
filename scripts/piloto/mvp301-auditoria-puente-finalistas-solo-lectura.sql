-- MVP301 · Solo lectura, listo para ejecutar en cotironda-piloto.
-- Verifica la discontinuidad de fuentes entre el planificador v9/MVP196
-- y las cotizaciones IA Central/MVP227. NO habilita finalistas, no usa Vault.
-- No devuelve cotizaciones, identidad, teléfono, HMAC ni total.
WITH status AS (
 SELECT
  (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_review_mvp227
   WHERE state='verified') AS ai_verified,
  (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_review_mvp227
   WHERE state='review') AS ai_review,
  (SELECT count(*) FROM cotironda_piloto_privado.supplier_media_quotes_mvp098)
   AS old_v9_documents,
  (SELECT count(*) FROM cotironda_piloto_privado.finalist_source_plans_mvp196)
   AS old_v9_plans,
  (SELECT count(*) FROM cotironda_piloto_privado.finalist_coverage_plans_mvp108)
   AS final_coverage_plans,
  (SELECT enabled FROM cotironda_piloto_privado.finalist_activation_mvp113)
   AS finalist_activation_enabled,
  (SELECT count(*) FROM cron.job
   WHERE jobname='cotironda_piloto_finalists_plan_only_5min' AND active)
   AS finalist_plan_cron_enabled,
  (SELECT count(*) FROM cron.job
   WHERE jobname='cotironda_piloto_close_due_5min' AND active)
   AS round_close_cron_enabled
)
SELECT now() AS checked_at,
 'read_only_no_whapi_no_secrets'::text AS operation,
 ai_verified,ai_review,old_v9_documents,old_v9_plans,
 final_coverage_plans,finalist_activation_enabled,
 finalist_plan_cron_enabled,round_close_cron_enabled,
 (to_regprocedure('public.cotironda_piloto_commercial_due_mvp196(integer)')
  IS NOT NULL) AS legacy_commercial_planner_installed,
 (to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227')
  IS NOT NULL) AS ai_central_supplier_ledger_installed,
 (SELECT count(*)=2 AND bool_and(
   position('ai_supplier_review_mvp227' IN pg_get_functiondef(p.oid))>0
  )
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.proname IN (
    'cotironda_piloto_commercial_due_mvp196',
    'cotironda_piloto_commit_commercial_plan_mvp196'
  )) AS legacy_planner_explicitly_reads_ia_central,
 false AS real_end_to_end_certified
FROM status;
