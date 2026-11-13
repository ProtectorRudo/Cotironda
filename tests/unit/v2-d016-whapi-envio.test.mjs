import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {notificarAccesoWhatsappD016}
 from '../../supabase/functions/cotironda-piloto-whapi/buyer-whatsapp-entry-d016.ts';

const PORTAL='https://cotironda-portal-9sl89v1ho-protector-rudo-s-projects.vercel.app';
const SHA='a'.repeat(40);
const KEY='b'.repeat(64);
const CHAT='c'.repeat(64);
const EVENT='d'.repeat(64);
const ROUND='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECIPIENT='5492211234567@s.whatsapp.net';
const WHAPI='wamid.FAKETEST12345';
const args=()=>({
 enabled:true,webhookAutenticado:true,compradorVerificado:true,
 mode:'auto',requestId:ROUND,chatHmac:CHAT,eventHmac:EVENT,
 recipient:RECIPIENT,portalOrigin:PORTAL,portalSha:SHA,approvedSha:SHA,
 hmacKeyHex:KEY
});
function make(extra={}){
 const state={prepares:[],finishes:[],sent:[],auth:[],sentAccepted:true,
  sentId:WHAPI,authorized:true,preparedState:'issued',
  failPrepare:false,failFinish:false,sendThrows:false,
  registered:new Set()};
 const rpc=async (name,q)=>{
  if(name==='cotironda_piloto_v2_d016_prepare_whapi_link_private'){
   state.prepares.push(q);
   assert.deepEqual(Object.keys(q).sort(),[
    'p_chat_hmac','p_event_hmac','p_mode','p_request_id','p_ticket_hmac'
   ]);
   assert.match(q.p_ticket_hmac,/^[a-f0-9]{64}$/u);
   if(state.failPrepare)return {data:null,error:{code:'503'}};
   if(state.preparedState!=='issued')
    return {data:{state:state.preparedState},error:null};
   if(state.registered.has(q.p_event_hmac))
    return {data:{state:'duplicate'},error:null};
   state.registered.add(q.p_event_hmac);
   return {data:{state:'issued',request_id:extra.responseId??ROUND},error:null};
  }
  if(name==='cotironda_piloto_v2_d016_finish_whapi_link_private'){
   state.finishes.push(q);
   if(state.failFinish)return {data:false,error:null};
   return {data:true,error:null};
  }
  throw Error('unexpected_rpc');
 };
 const send=async(to,body)=>{
  state.sent.push({to,body});
  if(state.sendThrows)throw Error('network_timeout');
  return {accepted:state.sentAccepted,messageId:state.sentId};
 };
 const authorizeChat=async(to,hash)=>{
  state.auth.push({to,hash});
  return state.authorized;
 };
 const run=(overrides={})=>notificarAccesoWhatsappD016({
  ...args(),...overrides,rpc,send,authorizeChat
 });
 return {state,run};
}
test('D016 Whapi: token hash igual a Node, URL fragmento no query y sin secretos SQL',async()=>{
 const f=make();
 const out=await f.run();
 assert.deepEqual(out,{estado:'api_aceptada',intentos:1});
 assert.equal(f.state.prepares.length,1);
 assert.equal(f.state.sent.length,1);
 assert.equal(f.state.finishes.length,1);
 assert.deepEqual(f.state.auth,[{to:RECIPIENT,hash:CHAT}]);
 assert.equal(f.state.sent[0].to,RECIPIENT);
 const body=f.state.sent[0].body;
 assert.match(body,/SEGUIMIENTO COTI/u);
 const link=body.match(/https:\/\/\S+/u)?.[0];
 assert.ok(link?.startsWith(PORTAL+'/piloto/v2/acceso#d016='));
 assert.ok(!link.includes('?'));
 const token=link.split('#d016=')[1]?.split('&ronda=')[0];
 assert.match(token,/^[A-Za-z0-9_-]{43}$/u);
 assert.ok(link.endsWith('&ronda='+ROUND));
 const expected=createHmac('sha256',Buffer.from(KEY,'hex'))
  .update('cotironda/d016/acceso/v1/').update(token).digest('hex');
 assert.equal(f.state.prepares[0].p_ticket_hmac,expected);
 assert.ok(!JSON.stringify(f.state.prepares).includes(token));
 assert.ok(!JSON.stringify(out).includes(token));
 assert.deepEqual(f.state.finishes[0],{
  p_ticket_hmac:expected,p_state:'api_accepted',p_whapi_message_id:WHAPI
 });
});
test('D016 Whapi: un evento duplicado no produce dos envíos',async()=>{
 const f=make();
 assert.equal((await f.run()).estado,'api_aceptada');
 assert.equal((await f.run()).estado,'no_elegible');
 assert.equal(f.state.sent.length,1);
 assert.equal(f.state.finishes.length,1);
});
test('D016 Whapi: baja, canal incorrecto, SHA, origen y flag OFF niegan sin POST',async()=>{
 const invalid=[
  {enabled:false},{webhookAutenticado:false},{compradorVerificado:false},
  {portalSha:'a'.repeat(39)},{approvedSha:'f'.repeat(40)},
  {portalOrigin:'https://evil.vercel.app'},
  {portalOrigin:'http://'+PORTAL.slice(8)},
  {hmacKeyHex:'f'.repeat(63)},{chatHmac:'x'},
  {recipient:'1234@s.whatsapp.net'}, // too few chars
  {requestId:'not_uuid'},{mode:'recovery',requestId:ROUND},
  {mode:'auto',requestId:null}
 ];
 for(const bad of invalid){
  const f=make();const result=await f.run(bad);
  assert.notEqual(result.estado,'api_aceptada',JSON.stringify(bad));
  assert.equal(f.state.prepares.length,0,JSON.stringify(bad));
  assert.equal(f.state.sent.length,0,JSON.stringify(bad));
 }
});
test('D016 Whapi: recovery solo con ronda resuelta por SQL',async()=>{
 const f=make();
 const out=await f.run({mode:'recovery',requestId:null});
 assert.equal(out.estado,'api_aceptada');
 assert.equal(f.state.prepares[0].p_mode,'recovery');
 assert.equal(f.state.prepares[0].p_request_id,null);
});
test('D016 Whapi: cuota y denegación SQL no gastan mensajes',async()=>{
 for(const status of ['denied','duplicate','rate_limited']){
  const f=make();f.state.preparedState=status;
  const x=await f.run();
  assert.deepEqual(x,{estado:'no_elegible',intentos:0},status);
  assert.equal(f.state.sent.length,0);
 }
});
test('D016 Whapi: red incierta, ID no validado, autorización revocada, sin reintentos',async()=>{
 for(const kind of ['timeout','bad_id','no_auth','rejected']){
  const f=make();
  if(kind==='timeout')f.state.sendThrows=true;
  if(kind==='bad_id')f.state.sentId='bad';
  if(kind==='no_auth')f.state.authorized=false;
  if(kind==='rejected')f.state.sentAccepted=false;
  assert.deepEqual(await f.run(),{estado:'entrega_incierta',intentos:1});
  assert.deepEqual(f.state.finishes.map(x=>x.p_state),['uncertain']);
  assert.equal(f.state.finishes[0].p_whapi_message_id,null);
  assert.ok(f.state.sent.length<=1);
  assert.equal((await f.run()).estado,'no_elegible');
 }
});
test('D016 Whapi: DB error before reservar no dispara envío; tras reservar concilia sin duplicar',async()=>{
 const a=make();a.state.failPrepare=true;
 assert.deepEqual(await a.run(),{estado:'conciliacion_requerida',intentos:0});
 assert.equal(a.state.sent.length,0);
 const b=make();b.state.failFinish=true;
 assert.deepEqual(await b.run(),{estado:'conciliacion_requerida',intentos:1});
 assert.equal(b.state.sent.length,1);
 assert.equal((await b.run()).estado,'no_elegible');
 assert.equal(b.state.sent.length,1);
});
test('D016 Whapi: integración webhook exclusiva, flag apagado conserva MVP289',()=>{
 const s=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 assert.match(s,/buyer-whatsapp-entry-d016\.ts/u);
 assert.match(s,/COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED/u);
 assert.match(s,/notificarAccesoWhatsappD016/u);
 assert.match(s,/notificarSeguimientoMvp289/u);
 assert.match(s,/buyerLinkRequests/u);
 assert.match(s,/buyer_d016_link_reconciliation_required/u);
});
