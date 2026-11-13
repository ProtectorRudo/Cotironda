-- D016 — CANDIDATO RETIRADO. ¡NO EJECUTAR!
-- ARCHIVO HISTÓRICO, NO ES UNA MIGRACIÓN NI UNA REPARACIÓN COMPATIBLE.
-- Documentación oficial Supabase, actualizada 2026-11-04:
-- https://supabase.com/kb/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16
--
-- Los grants de net.http_request_queue fueron concedidos por supabase_admin.
-- El rol postgres no puede revocar grants de otro concedente: produce WARNING,
-- sin corregir acceso. Cambiar grants con el propietario podría romper pg_net,
-- webhooks existentes y jobs que necesitan permisos heredados de PUBLIC.
-- anon/authenticated no pueden hacer LOGIN directo y net no está expuesto
-- en la Data API por defecto. Los roles de DB con LOGIN sí podrían leer headers.
--
-- RESOLUCIÓN D016: NO USAR pg_net PARA ENVÍO DE SECRETOS:
-- 1) cron SQL DIRECTO sólo para cierre (sin HTTP);
-- 2) GitHub Actions programado -> HTTPS Edge para IA, secretos GHA;
-- 3) ambas rutas siguen OFF hasta «Publicalo» PILOTO.
--
-- Protección contra ejecución accidental: SIEMPRE ABORTAR.
DO $d016_aborted_mitigation$
BEGIN
 RAISE EXCEPTION 'D016_UNSUPPORTED_PGNET_ACL_MUTATION_RETIRED';
END $d016_aborted_mitigation$;
