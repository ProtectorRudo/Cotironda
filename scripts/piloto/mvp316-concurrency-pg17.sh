#!/usr/bin/env bash
# MVP316: ONLY disposable GitHub Actions PG17, never Supabase pilot.
set -euo pipefail
if [[ "$PGDATABASE" != "cotironda_ci" || "$PGHOST" != "127.0.0.1" ||
      "$PGUSER" != "postgres" || "$PGPORT" != "5432" ]]; then
  echo "MVP316 refused non-disposable database" >&2; exit 20
fi
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/ci/.mvp316-concurrency-generated-pg17.sql >/dev/null
rid="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
 "SELECT request_id FROM cotironda_piloto_privado.ai_shadow_requests_mvp221 LIMIT 1")"
if [[ ! "$rid" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
 echo "synthetic UUID missing" >&2; exit 21
fi
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
race() {
 local label="$1" first_file="$2" second_file="$3" want_first="$4" want_second="$5"
 psql -X -qAt -v ON_ERROR_STOP=1 -v rid="$rid" -f "$first_file" > "$dir/first" &
 local pid="$!" found=0
 for _ in $(seq 1 100); do
   if grep -q "^$want_first$" "$dir/first"; then found=1; break; fi
   sleep 0.05
 done
 if [[ "$found" != 1 ]]; then
   echo "$label first session did not start" >&2
   wait "$pid" || :; exit 22
 fi
 local began="$(date +%s%3N)"
 local second="$(psql -X -qAt -v ON_ERROR_STOP=1 -v rid="$rid" -f "$second_file")"
 local elapsed=$(( $(date +%s%3N) - began ))
 wait "$pid"
 local first="$(tr -d '\r\n[:space:]' < "$dir/first")"
 if [[ "$first" != "$want_first" || "$second" != "$want_second" ||
       "$elapsed" -lt 1000 ]]; then
   echo "$label race invalid first=$first second=$second wait_ms=$elapsed" >&2
   exit 23
 fi
 echo "MVP316 $label: two concurrent DB sessions PASS (blocked >=1s)."
}
race "dispatch" \
 supabase/tests/ci/mvp316-dispatch-first-pg17.sql \
 supabase/tests/ci/mvp316-dispatch-second-pg17.sql leased budget_exhausted
dispatch_state="$(psql -X -qAt -v ON_ERROR_STOP=1 -v rid="$rid" <<'SQL'
SELECT (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
   WHERE request_id=:'rid'::uuid AND state='leased'),
 (SELECT attempts_reserved FROM cotironda_piloto_privado.ai_batch_budget_mvp314
   WHERE day_utc=(clock_timestamp() AT TIME ZONE 'UTC')::date),
 (SELECT attempts_reserved FROM cotironda_piloto_privado.ai_batch_buyer_budget_mvp314
   WHERE day_utc=(clock_timestamp() AT TIME ZONE 'UTC')::date
    AND buyer_key=(SELECT buyer_key FROM cotironda_piloto_privado.requests
     WHERE id=:'rid'::uuid));
SQL
)"
if [[ "$dispatch_state" != "1|1|1" ]]; then
 echo "dispatch caps drift: $dispatch_state" >&2; exit 24
fi
psql -X -v ON_ERROR_STOP=1 -f \
 supabase/tests/ci/mvp316-prepare-notice-race-pg17.sql >/dev/null
race "buyer_notice" \
 supabase/tests/ci/mvp316-notice-first-pg17.sql \
 supabase/tests/ci/mvp316-notice-second-pg17.sql issued budget_exhausted
notice_state="$(psql -X -qAt -v ON_ERROR_STOP=1 -v rid="$rid" <<'SQL'
SELECT (SELECT count(*) FROM cotironda_piloto_privado.buyer_tracking_mvp091
  WHERE request_id=:'rid'::uuid),
 (SELECT attempts_reserved FROM cotironda_piloto_privado.ai_buyer_notice_budget_mvp315
  WHERE day_utc=(clock_timestamp() AT TIME ZONE 'UTC')::date);
SQL
)"
if [[ "$notice_state" != "1|1" ]]; then
 echo "buyer notice quota drift: $notice_state" >&2; exit 25
fi
echo "MVP316: ALL concurrent PostgreSQL17 checks PASS. No remote contacts."
