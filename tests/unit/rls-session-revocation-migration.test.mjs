import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../../supabase/migrations/20261029234236_commercial_session_guard.sql',import.meta.url),'utf8');
const sqlTest=readFileSync(new URL('../../supabase/tests/ci/98_commercial_session_guard.sql',import.meta.url),'utf8');
const postgres=readFileSync(new URL('../../.github/workflows/postgres-rls.yml',import.meta.url),'utf8');
const postgrest=readFileSync(new URL('../../.github/workflows/postgrest-http-real.yml',import.meta.url),'utf8');
const e2e=readFileSync(new URL('../integration/postgrest-tenant-http-real.mjs',import.meta.url),'utf8');

test('migracion 12 es atomica y fail-closed, no habilita permisos ni escrituras comerciales',()=>{
 assert.match(migration,/create|alter/i); // DDL solo ALTER POLICY dinamico
 assert.match(migration,/registration_settings[\s\S]*?enabled=false/);
 assert.match(migration,/session_guard_preconditions_invalid/);
 assert.match(migration,/session_guard_policy_inventory_invalid/);
 assert.match(migration,/session_guard_client_policies_changed/);
 assert.match(migration,/session_guard_registrar_policies_changed/);
 assert.match(migration,/session_guard_incomplete/);
 assert.match(migration,/session_guard_upload_or_register_open/);
 assert.doesNotMatch(migration,/\b(create policy|drop policy|grant |revoke |alter table|update cotironda_private\.registration_settings)\b/i);
 assert.doesNotMatch(migration,/\bcreate\s+function\b/i);
});

test('exactamente 17 client policies endurecidas, seis registrar sin alteracion',()=>{
 const a=migration.match(/v_expected_client text\[\] := array\[([\s\S]*?)\];/);
 const b=migration.match(/v_expected_registrar text\[\] := array\[([\s\S]*?)\];/);
 assert.ok(a&&b);
 const x=[...a[1].matchAll(/'([a-z_]+)'/g)].map(m=>m[1]);
 const y=[...b[1].matchAll(/'([a-z_]+)'/g)].map(m=>m[1]);
 assert.equal(x.length,17);assert.equal(new Set(x).size,17);
 assert.equal(y.length,6);assert.equal(new Set(y).size,6);
 assert.match(migration,/v_applied <> 17/);
 assert.match(migration,/v_registrar_before is distinct from v_registrar_after/);
 assert.match(migration,/alter policy %I on public\.%I using \(\(%s\) and/i);
 assert.match(migration,/alter policy %I on public\.%I with check \(\(%s\) and/i);
 assert.match(migration,/storage_session_active\(\)/);
 assert.match(migration,/roles=array\['authenticated'\]::name\[\]/);
 assert.match(migration,/roles=array\['cotironda_registrar'\]::name\[\]/);
});

test('migracion 12 reconstruida y verificada en dos jobs de PG17 y en HTTP real',()=>{
 assert.match(postgres,/Guard de sesion en 17 RLS comerciales \(migracion 12\)/);
 assert.match(postgres,/20261029233650_commercial_session_guard\.sql/);
 assert.match(postgres,/98_commercial_session_guard\.sql/);
 assert.match(postgres,/Reconstruir historial 12 migraciones/);
 assert.match(postgres,/-ne 12/);
 assert.match(postgrest,/Instalar las 12 migraciones/);
 assert.match(postgrest,/98_commercial_session_guard\.sql/);
 assert.doesNotMatch(postgrest,/100_session_rls_hardening_draft\.sql/);
 assert.match(sqlTest,/session_guard|storage_session_active/);
 assert.match(e2e,/JWT firmado revocado no puede leer ni escribir/);
 assert.match(e2e,/token antiguo no revive/);
});

test('migracion no usa service role ni schema remoto',()=>{
 assert.doesNotMatch(migration,/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|\.supabase\.co/i);
 assert.doesNotMatch(migration,/create\s+policy\s+.*\s+using\s*\(true\)/i);
});
