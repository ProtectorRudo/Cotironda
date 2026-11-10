-- MVP317: deliberately fail AFTER changing prior functions and several tables.
-- PSQL ON_ERROR_STOP + connection exit must ROLLBACK all changes.
-- ONLY disposable DB. The caller MUST EXPECT NONZERO exit.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='120s';
DO $guard317$
BEGIN
 IF current_database()<>'cotironda_ci' OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'mvp317_disposable_db_only' USING ERRCODE='42501';
 END IF;
END $guard317$;
\ir ../../piloto/mvp309_declaracion_admin_autorizacion_previa.sql
\ir ../../piloto/mvp310_altas_multiples_admin_roles.sql
\ir ../../piloto/mvp311_multiidentidad_rutas_activas.sql
\ir ../../piloto/mvp312_alta_canal_administrada_cifrada.sql
\ir ../../piloto/mvp312b_proveedor_contacto_admin.sql
DO $mvp317_expected_failure$
BEGIN
 RAISE EXCEPTION 'mvp317_expected_failure_before_commit' USING ERRCODE='P0001';
END $mvp317_expected_failure$;
COMMIT;
