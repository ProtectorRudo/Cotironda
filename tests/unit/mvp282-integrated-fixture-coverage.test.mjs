import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,inspectFixtures,validateIsolation} from '../../scripts/piloto/mvp282-pg17-modular-rehearsal.mjs';

test('once fixtures ejercitan los 21 SQL (cobertura auditada)',()=>{
 const r=inspectFixtures();
 assert.equal(r.valid,true,JSON.stringify(r.errors));
 assert.equal(r.fixtureCount,11);
 assert.equal(r.migrationsCovered,21);
 assert.deepEqual(r.missing,[]);
});
test('no permite fixture parcial sin ROLLBACK ni migracion no cubierta',()=>{
 const r=inspectFixtures(
   [cases[0]],p=>p.endsWith('mvp227-cotizaciones-por-rubro-pg17.sql')
   ? 'BEGIN;\n\\ir ../../piloto/mvp245_media_quote_ia_central_verified.sql'
   : ''
 );
 assert.equal(r.valid,false);
 assert.ok(r.errors.some(x=>x.includes('sin BEGIN/ROLLBACK')));
 assert.ok(r.errors.some(x=>x.includes('Migraciones no ensayadas')));
});
test('prohibe conectarse a Supabase real aun con credenciales',()=>{
 for(const env of [
  {PGHOST:'db.ilggkalaafhtiysyzlmg.supabase.co',PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'cotironda_ci'},
  {PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'postgres'},
  {PGHOST:'localhost',PGPORT:'6543',PGUSER:'postgres',PGDATABASE:'cotironda_ci'}
 ]) assert.throws(()=>validateIsolation(env),/SOLO PostgreSQL 17/);
 assert.doesNotThrow(()=>validateIsolation({
  PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'cotironda_ci'
 }));
});
test('sin marcas de salida externa en los SQL de prueba',()=>{
 const a=inspectFixtures();
 assert.equal(a.valid,true);
 for(const [name,imports] of Object.entries(a.importsByTest)){
  assert.ok(imports.length>0,name+' sin archivos reales');
 }
});
