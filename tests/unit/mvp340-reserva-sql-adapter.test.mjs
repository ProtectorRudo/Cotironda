import test from 'node:test';
import assert from 'node:assert/strict';
import {presupuestosMvp337} from '../fixtures/mvp337-presupuestos-heterogeneos.mjs';
import {planificarEvidenciaMvp337} from
 '../../src/domain/ia-central/ingesta-evidencia-flexible-mvp337.ts';
import {procesarLotesIAInternosMvp339} from
 '../../src/domain/ia-central/procesador-ia-lotes-mvp339.ts';
import {crearReservaSqlMvp340,huellaPlanMvp340} from
 '../../src/domain/ia-central/puente-reserva-sql-mvp340.ts';
const scope={
 roundId:'aefe169e-7801-4efc-aabf-25cd134744eb',
 supplierKey:'corralon_ailin',
 messageHmac:'b'.repeat(64),chatHmac:'c'.repeat(64)
};
const fixture=presupuestosMvp337.find(x=>x.format==='xlsx'&&x.variant===15);
const plan=planificarEvidenciaMvp337({
 format:fixture.format,sourceSha256:fixture.sha256,rows:fixture.rows
});
const response=x=>({data:x,error:null});
test('MVP340: digest cambia si cambia fuente, orden, sección o lote',async()=>{
 const hash=await huellaPlanMvp340(plan);
 assert.match(hash,/^[a-f0-9]{64}$/u);
 assert.equal(await huellaPlanMvp340(plan),hash);
 for(const altered of [
  {...plan,sourceSha256:'f'.repeat(64),lots:plan.lots.map(
   l=>({...l,sourceSha256:'f'.repeat(64)}))},
  {...plan,lots:plan.lots.map((l,i)=>i===0?{...l,
   rows:l.rows.map((r,j)=>j===0?{...r,literal:r.literal+'+'}:r)}:l)},
  {...plan,lots:plan.lots.map((l,i)=>i===0?{...l,
   rows:l.rows.map((r,j)=>j===0?{...r,section:'pagina:99'}:r)}:l)}
 ])assert.notEqual(await huellaPlanMvp340(altered),hash);
});
test('MVP340: puente reserva -> doble lectura -> fin SQL, sin publicar',async()=>{
 const commands=[],receipts=new Set();
 const sql=async(name,params)=>{
  commands.push({name,params});
  if(name==='cotironda_piloto_reserve_supplier_lots_mvp340'){
   const id=params.p_message_hmac;
   if(receipts.has(id))return response({state:'already_processed'});
   receipts.add(id);
   return response({
    state:'reserved',receipt:'c'.repeat(32),
    roundId:params.p_round_id,supplierKey:params.p_supplier_key,
    messageHmac:id,chatHmac:params.p_chat_hmac,
    sourceSha256:params.p_source_sha256
   });
  }
  if(name==='cotironda_piloto_finish_supplier_lots_mvp340'){
   assert.equal(params.p_receipt,'c'.repeat(32));
   assert.equal(params.p_state,'analysis_ready_private');
   assert.equal(params.p_model_calls,plan.lots.length*2);
   assert.equal(params.p_agreed_rows,plan.totalRows);
   assert.equal(params.p_total_rows,plan.totalRows);
   return response({state:'recorded'});
  }
  throw Error('unexpected_sql');
 };
 const bridge=await crearReservaSqlMvp340({scope,plan,rpc:sql});
 const interpret=async req=>({
  sourceSha256:req.sourceSha256,lotNumber:req.lotNumber,
  lotDigest:req.lotDigest,
  readings:req.rows.map(row=>({...fixture.reading[row.position-1]}))
 });
 const args={scope,plan,interpret,...bridge};
 const first=await procesarLotesIAInternosMvp339(args);
 assert.equal(first.state,'ready_for_independent_source_audit');
 assert.equal(first.agreedRows,plan.totalRows);
 assert.equal(first.economicPublicationAllowed,false);
 assert.equal(first.whatsappMessages,0);
 const reserve=commands.find(x=>x.name.includes('reserve'));
 const finish=commands.find(x=>x.name.includes('finish'));
 assert.equal(reserve.params.p_round_id,scope.roundId);
 assert.equal(reserve.params.p_supplier_key,scope.supplierKey);
 assert.equal(reserve.params.p_plan_sha256,bridge.planSha256);
 assert.equal(reserve.params.p_max_model_calls,plan.lots.length*2);
 assert.equal(finish.params.p_plan_sha256,bridge.planSha256);
 assert.equal(finish.params.p_source_sha256,plan.sourceSha256);
 assert.equal(commands.length,2);
 const second=await procesarLotesIAInternosMvp339(args);
 assert.equal(second.state,'already_processed');
 assert.equal(commands.length,3);
});
test('MVP340: denial, RPC error, crossed supplier and uncommitted finish never issue verified offer',async()=>{
 const modes=['not_eligible','error','cross','finish_missing'];
 for(const mode of modes){
  let calls=0;
  const rpc=async(name,params)=>{
   calls++;
   if(name.includes('reserve')){
    if(mode==='error')return {data:null,error:{message:'private origin'}};
    if(mode==='not_eligible')return response({state:'not_eligible'});
    return response({
     state:'reserved',receipt:'d'.repeat(32),
     roundId:scope.roundId,
     supplierKey:mode==='cross'?'corralon_nahuel':scope.supplierKey,
     messageHmac:scope.messageHmac,chatHmac:scope.chatHmac,
     sourceSha256:plan.sourceSha256
    });
   }
   return response({state:mode==='finish_missing'?'not_leased':'recorded'});
  };
  const bridge=await crearReservaSqlMvp340({scope,plan,rpc});
  const outcome=await procesarLotesIAInternosMvp339({
   scope,plan,...bridge,interpret:async req=>({
    sourceSha256:req.sourceSha256,lotNumber:req.lotNumber,
    lotDigest:req.lotDigest,
    readings:req.rows.map(row=>fixture.reading[row.position-1])
   })
  });
  assert.ok(['not_eligible','reconciliation_required'].includes(
   outcome.state),mode);
  assert.equal(outcome.economicPublicationAllowed,false);
  assert.equal(outcome.readings,null);
  assert.equal(calls,mode==='finish_missing'?2:1);
 }
});
test('MVP340: adaptador impide cambiar la ronda o proveedor tras planificar',async()=>{
 let called=0;
 const bridge=await crearReservaSqlMvp340({
  scope,plan,rpc:async()=>{called++;return response({state:'reserved'})}
 });
 await assert.rejects(bridge.reserve({
  scope:{...scope,supplierKey:'corralon_nahuel'},
  sourceSha256:plan.sourceSha256
 }),/mvp340_scope_changed/);
 await assert.rejects(bridge.finish({
  scope:{...scope,roundId:'ddec169e-7801-4efc-aabf-25cd134744eb'},
  sourceSha256:plan.sourceSha256,receipt:'c'.repeat(32),
  state:'review_required',reason:'unread_source_lot',totalRows:plan.totalRows,
  modelCalls:0,agreedRows:0
 }),/mvp340_finish_scope_changed/);
 assert.equal(called,0);
});
