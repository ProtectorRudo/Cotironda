-- COTIRONDA PILOTO D016 — MITIGACIÓN AISLADA DE COLA pg_net
-- ¡NO EJECUTAR! Sólo candidato para revisión y «Publicalo» SOLO PILOTO.
--
-- Auditoría real 13/11/2026:
--   net.http_request_queue => relrowsecurity=false;
--   relacl incluye =arwdDxtm/supabase_admin, es decir todos los permisos
--   para PUBLIC; schema net otorga USAGE a anon y authenticated.
--   Esto permite SELECT de headers que pg_net almacena temporalmente.
-- La función cron de D016 rechaza su activación si persiste el riesgo.
--
-- ANTES DE APLICAR:
--   * comprobar el ref del proyecto dentro de Supabase Vault;
--   * auditar funciones existentes que consulten directamente la cola;
--   * evaluar todo el impacto de revocar SELECT a PUBLIC/anon/authenticated;
--   * obtener «Publicalo» SOLO PILOTO;
--   * tomar snapshot de relacl y respaldar rollback operativo.
--
-- NO cambia INSERT/UPDATE/DELETE ni USAGE de net: minimiza impacto sobre
-- net.http_post() y sobre sistemas ya publicados. No elimina datos ni claves.
-- No se incluye en migraciones automáticas ni en el cron.
BEGIN;
DO $preflight$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM vault.decrypted_secrets
  WHERE name='cotironda_d016_pilot_project_ref'
   AND decrypted_secret='ilggkalaafhtiysyzlmg'
 ) THEN
  RAISE EXCEPTION 'D016_NOT_PILOT_PROJECT';
 END IF;
 IF to_regclass('net.http_request_queue') IS NULL THEN
  RAISE EXCEPTION 'D016_PGNET_QUEUE_MISSING';
 END IF;
 IF to_regprocedure(
  'public.cotironda_piloto_v2_d016_worker_due_private(integer)'
 ) IS NULL THEN
  RAISE EXCEPTION 'D016_WORKER_NOT_INSTALLED';
 END IF;
END $preflight$;

-- Corrige sólo la fuga de LECTURA; conservar derechos del dueño de extensión.
REVOKE SELECT ON TABLE net.http_request_queue
 FROM PUBLIC, anon, authenticated;

DO $verify$
BEGIN
 IF (
  has_schema_privilege('anon','net','USAGE') AND
  has_table_privilege('anon','net.http_request_queue','SELECT')
 ) OR (
  has_schema_privilege('authenticated','net','USAGE') AND
  has_table_privilege('authenticated','net.http_request_queue','SELECT')
 ) THEN
  RAISE EXCEPTION 'D016_PGNET_QUEUE_STILL_PUBLIC';
 END IF;
END $verify$;
COMMIT;

-- Rechequear tras upgrades de pg_net; un upgrade podría restaurar grants.
-- Una restauración de permisos no es un rollback seguro automático: sólo
-- revertir bajo una decisión de seguridad y análisis de impacto explícitos.
