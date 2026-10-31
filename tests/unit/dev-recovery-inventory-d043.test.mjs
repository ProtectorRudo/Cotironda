import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORIAL_DEV_VALIDADO_D036 } from '../../scripts/ci/dev-readiness-d036.mjs';
import { compareRecoveryInventories } from '../../scripts/ops/compare-restore-inventory-d043.mjs';
const fixture = () => ({
  pgVersionNum:170011,
  migrations:HISTORIAL_DEV_VALIDADO_D036.map(x=>({...x})),
  extensions:['pg_cron','pg_net','supabase_vault'],
  authUsers:2,authIdentities:2,authSessions:0,
  storageBuckets:2,storagePublicBuckets:0,storageObjects:0,
  vaultRecords:1,cronJobs:0,publicMissingRls:0,privateMissingRls:0,
  qualityClaims:4,iaEnabled:false,registrationEnabled:false
});
test('D043 inventarios iguales no certifican restauracion',()=>{
  const r=compareRecoveryInventories(fixture(),fixture());
  assert.equal(r.estado,'INVENTARIOS_COINCIDENTES_SIN_RESTORE_CERTIFICADO');
  assert.equal(r.restore_verified,false);
  assert.equal(r.gate_d024_open,false);
});
test('D043 rechaza datos incompletos y cambios de conteos',()=>{
  for(const field of ['authUsers','authIdentities','authSessions','storageBuckets','storageObjects','vaultRecords','qualityClaims']){
    const b=fixture();b[field]++;
    const r=compareRecoveryInventories(fixture(),b);
    assert.equal(r.estado,'BLOQUEADO');
    assert.ok(r.errores.includes('diferencia_'+field));
  }
});
test('D043 rechaza cambios de historial',()=>{
  for(const modify of [b=>b.migrations.pop(), b=>b.migrations.reverse(), b=>b.migrations[0].name='otro']){
    const b=fixture();modify(b);
    assert.equal(compareRecoveryInventories(fixture(),b).estado,'BLOQUEADO');
  }
});
test('D043 seguridad estricta incluso si origen y destino coinciden',()=>{
  for(const [field,value] of [['cronJobs',1],['iaEnabled',true],['registrationEnabled',true],
    ['storagePublicBuckets',1],['publicMissingRls',1],['privateMissingRls',1]]){
    const a=fixture();a[field]=value;
    assert.equal(compareRecoveryInventories(a,structuredClone(a)).estado,'BLOQUEADO');
  }
});
test('D043 rechaza extensiones faltantes o version PG diferente',()=>{
  const b=fixture();b.extensions.pop();
  assert.equal(compareRecoveryInventories(fixture(),b).estado,'BLOQUEADO');
  const c=fixture();c.pgVersionNum=170012;
  assert.ok(compareRecoveryInventories(fixture(),c).errores.includes('version_postgresql_distinta'));
});
test('D043 estructura estricta y campos faltantes',()=>{
  for(const b of [null,{},[],{...fixture(),extra:1},{...fixture(),authUsers:'2'}]){
    assert.equal(compareRecoveryInventories(fixture(),b).estado,'BLOQUEADO');
  }
});
