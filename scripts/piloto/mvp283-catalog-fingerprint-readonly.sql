-- MVP283: firma estructural, SOLO LECTURA, sin filas ni definiciones privadas.
-- Hash útil para detectar drift, NO prueba equivalencia semántica de funciones.
WITH
tables AS (
 SELECT c.oid,c.relname,c.relrowsecurity,c.relkind
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='cotironda_piloto_privado' AND c.relkind IN('r','p')
),
columns AS (
 SELECT t.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS dtype,
  a.attnotnull AS not_null
 FROM tables t JOIN pg_attribute a ON a.attrelid=t.oid
 WHERE a.attnum>0 AND NOT a.attisdropped
),
signatures AS (
 SELECT c.relname||'.'||c.attname||':'||c.dtype||':'||c.not_null::text AS s
 FROM columns c
),
cons AS (
 SELECT t.relname||':'||k.contype::text||':'||pg_get_constraintdef(k.oid,true) AS s
 FROM tables t JOIN pg_constraint k ON k.conrelid=t.oid
),
triggers AS (
 SELECT t.relname||':'||pg_get_triggerdef(g.oid,true) AS s
 FROM tables t JOIN pg_trigger g ON g.tgrelid=t.oid WHERE NOT g.tgisinternal
),
schema_facts AS (
 SELECT 'column:'||s AS s FROM signatures
 UNION ALL SELECT 'constraint:'||s FROM cons
 UNION ALL SELECT 'trigger:'||s FROM triggers
 UNION ALL SELECT 'table:'||relname||':'||relrowsecurity::text FROM tables
)
SELECT jsonb_build_object(
 'audit','mvp283_structural_fingerprint_readonly',
 'pg_major',current_setting('server_version_num')::integer/10000,
 'private_tables',(SELECT count(*) FROM tables),
 'private_tables_rls',(SELECT count(*) FROM tables WHERE relrowsecurity),
 'private_columns',(SELECT count(*) FROM columns),
 'private_constraints',(SELECT count(*) FROM cons),
 'private_triggers',(SELECT count(*) FROM triggers),
 'private_routines',(SELECT count(*) FROM pg_proc f JOIN pg_namespace n
  ON n.oid=f.pronamespace WHERE n.nspname='cotironda_piloto_privado'),
 'public_pilot_routines',(SELECT count(*) FROM pg_proc f JOIN pg_namespace n
  ON n.oid=f.pronamespace WHERE n.nspname='public'
   AND f.proname LIKE 'cotironda_piloto_%'),
 'catalog_sha256',encode(sha256(convert_to(
   (SELECT string_agg(s,E'\n' ORDER BY s) FROM schema_facts),'UTF8')),'hex'),
 'source_rows_exported',false,
 'function_bodies_exported',false,
 'real_schema_clone_proven',false
) AS fingerprint;
