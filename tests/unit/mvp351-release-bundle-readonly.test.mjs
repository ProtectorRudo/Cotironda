import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 FILES_MVP351,validarBundleMvp351,inspeccionarCandidatoMvp351
} from '../../scripts/piloto/mvp351-release-bundle-readonly.mjs';

function localSources(){
 return Object.fromEntries(Object.entries(FILES_MVP351).map(([k,path])=>
  [k,readFileSync(path,'utf8')]));
}
test('MVP351 release: fuente SQL, worker, navegador y correlador protegen la misma ruta',()=>{
 const r=inspeccionarCandidatoMvp351();
 assert.equal(r.state,'offline_candidate_checked');
 assert.equal(r.historical_source_pinned,true);
 assert.equal(r.worker_material_fidelity_included,true);
 assert.equal(r.source_and_amount_gates_included,true);
 assert.equal(r.historical_round_not_bindable,true);
 assert.equal(r.no_new_communication,true);
 assert.equal(r.deployed,false);
 assert.equal(r.ready_to_publish,false);
 assert.equal(r.ready_for_e2e,false);
 assert.equal(r.whapi_sends,0);
 assert.equal(r.live_edge_worker_matches,null);
 assert.equal(r.pilot_sql_installed,null);
 assert.ok(r.requires_order.some(x=>x.includes('instalar_SQL')));
 assert.equal(validarBundleMvp351(localSources()).state,'local_sources_compatible');
});
test('MVP351 release: código Whapi alterado, falta de cotejo original o auth abortan',()=>{
 const all=localSources();
 const tamper=[
  ['correlator',s=>s.replace('historical_round_best_fit','forced_round')],
  ['worker',s=>s.replace('evaluarMaterialesRecuperadosMvp348(','ignoredMaterialFidelity(')],
  ['archived',s=>s.replace('cotironda_piloto_audit_supplier_amounts_mvp103','skip_amounts')],
  ['revision',s=>s.replace('cotironda_piloto_store_revision_candidate_mvp346','publish_anything')],
  ['publication',s=>s.replace('revision_sha_mismatch','ignore_sha')],
  ['entry',s=>s.replace('authorizeRecoveryMvp294({','allowAll({')],
  ['sql',s=>s.replace("r.state IN('prepared','closed')","r.state='prepared'")],
  ['sql',s=>s.replace("'bind_allowed',(v_request.state='prepared')","'bind_allowed',true")],
  ['material',s=>s.replace('archived_unit_mismatch','always_accepted')]
 ];
 for(const [file,edit] of tamper){
  const changed=edit(all[file]);
  assert.notEqual(changed,all[file],file+' fixture');
  assert.throws(()=>validarBundleMvp351({...all,[file]:changed}),/MVP351_/u,file);
 }
 assert.throws(()=>validarBundleMvp351({...all,worker:null}),/MVP351_MISSING_worker/u);
});
test('MVP351 release: reporte local jamás equivale a publicar cotizaciones',()=>{
 const src=readFileSync('scripts/piloto/mvp351-release-bundle-readonly.mjs','utf8');
 assert.match(src,/ready_to_publish:false/);
 assert.match(src,/economic_original_verified:false/);
 assert.match(src,/verified_backup:false/);
 assert.match(src,/ready_for_e2e:false/);
 assert.doesNotMatch(src,/\bfetch\s*\(/u);
 assert.doesNotMatch(src,/execute_sql|deploy_edge_function|apply_migration/u);
});
