import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {generarWebhookD016,conectarConsentimientoOriginalesD016} from '../../scripts/piloto/v2-d016-whapi-overlay.mjs';
import {notificarAccesoWhatsappD016,permitirAvisoD016,permitirRecuperacionD016,
 habilitarPublicacionD013ConAccesoD016}
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
 assert.doesNotMatch(body,/SEGUIMIENTO COTI/u);
 assert.match(body,/funciona durante 14 días/u);
 assert.match(body,/No tenés que enviar ninguna palabra/u);
 assert.doesNotMatch(body,/vence en 10 minutos|un solo uso/u);
 const link=body.match(/https:\/\/\S+/u)?.[0];
 assert.ok(link?.startsWith('https://app.cotironda.com/piloto/v2/acceso#d016='));
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

test('D013: no publica sin D016 y release Preview privado verificable',()=>{
 const base={
  outbound:true,matchingEnabled:true,linkSendEnabled:true,
  portalOrigin:PORTAL,portalSha:SHA,approvedSha:SHA,hmacKeyHex:KEY
 };
 assert.equal(habilitarPublicacionD013ConAccesoD016(base),true);
 for(const update of [
  {outbound:false},{matchingEnabled:false},{linkSendEnabled:false},
  {portalOrigin:'https://evil.example.com'},
  {portalOrigin:'http://cotironda-portal-x-protector-rudo-s-projects.vercel.app'},
  {portalOrigin:PORTAL+'/'},
  {portalSha:'bad'},{approvedSha:'f'.repeat(40)},
  {hmacKeyHex:''},{hmacKeyHex:'x'.repeat(64)}
 ]){
  assert.equal(habilitarPublicacionD013ConAccesoD016({...base,...update}),false,
   JSON.stringify(update));
 }
 // Nunca basta activar D013 a solas: el enlace de comprador debe funcionar.
 assert.equal(habilitarPublicacionD013ConAccesoD016({
  ...base,matchingEnabled:true,linkSendEnabled:false
 }),false);
});

