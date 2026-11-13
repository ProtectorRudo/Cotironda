/** D016 — puente de notificación WhatsApp al portal SIN SMS.
 * Se ejecuta SOLO después de webhook autenticado y persistencia del evento.
 * Una reserva SQL por evento = máximo un POST Whapi. Nunca reintentar
 * automáticamente ante entrega incierta; el comprador pide un enlace nuevo.
 * No crea sesión ni toca originales: el navegador redime el ticket una vez.
 */
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Send=(recipient:string,body:string)=>Promise<{accepted:boolean;messageId:string|null}>;
type Result='apagado'|'no_autorizado'|'no_elegible'|'api_aceptada'|
 'entrega_incierta'|'conciliacion_requerida';
export type ResultadoAccesoD016=Readonly<{estado:Result;intentos:0|1}>;
const result=(estado:Result,intentos:0|1=0):ResultadoAccesoD016=>
 Object.freeze({estado,intentos});
const HASH=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const W=/^[1-9][0-9]{7,16}@s\.whatsapp\.net$/u;
const ID=/^[A-Za-z0-9._:-]{8,160}$/u;
const SHA=/^[a-f0-9]{40}$/u;
const enc=new TextEncoder();

function origenD016(s:string):boolean{
 try{
  const u=new URL(s);
  return u.protocol==='https:'&&u.origin===s&&u.username===''&&
   u.password===''&&u.port===''&&u.pathname==='/'&&
   u.search===''&&u.hash===''&&
   u.hostname.startsWith('cotironda-portal-')&&
   u.hostname.endsWith('-protector-rudo-s-projects.vercel.app');
 }catch{return false}
}
function hex(input:Uint8Array):string{
 return Array.from(input,x=>x.toString(16).padStart(2,'0')).join('');
}
function hexKey(s:string):ArrayBuffer{
 const bytes=new Uint8Array(32);
 for(let i=0;i<32;i++)bytes[i]=parseInt(s.slice(i*2,i*2+2),16);
 return bytes.buffer as ArrayBuffer;
}
async function hashTicket(token:string,keyHex:string):Promise<string>{
 const key=await crypto.subtle.importKey('raw',hexKey(keyHex),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,
  enc.encode('cotironda/d016/acceso/v1/'+token));
 return hex(new Uint8Array(bytes));
}
export async function notificarAccesoWhatsappD016(args:{
 enabled:boolean;webhookAutenticado:boolean;compradorVerificado:boolean;
 mode:'confirmed'|'recovery'|'auto';requestId:string|null;
 chatHmac:string;eventHmac:string;recipient:string;
 portalOrigin:string;portalSha:string;approvedSha:string;hmacKeyHex:string;
 rpc:Rpc;send:Send;authorizeChat:(recipient:string,chatHmac:string)=>Promise<boolean>;
}):Promise<ResultadoAccesoD016>{
 if(args?.enabled!==true)return result('apagado');
 if(!args.webhookAutenticado||!args.compradorVerificado||
  !HASH.test(args.chatHmac)||!HASH.test(args.eventHmac)||
  !W.test(args.recipient)||!HASH.test(args.hmacKeyHex)||
  !origenD016(args.portalOrigin)||
  !SHA.test(args.portalSha)||args.portalSha!==args.approvedSha||
  !['auto','recovery','confirmed'].includes(args.mode)||
  (args.mode==='recovery'&&args.requestId!==null)||
  (args.mode!=='recovery'&&!UUID.test(args.requestId??''))||
  typeof args.rpc!=='function'||typeof args.send!=='function'||
  typeof args.authorizeChat!=='function')
  return result('no_autorizado');

 let token:string,digest:string;
 try{
  const raw=crypto.getRandomValues(new Uint8Array(32));
  token=btoa(String.fromCharCode(...raw))
   .replace(/\+/gu,'-').replace(/\//gu,'_').replace(/=+$/u,'');
  digest=await hashTicket(token,args.hmacKeyHex);
 }catch{return result('conciliacion_requerida')}
 let row:Record<string,unknown>;
 try{
  const prepared=await args.rpc(
   'cotironda_piloto_v2_d016_prepare_whapi_link_private',{
    p_chat_hmac:args.chatHmac,p_event_hmac:args.eventHmac,
    p_request_id:args.requestId,p_mode:args.mode,p_ticket_hmac:digest
   });
  if(prepared.error!=null||!prepared.data||
   typeof prepared.data!=='object'||Array.isArray(prepared.data))
   return result('conciliacion_requerida');
  row=prepared.data as Record<string,unknown>;
 }catch{return result('conciliacion_requerida')}
 if(['denied','duplicate','rate_limited'].includes(String(row.state)))
  return result('no_elegible');
 if(row.state!=='issued'||typeof row.request_id!=='string'||
  !UUID.test(row.request_id)||
  (args.requestId!==null&&row.request_id!==args.requestId))
  return result('conciliacion_requerida');
 const url=args.portalOrigin+'/piloto/v2/acceso#d016='+token+
  '&ronda='+row.request_id;
 const body='Cotironda ✅ Consultá los presupuestos recibidos para tu pedido.\n\n'+
  'Abrí este enlace privado para ingresar sin contraseña ni código:\n'+url+
  '\n\nEl enlace vence en 10 minutos y es de un solo uso. '+
  'Si vence, escribí SEGUIMIENTO COTI por este mismo WhatsApp. '+
  'No compartas el enlace.';
 let accepted=false,messageId:string|null=null;
 try{
  const valid=await args.authorizeChat(args.recipient,args.chatHmac);
  if(valid===true){
   const response=await args.send(args.recipient,body);
   accepted=response.accepted===true&&typeof response.messageId==='string'&&
    ID.test(response.messageId);
   if(accepted)messageId=response.messageId;
  }
 }catch{/* Entrega incierta: no reintentar. */}
 try{
  const finish=await args.rpc(
   'cotironda_piloto_v2_d016_finish_whapi_link_private',{
    p_ticket_hmac:digest,p_state:accepted?'api_accepted':'uncertain',
    p_whapi_message_id:messageId
   });
  if(finish.error!=null||finish.data!==true)
   return result('conciliacion_requerida',1);
 }catch{return result('conciliacion_requerida',1)}
 return result(accepted?'api_aceptada':'entrega_incierta',1);
}
