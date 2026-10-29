#!/usr/bin/env bash
set -euo pipefail
# PostgreSQL efímero de CI. Prueba real de 40 procesos SQL sobre una sola PK.
temp="$(mktemp -d)"
user='c9999999-9999-4999-8999-999999999999'
session='d9999999-9999-4999-8999-999999999999'
cleanup() {
 psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL' >/dev/null || true
update cotironda_private.registration_settings set enabled=false where singleton=true;
delete from auth.users where id='c9999999-9999-4999-8999-999999999999';
SQL
 rm -rf "$temp"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL' >/dev/null
insert into auth.users(id,email_confirmed_at,is_anonymous)
values ('c9999999-9999-4999-8999-999999999999',now(),false);
insert into auth.sessions(id,user_id,not_after)
values ('d9999999-9999-4999-8999-999999999999',
 'c9999999-9999-4999-8999-999999999999',null);
update cotironda_private.registration_settings set enabled=true where singleton=true;
SQL
cat > "$temp/request.sql" <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claims',
 '{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"c9999999-9999-4999-8999-999999999999","session_id":"d9999999-9999-4999-8999-999999999999"}',true);
select set_config('request.jwt.claim.sub',
 'c9999999-9999-4999-8999-999999999999',true);
select registration_status from public.register_company_for_current_user(
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','X','buyer');
commit;
SQL
: > "$temp/results"
export PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
seq 1 40 | xargs -P 8 -I '{}' bash -c '
  set -euo pipefail
  output="$(psql -X -qAt -v ON_ERROR_STOP=1 -f "$1" |
    grep -E "^(invalid_request|rate_limited)$" | tail -n1)"
  test -n "$output"
  printf "%s\n" "$output" >> "$2"
' _ "$temp/request.sql" "$temp/results"
total="$(wc -l < "$temp/results" | tr -d ' ')"
allowed="$(grep -c '^invalid_request$' "$temp/results" || true)"
blocked="$(grep -c '^rate_limited$' "$temp/results" || true)"
if [[ "$total" != 40 || "$allowed" != 20 || "$blocked" != 20 ]]; then
 echo "FAIL concurrent rate count total=$total allowed=$allowed blocked=$blocked" >&2
 exit 1
fi
psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
do $$
begin
 if (select request_count from cotironda_private.registration_attempt_quotas
     where user_id='c9999999-9999-4999-8999-999999999999') <> 21 then
  raise exception 'TEST_FAILED: contador concurrencia no saturado';
 end if;
 if exists (select from public.organization_members where
     user_id='c9999999-9999-4999-8999-999999999999') then
  raise exception 'TEST_FAILED: requests inválidos insertaron membresías';
 end if;
end;
$$;
SQL
echo "PASS: 40 solicitudes concurrentes / 20 contabilizadas / 20 bloqueadas / contador saturado en 21"
