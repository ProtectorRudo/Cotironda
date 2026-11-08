#!/usr/bin/env bash
# MVP318: isolated PostgreSQL17 archive + actual restore drill (synthetic only).
set -euo pipefail
if [[ "$PGDATABASE" != "cotironda_ci" ||
      "$PGHOST" != "127.0.0.1" ||
      "$PGPORT" != "5432" ||
      "$PGUSER" != "postgres" ]]; then
  echo "MVP318 CI-only; refusing external database" >&2; exit 20
fi
for app in psql pg_dump pg_restore createdb sha256sum; do
  command -v "$app" >/dev/null || { echo "Missing $app" >&2; exit 21; }
done
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
node scripts/piloto/mvp317-generar-baseline-pg17.mjs
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/ci/.mvp317-baseline-pg17.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/ci/mvp317-ensayo-atomico-pg17.sql >/dev/null

# Only synthetic data. Preserve ACL! RLS by itself is not a complete security policy.
fingerprint_sql=$(cat <<'SQL'
SELECT
 (SELECT count(*) FROM cotironda_piloto_privado.participants)::text||'|'||
 (SELECT count(*) FROM cotironda_piloto_privado.requests)::text||'|'||
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='cotironda_piloto_privado' AND c.relkind IN('r','p'))::text||'|'||
 (SELECT encode(sha256(convert_to(pg_get_functiondef(
 'public.cotironda_piloto_ia_claim_mvp222(uuid)'::regprocedure),'UTF8')),'hex'))||'|'||
 (SELECT encode(sha256(convert_to(pg_get_functiondef(
 'public.cotironda_piloto_ia_issue_buyer_notice_mvp315(uuid,text,text,text,text)'::regprocedure),'UTF8')),'hex'));
SQL
)
source_fingerprint="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "$fingerprint_sql")"
pg_dump --format=custom --no-owner --file="$work/snapshot.pgcustom" --dbname=cotironda_ci
test -s "$work/snapshot.pgcustom" || exit 22
pg_restore --list "$work/snapshot.pgcustom" >/dev/null
sha256sum "$work/snapshot.pgcustom" > "$work/snapshot.sha256"
(cd "$work" && sha256sum --check --status snapshot.sha256)
createdb cotironda_restore
pg_restore --exit-on-error --no-owner --dbname=cotironda_restore \
 "$work/snapshot.pgcustom" >/dev/null
restored_fingerprint="$(psql -X -qAt -v ON_ERROR_STOP=1 -d cotironda_restore -c "$fingerprint_sql")"
if [[ "$source_fingerprint" != "$restored_fingerprint" ]]; then
 echo "MVP318 restore drift: synthetic row/table counts or RPC hashes" >&2
 exit 23
fi
psql -X -qAt -v ON_ERROR_STOP=1 -d cotironda_restore <<'SQL'
DO $privacy318$
BEGIN
 IF has_function_privilege('anon',
   'public.cotironda_piloto_ia_claim_mvp314(uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_ia_issue_buyer_notice_mvp315(uuid,text,text,text,text)','EXECUTE')
 OR (SELECT enabled FROM cotironda_piloto_privado.ai_batch_gate_mvp314 WHERE only_row)
 OR (SELECT enabled FROM cotironda_piloto_privado.ai_buyer_notice_gate_mvp315 WHERE only_row)
 OR (SELECT enabled FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306 WHERE only_row)
 THEN RAISE EXCEPTION 'mvp318_restored_privacy_or_automation_drift';
 END IF;
END $privacy318$;
SQL
bytes="$(wc -c < "$work/snapshot.pgcustom")"
if (( bytes < 10000 )); then echo "Unexpectedly tiny backup" >&2; exit 24; fi
head -c $((bytes/2)) "$work/snapshot.pgcustom" > "$work/truncated.pgcustom"
if pg_restore --list "$work/truncated.pgcustom" >/dev/null 2>&1 &&
   pg_restore --exit-on-error --no-owner --dbname=cotironda_restore \
    "$work/truncated.pgcustom" >/dev/null 2>&1; then
 echo "MVP318 truncated archive unexpectedly accepted" >&2; exit 25
fi
echo "MVP318 PASS: synthetic PG17 archive, SHA256, isolated restore, original row counts, RPC hashes, grants and gates OFF."
echo "This is NOT a backup of real pilot data, Storage files or configuration."
