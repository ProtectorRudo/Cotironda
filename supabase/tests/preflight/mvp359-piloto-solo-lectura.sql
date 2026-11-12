-- MVP359 — PRE-FLIGHT DE PUBLICACION, SOLO LECTURA, SOLO PILOTO.
-- Contrato: no ejecutar INSERT/UPDATE/DELETE/DDL, no secretos ni HMAC.
-- Ejecución recomendada: Supabase SQL connector/SQL Editor. Resultado
-- indica si el snapshot de DDL cambió, no autoriza despliegue por sí solo.
-- Huellas observadas el 12/11/2026 sobre el PILOTO, verificar otra vez.
WITH expected(name,sha) AS (
 VALUES
 ('cotironda_piloto_claim_whapi_v1','dbc7ab7718ffd3c951c40010db87cad9752cd0cbeaee11a5daec6e1458e26f34'),
 ('cotironda_piloto_ia_claim_mvp222','5c415fb0adb665d26128d9faab9dcf19a0b9501772efd407c56cd8ab2e9d8dc0'),
 ('cotironda_piloto_ia_claim_mvp314','7fcd3d27eaab4d4dffe7a2fdcbaf74de7fba526b7df5974ecd1c33766b93a3c0'),
 ('cotironda_piloto_ia_next_batch_mvp314','fe4ce87deadeff28c8557975fcbcedaabe76f68947e7b606840100fe6ed47206')
), live AS (
 SELECT p.proname AS name,
 encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
), fn AS (
 SELECT count(*) AS total,
 count(*) FILTER (WHERE live.sha=expected.sha) AS exact
 FROM expected LEFT JOIN live USING(name)
), queue AS (
 SELECT
 (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 WHERE state='pending') AS ai_pending,
 (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 WHERE state='uncertain') AS ai_uncertain,
 (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox WHERE state='pending') AS legacy_pending,
 (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox WHERE state='uncertain') AS legacy_uncertain,
 (SELECT count(*) FROM cotironda_piloto_privado.requests WHERE state='prepared' AND closes_at>clock_timestamp()) AS active_prepared,
 (SELECT count(*) FROM auth.users) AS auth_users,
 (SELECT count(*) FROM cron.job WHERE jobname='cotironda_piloto_ai_batch_retry_5min_mvp357') AS batch_cron,
 (SELECT count(*) FROM vault.secrets WHERE name IN (
  'cotironda_piloto_ai_batch_private_mvp357',
  'cotironda_piloto_ai_batch_cron_proof_mvp357')) AS vault_names
), result AS (
 SELECT '01_live_sql_fingerprints' AS control,
 CASE WHEN fn.total=4 AND fn.exact=4 THEN 'APTO' ELSE 'BLOQUEADO' END AS estado,
 jsonb_build_object('funciones',fn.total,'sha_coincidentes',fn.exact) AS detalle
 FROM fn
 UNION ALL
 SELECT '02_pending_and_uncertain',
 CASE WHEN q.ai_uncertain=0 AND q.legacy_uncertain=0 THEN 'APTO' ELSE 'BLOQUEADO' END,
 jsonb_build_object('ai_pending',q.ai_pending,'ai_uncertain',q.ai_uncertain,
                    'legacy_pending',q.legacy_pending,'legacy_uncertain',q.legacy_uncertain)
 FROM queue q
 UNION ALL
 SELECT '03_prepared_rounds',
 CASE WHEN q.active_prepared=0 THEN 'SIN_RONDA_ACTIVA'
      WHEN q.active_prepared=1 THEN 'NO_CREAR_OTRA' ELSE 'BLOQUEADO' END,
 jsonb_build_object('rondas_preparadas_vigentes',q.active_prepared)
 FROM queue q
 UNION ALL
 SELECT '04_cron_gate',
 CASE WHEN q.batch_cron=0 THEN 'OFF_SIN_CRON' ELSE 'REVISAR' END,
 jsonb_build_object('cron_mvp357',q.batch_cron,'secretos_por_nombre',q.vault_names)
 FROM queue q
 UNION ALL
 SELECT '05_auth_comprador',
 CASE WHEN q.auth_users=0 THEN 'PENDIENTE_P0' ELSE 'VALIDAR_PERTENENCIA' END,
 jsonb_build_object('usuarios_auth',q.auth_users)
 FROM queue q
 UNION ALL
 SELECT '06_net_pg_grants',
 'ADVERTENCIA_NO_ES_PRUEBA_REST',
 jsonb_build_object(
 'anon_schema_usage',has_schema_privilege('anon','net','USAGE'),
 'anon_queue_select',has_table_privilege('anon','net.http_request_queue','SELECT'),
 'authenticated_queue_select',has_table_privilege('authenticated','net.http_request_queue','SELECT'))
 UNION ALL
 SELECT '07_net_exposed_via_rest','NO_VERIFICADO_POR_SQL',
 jsonb_build_object('accion','Ejecutar probe HTTP con clave publica y Accept-Profile net; requiere PGRST106')
)
SELECT control,estado,detalle FROM result ORDER BY control;
