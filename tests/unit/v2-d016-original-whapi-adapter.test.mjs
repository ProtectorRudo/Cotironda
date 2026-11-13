import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {despacharSolicitudCentralMvp223}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-dispatch-mvp223.ts';
import {reservarAvisoOriginalEnDespachoD016,registrarResultadoOriginalD016}
 from '../../supabase/functions/cotironda-piloto-whapi/original-notice-dispatch-d016.ts';
import {AVISO_ORIGINALES_D016,AVISO_ORIGINALES_D016_VERSION}
 from '../../src/server/v2-d016-aviso-original-proveedor.ts';
import {generarWebhookOriginalD016}
 from '../../scripts/piloto/v2-d016-original-notice-overlay.mjs';

const ROUND='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEASE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUPPLIER='supplier_a';
const CHAT='a'.repeat(64);
const RECIPIENT='5492211234567';
const WHAPI='wamid.ABCDEF123456';
const BASE='Cotironda · Nueva solicitud de cotización.';
const sha=s=>createHash('sha256').update(s).digest('hex');
const snapshot={requestId:ROUND,city:'La Plata',
 deadlineIso:'2026-11-17T21:00:00Z',deliveryNote:null,
 items:[{description:'Cemento',quantity:'20',unit:'bag'}]};
const packet={state:'leased',request_id:ROUND,supplier_key:SUPPLIER,
 lease_token:LEASE,chat_hmac:CHAT};
