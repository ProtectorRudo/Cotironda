import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {generarWebhookD016} from '../../scripts/piloto/v2-d016-whapi-overlay.mjs';
import {notificarAccesoWhatsappD016,permitirAvisoD016,permitirRecuperacionD016}
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
test('D016: el flag legado OFF no impide enlace V2; outbound OFF nunca envía',()=>{
 const matrix=[
  [false,false,undefined,false],
  [false,true,undefined,false],
  [false,true,'false',false],
  [true,false,'false',false],
  [true,false,'true',true],
  [true,false,undefined,true],
  [true,true,'false',true],
  [true,true,undefined,true],
  [true,true,'true',true]
 ];
 for(const [outbound,d016,legacy,expected] of matrix){
  assert.equal(permitirAvisoD016(outbound,d016,legacy),expected,
   JSON.stringify({outbound,d016,legacy}));
 }
 const old=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 const candidate=generarWebhookD016(old);
 assert.match(candidate,/permitirAvisoD016\(sec\.outbound,d016Enabled,/u);
 assert.match(candidate,/const d016Enabled=Deno\.env\.get\('COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED'\)==='true'/u);
 assert.match(candidate,/if\(d016Enabled\)\{/u);
 assert.doesNotMatch(candidate,
  /if\(!sec\.outbound\|\|Deno\.env\.get\('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED'\)==='false'\)continue;/u);
});

test('D016 OFF conserva las dos semánticas distintas del tracking legado',()=>{
 const cases=[
  {value:undefined,normal:true,recovery:true},
  {value:'true',normal:true,recovery:true},
  {value:'false',normal:false,recovery:false},
  {value:'',normal:true,recovery:false},
  {value:'0',normal:true,recovery:false},
  {value:'off',normal:true,recovery:false},
  {value:'FALSE',normal:true,recovery:false}
 ];
 for(const {value,normal,recovery} of cases){
  assert.equal(permitirAvisoD016(true,false,value),normal,
   'MVP289 envío '+String(value));
  assert.equal(permitirRecuperacionD016(true,false,value),recovery,
   'MVP289 recuperación '+String(value));
  assert.equal(permitirAvisoD016(true,true,value),true,
   'D016 envío '+String(value));
  assert.equal(permitirRecuperacionD016(true,true,value),true,
   'D016 recuperación '+String(value));
  assert.equal(permitirAvisoD016(false,true,value),false,
   'Outbound OFF envío '+String(value));
  assert.equal(permitirRecuperacionD016(false,true,value),false,
   'Outbound OFF recuperación '+String(value));
 }
});

test('D016: SEGUIMIENTO COTI recupera acceso con tracking legado apagado',()=>{
 const old=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 assert.match(old,/if\(buyerLinkCommand\)\{/u);
 assert.match(old,/pilotEnvNotDenied\('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED'\)/u);
 const candidate=generarWebhookD016(old);
 const cmd=candidate.match(/if\(buyerLinkCommand\)\{([\s\S]*?)\n   \}/u)?.[1];
 assert.ok(cmd,'command SEGUIMIENTO COTI must still exist');
 assert.match(cmd,/permitirRecuperacionD016\(sec\.outbound,/u);
 assert.match(cmd,/COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED/u);
 assert.match(cmd,/buyerLinkRequests\.push\(\{mode:'recovery'/u);
 assert.doesNotMatch(cmd,/pilotEnvNotDenied\('COTIRONDA_PILOT_BUYER_TRACKING_ENABLED'\)/u);
 // No abrir envíos si el interruptor global está apagado.
 assert.equal(permitirRecuperacionD016(false,true,'false'),false);
 // D016 activo permite la recuperación, sin reactivar el seguimiento antiguo.
 assert.equal(permitirRecuperacionD016(true,true,'false'),true);
 // D016 apagado conserva el bloqueo legado.
 assert.equal(permitirRecuperacionD016(true,false,'false'),false);
});

test('D013+ D016: candidato Whapi usa catalogo por producto SOLO con flag V2',()=>{
 const original=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 assert.doesNotMatch(original,/COTIRONDA_PILOT_V2_D013_PRODUCT_MATCHING_ENABLED/u);
 assert.match(original,/procesarCompradorCentralMvp226/u);
 const candidate=generarWebhookD016(original);
 assert.match(candidate,/from '\.\/ai-central-buyer-mvp226\.ts';/u);
 assert.match(candidate,/from '\.\/ai-central-buyer-v2-d013\.ts';/u);
 assert.match(candidate,/const d013Enabled=Deno\.env\.get\('COTIRONDA_PILOT_V2_D013_PRODUCT_MATCHING_ENABLED'\)==='true'/u);
 assert.match(candidate,/const buyerWorker=d013Enabled\?\s*procesarCompradorCentralV2D013:procesarCompradorCentralMvp226/u);
 assert.match(candidate,/habilitado:true,publicar:d013Enabled/u);
 assert.match(candidate,/if\(!d013Enabled\|\|!result\.requestId\)/u);
 assert.match(candidate,/trialDispatchChats\.add\(chatHash\)/u);
 assert.match(candidate,/buyerLinkRequests\.push\(\{mode:'auto',requestId:result\.requestId,/u);
 assert.match(candidate,/buyer_review_bypassed_by_text_broker/u);
 // La fuente viva no cambia y el deploy del candidato sigue desautorizado.
 assert.doesNotMatch(original,/ai-central-buyer-v2-d013/u);
 const module=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-v2-d013.ts',
  import.meta.url),'utf8');
 assert.match(module,/planificador-piloto-v2-d013/u);
 const router=readFileSync(new URL('../../src/domain/ia-central/ruteador-catalogos-v2-d013.ts',
  import.meta.url),'utf8');
 assert.doesNotMatch(router,/source\.rubro!==requested\.rubro/u);
 assert.match(router,/verificarCorrespondenciaTecnicaD013/u);
});

test('D016 Whapi: overlay genera webhook aislado y conserva v76 inmutable',()=>{
 const old=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 assert.doesNotMatch(old,/notificarAccesoWhatsappD016|COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED/u);
 const candidate=generarWebhookD016(old);
 assert.ok(candidate.includes("from './buyer-whatsapp-entry-d016.ts'"));
 assert.match(candidate,/COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED/u);
 assert.match(candidate,/notificarAccesoWhatsappD016/u);
 assert.match(candidate,/notificarSeguimientoMvp289/u);
 assert.match(candidate,/buyerLinkRequests/u);
 assert.match(candidate,/buyer_d016_link_reconciliation_required/u);
 assert.match(candidate,/COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED/u);
 assert.notEqual(candidate,old);
 assert.throws(()=>generarWebhookD016(candidate),/d016_overlay_base_invalid/u);
});
