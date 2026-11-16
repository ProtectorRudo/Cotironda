/** Recuperación D013, solo operador servidor. No se integra al webhook.
 * Preserva el intento original review y NO publica ni envía WhatsApp.
 * Fuente: UN único inbox cifrado validado por RPC service_role.
 */
import {planificarMensajeAutenticadoMvp220} from './planificador-piloto-v2-d013.ts';
import {armarPreparacionSombraMvp221} from './puente-sql-rondas-v2-d013.ts';
const HEX=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
type Rpc=(name:string,params:Readonly<Record<string,unknown>>)=>
 Promise<{data:unknown;error:unknown}>;
type Model='gpt-6-luna'|'gpt-6.1-sol';
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const decode=(s:string):Uint8Array=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=(arr:Uint8Array):string=>
 Array.from(arr,v=>v.toString(16).padStart(2,'0')).join('');
async function abrirTextoArchivado(aesHex:string,row:Record<string,unknown>):Promise<string|null>{
 if(!HEX.test(aesHex)||!HEX.test(String(row.chat_hmac))||
  !HEX.test(String(row.message_hmac))||!HEX.test(String(row.source_sha256))||
  typeof row.nonce_b64!=='string'||typeof row.ciphertext_b64!=='string'||
  !/^[A-Za-z0-9+/]{16}$/u.test(row.nonce_b64)||
  !/^[A-Za-z0-9+/=]{24,20000}$/u.test(row.ciphertext_b64))return null;
 try{
  const iv=decode(row.nonce_b64),data=decode(row.ciphertext_b64);
  if(iv.length!==12||data.length<17||data.length>10000)return null;
  const key=await crypto.subtle.importKey('raw',
   Uint8Array.from(aesHex.match(/.{2}/gu)!,v=>parseInt(v,16)).buffer as ArrayBuffer,
   'AES-GCM',false,['decrypt']);
  const aad=new TextEncoder().encode(
   String(row.chat_hmac)+'|'+String(row.message_hmac)+'|text');
  const bytes=await crypto.subtle.decrypt(
   {name:'AES-GCM',iv:iv.buffer as ArrayBuffer,
    additionalData:aad.buffer as ArrayBuffer,tagLength:128},key,data);
  const original=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(original.length<10||original.length>4000)return null;
  const digest=await crypto.subtle.digest('SHA-256',
   new TextEncoder().encode(original));
  return hex(new Uint8Array(digest))===row.source_sha256?original:null;
 }catch{return null}
}
export type ResultadoRecuperacionD013=Readonly<{
 estado:'disabled'|'no_candidate'|'needs_operator_review'|
 'source_verified'|'staged_no_send';
 requestId:string|null;
 outboundSent:false;
}>;
const result=(estado:ResultadoRecuperacionD013['estado'],
 requestId:string|null=null):ResultadoRecuperacionD013=>({
  estado,requestId,outboundSent:false
 });
/** ejecutar=false verifica integridad local y NO llama a IA ni muta SQL.
 * ejecutar=true es exclusivamente para una orden de despliegue aprobada:
 * el RPC atómico conserva la auditoría y solo crea un borrador.
 */
export async function recuperarBuyerReviewD013(args:{
 ejecutar:boolean;habilitado:boolean;apiKey:string;
 aesKeyHex:string;model:Model;rpc:Rpc;
 planificar?:typeof planificarMensajeAutenticadoMvp220;
 preparar?:typeof armarPreparacionSombraMvp221;
}):Promise<ResultadoRecuperacionD013>{
 if(args?.habilitado!==true)return result('disabled');
 if(typeof args.rpc!=='function'||!HEX.test(args.aesKeyHex))
  return result('needs_operator_review');
 let raw:unknown;
 try{
  const response=await args.rpc(
   'cotironda_piloto_v2_d013_review_source_private',{});
  if(response.error!=null)return result('needs_operator_review');
  raw=response.data;
 }catch{return result('needs_operator_review')}
 if(!obj(raw)||raw.state!=='ready'){
  return result(obj(raw)&&raw.state==='empty'?'no_candidate':'needs_operator_review');
 }
 const original=await abrirTextoArchivado(args.aesKeyHex,raw);
 if(!original)return result('needs_operator_review');
 if(args.ejecutar!==true)return result('source_verified');
 if(typeof args.apiKey!=='string'||args.apiKey.length<20||
  !['gpt-6-luna','gpt-6.1-sol'].includes(args.model))
  return result('needs_operator_review');
 try{
  // Identidad autenticada por el webhook en el inbox original y nuevamente
  // verificada por la RPC; nunca se crea ni reinyecta un evento artificial.
  const plan=await (args.planificar??planificarMensajeAutenticadoMvp220)({
   chatHmac:String(raw.chat_hmac),messageHmac:String(raw.message_hmac),
   textoOriginal:original,autenticadoPorWebhook:true,
   apiKey:args.apiKey,model:args.model,
   rpc:async(n,p)=>args.rpc(n,p)
  });
  if(plan.estado!=='plan_validado_sin_envio')
   return result('needs_operator_review');
  const prepared=(args.preparar??armarPreparacionSombraMvp221)({
   chatHmac:String(raw.chat_hmac),messageHmac:String(raw.message_hmac),
   textoOriginal:original,autenticadoPorWebhook:true,plan
  });
  if(prepared.estado!=='plan_sql_listo'||!prepared.params)
   return result('needs_operator_review');
  const expectedItems=prepared.params.p_items.length;
  const expectedMatches=prepared.params.p_destinos.reduce(
   (n,x)=>n+x.correspondencias.length,0);
  const staged=await args.rpc(
   'cotironda_piloto_v2_d013_recovery_stage_private',{
    ...prepared.params,p_source_sha256:raw.source_sha256
   });
  if(staged.error!=null||!obj(staged.data)||
   staged.data.state!=='staged'||!UUID.test(String(staged.data.request_id))||
   staged.data.items_staged!==expectedItems||
   staged.data.matches_staged!==expectedMatches||
   staged.data.invitations_sent!==0||staged.data.outbox_sent!==0)
   return result('needs_operator_review');
  return result('staged_no_send',String(staged.data.request_id));
 }catch{
  // Tras red incierta no se reintenta automáticamente. Conciliación por
  // inbox.source_hmac y sidecar append-only; nunca enviar ni repetir.
  return result('needs_operator_review');
 }
}
