-- MVP317: rehearsal of nine release migrations in ONE transaction.
-- Requires disposable CI baseline. REFUSES real Supabase pilot.
-- This script does NOT run automatically; CI only. No Whapi/cron/Edge.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
SET LOCAL idle_in_transaction_session_timeout='120s';
DO $gate317$
BEGIN
 IF current_database()<>'cotironda_ci' OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'mvp317_disposable_pg_only' USING ERRCODE='42501';
 END IF;
 IF to_regclass('cotironda_piloto_privado.admin_authorizations_mvp309') IS NOT NULL
    OR to_regclass('cotironda_piloto_privado.ai_batch_gate_mvp314') IS NOT NULL THEN
  RAISE EXCEPTION 'mvp317_not_clean_initial_state';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306
   WHERE only_row AND enabled=false) THEN
  RAISE EXCEPTION 'mvp317_legacy_auto_release_not_off';
 END IF;
END $gate317$;
\ir ../../piloto/mvp309_declaracion_admin_autorizacion_previa.sql
\ir ../../piloto/mvp310_altas_multiples_admin_roles.sql
\ir ../../piloto/mvp311_multiidentidad_rutas_activas.sql
\ir ../../piloto/mvp312_alta_canal_administrada_cifrada.sql
\ir ../../piloto/mvp312b_proveedor_contacto_admin.sql
\ir ../../piloto/mvp312c_contactos_postcierre_admin.sql
\ir ../../piloto/mvp313_destinatarios_dinamicos_cifrados.sql
\ir ../../piloto/mvp314_ia_despacho_lotes_cupo_seguro.sql
\ir ../../piloto/mvp315_aviso_comprador_post_despacho.sql
DO $assert317$
BEGIN
 IF to_regclass('cotironda_piloto_privado.admin_authorizations_mvp309') IS NULL
    OR to_regclass('cotironda_piloto_privado.admin_channels_mvp312') IS NULL
    OR to_regclass('cotironda_piloto_privado.ai_batch_gate_mvp314') IS NULL
    OR to_regclass('cotironda_piloto_privado.ai_buyer_notice_gate_mvp315') IS NULL
 THEN RAISE EXCEPTION 'mvp317_missing_schema_after_all_migrations';END IF;
 IF (SELECT enabled FROM cotironda_piloto_privado.ai_batch_gate_mvp314 WHERE only_row)
 OR (SELECT enabled FROM cotironda_piloto_privado.ai_buyer_notice_gate_mvp315 WHERE only_row)
 OR (SELECT enabled FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306 WHERE only_row)
 THEN RAISE EXCEPTION 'mvp317_unexpected_automatic_dispatch_enabled';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_claim_mvp314(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_issue_buyer_notice_mvp315(uuid,text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp317_private_api_exposure';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.participants) < 3
 THEN RAISE EXCEPTION 'mvp317_preexisting_participants_missing';END IF;
END $assert317$;
COMMIT;
