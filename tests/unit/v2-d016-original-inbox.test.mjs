import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {registrarRespuestaOriginalEntranteD016,esBajaOriginalD016}
 from '../../supabase/functions/cotironda-piloto-whapi/original-reply-intake-d016.ts';
import {generarWebhookInboxD016}
 from '../../scripts/piloto/v2-d016-original-inbox-overlay.mjs';

const HASH='b'.repeat(64),CHAT='c'.repeat(64),QUOTE='wamid.TEST_OUTGOING';
function env(overrides={}){
 const state={calls:[],status:'verified_reply_not_authorization',
  revoked:1,sqlError:null};
 const rpc=async (name,data)=>{
  state.calls.push({name,data});
  if(state.sqlError)return {data:null,error:state.sqlError};
  if(name==='cotironda_piloto_v2_d016_record_reply_event_private')
   return {data:state.status,error:null};
  if(name==='cotironda_piloto_v2_d016_revoke_by_whapi_text_private')
   return {data:state.revoked,error:null};
  throw Error('unexpected RPC');
 };
 const base={enabled:true,webhookAutenticado:true,
  mensajePersistido:true,duplicado:false,proveedorVerificado:true,
  messageHmac:HASH,chatHmac:CHAT,tipo:'text',texto:'Cotizo cemento 20 bolsas',
  reconocidoComoCotizacion:true,archivoGuardadoYVerificado:false,
  quotedWhapiId:QUOTE,reenviado:false,rpc};
 return {state,run:extra=>registrarRespuestaOriginalEntranteD016(
  {...base,...overrides,...extra})};
}
test('Entrada Whapi auténtica registra solo procedencia, jamás permiso',async()=>{
 const e=env();const r=await e.run({});
 assert.equal(r,'registrado_sin_autorizacion');
 assert.deepEqual(e.state.calls,[{
  name:'cotironda_piloto_v2_d016_record_reply_event_private',
  data:{p_message_hmac:HASH,p_chat_hmac:CHAT,p_quoted_whapi_id:QUOTE,
   p_is_forwarded:false,p_is_quote:true}
 }]);
});
test('Comando de baja exacto se reconoce sin pedir ronda ni enviar WhatsApp',async()=>{
 for(const raw of ['NO COMPARTIR','No compartir','no compartir',
  'NO COMPARTIR.','No compartir.','no compartir.']){
  assert.equal(esBajaOriginalD016(raw),true,raw);
  const e=env();
  const outcome=await e.run({texto:raw,reconocidoComoCotizacion:false,
   quotedWhapiId:null});
  assert.equal(outcome,'baja_registrada');
  assert.deepEqual(e.state.calls.map(c=>c.name),[
   'cotironda_piloto_v2_d016_revoke_by_whapi_text_private']);
 }
 for(const raw of ['NO COMPARTIR otro','nocompartir','NO COMPARTIR  ',
  'NO COMPARTIR\n','NO COMPARTIR?'])assert.equal(esBajaOriginalD016(raw),false);
});
test('Flags OFF, replays, no autenticado, comprador, reenviado no llaman SQL',async()=>{
 const cases=[
  {enabled:false},{webhookAutenticado:false},
  {mensajePersistido:false},{duplicado:true},
  {proveedorVerificado:false},{reenviado:true},
  {messageHmac:'bad'},{chatHmac:'bad'},{quotedWhapiId:'bad'},
  {reconocidoComoCotizacion:false},{tipo:'audio',reconocidoComoCotizacion:true}
 ];
 for(const bad of cases){
  const e=env();const v=await e.run(bad);
  assert.ok(['apagado','ignorado'].includes(v),JSON.stringify(bad));
  assert.equal(e.state.calls.length,0,JSON.stringify(bad));
 }
});
test('PDF/imagen no cuentan como originales hasta estar almacenados con SHA',async()=>{
 for(const kind of ['document','image']){
  const e=env();
  const v=await e.run({tipo:kind,texto:null,
   archivoGuardadoYVerificado:false});
  assert.equal(v,'ignorado');
  assert.equal(e.state.calls.length,0);
  const v2=await e.run({tipo:kind,texto:null,
   archivoGuardadoYVerificado:true,quotedWhapiId:null});
  assert.equal(v2,'registrado_sin_autorizacion');
  assert.equal(e.state.calls.length,1);
 }
});
test('Denegación SQL, baja inexistente y error RPC nunca conceden acceso',async()=>{
 const e=env();e.state.status='denied';
 assert.equal(await e.run({}),'ignorado');
 e.state.revoked=0;
 assert.equal(await e.run({texto:'NO COMPARTIR'}),'ignorado');
 e.state.sqlError={code:'503'};
 assert.equal(await e.run({}),'conciliacion_requerida');
 assert.equal(await e.run({texto:'NO COMPARTIR'}),'conciliacion_requerida');
});
test('Overlay solo genera copia; v76 permanece íntegro y un único hook',()=>{
 const src=readFileSync(
  'supabase/functions/cotironda-piloto-whapi/index.ts','utf8');
 const before=createHash('sha256').update(src).digest('hex');
 const v2=generarWebhookInboxD016(src);
 assert.equal(createHash('sha256').update(src).digest('hex'),before);
 assert.ok(v2.includes('COTIRONDA_PILOT_D016_ORIGINAL_INBOX_ENABLED'));
 assert.ok(v2.includes('COTIRONDA_PILOT_D016_ORIGINAL_NOTICE_ENABLED'));
 assert.ok(v2.includes('COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED'));
 assert.ok(v2.includes("d016MediaStored=true"));
 assert.ok(v2.includes("COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED"));
 assert.ok(v2.includes("supplierAckMode==='text_quote'"));
 assert.equal((v2.match(/registrarRespuestaOriginalEntranteD016\(\{/gu)||[]).length,1);
 assert.equal((v2.match(/sendWhapi:async\(recipient,pdf,d016Caption\)/gu)||[]).length,1);
});
