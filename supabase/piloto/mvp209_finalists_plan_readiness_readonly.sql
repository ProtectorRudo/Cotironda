-- MVP209 · SOLO LECTURA · no activa worker, cron ni WhatsApp.
-- Inspección de capacidad, nunca mostrar Vault decrypted_secret,
-- JWT, teléfonos, HMAC ni IDs de empresa/solicitud.
WITH requirements AS(
 SELECT
  to_regclass('cotironda_piloto_privado.requests') IS NOT NULL AS requests_ok,
  to_regclass('cotironda_piloto_privado.finalist_activation_mvp113') IS NOT NULL
    AS activation_table_ok,
  to_regclass('cotironda_piloto_privado.finalist_source_plans_mvp196') IS NOT NULL
    AS source_plan_table_ok,
  to_regclass('cotironda_piloto_privado.finalist_coverage_plans_mvp108') IS NOT NULL
    AS finalists_table_ok,
  to_regprocedure('public.cotironda_piloto_close_due_v1(integer)') IS NOT NULL
    AS close_rpc_ok,
  to_regprocedure('public.cotironda_piloto_commercial_due_mvp196(integer)') IS NOT NULL
    AS source_due_rpc_ok,
  to_regprocedure('public.cotironda_piloto_commit_commercial_plan_mvp196(uuid,text,jsonb)')
    IS NOT NULL AS source_commit_rpc_ok,
  to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NOT NULL
    AS network_rpc_ok,
  to_regclass('cron.job') IS NOT NULL AS cron_installed,
  to_regclass('vault.secrets') IS NOT NULL AS vault_installed
),
live AS(
 SELECT
  EXISTS(SELECT 1 FROM cotironda_piloto_privado.finalist_activation_mvp113
         WHERE only_row AND enabled AND activated_at IS NOT NULL
         AND activated_at<=clock_timestamp()) AS activation_on,
  EXISTS(SELECT 1 FROM vault.secrets
         WHERE name='cotironda_piloto_finalists_plan_only_v1')
    AS dedicated_vault_secret_exists,
  (SELECT count(*) FROM cron.job
    WHERE jobname='cotironda_piloto_finalists_plan_only_5min')
    AS plan_cron_jobs,
  (SELECT count(*) FROM cron.job
    WHERE jobname='cotironda_piloto_close_due_5min'
      AND active AND schedule='*/5 * * * *')
    AS close_cron_jobs,
  (SELECT count(*) FROM cotironda_piloto_privado.finalist_source_plans_mvp196)
    AS private_plans_existing,
  (SELECT count(*) FROM cotironda_piloto_privado.requests
    WHERE state='closed') AS closed_rounds
)
SELECT requests_ok,activation_table_ok,source_plan_table_ok,
 finalists_table_ok,close_rpc_ok,source_due_rpc_ok,source_commit_rpc_ok,
 network_rpc_ok,cron_installed,vault_installed,activation_on,
 dedicated_vault_secret_exists,plan_cron_jobs,close_cron_jobs,
 private_plans_existing,closed_rounds,
 CASE
  WHEN NOT(requests_ok AND activation_table_ok AND source_plan_table_ok
    AND finalists_table_ok AND close_rpc_ok AND source_due_rpc_ok
    AND source_commit_rpc_ok AND network_rpc_ok AND cron_installed
    AND vault_installed)
   THEN 'bloqueado_dependencias'
  WHEN plan_cron_jobs>0 THEN 'cron_existente_no_duplicar'
  WHEN NOT dedicated_vault_secret_exists
   THEN 'bloqueado_falta_credencial_plan_exclusiva'
  WHEN activation_on THEN 'bloqueado_instalar_solo_con_activacion_off'
  WHEN close_cron_jobs<>1 THEN 'bloqueado_cierre_no_programado'
  ELSE 'listo_para_programar_plan_sin_despacho_con_publicalo'
 END AS diagnostico
FROM requirements CROSS JOIN live;
