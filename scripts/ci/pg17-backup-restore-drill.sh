#!/usr/bin/env bash
# Ensayo de recuperación PostgreSQL 17 SOLO en runner GitHub con datos CI ficticios.
# Ni pg_dump ni pg_restore se conectan a Supabase dev/production.
set -euo pipefail
umask 077

[[ "${GITHUB_ACTIONS:-}" == "true" &&
   "${COTIRONDA_CI_BACKUP_RESTORE:-}" == "true" &&
   "${PGHOST:-}" == "127.0.0.1" &&
   "${PGPORT:-}" == "5432" &&
   "${PGUSER:-}" == "postgres" &&
   "${PGDATABASE:-}" == "cotironda_ci_fresh" &&
   "${PGPASSWORD:-}" == "ci_only_password" &&
   -d "${RUNNER_TEMP:-/nonexistent}" ]] ||
  { echo 'ERROR: recovery_ci_no_autorizado' >&2; exit 1; }

command -v docker >/dev/null
command -v psql >/dev/null
command -v sha256sum >/dev/null
command -v node >/dev/null

restore_db="cotironda_ci_restored"
source_db="$PGDATABASE"
# No tocar una base que no haya sido creada por este ensayo.
exists="$(psql -X -qAt -d postgres -c "select count(*) from pg_database where datname='$restore_db'")"
[[ "$exists" == "0" ]] ||
  { echo 'ERROR: recovery_target_ya_existe' >&2; exit 1; }
workdir="$(mktemp -d "$RUNNER_TEMP/cotironda-pg17-recovery-XXXXXXXX")"
chmod 700 "$workdir"
restore_created=0
cleanup() {
  if [[ "$restore_created" == "1" ]]; then
    # Aislado en PG17 CI: no usar DROP DATABASE en ningún proyecto Supabase.
    psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database $restore_db" >/dev/null ||
      echo 'WARN: no se pudo limpiar database de CI' >&2
  fi
  rm -rf -- "$workdir"
}
trap cleanup EXIT

# Impedir que el mismo script se use para exportar datos reales.
psql -X -qAt -d "$source_db" <<'SQL' > "$workdir/preflight"
select current_setting('server_version_num')::integer / 10000;
select (select enabled::text from cotironda_private.registration_settings where singleton=true);
select (select count(*) from auth.users);
select (select count(*) from auth.sessions);
select (select count(*) from public.organizations);
select (select count(*) from storage.objects);
SQL
mapfile -t checks < "$workdir/preflight"
[[ "${checks[*]}" == "17 false 0 0 0 0" ]] ||
 { echo 'ERROR: backup_ci_exige_origen_limpio_pg17' >&2; exit 1; }
echo 'PASS: origen exclusivamente PG17 CI, sin usuarios/empresas/archivos'

# Una fila sintética reversible permite comprobar diferencia entre backup y estado actual.
psql -X -q -v ON_ERROR_STOP=1 -d "$source_db" <<'SQL'
insert into public.catalog_categories(code,label,is_active)
values('ci_recuperacion','Respaldo exclusivamente CI',true);
SQL
echo 'PASS: fixture temporal de recuperación en catálogo CI'

# El dump se guarda exclusivamente en RUNNER_TEMP, no en GitHub artifacts.
# Se usa pg_dump 17 de la imagen Docker, porque Ubuntu runner trae cliente 16.
docker run --rm --network host --user "$(id -u):$(id -g)" \
  --env PGHOST --env PGPORT --env PGUSER --env PGPASSWORD --env PGDATABASE \
  --volume "$workdir:/backup:rw" postgres:17-alpine \
  pg_dump --format=custom --no-owner \
    --schema=public --schema=cotironda_private --schema=auth --schema=storage \
    --file=/backup/data.backup
chmod 600 "$workdir/data.backup"
test -s "$workdir/data.backup"
sha256sum "$workdir/data.backup" > "$workdir/data.sha256"
sha256sum -c "$workdir/data.sha256" >/dev/null

# Prueba adversarial sin tocar el backup bueno: una copia alterada no pasa el hash.
cp "$workdir/data.backup" "$workdir/data.corrupt"
printf 'corrupt_test' >> "$workdir/data.corrupt"
corrupt_sha="$(sha256sum "$workdir/data.corrupt" | cut -d ' ' -f 1)"
original_sha="$(cut -d ' ' -f 1 "$workdir/data.sha256")"
[[ "$corrupt_sha" != "$original_sha" ]] ||
  { echo 'ERROR: checksum_corrupto_aceptado' >&2; exit 1; }
