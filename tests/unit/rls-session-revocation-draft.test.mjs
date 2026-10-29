import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/tests/ci/100_session_rls_hardening_draft.sql',import.meta.url),'utf8');
const ci=readFileSync(new URL('../../.github/workflows/postgrest-http-real.yml',import.meta.url),'utf8');
const http=readFileSync(new URL('../integration/postgrest-tenant-http-real.mjs',import.meta.url),'utf8');

test('propuesta de RLS comercial no puede usarse como migración de producción',()=>{
 assert.match(sql,/NO ES MIGRACIÓN OFICIAL/);
 assert.match(sql,/current_database\(\) <> 'cotironda_ci_http'/);
 assert.match(sql,/registration_settings\s+where singleton=true/);
 assert.match(sql,/is distinct from false/);
 assert.match(sql,/rls_existing_policies_unexpected/);
 assert.match(sql,/rls_authenticated_policies_unexpected/);
 assert.match(sql,/rls_session_guard_incomplete/);
 assert.doesNotMatch(sql,/update\s+cotironda_private\.registration_settings\s+set enabled=true/i);
 assert.doesNotMatch(sql,/grant\s+.*to\s+anon|drop\s+policy|create\s+policy/i);
});

test('endurece únicamente las 17 policies authenticated, preserva predicados originales',()=>{
 assert.match(sql,/array_agg\(policyname::text order by policyname\)/);
 assert.match(sql,/roles=array\['authenticated'\]::name\[\]/);
 assert.match(sql,/roles not in \(array\['authenticated'\]::name\[\],/);
 assert.match(sql,/23/);
 const expected=sql.match(/v_expected text\[\] := array\[([\s\S]*?)\];/);
 assert.ok(expected,'No se encontró lista explícita de políticas');
 const names=[...expected[1].matchAll(/'([a-z_]+)'/g)].map(x=>x[1]);
 assert.equal(names.length,17);
 assert.equal(new Set(names).size,17);
 for(const name of ['organizations_read_member','members_read_self','categories_read_active','supplier_products_read_own','supplier_products_update_manager','supplier_areas_insert_manager']){
  assert.ok(names.includes(name),name);
 }
 assert.match(sql,/and \(select cotironda_private\.storage_session_active\(\)\)/);
 assert.match(sql,/alter policy %I on public\.%I using \(\(%s\) and/i);
 assert.match(sql,/alter policy %I on public\.%I with check \(\(%s\) and/i);
});

test('E2E comprueba revocación efectiva para GET y escrituras, nueva sesión independiente',()=>{
 assert.match(http,/delete from auth\.sessions where id=/);
 assert.match(http,/A tras logout/);
 assert.match(http,/catálogo A tras logout/);
 assert.match(http,/zonas A tras logout/);
 assert.match(http,/afterLogoutPatch\.data,\[\]/);
 assert.match(http,/afterLogoutInsert\.status/);
 assert.match(http,/token antiguo no revive/);
 assert.match(http,/sql\("delete from auth\.users"\)/);
 const posBase=ci.indexOf('node tests/integration/postgrest-http-real.mjs');
 const posRls=ci.indexOf('100_session_rls_hardening_draft.sql');
 const posFixture=ci.indexOf('99_tenant_http_fixture.sql');
 assert.ok(posBase>=0 && posRls>posBase && posFixture>posRls);
});
