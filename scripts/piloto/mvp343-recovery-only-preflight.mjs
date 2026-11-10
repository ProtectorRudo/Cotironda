/**
 * MVP343: audited recovery-only deployment candidate, development OFFLINE.
 * This is NOT a deployment command and never queries/pokes live Supabase.
 * Reuse MVP336 pinned webhook overlay + private one-time retry SQL, while
 * keeping the later universal-document MVP337–342 pipeline separate.
 */
import {resolve,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {prepararMvp336Overlay} from './mvp336-whapi-overlay-candidate.mjs';
import {buildMvp336Sql} from './mvp336-retry-source-builder.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const pull=(path)=>readFileSync(resolve(ROOT,path),'utf8');
const safeSql=(sql)=>{
 const parts=sql.split(/^ROLLBACK;\s*$/gm);
 if(parts.length!==2||!/^BEGIN;/mu.test(sql))
  throw Error('mvp343_release_requires_single_pg17_rollback');
 const migration='\\ir ../../piloto/mvp336_recorrelacion_una_vez_sin_unidades.sql';
 const test='\\ir ./mvp336-retry-source-pg17.sql';
 if(sql.split(migration).length!==2||sql.split(test).length!==2||
    sql.indexOf(migration)>sql.indexOf(test)||
    /\\ir \.\.\/\.\.\/piloto\/mvp34[0-9]/u.test(sql))
  throw Error('mvp343_recovery_only_bundle_changed');
 return Object.freeze({
  pg17_begin_rollback:true,
  one_time_recovery_migration:true,
  source_recovered_without_provider_reupload:true
 });
};
export function generarPaqueteRecuperacionMvp343(){
 const overlay=prepararMvp336Overlay();
 const sql=buildMvp336Sql();
 const checks=safeSql(sql);
 const worker=pull('supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts');
 const entry=pull('supabase/functions/cotironda-piloto-auto-recovery/index.ts');
 if(!worker.includes("from './supplier-auto-correlation-mvp336.ts'")||
    !worker.includes('retryReviewedOnce:')||
    !worker.includes('cotironda_piloto_claim_reviewed_auto_recovery_mvp336')||
    !entry.includes('authorizeRecoveryMvp294(')||
    !entry.includes("req.method!=='POST'")||
    !entry.includes('COTIRONDA_PILOT_AUTO_RECOVERY_SECRET'))
  throw Error('mvp343_private_worker_auth_or_link_missing');
 if(overlay.file_count!==62||
    overlay.db_mutated!==false||
    overlay.outbound_whatsapp_messages!==0||
    overlay.production_published!==false)
  throw Error('mvp343_historic_webhook_pin_drift');
 return Object.freeze({
  state:'candidate_only_not_deployed',
  scope:'mvp336_one_time_reviewed_source_recovery',
  webhook:{
   original_manifest_preserved:overlay.original_manifest_preserved,
   staging_file_count:overlay.file_count,
   base_index_sha256:overlay.baseline_index_sha256,
   candidate_index_sha256:overlay.index_sha256
  },
  sql:checks,
  worker_requires_two_independent_internal_credentials:true,
  newer_mvp337_342_not_required_for_legacy_recovery:true,
  backup_rehearsed:false,
  deployed:false,db_mutated:false,whatsapp_messages:0,
  openai_paid_calls:0,can_publish_quote:false
 });
}
const bool=x=>x===true;
/**
 * This operator-only report takes private READ-ONLY counts, never source
 * identifiers, credentials, actual prices, buyer phones or PDF text.
 * Staged status is NOT permission to bind; SQL+IA still own the decision.
 */
export function evaluarFuenteArchivadaMvp343(v){
 const allowed=['sourceStored','sourceUnbound','draftIsSupplierQuote',
  'stateReviewedInsufficient','recoveryPreviouslyClaimed',
  'unitlessRows','sourceRows','eligibleDispatchedRounds',
  'mvp336SqlPresent','liveBackupVerified',
  'workerAndWebhookSynced','recoveryAiSpendControlled',
  'explicitPilotPublicationAuthorized'];
 if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).some(k=>!allowed.includes(k)))
  return Object.freeze({state:'blocked',reason:'invalid_private_preflight',
   needsSupplierAction:false,canBindAutomatically:false,canPublish:false});
 if(!bool(v.sourceStored)||!bool(v.sourceUnbound)||
    !bool(v.draftIsSupplierQuote)||!bool(v.stateReviewedInsufficient)||
    v.recoveryPreviouslyClaimed!==false||
    !Number.isSafeInteger(v.sourceRows)||v.sourceRows!==3||
    !Number.isSafeInteger(v.unitlessRows)||v.unitlessRows!==3||
    !Number.isSafeInteger(v.eligibleDispatchedRounds)||
    v.eligibleDispatchedRounds!==2)
  return Object.freeze({state:'blocked',reason:'source_or_candidates_changed',
   needsSupplierAction:false,canBindAutomatically:false,canPublish:false});
 if(!bool(v.mvp336SqlPresent))
  return Object.freeze({state:'staging_required',reason:'mvp336_migration_absent',
   needsSupplierAction:false,canBindAutomatically:false,canPublish:false});
 if(!bool(v.liveBackupVerified))
  return Object.freeze({state:'blocked',reason:'recovery_backup_not_verified',
   needsSupplierAction:false,canBindAutomatically:false,canPublish:false});
 if(!bool(v.workerAndWebhookSynced))
  return Object.freeze({state:'blocked',reason:'worker_webhook_versions_not_synced',
   needsSupplierAction:false,canBindAutomatically:false,canPublish:false});
 if(!bool(v.recoveryAiSpendControlled))
  return Object.freeze({state:'blocked',reason:'recovery_ai_spend_uncontrolled',
   needsSupplierAction:false,canBindAutomatically:false,canPublish:false});
 if(!bool(v.explicitPilotPublicationAuthorized))
  return Object.freeze({state:'blocked',reason:'pilot_publication_not_authorized',
   needsSupplierAction:false,canBindAutomatically:false,canPublish:false});
 return Object.freeze({state:'ready_for_one_internal_retry',
  reason:'source_prerequisites_present_private_only',
  needsSupplierAction:false,canBindAutomatically:false,canPublish:false});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length>3||!['--check','--json'].includes(process.argv[2]??'--check'))
   throw Error('mvp343_invalid_mode');
  process.stdout.write(JSON.stringify(generarPaqueteRecuperacionMvp343())+'\n');
 }catch(e){console.error(e.message);process.exitCode=1}
}
