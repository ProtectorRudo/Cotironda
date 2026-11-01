import test from 'node:test';
import assert from 'node:assert/strict';
import {crearWorkerPedidosWhatsappD082}
 from '../../src/server/buyer-whatsapp-queue-worker-d082.ts';

const CH='channel_d082';
const KEY='a'.repeat(64);
const LEASE='bbbbbbbb-0082-4082-8082-000000000882';
const ROUND='cccccccc-0082-4082-8082-000000000883';
const WAIT='d082_buyer_queue_unavailable';
function make({
 result='zona_solicitada_en_cola',failProcessing=false,failClaim=false,
 failFinish=false
}={}){
 const calls={claim:0,finish:0,processed:0,actions:[]};
 let status='pending',attempts=0,due=true;
 const db={query:async(sql,args)=>{
  if(sql.includes('whapi_claim_buyer_d082')){
   calls.claim++;assert.deepEqual(args,[CH]);
   if(failClaim)throw Error('postgres password');
   if(status!=='pending'||!due)return {rows:[{payload:null}]};
   status='leased';attempts++;return {rows:[{payload:{
    channel:CH,messageKey:KEY,leaseToken:LEASE,attempt:attempts
   }}]};
  }
  assert.match(sql,/whapi_finish_buyer_d082/);
  calls.finish++;calls.actions.push(args[3]);
  assert.deepEqual(args.slice(0,3),[CH,KEY,LEASE]);
  if(failFinish)throw Error('db-finishing-token-SECRET');
  assert.equal(status,'leased');
  if(args[3]==='retry'){
   status=attempts>=4?'dead':'pending';
   due=false;
  }else if(args[3]==='zone_queued'||args[3]==='round_saved')
   status='done';
  else status=args[3]==='requires_review'?'manual_review':'discarded';
  return {rows:[{payload:{state:status,attempts}}]};
 }};
 const handler={procesar:async(key)=>{
  calls.processed++;
  assert.equal(key,KEY);
  if(failProcessing)throw Error('internal personal order text');
  return {estado:result,
   ...(result.includes('ronda_registrada')?{rondaId:ROUND}:{}),
   mensajesWhatsappEnviados:0};
 }};
 const worker=crearWorkerPedidosWhatsappD082({
  habilitado:true,channel:CH,db,handler
 });
 return {worker,db,handler,calls};
}
test('MVP047: pregunta zona duradera queda DONE, sin enviar WhatsApp',async()=>{
 const s=make();
 assert.deepEqual(await s.worker.procesarUno(),
  {estado:'procesado',cola:'done',intento:1});
 assert.deepEqual(s.calls.actions,['zone_queued']);
 assert.equal(s.calls.processed,1);
 assert.equal((await s.worker.procesarUno()).estado,'cola_vacia');
});
test('MVP047: ronda guardada y D071 preparada queda DONE',async()=>{
 const s=make({result:'ronda_registrada_consultas_en_cola'});
 assert.equal((await s.worker.procesarUno()).cola,'done');
 assert.deepEqual(s.calls.actions,['round_saved']);
});
test('MVP047: D071 falló después del commit => retry, no descartar la ronda',async()=>{
 const s=make({result:'ronda_registrada_preparacion_pendiente'});
 assert.equal((await s.worker.procesarUno()).cola,'pending');
 assert.deepEqual(s.calls.actions,['retry']);
});
test('MVP047: medios sin escaneo y lista ambigua van a revisión',async()=>{
 for(const estado of ['esperando_extraccion_segura','requiere_revision_interna']){
  const s=make({result:estado});
  assert.equal((await s.worker.procesarUno()).cola,'manual_review');
  assert.deepEqual(s.calls.actions,['requires_review']);
 }
});
test('MVP047: BAJA y contacto no verificado no crean ronda',async()=>{
 for(const estado of ['sin_entrada_verificada','consentimiento_contacto_pendiente']){
  const s=make({result:estado});
  assert.equal((await s.worker.procesarUno()).cola,'discarded');
  assert.deepEqual(s.calls.actions,['no_auth']);
 }
});
test('MVP047: procesamiento fallido no filtra texto ni DB',async()=>{
 const s=make({failProcessing:true});
 assert.equal((await s.worker.procesarUno()).cola,'pending');
 assert.deepEqual(s.calls.actions,['retry']);
});
test('MVP047: caída de claim o finish falla cerrado sin dar ACK falso',async()=>{
 const a=make({failClaim:true});
 await assert.rejects(a.worker.procesarUno(),e=>{
  assert.equal(e.message,WAIT);return true;
 });
 assert.equal(a.calls.processed,0);
 const b=make({failFinish:true});
 await assert.rejects(b.worker.procesarUno(),e=>{
  assert.equal(e.message,WAIT);return true;
 });
 assert.equal(b.calls.processed,1);
});
test('MVP047: deshabilitado no reclama cola ni interpreta',async()=>{
 const s=make();
 const disabled=crearWorkerPedidosWhatsappD082({
  habilitado:false,channel:CH,db:s.db,handler:s.handler
 });
 assert.equal((await disabled.procesarUno()).estado,'desactivado');
 assert.equal((await disabled.procesarLote()).procesados,0);
 assert.deepEqual(s.calls,{claim:0,finish:0,processed:0,actions:[]});
});
test('MVP047: lote acotado; un solo job no procesa duplicados',async()=>{
 const s=make({result:'ronda_registrada_sin_consultas'});
 const res=await s.worker.procesarLote(8);
 assert.deepEqual(res,{procesados:1,finalizados:1,enRevision:0,
  descartados:0,pendientes:0,agotados:0});
 assert.equal(s.calls.processed,1);
 for(const invalid of [0,21,1.5,-1]){
  await assert.rejects(s.worker.procesarLote(invalid),/d082_buyer_queue_unavailable/);
 }
});
test('MVP047: SQL adulterado/canal ajeno no llega al handler',async()=>{
 for(const mutate of [
  {channel:'different_channel'}, {messageKey:'not_sha'},
  {attempt:5},{leaseToken:'not_uuid'}, {extra:'raw_phone'}
 ]){
  const s=make();
  const original=s.db.query;
  s.db.query=async(sql,args)=>{
   const out=await original(sql,args);
   if(sql.includes('whapi_claim_buyer_d082'))
    Object.assign(out.rows[0].payload,mutate);
   return out;
  };
  await assert.rejects(s.worker.procesarUno(),/d082_buyer_queue_unavailable/);
  assert.equal(s.calls.processed,0);
 }
});
test('MVP047: respuesta del handler que afirma envíos no se confía',async()=>{
 const s=make();
 s.handler.procesar=async()=>({estado:'ronda_registrada_consultas_en_cola',
  rondaId:ROUND,mensajesWhatsappEnviados:1});
 assert.equal((await s.worker.procesarUno()).cola,'pending');
 assert.deepEqual(s.calls.actions,['retry']);
});
