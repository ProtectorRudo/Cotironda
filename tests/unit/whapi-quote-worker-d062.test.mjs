import test from 'node:test';
import assert from 'node:assert/strict';
import {crearWorkerCotizacionesD062}
 from '../../src/server/whapi-quote-worker-d062.ts';

const claim={channel:'whapi_ci',messageKey:'a'.repeat(64),
 leaseToken:'aaaaaaaa-0000-4000-8000-000000000001',attempt:1};
const success={estado:'cotizacion_recibida',version:1,repetido:false,
 precios:1,datosNoInformados:4};
function setup({jobs=[claim],handle=async()=>success,finish=null}={}){
 const events=[];
 const pending=[...jobs];
 const db={query:async(sql,params)=>{
  if(sql.includes('whapi_claim_quote_d062')){
   events.push({phase:'claim',params});
   return{rows:[{payload:pending.shift()??null}]};
  }
  if(sql.includes('whapi_finish_quote_d062')){
   events.push({phase:'finish',params});
   const state=finish??(params[3]==='received'?'done':
     params[3]==='no_price'?'manual_review':
     params[3]==='not_eligible'?'discarded':'pending');
   return{rows:[{payload:{state,attempts:1}}]};
  }
  throw Error('unknown_sql');
 }};
 return{worker:crearWorkerCotizacionesD062(db,{procesar:handle}),events};
}
test('D062: cola vacía no ejecuta interpretación ni SQL de escritura',async()=>{
 let count=0;
 const {worker,events}=setup({jobs:[],handle:async()=>{count++;return success}});
 assert.deepEqual(await worker.procesarUno(),{estado:'cola_vacia'});
 assert.equal(events.length,1);
 assert.equal(count,0);
});
test('D062: éxito del broker -> ACK received, sin Confirmo ni reintentos',async()=>{
 const {worker,events}=setup();
 const r=await worker.procesarUno();
 assert.deepEqual(r,{estado:'procesado',cola:'done',intento:1});
 assert.deepEqual(events.map(x=>x.phase),['claim','finish']);
 assert.deepEqual(events[1].params,[claim.channel,claim.messageKey,
  claim.leaseToken,'received']);
 assert.doesNotMatch(JSON.stringify(events),/Confirmo|password|supplierOrgId/);
});
test('D062: importe ambiguo requiere revisión interna, no pregunta al corralón',async()=>{
 const {worker,events}=setup({handle:async()=>({estado:'sin_precio_atribuible'})});
 assert.deepEqual(await worker.procesarUno(),
  {estado:'procesado',cola:'manual_review',intento:1});
 assert.equal(events[1].params[3],'no_price');
});
test('D062: baja, ronda cerrada o no habilitado -> descarte silencioso',async()=>{
 const {worker,events}=setup({handle:async()=>({estado:'no_disponible_o_no_habilitado'})});
 assert.deepEqual(await worker.procesarUno(),
  {estado:'procesado',cola:'discarded',intento:1});
 assert.equal(events[1].params[3],'not_eligible');
});
test('D062: error transitorio -> un ACK retry sin contenido ni reintento local',async()=>{
 let executions=0;
 const {worker,events}=setup({handle:async()=>{
  executions++;
  throw Error('inbox_private_phone_should_not_leak');
 }});
 assert.deepEqual(await worker.procesarUno(),
  {estado:'procesado',cola:'pending',intento:1});
 assert.equal(executions,1);
 assert.equal(events[1].params[3],'retry');
});
test('D062: lease incorrecto, resultado adulterado o SQL inconsistente falla cerrado',async()=>{
 for(const v of [{...claim,leaseToken:'arbitrary'},
  {...claim,attempt:5},{...claim,extra:'bad'},
  {...claim,messageKey:'short'}, {...claim,channel:'../env'}]){
  const {worker,events}=setup({jobs:[v]});
  await assert.rejects(worker.procesarUno(),/d062_worker_unavailable/);
  assert.equal(events.length,1);
 }
 const bad=crearWorkerCotizacionesD062({
  query:async()=>({rows:[{not_payload:true}]})
 },{procesar:async()=>success});
 await assert.rejects(bad.procesarUno(),/d062_worker_unavailable/);
});
test('D062: lote acotado, no hace polling infinito cuando cola termina',async()=>{
 const {worker,events}=setup({jobs:[claim,{...claim,messageKey:'b'.repeat(64)}]});
 const r=await worker.procesarLote(2);
 assert.deepEqual(r,{tomados:2,registrados:2,revisionManual:0,
  descartados:0,pendientes:0,agotados:0});
 assert.deepEqual(events.map(x=>x.phase),['claim','finish','claim','finish']);
 const another=setup({jobs:[]});
 assert.equal((await another.worker.procesarLote()).tomados,0);
 await assert.rejects(worker.procesarLote(21),/d062_worker_unavailable/);
});