const create=(opts={})=>{
 const state={calls:[],sent:[],leases:0,finishes:[],ack:0,notices:[],
  reserve:true,confirm:true,send:true,finish:true};
 const rpc=async(name,p)=>{
  state.calls.push(name);
  if(name==='cotironda_piloto_ia_claim_mvp222')
   return {data:state.leases++===0?packet:{state:'empty'},error:null};
  if(name==='cotironda_piloto_ia_pdf_snapshot_mvp222')
   return {data:snapshot,error:null};
  if(name==='cotironda_piloto_v2_d016_reserve_original_notice_private'){
   state.notices.push(p);
   return {data:state.reserve,error:null};
  }
  if(name==='cotironda_piloto_ia_finish_mvp222'){
   state.finishes.push(p);
   return {data:state.finish,error:null};
  }
  if(name==='cotironda_piloto_v2_d016_finish_original_notice_private'){
   state.ack++;
   assert.equal(state.finishes.at(-1)?.p_state,'api_accepted',
    'debe confirmar MVP222 antes de registrar aviso');
   assert.equal(state.finishes.at(-1)?.p_message_id,p.p_whapi_message_id);
   return {data:state.confirm,error:null};
  }
  throw Error('unexpected_rpc:'+name);
 };
 const prepare=async data=>reservarAvisoOriginalEnDespachoD016({
  ...data,enabled:true,captionBase:BASE,rpc
 });
 const confirm=async data=>registrarResultadoOriginalD016({
  ...data,enabled:true,rpc
 });
 const sendWhapi=async(recipient,pdf,caption)=>{
  assert.equal(recipient,RECIPIENT);
  assert.equal(pdf.length,50);
  state.sent.push({recipient,caption});
  if(opts.throwSend)throw Error('network_timeout');
  return {accepted:state.send,
   messageId:opts.missingId?null:WHAPI};
 };
 const run=(override={})=>despacharSolicitudCentralMvp223({
  enabled:true,requestId:ROUND,recipients:{[SUPPLIER]:RECIPIENT},maxJobs:2,
  rpc,authorizeChatHmac:async(r,h)=>r===RECIPIENT&&h===CHAT,
  createPdf:()=>new Uint8Array(50),
  sendWhapi,prepareOriginalNotice:prepare,confirmOriginalNotice:confirm,
  ...override
 });
 return {state,rpc,run,prepare,confirm};
};
test('D016: un PDF/WhatsApp, reserva antes, ack después del finish MVP222',async()=>{
 const f=create();
 const out=await f.run();
 assert.equal(out.estado,'terminado');
 assert.equal(out.reclamados,1);
 assert.equal(out.apiAceptados,1);
 assert.equal(f.state.sent.length,1);
 assert.equal(f.state.ack,1);
 const cap=f.state.sent[0].caption;
 assert.ok(cap.startsWith(BASE));
 assert.ok(cap.endsWith(AVISO_ORIGINALES_D016));
 assert.equal(f.state.notices.length,1);
 assert.equal(f.state.notices[0].p_notice_body_sha256,sha(cap));
 assert.equal(f.state.notices[0].p_notice_version,AVISO_ORIGINALES_D016_VERSION);
 const ops=f.state.calls;
 assert.ok(ops.indexOf('cotironda_piloto_v2_d016_reserve_original_notice_private')<
  ops.indexOf('cotironda_piloto_ia_finish_mvp222'));
 assert.ok(ops.indexOf('cotironda_piloto_ia_finish_mvp222')<
  ops.indexOf('cotironda_piloto_v2_d016_finish_original_notice_private'));
});
test('D016 OFF conserva despacho MVP223 y no reserva ni confirma evidencia',async()=>{
 const f=create();
 const out=await f.run({prepareOriginalNotice:undefined,confirmOriginalNotice:undefined});
 assert.equal(out.estado,'terminado');
 assert.equal(out.apiAceptados,1);
 assert.equal(f.state.notices.length,0);
 assert.equal(f.state.ack,0);
 assert.equal(f.state.sent.length,1);
 assert.equal(f.state.sent[0].caption,undefined);
});
test('D016 bloquea antes de llamar Whapi si la reserva SQL falla',async()=>{
 const f=create(); f.state.reserve=false;
 const out=await f.run();
 assert.equal(out.estado,'terminado');
 assert.equal(out.inciertos,1);
 assert.equal(f.state.sent.length,0);
 assert.equal(f.state.ack,0);
 assert.equal(f.state.finishes[0].p_state,'uncertain');
});
test('D016 sin ID Whapi, timeout o respuesta incierta no registra evidencia',async()=>{
 for(const option of [{missingId:true},{throwSend:true}]){
  const f=create(option);
  const out=await f.run();
  assert.equal(out.inciertos,1);
  assert.equal(f.state.ack,0);
  assert.equal(f.state.finishes[0].p_state,'uncertain');
  assert.equal(f.state.sent.length,1);
 }
 const g=create();g.state.send=false;
 const out=await g.run();
 assert.equal(out.inciertos,1);
 assert.equal(g.state.ack,0);
});
test('D016 fin de despacho falla: se marca conciliación y no se confirma ledger',async()=>{
 const f=create();f.state.finish=false;
 const out=await f.run();
 assert.equal(out.estado,'requiere_conciliacion');
 assert.equal(f.state.sent.length,1);
 assert.equal(f.state.ack,0);
});
test('D016 ledger finish fallido: conciliación SIN reenviar',async()=>{
 const f=create();f.state.confirm=false;
 const out=await f.run();
 assert.equal(out.estado,'requiere_conciliacion');
 assert.equal(f.state.sent.length,1);
 assert.equal(f.state.ack,1);
});
test('D016 callbacks incompletos bloquean antes de reclamar',async()=>{
 const f=create();
 const out=await f.run({confirmOriginalNotice:undefined});
 assert.equal(out.estado,'requiere_conciliacion');
 assert.equal(f.state.calls.length,0);
 const f2=create();
 const out2=await f2.run({prepareOriginalNotice:undefined});
 assert.equal(out2.estado,'requiere_conciliacion');
 assert.equal(f2.state.calls.length,0);
});
test('D016 adaptador niega sender no autorizado, hash inválido y flags OFF',async()=>{
 const f=create();
 for(const bad of [
  {enabled:false},{supplierKey:'other'},{requestId:'bad'},
  {chatHmac:'bad'},{recipient:'000'},{leaseToken:'bad'}
 ]){
  const x=await reservarAvisoOriginalEnDespachoD016({
   enabled:true,requestId:ROUND,supplierKey:SUPPLIER,chatHmac:CHAT,
   recipient:RECIPIENT,leaseToken:LEASE,captionBase:BASE,rpc:f.rpc,...bad
  });
  assert.equal(x,null);
 }
 assert.equal(f.state.notices.length,0);
 assert.equal(await registrarResultadoOriginalD016({
  enabled:false,requestId:ROUND,supplierKey:SUPPLIER,
  messageId:WHAPI,rpc:f.rpc}),false);
});
test('D016 overlay no edita webhook v76 ni elimina V2-02 y acceso comprador',()=>{
 const original=readFileSync(
  'supabase/functions/cotironda-piloto-whapi/index.ts','utf8');
 const before=sha(original);
 const out=generarWebhookOriginalD016(original);
 assert.equal(sha(original),before);
 assert.ok(out.includes("COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED"));
 assert.ok(out.includes("COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED"));
 assert.ok(out.includes("COTIRONDA_PILOT_D016_ORIGINAL_NOTICE_ENABLED"));
 assert.ok(out.includes("prepareOriginalNotice:async("));
 assert.ok(out.includes("confirmOriginalNotice:async("));
 assert.ok(out.includes("caption:d016Caption??("));
 assert.equal((out.match(/sendWhapi:async\(recipient,pdf,d016Caption\)/gu)||[]).length,1);
 assert.match(original,/caption:CAPTION_PEDIDO_COTIRONDA_MVP305/u);
});
