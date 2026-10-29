import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/postgrest-http-real.yml',import.meta.url),'utf8');
const fixture=readFileSync(new URL('../../supabase/tests/ci/99_tenant_http_fixture.sql',import.meta.url),'utf8');
const runner=readFileSync(new URL('../integration/postgrest-tenant-http-real.mjs',import.meta.url),'utf8');

test('aislamiento HTTP corre solo tras contrato JWT/429 y antes del cierre del servicio',()=>{
 const a=workflow.indexOf('node tests/integration/postgrest-http-real.mjs');
 const b=workflow.indexOf('supabase/tests/ci/99_tenant_http_fixture.sql');
 const c=workflow.indexOf('node tests/integration/postgrest-tenant-http-real.mjs');
 const d=workflow.indexOf('docker rm -f cotironda-postgrest-ci');
 assert.ok(a>=0&&a<b&&b<c&&c<d);
 assert.match(workflow,/postgres:17-alpine/);
 assert.match(workflow,/postgrest\/postgrest@sha256:[0-9a-f]{64}/);
 assert.doesNotMatch(workflow,/(?:sb_secret_|SUPABASE_SERVICE_ROLE_KEY|https:\/\/[a-z0-9]+\.supabase\.co)/i);
});

test('fixture es enteramente sintético y se niega a correr fuera de la BD CI limpia',()=>{
 assert.match(fixture,/current_database\(\) <> 'cotironda_ci_http'/);
 assert.match(fixture,/registration_settings where singleton=true/);
 assert.match(fixture,/count\(\*\) from auth\.users/);
 assert.match(fixture,/count\(\*\) from public\.organizations/);
 assert.match(fixture,/insert into public\.organization_members/);
 assert.match(fixture,/'member','active'/);
 assert.match(fixture,/'manager','suspended'/);
 assert.match(fixture,/insert into public\.supplier_delivery_areas/);
 assert.doesNotMatch(fixture,/update\s+cotironda_private\.registration_settings\s+set enabled=true/i);
 assert.doesNotMatch(fixture,/sb_secret_|service_role|@gmail\.com|@hotmail\.com/i);
});

test('prueba RLS ejercita casos positivos, negativos, metadata falsa y efectos SQL',()=>{
 assert.match(runner,/process\.env\.GITHUB_ACTIONS!=='true'/);
 assert.match(runner,/process\.env\.PGHOST!=='127\.0\.0\.1'/);
 assert.match(runner,/process\.env\.PGDATABASE!=='cotironda_ci_http'/);
 assert.match(runner,/createHmac\('sha256',secret\)/);
 for(const table of ['organizations','organization_members','supplier_profiles','supplier_categories','supplier_products','supplier_delivery_areas']){
  assert.ok(runner.includes(table));
 }
 assert.match(runner,/user_metadata:\{role:'owner',organization_id:ORGS\.b/);
 assert.match(runner,/exactIds\(await rows\('organizations',jwt\[user\]\)/);
 assert.match(runner,/PATCH.*supplier_products/);
 assert.match(runner,/POST.*supplier_products/);
 assert.match(runner,/DELETE.*supplier_products/);
 assert.match(runner,/select product_name from public\.supplier_products/);
 assert.match(runner,/finally\s*\{/);
 assert.match(runner,/delete from auth\.users/);
 assert.match(runner,/registration_settings where singleton=true/);
 assert.doesNotMatch(runner,/https:\/\/[a-z0-9]+\.supabase\.co/i);
});

test('bootstrap auth.uid coincide con Supabase Auth y soporta claims JSON de PostgREST',()=>{
 const bootstrap=readFileSync(new URL('../../supabase/tests/ci/00_bootstrap.sql',import.meta.url),'utf8');
 assert.match(bootstrap,/create function auth\.uid\(\) returns uuid/);
 assert.match(bootstrap,/current_setting\('request\.jwt\.claim\.sub', true\)/);
 assert.match(bootstrap,/current_setting\('request\.jwt\.claims', true\)/);
 assert.match(bootstrap,/->> 'sub'/);
});
