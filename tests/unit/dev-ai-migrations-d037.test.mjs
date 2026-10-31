import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verificarFuentesIAD037} from '../../scripts/ci/verify-dev-ai-migration-sources-d037.mjs';

test('D037: los cinco archivos son identicos por SHA al historial aplicado en DEV',async()=>{
 const r=await verificarFuentesIAD037();
 assert.equal(r.status,'FUENTES_EXACTAS_VERIFICADAS');
 assert.equal(r.count,5);
 assert.equal(r.readyForRestore,false);
 assert.equal(r.readyForDeploy,false);
 assert.deepEqual(r.hashes.map(x=>x.version),[
   '20261030182413','20261030190232','20261030192011',
   '20261030192221','20261030194856'
 ]);
});
test('D037: editar un solo byte de SQL histórico bloquea integridad',async()=>{
 const read=async(file,enc)=>{
   const source=await readFile(file,enc);
   if(String(file).endsWith('20261030192011_dev_quality_auto_dispatch_d020.sql'))
      return source.replace('create extension','CREATE EXTENSION');
   return source;
 };
 await assert.rejects(()=>verificarFuentesIAD037(read),
   /D037_SOURCE_HASH_MISMATCH_20261030192011/);
});
test('D037: adulterar hash o nombre del manifiesto bloquea',async()=>{
 for(const alter of [
   m=>m.migrations[0].sha256='a'.repeat(64),
   m=>m.migrations[1].name='../../unsafe',
   m=>m.migrations[2].version=m.migrations[1].version,
   m=>m.safeToAutoExecute=true,
   m=>m.migrations=m.migrations.slice(0,4)
 ]){
   const read=async(file,enc)=>{
     const source=await readFile(file,enc);
     if(!String(file).endsWith('manifest.json'))return source;
     const manifest=JSON.parse(source);alter(manifest);
     return JSON.stringify(manifest);
   };
   await assert.rejects(()=>verificarFuentesIAD037(read),/D037_/);
 }
});
test('D037: ausencia de archivo no habilita restauración parcial',async()=>{
 const read=async(file,enc)=>{
   if(String(file).endsWith('20261030194856_dev_quality_numeric_diagnostics_d021.sql'))
     throw new Error('ENOENT');
   return readFile(file,enc);
 };
 await assert.rejects(()=>verificarFuentesIAD037(read),/ENOENT/);
});
test('D037: el control nunca llama SQL ni red externa',async()=>{
 const seen=[];
 const read=async(file,enc)=>{seen.push(String(file));return readFile(file,enc)};
 await verificarFuentesIAD037(read);
 assert.equal(seen.length,6);
 assert.ok(seen.every(x=>x.includes('/supabase/recovery/dev_quality_20261030/')));
});
