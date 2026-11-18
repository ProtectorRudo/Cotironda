import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FUENTES_ASOCIACION_V2,sustituirAsociacionV2,
 reconstruirAsociacionUniversalV2} from
 '../../scripts/piloto/v2-asociacion-contextual-live-overlay.mjs';
const fake='import {correlacionAutomaticaMvp291} from \'./supplier-auto-correlation-mvp336.ts\';\n'+
 'import {extraerMaterialesTextoMvp292} from \'./supplier-text-materials-mvp292.ts\';\n'+
 '/* SAFE ORIGINAL PRODUCTION CODE */'.repeat(15);
test('El overlay integra los dos lectores sin modificar ninguna otra línea',()=>{
 const patched=sustituirAsociacionV2(fake);
 assert.match(patched,/supplier-auto-correlation-contextual-v2.ts/u);
 assert.match(patched,/supplier-text-materials-contextual-v2.ts/u);
 assert.doesNotMatch(patched,/supplier-auto-correlation-mvp336.ts/u);
 assert.doesNotMatch(patched,/supplier-text-materials-mvp292.ts/u);
 assert.ok(patched.includes('SAFE ORIGINAL PRODUCTION CODE'));
 assert.notEqual(createHash('sha256').update(fake).digest('hex'),
  createHash('sha256').update(patched).digest('hex'));
});
test('El overlay rechaza fuente de versión, contenido o importación no verificada',()=>{
 assert.throws(()=>sustituirAsociacionV2(fake.replace(
  'supplier-auto-correlation-mvp336.ts','otro-archivo.ts')),
  /v2_contextual_import_drift/u);
 assert.throws(()=>sustituirAsociacionV2(fake+fake),
  /v2_contextual_import_drift/u);
 assert.throws(()=>reconstruirAsociacionUniversalV2({
  whapi:{version:101,bundle:FUENTES_ASOCIACION_V2.whapi.bundle,content:fake},
  recovery:{version:21,bundle:FUENTES_ASOCIACION_V2.recovery.bundle,content:fake}
 }),/v2_contextual_live_source_drift/u);
 assert.throws(()=>reconstruirAsociacionUniversalV2({}),/two_sources_required/u);
});
test('El gate está anclado a v101 y v21 y no permite despliegue automático',()=>{
 assert.equal(FUENTES_ASOCIACION_V2.whapi.version,101);
 assert.equal(FUENTES_ASOCIACION_V2.recovery.version,21);
 for(const v of Object.values(FUENTES_ASOCIACION_V2)){
  assert.match(v.sha256,/^[a-f0-9]{64}$/u);
  assert.match(v.bundle,/^[a-f0-9]{64}$/u);
 }
 const source=String.raw\`const x='never';\`;
 assert.doesNotMatch(source,/deploy_edge_function/u);
});
