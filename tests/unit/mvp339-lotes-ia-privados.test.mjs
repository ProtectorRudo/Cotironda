import test from 'node:test';
import assert from 'node:assert/strict';
import {presupuestosMvp337} from '../fixtures/mvp337-presupuestos-heterogeneos.mjs';
import {planificarEvidenciaMvp337} from
 '../../src/domain/ia-central/ingesta-evidencia-flexible-mvp337.ts';
import {procesarLotesIAInternosMvp339} from
 '../../src/domain/ia-central/procesador-ia-lotes-mvp339.ts';

const scope=Object.freeze({
 roundId:'aefe169e-7801-4efc-aabf-25cd134744eb',
 supplierId:'aaec169e-7801-4efc-aabf-25cd134744eb',
 messageHmac:'a'.repeat(64),chatHmac:'b'.repeat(64)
});
const sample=presupuestosMvp337.find(x=>x.format==='xlsx'&&x.variant===15);
assert.ok(sample);
const p=x=>planificarEvidenciaMvp337({
 format:x.format,sourceSha256:x.sha256,rows:x.rows
});
const budget=x=>({
 maxModelCalls:x.lots.length*2,
 maxInputChars:x.lots.flatMap(l=>l.rows)
  .reduce((n,r)=>n+r.literal.length,0)*2
});
const fakeReader=(fixture,changes=()=>{})=>async request=>{
 const items=request.rows.map(row=>({...fixture.reading[row.position-1]}));
 changes({request,items});
 return {
  sourceSha256:request.sourceSha256,lotNumber:request.lotNumber,
  lotDigest:request.lotDigest,readings:items
 };
};
function setup(fixture=sample,overrides={}){
 const plan=p(fixture),events=[],completed=new Set();
 const interpret=overrides.interpret??fakeReader(fixture);
 return {
  plan,events,
  args:{
   scope,plan,budget:budget(plan),
   reserve:async({sourceSha256,scope})=>{
    events.push({event:'reserve',sourceSha256,roundId:scope.roundId});
    const key=[sourceSha256,scope.messageHmac,scope.roundId].join('/');
    if(completed.has(key))return {state:'already_processed'};
    completed.add(key);
    return {state:'reserved',sourceSha256,
     roundId:scope.roundId,supplierId:scope.supplierId,
     messageHmac:scope.messageHmac,chatHmac:scope.chatHmac,
     receipt:'r'.repeat(32)};
   },
   finish:async args=>{events.push({event:'finish',...args});return 'recorded'},
   interpret:async req=>{
    events.push({event:'interpret',perspective:req.perspective,
     lot:req.lotNumber,positions:req.rows.map(r=>r.position)});
    return interpret(req);
   },...overrides
  }
 };
}
test('MVP339: 87+ renglones y extras/IVA/flete/total no se pierden',async()=>{
 const {plan,events,args}=setup();
 assert.ok(plan.totalRows>80);
 const v=await procesarLotesIAInternosMvp339(args);
 assert.equal(v.state,'ready_for_independent_source_audit',v.reason);
 assert.equal(v.agreedRows,sample.expectedRows);
 assert.equal(v.modelCalls,plan.lots.length*2);
 assert.deepEqual(v.readings,sample.reading);
 assert.equal(v.economicPublicationAllowed,false);
 assert.equal(v.whatsappMessages,0);
 const reads=events.filter(x=>x.event==='interpret');
 assert.equal(reads.length,v.modelCalls);
 for(let i=0;i<reads.length;i+=2){
  assert.equal(reads[i].perspective,'primary');
  assert.equal(reads[i+1].perspective,'corroboration');
  assert.deepEqual(reads[i].positions,reads[i+1].positions);
 }
 assert.equal(events[0].event,'reserve');
 assert.equal(events.at(-1).event,'finish');
 assert.equal(events.at(-1).state,'analysis_ready_private');
 assert.equal(v.readings.some(x=>x.kind==='condition'),true);
 assert.equal(v.readings.some(x=>x.kind==='total'),true);
 assert.equal(v.readings.some(x=>x.kind==='extra'),true); // descuento variante15
});
test('MVP339: 192 corpus heterogéneo completo conserva todas las filas',async()=>{
 for(const fixture of presupuestosMvp337){
  const {args,plan}=setup(fixture);
  const v=await procesarLotesIAInternosMvp339(args);
  assert.equal(v.state,'ready_for_independent_source_audit',
   fixture.id+' '+v.reason);
  assert.equal(v.agreedRows,fixture.expectedRows);
  assert.equal(v.readings.length,fixture.expectedRows);
  assert.equal(v.modelCalls,plan.lots.length*2);
 }
});
test('MVP339: segunda ejecución misma ronda+origen no consume otra IA',async()=>{
 const {args,events}=setup();
 const first=await procesarLotesIAInternosMvp339(args);
 assert.equal(first.state,'ready_for_independent_source_audit');
 const before=events.filter(x=>x.event==='interpret').length;
 const second=await procesarLotesIAInternosMvp339(args);
 assert.equal(second.state,'already_processed');
 assert.equal(events.filter(x=>x.event==='interpret').length,before);
 assert.equal(second.readings,null);
});
test('MVP339: sin presupuesto completo rechaza ANTES de reservar ni cobrar',async()=>{
 const {args,events}=setup();
 for(const budget of [
  {maxModelCalls:2,maxInputChars:99999},
  {maxModelCalls:9999,maxInputChars:99999},
  {maxModelCalls:args.budget.maxModelCalls,maxInputChars:1}
 ]){
  const v=await procesarLotesIAInternosMvp339({...args,budget});
  assert.equal(v.state,'budget_limited');
  assert.equal(v.modelCalls,0);
 }
 assert.equal(events.length,0);
});
test('MVP339: reserva de otra ronda, proveedor, mensaje o hash no habilita IA',async()=>{
 for(const mismatch of [
  {roundId:'ddec169e-7801-4efc-aabf-25cd134744eb'},
  {supplierId:'bbec169e-7801-4efc-aabf-25cd134744eb'},
  {messageHmac:'f'.repeat(64)},
  {chatHmac:'f'.repeat(64)},
  {sourceSha256:'f'.repeat(64)}
 ]){
  const {args,events}=setup();
  const v=await procesarLotesIAInternosMvp339({...args,
   reserve:async q=>({
    state:'reserved',...q.scope,sourceSha256:q.sourceSha256,
    receipt:'t'.repeat(32),...mismatch
   })
  });
  assert.equal(v.state,'reconciliation_required');
  assert.equal(events.length,0);
 }
});
test('MVP339: respuesta cruzada del modelo se detiene antes del segundo lote',async()=>{
 const {args,events}=setup();
 const v=await procesarLotesIAInternosMvp339({...args,
  interpret:async r=>({
   ...(await fakeReader(sample)(r)),sourceSha256:'d'.repeat(64)
  })
 });
 assert.equal(v.state,'review_required');
 assert.equal(v.reason,'incomplete_or_cross_source_model_response');
 assert.equal(v.modelCalls,1);
 assert.equal(events.at(-1).state,'review_required');
 assert.equal(v.readings,null);
});
test('MVP339: lectura con omisión, duplicación o precio alterado obliga revisión',async()=>{
 for(const failure of ['omission','duplicated','price_changed','different']){
  const {args,events}=setup();
  const v=await procesarLotesIAInternosMvp339({...args,
   interpret:fakeReader(sample,({request,items})=>{
    if(request.lotNumber!==1||request.perspective!=='corroboration')return;
    if(failure==='omission')items.pop();
    if(failure==='duplicated')items[1]={...items[0]};
    if(failure==='price_changed')items[1].unitPrice='$ 999.999';
    if(failure==='different')items[1].quantity=null;
   })
  });
  assert.equal(v.state,'review_required',failure);
  assert.equal(v.readings,null);
  assert.ok(v.modelCalls<=2*args.plan.lots.length);
  assert.equal(events.at(-1).state,'review_required');
 }
});
test('MVP339: error transport sin reintentar ni filtrar el presupuesto',async()=>{
 const {args,events}=setup();
 const v=await procesarLotesIAInternosMvp339({...args,
  interpret:async()=>{throw Error('Secreto: presupuesto proveedor 123')},
 });
 assert.equal(v.state,'review_required');
 assert.equal(v.reason,'model_or_evidence_unavailable');
 assert.equal(v.modelCalls,1);
 assert.equal(v.readings,null);
 assert.equal(JSON.stringify(v).includes('Secreto'),false);
 assert.equal(events.at(-1).state,'review_required');
});
test('MVP339: sin confirmación persistente de finish ninguna lectura es utilizable',async()=>{
 for(const finish of [
  async()=>{throw Error('network_down')},
  async()=> 'not_recorded'
 ]){
  const {args}=setup();
  const v=await procesarLotesIAInternosMvp339({...args,finish});
  assert.equal(v.state,'reconciliation_required');
  assert.equal(v.readings,null);
  assert.equal(v.modelCalls,args.plan.lots.length*2);
 }
});
test('MVP339: sin reserva real, reserva caída o proveedor inválido no hay llamadas',async()=>{
 for(const override of [
  {reserve:async()=>{throw Error('db unavailable')}},
  {reserve:async()=>({state:'not_eligible'})},
  {scope:{...scope,supplierId:'invalid'}},
  {reserve:async()=>({state:'reserved',receipt:'invalid'})}
 ]){
  const {args,events}=setup();
  const v=await procesarLotesIAInternosMvp339({...args,...override});
  assert.ok(['reconciliation_required','not_eligible','review_required'].includes(v.state));
  assert.equal(v.modelCalls,0);
  assert.equal(events.filter(e=>e.event==='interpret').length,0);
 }
});
test('MVP339: no utiliza propuestas históricas para completar una nueva ronda',async()=>{
 const another={...scope,roundId:'ddec169e-7801-4efc-aabf-25cd134744eb'};
 const {args,events}=setup();
 const a=await procesarLotesIAInternosMvp339(args);
 assert.equal(a.state,'ready_for_independent_source_audit');
 const b=await procesarLotesIAInternosMvp339({...args,scope:another});
 assert.equal(b.state,'ready_for_independent_source_audit');
 assert.equal(events.filter(x=>x.event==='finish').length,2);
 const c=await procesarLotesIAInternosMvp339({...args,scope:another});
 assert.equal(c.state,'already_processed');
});
