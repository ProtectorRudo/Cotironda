import test from 'node:test';
import assert from 'node:assert/strict';
import {
 generarPaqueteRecuperacionMvp343,evaluarFuenteArchivadaMvp343
} from '../../scripts/piloto/mvp343-recovery-only-preflight.mjs';
import {corroborarCantidadMvp291 as cuantiaMvp291} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp291.ts';
import {elegirRondaUnicaMvp291 as elegirMvp336} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.ts';

const snapshot=Object.freeze({
 sourceStored:true,sourceUnbound:true,draftIsSupplierQuote:true,
 stateReviewedInsufficient:true,recoveryPreviouslyClaimed:false,
 sourceRows:3,unitlessRows:3,eligibleDispatchedRounds:2,
 mvp336SqlPresent:false,liveBackupVerified:false,
 workerAndWebhookSynced:false,explicitPilotPublicationAuthorized:false
});
test('MVP343: paquete de recuperación acotado genera overlay de webhook y PG17 rollback sin publicar',()=>{
 const r=generarPaqueteRecuperacionMvp343();
 assert.equal(r.state,'candidate_only_not_deployed');
 assert.equal(r.scope,'mvp336_one_time_reviewed_source_recovery');
 assert.equal(r.webhook.original_manifest_preserved,true);
 assert.equal(r.webhook.staging_file_count,62);
 assert.match(r.webhook.candidate_index_sha256,/^[a-f0-9]{64}$/u);
 assert.equal(r.sql.pg17_begin_rollback,true);
 assert.equal(r.sql.one_time_recovery_migration,true);
 assert.equal(r.newer_mvp337_342_not_required_for_legacy_recovery,true);
 assert.equal(r.worker_requires_two_independent_internal_credentials,true);
 assert.equal(r.deployed,false);
 assert.equal(r.db_mutated,false);
 assert.equal(r.whatsapp_messages,0);
 assert.equal(r.openai_paid_calls,0);
 assert.equal(r.can_publish_quote,false);
});
test('MVP343: diagnóstico real sanitizado bloquea publicar y no exige reenviar',()=>{
 const r=evaluarFuenteArchivadaMvp343(snapshot);
 assert.equal(r.state,'staging_required');
 assert.equal(r.reason,'mvp336_migration_absent');
 assert.equal(r.needsSupplierAction,false);
 assert.equal(r.canBindAutomatically,false);
 assert.equal(r.canPublish,false);
});
test('MVP343: migración sola no autoriza IA, presupuesto ni edición del piloto',()=>{
 const staged=evaluarFuenteArchivadaMvp343({
  ...snapshot,mvp336SqlPresent:true
 });
 assert.equal(staged.state,'blocked');
 assert.equal(staged.reason,'recovery_backup_not_verified');
 const backed=evaluarFuenteArchivadaMvp343({
  ...snapshot,mvp336SqlPresent:true,liveBackupVerified:true
 });
 assert.equal(backed.reason,'worker_webhook_versions_not_synced');
 const synced=evaluarFuenteArchivadaMvp343({
  ...snapshot,mvp336SqlPresent:true,liveBackupVerified:true,
  workerAndWebhookSynced:true
 });
 assert.equal(synced.reason,'pilot_publication_not_authorized');
 const authorized=evaluarFuenteArchivadaMvp343({
  ...snapshot,mvp336SqlPresent:true,liveBackupVerified:true,
  workerAndWebhookSynced:true,explicitPilotPublicationAuthorized:true
 });
 assert.equal(authorized.state,'ready_for_one_internal_retry');
 assert.equal(authorized.canBindAutomatically,false);
 assert.equal(authorized.canPublish,false);
});
test('MVP343: no usar cantidad parcial, segunda cotización o plazo vencido para decidir ronda',()=>{
 for(const change of [
  {sourceStored:false},{sourceUnbound:false},
  {draftIsSupplierQuote:false},{stateReviewedInsufficient:false},
  {recoveryPreviouslyClaimed:true},{sourceRows:2},
  {unitlessRows:2},{eligibleDispatchedRounds:1},
  {eligibleDispatchedRounds:3},{eligibleDispatchedRounds:0},
  {unitlessRows:'3'},{sourceRows:3.5}
 ]){
  const v=evaluarFuenteArchivadaMvp343({...snapshot,...change});
  assert.equal(v.state,'blocked',JSON.stringify(change));
  assert.equal(v.reason,'source_or_candidates_changed');
  assert.equal(v.needsSupplierAction,false);
  assert.equal(v.canBindAutomatically,false);
 }
 assert.equal(evaluarFuenteArchivadaMvp343({
  ...snapshot,price:300000
 }).state,'blocked');
});
test('MVP343: el PDF 15/2/1 de ensayo es UNICO ante 20/3 solo con doble lectura concordante',()=>{
 const newer='11111111-1111-4111-8111-111111111111';
 const older='22222222-2222-4222-8222-222222222222';
 const quote=[
  {line_no:1,description:'Cemento Avellaneda',quantity:'15,00',unit:null},
  {line_no:2,description:'BIG BAG de Arena',quantity:'2,00',unit:null},
  {line_no:3,description:'BIG BAG de Piedra',quantity:'1,00',unit:null}
 ];
 const newRound={request_id:newer,lines:[
  {line_no:1,description:'Cemento CPC 50 kg',quantity:'15',unit:'bolsas'},
  {line_no:2,description:'Arena',quantity:'2',unit:'bolsones'},
  {line_no:3,description:'Piedra',quantity:'1',unit:'bolsón'}
 ]};
 const oldRound={request_id:older,lines:[
  {line_no:1,description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas'},
  {line_no:2,description:'Arena',quantity:'3',unit:'bolsones'}
 ]};
 const p={matches:[
  ...[1,2,3].map(i=>({candidate:'r1',source_line:i,
   request_line:i,relation:'equivalent'})),
  ...[1,2].map(i=>({candidate:'r2',source_line:i,
   request_line:i,relation:'equivalent'}))
 ]};
 const snapshot={quote,options:[newRound,oldRound]};
 const selected=elegirMvp336(snapshot,p,{matches:[...p.matches].reverse()});
 assert.equal(selected.requestId,newer);
 assert.deepEqual(selected.scores,[6,2]);
 assert.equal(selected.reason,'unique_material_evidence');
 assert.equal(cuantiaMvp291(quote[0],newRound.lines[0]),'unknown');
 // The new correlation does not repair omitted packaging units or validate a price.
 assert.equal(quote[0].unit,null);
 assert.equal(elegirMvp336(snapshot,p,{matches:[]}).requestId,null);
 assert.equal(elegirMvp336({
  quote,options:[newRound,{...newRound,request_id:older}]
 },{matches:p.matches.filter(x=>x.candidate==='r1').flatMap(x=>[
  x,{...x,candidate:'r2'}
 ])},{matches:p.matches.filter(x=>x.candidate==='r1').flatMap(x=>[
  x,{...x,candidate:'r2'}
 ])}).requestId,null);
});
