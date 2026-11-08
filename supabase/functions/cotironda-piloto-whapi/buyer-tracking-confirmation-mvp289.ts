/** MVP289 — enlace privado del comprador tras despacho confirmado.
 * Reusa MVP091/MVP212. Una reserva SQL = maximo un POST a Whapi.
 * Ante fallo o timeout, entrega incierta: JAMAS reenviar automaticamente.
 */
import {crearEnlacePrivadoSeguimientoMvp212} from '../../../src/domain/enlace-seguimiento-piloto-mvp212.ts';
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Send=(recipient:string,body:string)=>Promise<{accepted:boolean;messageId:string|null}>;
const H=/^[a-f0-9]{64}$/u;
const U=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const W=/^[1-9][0-9]{7,16}@s\.whatsapp\.net$/u;
const ID=/^[A-Za-z0-9._:-]{8,160}$/u;
export type ResultadoSeguimientoMvp289=Readonly<{
 estado:'apagado'|'no_autorizado'|'no_elegible'|
 'api_aceptada'|'entrega_incierta'|'conciliacion_requerida';
 intentos:0|1;
}>;
const done=(estado:ResultadoSeguimientoMvp289['estado'],intentos:0|1=0)=>
 Object.freeze({estado,intentos});
export async function notificarSeguimientoMvp289(args:{
 enabled:boolean;buyerVerified:boolean;
 mode:'confirmed'|'recovery'|'auto';requestId:string|null;
 chatHmac:string;eventHmac:string;recipient:string;
 rpc:Rpc;send:Send;
 // MVP315 uses independent budgeted issuance when the batch notice gate is ON.
 issueRpc?:'cotironda_piloto_ia_issue_buyer_notice_mvp315';
 noticeChannel?:string;
 authorizeBeforeSend?:(tokenHash:string)=>Promise<boolean>;
}):Promise<ResultadoSeguimientoMvp289>{
 if(!args?.enabled)return done('apagado');
 if(!args.buyerVerified||!H.test(args.chatHmac)||!H.test(args.eventHmac)||
    !W.test(args.recipient)||typeof args.rpc!=='function'||
    typeof args.send!=='function'||
    !['confirmed','recovery','auto'].includes(args.mode)||
    ((args.mode==='confirmed'||args.mode==='auto')&&!U.test(args.requestId??''))||
    (args.mode==='recovery'&&args.requestId!==null)||
    (args.issueRpc!==undefined&&
      (args.mode!=='auto'||typeof args.noticeChannel!=='string'||
       !/^[A-Za-z0-9_-]{4,64}$/u.test(args.noticeChannel))))
  return done('no_autorizado');
 const raw=crypto.getRandomValues(new Uint8Array(32));
 const token=Array.from(raw,x=>x.toString(16).padStart(2,'0')).join('');
 const link=crearEnlacePrivadoSeguimientoMvp212(token);
 if(!link)return done('conciliacion_requerida');
 const digest=Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),
  x=>x.toString(16).padStart(2,'0')).join('');
 let issued:unknown;
 try{
  const r=await args.rpc(
   args.mode==='auto'
    ?(args.issueRpc??'cotironda_piloto_issue_auto_tracking_mvp306')
    :'cotironda_piloto_issue_confirmed_tracking_mvp289',
   args.mode==='auto'?{
    p_chat_hmac:args.chatHmac,p_event_hmac:args.eventHmac,
    p_request:args.requestId,p_token_hash:digest,
    ...(args.issueRpc?{p_channel:args.noticeChannel}: {})
   }:{
    p_chat_hmac:args.chatHmac,p_event_hmac:args.eventHmac,
    p_request:args.requestId,p_token_hash:digest,p_mode:args.mode
   }
  );
  if(r.error!==null&&r.error!==undefined)
   return done('conciliacion_requerida');
  issued=r.data;
 }catch{return done('conciliacion_requerida')}
 if(!issued||typeof issued!=='object'||
    (issued as Record<string,unknown>).state!=='issued')
  return done('no_elegible');
 const actual=(issued as Record<string,unknown>).request_id;
 if(!U.test(String(actual))||
    (args.requestId!==null&&actual!==args.requestId))
  return done('conciliacion_requerida');
 const body=(args.mode==='auto'
  ?'Cotironda ✅ Recibimos tu pedido y las solicitudes fueron aceptadas por el canal de los negocios.'
  :'Cotironda ✅ Tu pedido fue confirmado y enviamos las solicitudes a los negocios.')+'\n\n'+
  'Seguí las cotizaciones por rubro y los resultados de la ronda en este enlace privado:\n'+link+
  '\n\nAl cierre vas a poder identificar a todos los proveedores invitados. '+
  'La adjudicación la decidís vos. No compartas este enlace.';
 let accepted=false;let messageId:string|null=null;
 let authorized=true;
 if(args.authorizeBeforeSend)try{
  authorized=await args.authorizeBeforeSend(digest)===true;
 }catch{authorized=false}
 try{
  if(!authorized)throw Error('buyer_notice_authorization_revoked');
  const sent=await args.send(args.recipient,body);
  accepted=sent.accepted===true&&typeof sent.messageId==='string'&&
    ID.test(sent.messageId);
  if(accepted)messageId=sent.messageId;
 }catch{/* Red incierta. No se reintenta. */}
 try{
  const finished=await args.rpc('cotironda_piloto_finish_tracking_mvp091',{
   p_token_hash:digest,p_state:accepted?'api_accepted':'uncertain'
  });
  if(finished.error!==null&&finished.error!==undefined||
     finished.data!==true)return done('conciliacion_requerida',1);
  if(accepted&&messageId){
   const recorded=await args.rpc('cotironda_piloto_record_tracking_id_mvp119',{
    p_token_hash:digest,p_whapi_message_id:messageId
   });
   if(recorded.error!==null&&recorded.error!==undefined||
      recorded.data!==true)return done('conciliacion_requerida',1);
  }
 }catch{return done('conciliacion_requerida',1)}
 return done(accepted?'api_aceptada':'entrega_incierta',1);
}
