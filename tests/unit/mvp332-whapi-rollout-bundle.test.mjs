import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,copyFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {inspeccionarWebhookMvp332} from
 '../../scripts/piloto/mvp332-whapi-bundle-readonly.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const MANIFEST='scripts/piloto/mvp332-whapi-v70-bundle-manifest.json';
const manifest=JSON.parse(readFileSync(resolve(ROOT,MANIFEST),'utf8'));
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'mvp332-'));
 for(const file of [...manifest.files.map(x=>x.path),MANIFEST]){
  const src=resolve(ROOT,file),dst=resolve(dir,file);
  mkdirSync(dirname(dst),{recursive:true});
  copyFileSync(src,dst);
 }
 return dir;
}
function withFixture(fn){
 const dir=fixture();
 try{return fn(dir)}
 finally{rmSync(dir,{recursive:true,force:true})}
}
function mutation(dir,path,edit){
 const file=resolve(dir,path);
 writeFileSync(file,edit(readFileSync(file,'utf8')));
}
test('MVP332: exact 60 live + 1 new, static import graph, no deploy',()=>{
 const r=inspeccionarWebhookMvp332();
 assert.equal(r.estado,'bundle_whapi_mvp332_candidate_verified');
 assert.equal(r.active_files,60);
 assert.equal(r.candidate_files,61);
 assert.equal(r.unchanged_files,57);
 assert.equal(r.file_paths.length,61);
 assert.equal(r.changed_files.length,4);
 assert.equal(r.deployment_authorized,false);
 assert.equal(r.messages_sent,0);
 assert.equal(r.sql_modified,false);
 assert.equal(r.whapi_modified,false);
 assert(!JSON.stringify(r).includes('Bearer '));
});
test('MVP332: copied bundle also verifies independently',()=>{
 withFixture(dir=>assert.equal(inspeccionarWebhookMvp332(dir).candidate_files,61));
});
test('MVP332: modified existing webhook code is rejected',()=>{
 withFixture(dir=>{
  mutation(dir,manifest.entrypoint,s=>s.replace(
   'COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED',
   'COTIRONDA_PILOT_WHAPI_OUTBOUND_DISABLEDD'));
  assert.throws(()=>inspeccionarWebhookMvp332(dir),/candidate_hash_drift/u);
 });
});
test('MVP332: tampered dynamic recipient decoder rejected',()=>{
 withFixture(dir=>{
  mutation(dir,'supabase/functions/cotironda-piloto-whapi/dynamic-recipient-mvp313.ts',
   s=>s+'\n// unauthorized path\n');
  assert.throws(()=>inspeccionarWebhookMvp332(dir),/candidate_hash_drift/u);
 });
});
test('MVP332: a missing audited file blocks deployment candidate',()=>{
 withFixture(dir=>{
  rmSync(resolve(dir,manifest.files[8].path));
  assert.throws(()=>inspeccionarWebhookMvp332(dir),/missing_source/u);
 });
});
test('MVP332: adding an import of an unexpected module fails hash check',()=>{
 withFixture(dir=>{
  mutation(dir,manifest.entrypoint,
   s=>s+"\\nimport './unreviewed-sender.ts';\\n");
  assert.throws(()=>inspeccionarWebhookMvp332(dir),/candidate_hash_drift/u);
 });
});
test('MVP332: manifest cannot authorize deployment or silently change project',()=>{
 for(const key of ['deployment_authorized','project_ref']){
  withFixture(dir=>{
   const p=resolve(dir,MANIFEST),m=JSON.parse(readFileSync(p,'utf8'));
   m[key]=key==='deployment_authorized'?true:'some-other-supabase-project';
   writeFileSync(p,JSON.stringify(m));
   assert.throws(()=>inspeccionarWebhookMvp332(dir),/wrong_baseline_manifest/u);
  });
 }
});
test('MVP332: manifest cannot smuggle new source under path traversal',()=>{
 withFixture(dir=>{
  const p=resolve(dir,MANIFEST),m=JSON.parse(readFileSync(p,'utf8'));
  m.files[0].path='../secret.ts';
  writeFileSync(p,JSON.stringify(m));
  assert.throws(()=>inspeccionarWebhookMvp332(dir),/invalid_manifest_entry/u);
 });
});
test('MVP332: target source map rejects empty or arbitrary manifests',()=>{
 withFixture(dir=>{
  const p=resolve(dir,MANIFEST),m=JSON.parse(readFileSync(p,'utf8'));
  m.files=m.files.slice(0,-1);
  writeFileSync(p,JSON.stringify(m));
  assert.throws(()=>inspeccionarWebhookMvp332(dir),/wrong_baseline_manifest/u);
 });
});
