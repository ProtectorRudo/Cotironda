#!/usr/bin/env bash
# MVP-003/#175. Restore drill of SYNTHETIC GitHub Actions PostgreSQL 17 only.
# NOT a backup/restore of actual Supabase DEV. Never accepts a remote URL.
set -euo pipefail
if [[ "$COTIRONDA_RESTORE_CI" != "true" || "$PGDATABASE" != "cotironda_ci" ||
      "$PGHOST" != "127.0.0.1" || "$PGPORT" != "5432" ||
      "$PGUSER" != "postgres" || "$PGPASSWORD" != "ci_only_password" ]]; then
  echo 'MVP003_BLOCKED_NOT_DISPOSABLE_CI' >&2
  exit 31
fi
command -v docker >/dev/null || { echo 'MVP003_BLOCKED_NO_DOCKER' >&2; exit 32; }
command -v psql >/dev/null || { echo 'MVP003_BLOCKED_NO_PSQL' >&2; exit 33; }
# Hosted GitHub Actions service image ONLY. Do not infer a host/URL from input.
cid="$(docker ps --filter 'ancestor=postgres:17-alpine' --format '{{.ID}}')"
if [[ -z "$cid" || "$cid" == *$'\n'* ]]; then
  echo 'MVP003_BLOCKED_PG17_SERVICE_NOT_UNIQUE' >&2; exit 34
fi
docker exec "$cid" pg_dump --version | grep -Eq '^pg_dump \(PostgreSQL\) 17\.'
docker exec "$cid" pg_restore --version | grep -Eq '^pg_restore \(PostgreSQL\) 17\.'
# Roundtrip in SAME EPHEMERAL PG17 cluster; roles are cluster-global and are
# NOT independently restored. Source DB stays untouched throughout.
SRC='cotironda_ci'
DST='cotironda_ci_restore_mvp003'
TMP='/tmp/cotironda-mvp003-synthetic.custom'
baseline="$(psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/ci/restore-mvp003-fingerprint.sql)"
test -n "$baseline"
# Fail if another tool already created a target. Never drop any DB.
if psql -XqAt -d postgres -v ON_ERROR_STOP=1 -c \
 "select 1 from pg_database where datname='$DST'" | grep -q 1; then
  echo 'MVP003_BLOCKED_TARGET_EXISTS' >&2; exit 35
fi
# All operations run ONLY within the disposable service container.
# Dump remains there and vanishes with the CI job.
docker exec -e PGPASSWORD="$PGPASSWORD" "$cid" pg_dump \
 --host=127.0.0.1 --username=postgres --dbname="$SRC" \
 --format=custom --file="$TMP"
docker exec -e PGPASSWORD="$PGPASSWORD" "$cid" createdb \
 --host=127.0.0.1 --username=postgres --template=template0 "$DST"
docker exec -e PGPASSWORD="$PGPASSWORD" "$cid" pg_restore \
 --host=127.0.0.1 --username=postgres --dbname="$DST" \
 --exit-on-error --no-owner "$TMP"
actual="$(psql -X -qAt -d "$DST" -v ON_ERROR_STOP=1 \
 -f scripts/ci/restore-mvp003-fingerprint.sql)"
if [[ "$baseline" != "$actual" ]]; then
 echo 'MVP003_RESTORE_FINGERPRINT_MISMATCH' >&2; exit 36
fi
source_after="$(psql -X -qAt -d "$SRC" -v ON_ERROR_STOP=1 \
 -f scripts/ci/restore-mvp003-fingerprint.sql)"
if [[ "$baseline" != "$source_after" ]]; then
 echo 'MVP003_SOURCE_WAS_MODIFIED' >&2; exit 37
fi
psql -X -v ON_ERROR_STOP=1 -d "$DST" -f \
 scripts/ci/restore-mvp003-assertions.sql >/dev/null
echo 'MVP003_PG17_SYNTHETIC_RESTORE_PASS: full SQL dump restored to second disposable DB; source unchanged; RLS/ACL snapshot checked; NO DEV backup'