test('D013+D016: localidad reanuda la MISMA ronda con V2, nunca rubro V1',()=>{
 const old=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 assert.doesNotMatch(old,/continuarZonaCentralV2D013|d013ZoneEnabled/u);
 const candidate=generarWebhookD016(old);
 assert.match(candidate,/from '\.\/ai-central-zone-v2-d013\.ts'/u);
 assert.match(candidate,/continuarZonaCentralMvp233 as continuarZonaCentralV2D013/u);
 assert.match(candidate,/const d013ZoneEnabled=habilitarPublicacionD013ConAccesoD016\(\{/u);
 assert.match(candidate,/const zoneWorker=continuarZonaCentralV2D013;/u);
 assert.doesNotMatch(candidate,/const zoneWorker=d013ZoneEnabled\?/u);
 assert.match(candidate,/model,publicar:d013ZoneEnabled/u);
 assert.match(candidate,/if\(!d013ZoneEnabled\|\|!resumed\.requestId\)/u);
 assert.match(candidate,/buyerLinkRequests\.push\(\{mode:'auto',requestId:resumed\.requestId,\s*chatHmac:chatHash,eventHmac:messageHash/u);
 const zona=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/ai-central-zone-v2-d013.ts',
  import.meta.url),'utf8');
 assert.match(zona,/planificador-piloto-v2-d013\.ts/u);
 assert.match(zona,/puente-sql-rondas-v2-d013\.ts/u);
 assert.match(zona,/p_source_hmac:args\.sourceHmac/u);
 assert.match(zona,/args\.shaText\(original\)!==args\.originalSha256/u);
 assert.doesNotMatch(zona,/puente-sql-rondas-mvp221\.ts|planificador-piloto-mvp220\.ts/u);
});

test('D013+D016: lector siempre V2; publicación sólo con permisos completos',()=>{
 const original=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 assert.doesNotMatch(original,/COTIRONDA_PILOT_V2_D013_PRODUCT_MATCHING_ENABLED/u);
 assert.match(original,/procesarCompradorCentralMvp226/u);
 const candidate=generarWebhookD016(original);
 assert.match(candidate,/from '\.\/ai-central-buyer-mvp226\.ts';/u);
 assert.match(candidate,/from '\.\/ai-central-buyer-v2-d013\.ts';/u);
 assert.match(candidate,/const d013Enabled=habilitarPublicacionD013ConAccesoD016\(\{/u);
 assert.match(candidate,/matchingEnabled:Deno\.env\.get\('COTIRONDA_PILOT_V2_D013_PRODUCT_MATCHING_ENABLED'\)==='true'/u);
 assert.match(candidate,/linkSendEnabled:Deno\.env\.get\('COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED'\)==='true'/u);
 assert.match(candidate,/const buyerWorker=procesarCompradorCentralV2D013;/u);
 assert.doesNotMatch(candidate,/const buyerWorker=d013Enabled\?/u);
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
 assert.doesNotMatch(router,/verificarCorrespondenciaTecnicaD013/u);
});

test('D013+D016: PDF Word y Excel corroborados usan V2 privado, nunca MVP278 publico',()=>{
 const original=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const candidate=generarWebhookD016(original);
 assert.match(candidate,/from '\.\/ai-central-buyer-binary-v2-d013\.ts'/u);
 assert.match(candidate,/const d013BinaryEnabled=habilitarPublicacionD013ConAccesoD016\(\{/u);
  assert.match(candidate,/const binaryWorker=prepararDocumentoBinarioV2D013/u);
  assert.doesNotMatch(candidate,/const binaryWorker=d013BinaryEnabled/u);
 assert.match(candidate,/enabled:d013BinaryEnabled/u);
 assert.match(candidate,/if\(!d013BinaryEnabled\|\|!mediaPlan\.requestId\)/u);
 assert.match(candidate,/buyerLinkRequests\.push\(\{mode:'auto',requestId:mediaPlan\.requestId/u);
 assert.match(candidate,/mediaPlan\.estado==='ronda_en_sombra'&&!d013BinaryEnabled/u);
 assert.doesNotMatch(original,/prepararDocumentoBinarioV2D013/u);
 const binary=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-binary-v2-d013.ts',import.meta.url),'utf8');
 assert.match(binary,/prepararDocumentoBinarioCompradorMvp278/u);
 assert.match(binary,/cotironda_piloto_v2_auto_release_d013/u);
 assert.doesNotMatch(binary,/cotironda_piloto_ia_publish_mvp222/u);
 assert.match(binary,/procesarCompradorV2D013/u);
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

test('D016 originales: consentimiento y baja se procesan sólo DESPUÉS del inbox autenticado',()=>{
 const old=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 const candidate=generarWebhookD016(old);
 const posStore=candidate.indexOf("const out=await db.rpc('cotironda_piloto_receive_whapi_v1'");
 const posConsent=candidate.indexOf("'cotironda_piloto_v2_d016_register_terms_acceptance_private'");
 const posRecovery=candidate.indexOf('  if(webLinkCode){',posStore);
 assert.ok(posStore>=0&&posConsent>posStore&&posRecovery>posConsent);
 assert.match(candidate,/body==='ACEPTO COTIRONDA ORIGINALES V2'/u);
 assert.match(candidate,/\^\(\?:NO COMPARTIR\|No compartir\|no compartir\)/u);
 assert.match(candidate,/cotironda_piloto_v2_d016_revoke_by_whapi_text_private/u);
 assert.match(candidate,/p_message_hmac:messageHash,p_chat_hmac:chatHash/u);
 assert.match(candidate,/\['duplicate','unrecognized_contact'\]\.includes\(outcome\(out\.data\)\)/u);
 assert.ok(candidate.slice(posConsent,posRecovery).includes('continue;'));
 assert.equal((candidate.match(/cotironda_piloto_v2_d016_register_terms_acceptance_private/gu)??[]).length,1);
 assert.doesNotMatch(old,/cotironda_piloto_v2_d016_register_terms_acceptance_private/u);
 // La repetición no ejecuta un segundo permiso ni vuelve a modificar el código.
 assert.throws(()=>conectarConsentimientoOriginalesD016(candidate),
  /d016_supplier_original_terms_invalid_source/u);
});

test('D016 originales: no se añade el comando si la base no es la misma',()=>{
 assert.throws(()=>conectarConsentimientoOriginalesD016(''),
  /d016_supplier_original_terms_invalid_source/u);
 assert.throws(()=>conectarConsentimientoOriginalesD016(
  "cotironda_piloto_receive_whapi_v1"),
  /anchor_invalid:original-consent-after-inbox/u);
});


test('D016 Whapi: enlace a app.cotironda.com exacto conserva SQL, HMAC y evita dominios hermanos',async()=>{
 const own='https://app.cotironda.com';
 const permitted=make();
 const response=await permitted.run({portalOrigin:own});
 assert.equal(response.estado,'api_aceptada');
 assert.equal(permitted.state.sent.length,1);
 const sent=permitted.state.sent[0].body;
 assert.match(sent,/https:\/\/app\.cotironda\.com\/piloto\/v2\/acceso#d016=/u);
 assert.ok(!sent.includes('?ticket='));
 assert.equal(permitted.state.prepares.length,1);
 assert.equal(permitted.state.finishes.length,1);
 assert.equal(habilitarPublicacionD013ConAccesoD016({
  outbound:true,matchingEnabled:true,linkSendEnabled:true,
  portalOrigin:own,portalSha:SHA,approvedSha:SHA,hmacKeyHex:KEY
 }),true);
 for(const invalid of [
  'https://www.cotironda.com',
  'https://cotironda.com',
  'http://app.cotironda.com',
  'https://app.cotironda.com/',
  'https://app.cotironda.com.evil.test',
  'https://xapp.cotironda.com'
 ]){
  const f=make();
  const out=await f.run({portalOrigin:invalid});
  assert.equal(out.estado,'no_autorizado',invalid);
  assert.equal(f.state.prepares.length,0,invalid);
  assert.equal(f.state.sent.length,0,invalid);
 }
});


test('D016 recuperación: origen propio exacto, sin aceptar otros dominios ni debilitar el acceso',()=>{
 const edge=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-v2-reemitir-acceso/index.ts',
  import.meta.url),'utf8');
 // Ejecutamos sólo la expresión real de la puerta Deno, sin llamar
 // al webhook ni emitir un ticket o WhatsApp.
 const fragment=edge.match(/function originAllowed\(o:string\):boolean\{([\s\S]*?)\n\}/u);
 assert.ok(fragment,'guardia D016 de reemisión presente');
 const guard=runInNewContext('(function(o){'+fragment[1]+'\n})',{URL});
 for(const origin of [PORTAL,'https://app.cotironda.com'])
  assert.equal(guard(origin),true,origin);
 for(const origin of [
  'https://cotironda.com','https://www.cotironda.com',
  'https://evil.vercel.app','https://app.cotironda.com.evil.test',
  'https://xapp.cotironda.com','http://app.cotironda.com',
  'https://app.cotironda.com/','https://app.cotironda.com:8443',
  'https://app.cotironda.com?token=123',
  'https://usuario@app.cotironda.com'
 ])assert.equal(guard(origin),false,origin);
 assert.match(edge,/const portal=Deno\.env\.get\('COTIRONDA_PILOT_D016_PORTAL_ORIGIN'\)/u);
 assert.match(edge,/typeof input\.releaseSha!=='string'\|\|!SHA\.test\(input\.releaseSha\)/u);
 assert.match(edge,/const access='https:\/\/app\.cotironda\.com\/piloto\/v2\/acceso#d016='/u);
 assert.match(edge,/cotironda_piloto_v2_d016_reissue_unique_pilot_private/u);
});


test('D016 transición: Whapi no envía más enlaces al alias antiguo, sin tocar el permiso SQL',async()=>{
 const x=make();
 assert.equal((await x.run()).estado,'api_aceptada');
 assert.equal(x.state.sent.length,1);
 assert.equal(x.state.prepares.length,1);
 const sent=x.state.sent[0].body;
 assert.match(sent,/https:\/\/app\.cotironda\.com\/piloto\/v2\/acceso#d016=/u);
 assert.ok(!sent.includes(PORTAL));
 const recoverySource=readFileSync(new URL('../../supabase/functions/cotironda-piloto-v2-reemitir-acceso/index.ts',import.meta.url),'utf8');
 assert.match(recoverySource,/const access='https:\/\/app\.cotironda\.com\/piloto\/v2\/acceso#d016='/u);
 assert.match(recoverySource,/if\(!originAllowed\(portal\)\)/u);
});


test('D016 reemisión: commit del portal validado, HMAC lo ata a la solicitud y Edge rechaza SHA inválido',()=>{
 const portal=readFileSync(new URL('../../apps/portal/lib/piloto-v2-d016-http.ts',import.meta.url),'utf8');
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-v2-reemitir-acceso/index.ts',import.meta.url),'utf8');
 const fnStart=portal.indexOf('export async function solicitarAccesoPilotoSinSesionD016(');
 const fn=portal.slice(fnStart,portal.indexOf('\n}\n',fnStart)+2);
 assert.ok(fnStart>=0);
 assert.match(fn,/const gate=puertaWhatsappPortalD016\(env\)/u);
 assert.match(fn,/if\(!gate\|\|env\.COTIRONDA_D016_REISSUE_ENABLED!=='true'\)/u);
 assert.match(fn,/u\.origin!==gate\.origenPortal/u);
 assert.match(fn,/req\.headers\.get\('origin'\)!==gate\.origenPortal/u);
 assert.match(fn,/releaseSha:gate\.shaDesplegado/u);
 assert.match(fn,/createHmac\('sha256'/u);
 assert.match(fn,/\.update\('cotironda\/d016\/reissue\/v1\\n'\+sentAt\+'\\n'\+body/u);
 assert.doesNotMatch(edge,/COTIRONDA_PILOT_D016_(?:PORTAL_RELEASE_SHA|APPROVED_RELEASE_SHA)/u);
 assert.match(edge,/const expectedSign=await hmac\(signedKey,/u);
 assert.match(edge,/if\(!same\(receivedSign,expectedSign\)\)return response\('blocked',403\)/u);
 assert.ok(edge.indexOf('if(!same(receivedSign,expectedSign))')<
  edge.indexOf('const admin=roleKey()'));
 const p=edge.indexOf(' const pilotUnique=');
 const q=edge.indexOf(' // Portal y Edge ya',p);
 assert.ok(p>=0&&q>p);
 const validator=runInNewContext('(function(input){'+edge.slice(p,q)+
  "\nreturn 'ok';\n})",{
  UUID:/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu,
  HASH:/^[a-f0-9]{64}$/u,SHA:/^[a-f0-9]{40}$/u,
  response:state=>state
 });
 const operationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const good={mode:'pilot_unique',operationId,releaseSha:'a'.repeat(40)};
 assert.equal(validator(good),'ok');
 for(const invalid of [
  {mode:'pilot_unique',operationId},
  {...good,releaseSha:'bad'},
  {...good,releaseSha:'A'.repeat(40)},
  {...good,releaseSha:'0'.repeat(39)},
  {...good,requestId:operationId},
  {...good,recipient:'54999999999@s.whatsapp.net'}
 ])assert.equal(validator(invalid),'blocked',JSON.stringify(invalid));
 assert.equal(validator({
  operationId,requestId:operationId,sessionHmac:'b'.repeat(64),
  releaseSha:good.releaseSha
 }),'ok');
 const timestamp='1795140000000';
 const signedValue=body=>createHmac('sha256',Buffer.from(KEY,'hex'))
  .update('cotironda/d016/reissue/v1\n'+timestamp+'\n'+JSON.stringify(body))
  .digest('hex');
 assert.notEqual(signedValue(good),signedValue({...good,releaseSha:'c'.repeat(40)}));
});