rm -f "$workdir/data.corrupt"
echo 'PASS: detección de alteración del backup por SHA-256'

# pg_restore --list solo contiene nombres de objetos; nunca datos ni passwords.
docker run --rm --network none --user "$(id -u):$(id -g)" \
  --volume "$workdir:/backup:rw" postgres:17-alpine \
  pg_restore --list /backup/data.backup > "$workdir/inventory.txt"
COTIRONDA_CI_BACKUP_RESTORE=true node --experimental-strip-types \
  scripts/ci/check-backup-inventory.mjs "$workdir/inventory.txt"
rm -f "$workdir/inventory.txt"

# Simular pérdida reversible del fixture en la FUENTE CI, nunca en Supabase.
psql -X -q -v ON_ERROR_STOP=1 -d "$source_db" \
  -c "delete from public.catalog_categories where code='ci_recuperacion'"
remaining="$(psql -X -qAt -d "$source_db" -c "select count(*) from public.catalog_categories where code='ci_recuperacion'")"
[[ "$remaining" == "0" ]] ||
  { echo 'ERROR: pérdida_sintética_no_simulada' >&2; exit 1; }

psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "create database $restore_db"
restore_created=1
sha256sum -c "$workdir/data.sha256" >/dev/null

# Restore de las 4 áreas en OTRA base PG17 aislada, una sola transacción.
docker run --rm --network host --user "$(id -u):$(id -g)" \
  --env PGHOST --env PGPORT --env PGUSER --env PGPASSWORD \
  --volume "$workdir:/backup:ro" postgres:17-alpine \
  pg_restore --dbname="$restore_db" --clean --if-exists --no-owner \
    --single-transaction --exit-on-error /backup/data.backup > /dev/null

# Restaura no solo tablas: seed, función guard, RLS, roles ACL y Storage privado.
psql -X -q -v ON_ERROR_STOP=1 -d "$restore_db" <<'SQL'
do $assert$
begin
 if (select count(*) from public.catalog_categories)<>6
 or (select count(*) from public.catalog_categories where code='ci_recuperacion')<>1
 then raise exception 'recovery_fixture_no_restored'; end if;
 if (select enabled from cotironda_private.registration_settings where singleton) is distinct from false
 then raise exception 'recovery_registro_abierto'; end if;
 if (select count(*) from auth.users)<>0 or (select count(*) from auth.sessions)<>0
 or (select count(*) from public.organizations)<>0
 or (select count(*) from storage.objects)<>0
 then raise exception 'recovery_datos_inesperados'; end if;
 if (select count(*) from pg_policies
      where schemaname='public' and tablename in
       ('organizations','organization_members','catalog_categories',
        'supplier_profiles','supplier_categories','supplier_products','supplier_delivery_areas'))<>23
 then raise exception 'recovery_rls_inventory_invalid'; end if;
 if (select count(*) from pg_policies
      where schemaname='public' and roles=array['authenticated']::name[]
       and (qual like '%storage_session_active%' or with_check like '%storage_session_active%'))<>17
 then raise exception 'recovery_session_guard_invalid'; end if;
 if (select count(*) from pg_policies
      where schemaname='public' and roles=array['cotironda_registrar']::name[])<>6
 then raise exception 'recovery_registrar_policies_invalid'; end if;
 if (select count(*) from storage.buckets where
      id in ('cotironda-buyer-drafts','cotironda-upload-quarantine') and public=false)<>2
 then raise exception 'recovery_storage_private_invalid'; end if;
 if (select count(*) from pg_policies where schemaname='storage'
       and tablename='objects' and cmd in ('INSERT','UPDATE','DELETE','ALL'))<>0
 then raise exception 'recovery_storage_write_enabled'; end if;
 if has_function_privilege('anon',
      'cotironda_private.storage_session_active()','EXECUTE')
 or not has_function_privilege('authenticated',
      'cotironda_private.storage_session_active()','EXECUTE')
 then raise exception 'recovery_guard_acl_invalid'; end if;
end;
$assert$;
SQL

[[ "$(psql -X -qAt -d "$source_db" -c "select count(*) from public.catalog_categories")" == 5 ]] ||
  { echo 'ERROR: origen_ci_no_limpio' >&2; exit 1; }
echo 'PASS: PG17 dump + restore completo en otra base CI, fixture recuperado'
echo 'PASS: auth, Storage privado, bandera comercial, RLS, sesión y privilegios recuperados'
echo 'PASS: backup efímero; nunca exportado desde Supabase ni subido a GitHub'
