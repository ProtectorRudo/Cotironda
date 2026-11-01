#!/usr/bin/env bash
set -euo pipefail
# Test de dos solicitudes simultáneas contra PostgreSQL efímero.
# Necesita las variables PGHOST, PGUSER, PGPASSWORD y PGDATABASE del job CI.
psql -X -q -v ON_ERROR_STOP=1 -c \
  "insert into auth.users(id) values ('88888888-8888-4888-8888-888888888888')"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
register() {
  psql -X -qAt -v ON_ERROR_STOP=1 \
   -c 'set role service_role' \
   -c "select replay from cotironda_private.register_company(
     '88888888-8888-4888-8888-888888888888',
     '99999999-9999-4999-8999-999999999999',
     'Empresa Concurrente','supplier','Proveedor Concurrente')"
}
register > "$tmp/uno" &
uno=$!
register > "$tmp/dos" &
dos=$!
wait "$uno"
wait "$dos"
cat "$tmp/uno" "$tmp/dos" > "$tmp/all"
if [[ "$(grep -cx 'f' "$tmp/all")" != "1" || "$(grep -cx 't' "$tmp/all")" != "1" ]]; then
  echo "Error: las dos invocaciones no devolvieron creación + replay"
  cat "$tmp/all"
  exit 1
fi
actual="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
  "select count(*) from public.organizations where display_name='Empresa Concurrente'")"
if [[ "$actual" != "1" ]]; then
  echo "Error: las solicitudes crearon $actual organizaciones"
  exit 1
fi
echo "OK: concurrencia idempotente, 1 creación + 1 replay, 1 organización"
