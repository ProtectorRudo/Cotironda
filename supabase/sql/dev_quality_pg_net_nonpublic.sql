-- D020: ajuste excepcional del primer despliegue DEV.
-- Ejecutar SOLO si pg_net quedo en public por la instalacion previa, sin jobs ni cola.
-- No usar en otras bases/produccion. El esquema final recomendado ya esta en
-- dev_quality_auto_dispatch.sql (WITH SCHEMA extensions).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job)
     OR EXISTS (SELECT 1 FROM net.http_request_queue)
     OR EXISTS (SELECT 1 FROM net._http_response) THEN
    RAISE EXCEPTION 'pg_net_move_refused_jobs_or_http_records';
  END IF;
END
$$;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;
