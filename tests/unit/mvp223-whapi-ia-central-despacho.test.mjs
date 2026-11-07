import test from 'node:test';
import assert from 'node:assert/strict';
import {despacharSolicitudCentralMvp223,validarSnapshotPdfMvp223} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-dispatch-mvp223.ts';

const id='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const lease='b2222222-2222-4222-8222-222222222222';
const names=['corralon_alfa','pintureria_beta','electricidad_gamma'];
const hashes=['1','2','3'].map(s=>s.repeat(64));
const samples=[
 {description:'Cemento CPC bolsa 50kg',quantity:'20',unit:'bag'},
 {description:'Pintura látex 5 l',quantity:'5',unit:'l'},
 {description:'Cable 2,5mm',quantity:'50',unit:'m'}
];
function fixture(opts={}){
 const state={next:0,calls:[],sent:[],finished:[],pdfs:[],verified:[],
  ...opts};
 const rpc=async(name,params)=>{
  state.calls.push({name,params});
  if(name==='cotironda_piloto_ia_claim_mvp222'){
   if(state.next>=names.length)return {data:{state:'empty'},error:null};
   const i=state.next++;
   return {data:{state:'leased',request_id:id,
    supplier_key:names[i],lease_token:lease,chat_hmac:hashes[i]},error:null};
  }
  if(name==='cotironda_piloto_ia_pdf_snapshot_mvp222'){
   const i=names.indexOf(params.p_supplier);
   return {data:{requestId:id,city:'La Plata',
    deadlineIso:'2026-11-10T12:00:00Z',deliveryNote:null,
    items:[samples[i]]},error:null};
  }
  if(name==='cotironda_piloto_ia_finish_mvp222'){
   state.finished.push(params);return {data:true,error:null};
  }
  throw Error('unexpected_rpc');
 };
 const recipients=Object.fromEntries(names.map((s,i)=>[s,'549221500000'+i]));
 const authorizeChatHmac=async(recipient,hash)=>{
  state.verified.push({recipient,hash});
  return recipients[names[hashes.indexOf(hash)]]===recipient;
 };
 const createPdf=snapshot=>{
  state.pdfs.push(snapshot);
  return new Uint8Array(200);
 };
 const sendWhapi=async(recipient,pdf)=>{
  state.sent.push({recipient,length:pdf.length});
  return {accepted:true,messageId:'message_id_123456789'};
 };
 return {state,rpc,recipients,authorizeChatHmac,createPdf,sendWhapi};
}
test('MVP223 OFF implica cero RPCs y cero envíos',async()=>{
 const x=fixture();
 const r=await despacharSolicitudCentralMvp223({
  enabled:false,requestId:id,...x
 });
 assert.equal(r.estado,'inactivo');
 assert.equal(x.state.calls.length,0);
 assert.equal(x.state.sent.length,0);
});
test('MVP223 2 leases → solo 2 PDFs separados para 2 negocios',async()=>{
 const x=fixture();
 const r=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:id,...x
 });
 assert.equal(r.estado,'terminado');
 assert.deepEqual([r.reclamados,r.apiAceptados,r.inciertos],[2,2,0]);
 assert.deepEqual(x.state.pdfs.map(p=>p.items[0].description),
  ['Cemento CPC bolsa 50kg','Pintura látex 5 l']);
 assert.equal(x.state.sent.length,2);
 assert.equal(x.state.finished.length,2);
 assert.equal(x.state.finished[0].p_state,'api_accepted');
});
test('MVP223 con tercero en el siguiente ciclo no duplica dos anteriores',async()=>{
 const x=fixture();const r=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:id,...x,maxJobs:1
 });
 assert.equal(r.reclamados,1);
 const again=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:id,...x
 });
 assert.equal(again.reclamados,2);
 assert.equal(x.state.sent.length,3);
 assert.equal(new Set(x.state.sent.map(x=>x.recipient)).size,3);
});
test('MVP223 si HMAC no coincide marca incierto, NO envía a otro número',async()=>{
 const x=fixture();
 const r=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:id,...x,maxJobs:1,
  authorizeChatHmac:async()=>false
 });
 assert.equal(r.inciertos,1);
 assert.equal(x.state.sent.length,0);
 assert.equal(x.state.finished[0].p_state,'uncertain');
});
test('MVP223 PDF vacío o de una ronda ajena nunca se envía',async()=>{
 const x=fixture();
 const r=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:id,...x,maxJobs:1,
  createPdf:()=>new Uint8Array(0)
 });
 assert.equal(r.inciertos,1);assert.equal(x.state.sent.length,0);
 assert.equal(validarSnapshotPdfMvp223({requestId:'otro',
  city:'La Plata',deadlineIso:'2026-11-10T12:00:00Z',
  deliveryNote:null,items:[samples[0]]},id),null);
});
test('MVP225 preserva ID Whapi con punto para asociación de respuesta citada',async()=>{
 const x=fixture();
 const r=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:id,...x,maxJobs:1,
  sendWhapi:async()=>({accepted:true,messageId:'wamid.HBgAAA111'})
 });
 assert.equal(r.apiAceptados,1);
 assert.equal(x.state.finished[0].p_message_id,'wamid.HBgAAA111');
});
test('MVP284 API responde accepted sin ID: terminal incierto, nunca publicable ni reintento',async()=>{
 for(const messageId of [null,'invalid','a'.repeat(161)]){
  const x=fixture();
  const r=await despacharSolicitudCentralMvp223({
   enabled:true,requestId:id,...x,maxJobs:1,
   sendWhapi:async()=>({accepted:true,messageId})
  });
  assert.equal(r.apiAceptados,0);
  assert.equal(r.inciertos,1);
  assert.equal(x.state.sent.length,0);
  assert.equal(x.state.finished[0].p_state,'uncertain');
  assert.equal(x.state.finished[0].p_message_id,null);
  assert.equal(x.state.finished.length,1);
 }
});
test('MVP223 falla al finalizar → conciliación, sin reintentar el PDF',async()=>{
 const x=fixture();
 const r=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:id,...x,maxJobs:1,
  rpc:async(name,args)=>name==='cotironda_piloto_ia_finish_mvp222'?
   {data:null,error:{message:'db_fail'}}:x.rpc(name,args)
 });
 assert.equal(r.estado,'requiere_conciliacion');
 assert.equal(x.state.sent.length,1);
});
test('MVP223 rechazo de estructura RPC errónea, no se envía nada',async()=>{
 const x=fixture();
 const r=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:id,...x,
  rpc:async()=>({data:{state:'leased',request_id:'incorrect',
   supplier_key:'corralon_alfa',lease_token:lease,chat_hmac:hashes[0]},error:null})
 });
 assert.equal(r.estado,'requiere_conciliacion');
 assert.equal(x.state.sent.length,0);
});
