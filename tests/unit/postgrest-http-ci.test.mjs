import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/postgrest-http-real.yml',import.meta.url),'utf8');
const fixture=readFileSync(new URL('../../supabase/tests/ci/98_postgrest_http_fixture.sql',import.meta.url),'utf8');
const runner=readFileSync(new URL('../integration/postgrest-http-real.mjs',import.meta.url),'utf8');

test('flujo HTTP usa PostgreSQL y PostgREST reales efímeros, sin credenciales Supabase',()=>{
 assert.match(workflow,/postgres:17-alpine/);
 assert.match(workflow,/postgrest\/postgrest@sha256:[0-9a-f]{64}/);
 assert.match(workflow,/PGDATABASE: cotironda_ci_http/);
 assert.match(workflow,/PGHOST: 127\.0\.0\.1/);
 assert.match(workflow,/openssl rand -hex 48/);
 assert.match(workflow,/PGRST_JWT_SECRET="\$COTIRONDA_CI_JWT_SECRET"/);
 assert.match(workflow,/COTIRONDA_POSTGREST_HTTP_CI: 'true'/);
 assert.doesNotMatch(workflow,/(?:^|\s)(?:sb_secret_|SUPABASE_SERVICE_ROLE_KEY|COTIRONDA_E2E_VERIFIED_PASSWORD)/m);
 assert.doesNotMatch(workflow,/https:\/\/[a-z0-9]+\.supabase\.co/);
});

test('fixture habilita registro SOLO en DB efímera protegida y nunca usa Auth real',()=>{
 assert.match(fixture,/current_database\(\) <> 'cotironda_ci_http'/);
 assert.match(fixture,/enabled from cotironda_private\.registration_settings/);
 assert.match(fixture,/count\(\*\) from auth\.users/);
 assert.match(fixture,/update cotironda_private\.registration_settings set enabled=true/);
 assert.match(fixture,/commit;/);
 assert.doesNotMatch(fixture,/create\s+extension|service_role|alter\s+role\s+postgres/i);
});

test('runner comprueba JWT real de PostgREST, cuota 429, revocación, no reactivación y limpieza',()=>{
 assert.match(runner,/process\.env\.GITHUB_ACTIONS!=='true'/);
 assert.match(runner,/process\.env\.PGHOST!=='127\.0\.0\.1'/);
 assert.match(runner,/process\.env\.PGDATABASE!=='cotironda_ci_http'/);
 assert.match(runner,/createHmac\('sha256',secret\)/);
 assert.match(runner,/tampered\.status,401/);
 assert.match(runner,/expired\.status,401/);
 assert.match(runner,/limit\.status,429/);
 assert.match(runner,/revoked\.status,403/);
 assert.match(runner,/oldAgain\.status,403/);
 assert.match(runner,/public\.organizations'\),'0'/);
 assert.match(runner,/finally\s*\{/);
 assert.match(runner,/registration_settings set enabled=false/);
 assert.match(runner,/delete from auth\.users/);
});
