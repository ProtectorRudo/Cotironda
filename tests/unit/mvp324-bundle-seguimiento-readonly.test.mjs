import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {
 ACTIVE_FILES_MVP324,EDGE_ENTRY_MVP324,inspectSeguimientoBundleMvp324
} from '../../scripts/piloto/mvp324-bundle-seguimiento-readonly.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const EXTRA='src/domain/ia-central/preliminar-anonimo-presupuestos-mvp322.ts';
const filePaths=[...ACTIVE_FILES_MVP324,EXTRA];
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'cotironda-mvp324-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const name of filePaths){
   const target=join(root,name);
   mkdirSync(dirname(target),{recursive:true});
   cpSync(join(ROOT,name),target);
 }
 return root;
}
function corrupt(root,name,update){
 const path=join(root,name);
 writeFileSync(path,update(readFileSync(path,'utf8')));
}
test('MVP324: active Edge v25 29-file snapshot plus only MVP322 adapter => 30 files',()=>{
 const report=inspectSeguimientoBundleMvp324(ROOT);
 assert.equal(report.state,'mvp324_bundle_offline_verified');
 assert.equal(report.file_count,30);
 assert.equal(report.unchanged_active_files,28);
 assert.equal(report.baseline_blob_sha,'9c38a10ba6b4ffd726ad2348a748b1598954bffc');
 assert.deepEqual(report.new_or_changed_files,[EDGE_ENTRY_MVP324,EXTRA]);
 assert.deepEqual(new Set(report.filePaths),new Set(filePaths));
 for(const field of ['scheduled_jobs_created','whapi_touched','deployment_authorized'])
   assert.equal(report[field],false);
 assert.equal(report.verify_jwt_must_remain_false,true);
});
test('MVP324: CLI outputs names only, no source or tokens',()=>{
 const out=execFileSync(process.execPath,[
  'scripts/piloto/mvp324-bundle-seguimiento-readonly.mjs','--paths'
 ],{cwd:ROOT,encoding:'utf8'});
 assert.equal(out.trim().split('\n').length,30);
 assert.match(out,/preliminar-anonimo-presupuestos-mvp322\.ts/u);
 assert.doesNotMatch(out,/SUPABASE|Bearer|secret|whapi\.cloud|npm:@supabase/u);
});
test('MVP324: fails closed on a single altered line in OLD tracking logic',t=>{
 const root=fixture(t);
 corrupt(root,EDGE_ENTRY_MVP324,s=>s.replace(
  'const ref=', 'const changed_ref='
 ));
 assert.throws(()=>inspectSeguimientoBundleMvp324(root),
  /live_index_baseline_drift_unreviewed_change/u);
});
test('MVP324: fails closed if new projection is missing',t=>{
 const root=fixture(t);
 corrupt(root,EDGE_ENTRY_MVP324,s=>s.replace(
  'const preliminar=preliminarAnonimoPresupuestosMvp322(ai.data,safe);',''
 ));
 assert.throws(()=>inspectSeguimientoBundleMvp324(root),
  /new_projection_not_exactly_once/u);
});
test('MVP324: fails closed if import was duplicated or new file removed',t=>{
 const root=fixture(t);
 corrupt(root,EDGE_ENTRY_MVP324,s=>{
  const first=s.indexOf('import {preliminarAnonimoPresupuestosMvp322}');
  const pos=s.indexOf(';',first)+1;
  return s.slice(0,pos)+'\n'+s.slice(first,pos)+s.slice(pos);
 });
 assert.throws(()=>inspectSeguimientoBundleMvp324(root),/new_import_not_exactly_once/u);
});
test('MVP324: rejects newly introduced import absent from reviewed manifest',t=>{
 const root=fixture(t);
 const unexpected='src/domain/ia-central/undeclared-mvp324.ts';
 mkdirSync(dirname(join(root,unexpected)),{recursive:true});
 writeFileSync(join(root,unexpected),'export const extra=1;\n');
 corrupt(root,EXTRA,s=>
  "import {extra} from './undeclared-mvp324.ts';\n"+s
 );
 assert.throws(()=>inspectSeguimientoBundleMvp324(root),
  /dependency_closure_diff/u);
});
test('MVP324: rejects dynamic import in dependency',t=>{
 const root=fixture(t);
 corrupt(root,EXTRA,s=>
   s+'\nconst suspense=()=>import("./unknown.ts");\n'
 );
 assert.throws(()=>inspectSeguimientoBundleMvp324(root),
  /dynamic_import_not_reviewed/u);
});
