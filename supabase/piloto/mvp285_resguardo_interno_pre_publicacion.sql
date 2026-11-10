-- MVP285: resguardo interno de contingencia de costo cero, SOLO PILOTO.
-- NO sustituye un pg_dump fuera de Supabase ni restaura bytes de Storage.
-- Solo lectura de datos originales; crea un esquema privado para eventual
-- reversión del cambio de aplicación. Ningún mensaje ni tarea externa.
DO $guard$
BEGIN
 IF to_regnamespace('cotironda_resguardo_mvp285') IS NOT NULL
 THEN RAISE EXCEPTION 'mvp285_snapshot_already_exists';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
            WHERE enabled)
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
            WHERE enabled)
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_trial_control_mvp229
            WHERE enabled)
 THEN RAISE EXCEPTION 'mvp285_snapshot_refuse_active_gates';END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON
  n.oid=c.relnamespace WHERE n.nspname='cotironda_piloto_privado'
  AND c.relkind IN ('r','p'))<>63
 THEN RAISE EXCEPTION 'mvp285_snapshot_unexpected_table_count';END IF;
END $guard$;
CREATE SCHEMA cotironda_resguardo_mvp285;
REVOKE ALL ON SCHEMA cotironda_resguardo_mvp285
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE cotironda_resguardo_mvp285.inventory(
 source_schema text NOT NULL,source_table text NOT NULL,
 source_rows bigint NOT NULL,snapshot_rows bigint NOT NULL,
 original_relation_bytes bigint,
 snapshot_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(source_schema,source_table),
 CHECK(source_rows=snapshot_rows));
CREATE TABLE cotironda_resguardo_mvp285.routine_definitions(
 object_schema text NOT NULL,signature text NOT NULL,
 definition text NOT NULL,
 PRIMARY KEY(object_schema,signature));
CREATE TABLE cotironda_resguardo_mvp285.schema_objects(
 object_kind text NOT NULL,object_key text NOT NULL,definition text NOT NULL,
 PRIMARY KEY(object_kind,object_key));
DO $copy$
DECLARE
 t record;src bigint;dst bigint;copied integer:=0;
 target text;
BEGIN
 FOR t IN
  SELECT n.nspname AS s,c.relname AS tbl,c.oid AS relid
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='cotironda_piloto_privado'
   AND c.relkind IN('r','p')
  ORDER BY c.relname
 LOOP
  target:=format('%I.%I','cotironda_resguardo_mvp285',t.tbl);
  EXECUTE format('SELECT count(*) FROM %I.%I',t.s,t.tbl) INTO src;
  EXECUTE format('CREATE TABLE %s AS SELECT * FROM %I.%I',target,t.s,t.tbl);
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',target);
  EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC,anon,authenticated,service_role',target);
  EXECUTE format('SELECT count(*) FROM %s',target) INTO dst;
  IF src<>dst THEN RAISE EXCEPTION 'mvp285_snapshot_inconsistent_%',t.tbl;END IF;
  INSERT INTO cotironda_resguardo_mvp285.inventory(
   source_schema,source_table,source_rows,snapshot_rows,original_relation_bytes)
  VALUES(t.s,t.tbl,src,dst,pg_total_relation_size(t.relid));
  copied:=copied+1;
 END LOOP;
 IF copied<>63 THEN RAISE EXCEPTION 'mvp285_snapshot_incomplete';END IF;
END $copy$;
-- Datos de soporte Supabase. Aquí NO se copian archivos binarios de Storage.
CREATE TABLE cotironda_resguardo_mvp285.__auth_users AS
 SELECT * FROM auth.users;
CREATE TABLE cotironda_resguardo_mvp285.__auth_sessions AS
 SELECT * FROM auth.sessions;
CREATE TABLE cotironda_resguardo_mvp285.__storage_objects AS
 SELECT * FROM storage.objects;
CREATE TABLE cotironda_resguardo_mvp285.__migration_history AS
 SELECT * FROM supabase_migrations.schema_migrations;
INSERT INTO cotironda_resguardo_mvp285.routine_definitions(
 object_schema,signature,definition)
SELECT n.nspname, p.proname || '(' ||
 pg_get_function_identity_arguments(p.oid) || ')',pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='cotironda_piloto_privado'
 OR (n.nspname='public' AND p.proname LIKE 'cotironda_piloto_%');
INSERT INTO cotironda_resguardo_mvp285.schema_objects
 (object_kind,object_key,definition)
SELECT 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,
 pg_get_triggerdef(t.oid,true)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='cotironda_piloto_privado' AND NOT t.tgisinternal
UNION ALL
SELECT 'constraint',n.nspname||'.'||c.relname||'.'||k.conname,
 pg_get_constraintdef(k.oid,true)
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='cotironda_piloto_privado';
DO $seal$
DECLARE n text;
BEGIN
 FOR n IN SELECT tablename FROM pg_tables
  WHERE schemaname='cotironda_resguardo_mvp285'
 LOOP
  EXECUTE format('ALTER TABLE cotironda_resguardo_mvp285.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON TABLE cotironda_resguardo_mvp285.%I FROM PUBLIC,anon,authenticated,service_role',n);
 END LOOP;
 IF (SELECT count(*) FROM cotironda_resguardo_mvp285.inventory)<>63
 OR (SELECT count(*) FROM cotironda_resguardo_mvp285.routine_definitions)<130
 OR (SELECT count(*) FROM cotironda_resguardo_mvp285.__migration_history)<>71
 THEN RAISE EXCEPTION 'mvp285_snapshot_inventory_failed';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_resguardo_mvp285.inventory
  WHERE source_rows<>snapshot_rows)
 THEN RAISE EXCEPTION 'mvp285_snapshot_row_mismatch';END IF;
END $seal$;
