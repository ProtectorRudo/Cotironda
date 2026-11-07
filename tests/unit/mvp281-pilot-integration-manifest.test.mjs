import test from 'node:test';
import assert from 'node:assert/strict';
import {migrationFiles,checkManifest} from '../../scripts/piloto/mvp281-manifiesto-integracion.mjs';

test('la secuencia 245-280 existe y no instala cron manual ni rollback',()=>{
  const result=checkManifest();
  assert.deepEqual(result.errors,[]);
  assert.equal(result.count,21);
  assert.equal(result.valid,true);
  assert.ok(!migrationFiles.some(s=>/MANUAL|rollback|mvp268|smoke/i.test(s)));
  assert.equal(migrationFiles.at(-1),'mvp280_confirmacion_unificada_comprador.sql');
});
test('rechaza un archivo faltante (sin ejecutar SQL)',()=>{
  const result=checkManifest(migrationFiles,()=>false);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(e=>e.startsWith('Archivo ausente:')));
});
test('rechaza duplicados, reordenamientos y nombres operativos',()=>{
  const original=migrationFiles[0];
  const list=[migrationFiles[1],original,original,'mvp263_operator_cron_activate_MANUAL.sql',...migrationFiles.slice(2)];
  const result=checkManifest(list,()=>true);
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(e=>e.startsWith('Duplicada:')));
  assert.ok(result.errors.some(e=>e.startsWith('Orden incorrecto:')));
  assert.ok(result.errors.some(e=>e.startsWith('Nombre no instalable:')));
});
test('rechaza manifiesto vacío o sin confirmación de comprador',()=>{
  assert.equal(checkManifest([],()=>true).valid,false);
  assert.equal(checkManifest(migrationFiles.slice(0,-1),()=>true).valid,false);
});
