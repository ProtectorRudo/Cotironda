#!/usr/bin/env bash
# MVP317: atomicity and 9 migrations, disposable PG17 only. Not a backup.
set -euo pipefail
if [[ "$PGDATABASE" != "cotironda_ci" ||
      "$PGHOST" != "127.0.0.1" ||
      "$PGPORT" != "5432" ||
      "$PGUSER" != "postgres" ]]; then
  echo "MVP317 REFUSED: disposable PostgreSQL17 CI only" >&2; exit 20
fi
node scripts/piloto/mvp317-generar-baseline-pg17.mjs
psql -X -q -v ON_ERROR_STOP=1 \
 -f supabase/tests/ci/.mvp317-baseline-pg17.sql >/dev/null
before="$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
SELECT
 (SELECT count(*) FROM cotironda_piloto_privado.participants)||'|'||
 (SELECT count(*) FROM cotironda_piloto_privado.requests)||'|'||
 encode(sha256(convert_to(pg_get_functiondef(
  'cotironda_piloto_privado.proveedor_contactable_mvp307(text)'::regprocedure),'UTF8')),'hex')||'|'||
 encode(sha256(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_all_supplier_contacts_mvp304(text)'::regprocedure),'UTF8')),'hex')||'|'||
 encode(sha256(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_ia_claim_mvp222(uuid)'::regprocedure),'UTF8')),'hex')||'|'||
 count(*) FROM pg_constraint WHERE conname IN (
 'participants_key_check','participants_check','requests_buyer_key_check');
SQL
)"
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
if psql -X -q -v ON_ERROR_STOP=1 \
 -f supabase/tests/ci/mvp317-fallo-inyectado-pg17.sql \
 >"$dir/failure.log" 2>&1; then
 echo "MVP317 FAILED: injected migration error did not abort" >&2; exit 21
fi
if ! grep -q 'mvp317_expected_failure_before_commit' "$dir/failure.log"; then
 echo "MVP317 FAILED: unexpected migration failure" >&2
 tail -n 12 "$dir/failure.log" >&2
 exit 22
fi
after="$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
SELECT
 (SELECT count(*) FROM cotironda_piloto_privado.participants)||'|'||
 (SELECT count(*) FROM cotironda_piloto_privado.requests)||'|'||
 encode(sha256(convert_to(pg_get_functiondef(
  'cotironda_piloto_privado.proveedor_contactable_mvp307(text)'::regprocedure),'UTF8')),'hex')||'|'||
 encode(sha256(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_all_supplier_contacts_mvp304(text)'::regprocedure),'UTF8')),'hex')||'|'||
 encode(sha256(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_ia_claim_mvp222(uuid)'::regprocedure),'UTF8')),'hex')||'|'||
 count(*) FROM pg_constraint WHERE conname IN (
 'participants_key_check','participants_check','requests_buyer_key_check');
SQL
)"
if [[ "$before" != "$after" ]]; then
 echo "MVP317 FAILED: original rows/constraints/RPC digests drifted" >&2; exit 23
fi
absent="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
 "SELECT (to_regclass('cotironda_piloto_privado.admin_authorizations_mvp309') IS NULL)
    AND (to_regclass('cotironda_piloto_privado.admin_channels_mvp312') IS NULL)
    AND (to_regclass('cotironda_piloto_privado.ai_batch_gate_mvp314') IS NULL)")"
if [[ "$absent" != "t" ]]; then
 echo "MVP317 FAILED: partial schema survived failed transaction" >&2; exit 24
fi
echo "MVP317: injected failure ROLLBACK passed; existing schema/data/RPC intact."
psql -X -q -v ON_ERROR_STOP=1 \
 -f supabase/tests/ci/mvp317-ensayo-atomico-pg17.sql >/dev/null
verified="$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
SELECT
 (SELECT count(*) FROM cotironda_piloto_privado.participants)||'|'||
 (SELECT count(*) FROM cotironda_piloto_privado.requests)||'|'||
 (SELECT enabled FROM cotironda_piloto_privado.ai_batch_gate_mvp314 WHERE only_row)||'|'||
 (SELECT enabled FROM cotironda_piloto_privado.ai_buyer_notice_gate_mvp315 WHERE only_row)||'|'||
 (SELECT enabled FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306 WHERE only_row);
SQL
)"
expected_prefix="$(printf '%s' "$before" | cut -d '|' -f 1-2)"
if [[ "$verified" != "$expected_prefix|false|false|false" ]]; then
 echo "MVP317 FAILED: full install changed data or enabled gates: $verified" >&2; exit 25
fi
echo "MVP317: 9 migrations committed atomically; original row counts unchanged; all automatic gates OFF."
echo "MVP317: no live pilot, no Whapi, no cron, no backup created."
