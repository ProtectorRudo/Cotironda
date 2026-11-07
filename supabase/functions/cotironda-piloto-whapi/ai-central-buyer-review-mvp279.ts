/** MVP279: single-use exact buyer WhatsApp review and reply.
 * All writes stay behind SQL service_role, no AI interpretation or new
 * purchase. A Whapi timeout is UNCERTAIN; never automatically resend.
 */
import {lineaComercialLegibleMvp288} from '../../../src/domain/ia-central/fidelidad-pedido-mvp288.ts';
type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Send=(to:string,body:string)=>
 Promise<Readonly<{accepted:boolean;messageId:string|null}>>;
const HASH=/^[a-f0-9]{64}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CODE=/^[A-F0-9]{16}$/u;
const ID=/^[A-Za-z0-9._:-]{8,160}$/u;
const RUBROS=new Set([
 'obra_gruesa','pintura','electricidad','construccion_seca',
 'sanitarios','ferreteria','otros'
]);
const CTL=/[\u0000-\u001f\u007f]/u;
const digits=/^\d{1,7}(?:\.\d{1,3})?$/u;
export const esRespuestaConfirmacionMvp279=(body:string):boolean=>
 typeof body==='string'&&
 /^CONFIRMAR COTI [A-F0-9]{16}$/iu.test(body.trim());
export function componerRevisionCompradorMvp279(raw:unknown):string|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const o=raw as Record<string,unknown>;
 if(o.state!=='issued'||!UUID.test(String(o.request_id))||
    typeof o.code!=='string'||!CODE.test(o.code)||
    typeof o.city!=='string'||o.city.trim().length<3||
    o.city.length>80||CTL.test(o.city)||
    !(o.note===null||typeof o.note==='string'&&
      o.note.length<=90&&!CTL.test(o.note))||
    !Array.isArray(o.items)||o.items.length<1||o.items.length>25||
    o.items_count!==o.items.length)return null;
 const lines=[
  'Cotironda — revisá tu pedido antes de enviarlo:',
  'Entrega: '+o.city.trim()
 ];
 if(o.note)lines.push('Indicaciones: '+o.note);
 for(let i=0;i<o.items.length;i++){
  const row=o.items[i];
  if(!row||typeof row!=='object'||Array.isArray(row))return null;
  const item=row as Record<string,unknown>;
  if(item.lineNo!==i+1||
     typeof item.description!=='string'||
     item.description.trim().length<3||item.description.length>500||
     CTL.test(item.description)||
     typeof item.quantity!=='string'||!digits.test(item.quantity)||
     !(Number(item.quantity)>0&&Number(item.quantity)<=1000000)||
     typeof item.unit!=='string'||!/^([a-z0-9]{1,12})$/u.test(item.unit)||
     typeof item.rubro!=='string'||!RUBROS.has(item.rubro))
   return null;
  const human=lineaComercialLegibleMvp288(
   item.quantity,item.unit,item.description);
  if(!human)return null;
  const line=String(i+1)+'. ['+item.rubro.replaceAll('_',' ')+'] '+
   human.cantidad+' '+human.unidad+' — '+human.descripcion;
  lines.push(line);
 }
 lines.push('Si las cantidades, materiales y rubros son correctos, respondé exactamente:',
  'CONFIRMAR COTI '+o.code,
  'Si algo está mal, NO confirmes. Para reemplazar ESTA revisión enviá',
  'CORREGIR COTI '+o.code+': <pedido completo corregido>');
 const body=lines.join('\n');
 // Never truncate descriptions or skip articles to fit WhatsApp limits.
 if(body.length>3300||CTL.test(body.replaceAll('\n','')))return null;
 return body;
}
type State='apagado'|'no_autorizado'|'sin_revision'|'reservada'|
 'api_aceptada'|'entrega_incierta'|'conciliacion_requerida';
type Result=Readonly<{estado:State;codigo:string;whatsappIntentos:0|1;
 rondaPublicada:false;proveedoresContactados:false}>;
const done=(estado:State,codigo:string,intentos:0|1=0):Result=>
 Object.freeze({estado,codigo,whatsappIntentos:intentos,
  rondaPublicada:false,proveedoresContactados:false});
export async function emitirRevisionCompradorMvp279(args:{
 habilitado:boolean;compradorAutenticado:boolean;chatHmac:string;
 sourceHmac:string;destinatario:string;rpc:Rpc;send:Send;
}):Promise<Result>{
 if(args?.habilitado!==true)return done('apagado','flag_disabled');
 if(!args.compradorAutenticado||!HASH.test(args.chatHmac)||
    !HASH.test(args.sourceHmac)||
    !/^[1-9][0-9]{7,16}@s[.]whatsapp[.]net$/u.test(args.destinatario)||
    typeof args.rpc!=='function'||typeof args.send!=='function')
  return done('no_autorizado','invalid_buyer_context');
 let reserved:{state?:unknown;request_id?:unknown}|null=null;
 try{
  const reply=await args.rpc('cotironda_piloto_ia_review_issue_mvp279',{
   p_chat_hmac:args.chatHmac,p_source_hmac:args.sourceHmac
  });
  if(reply.error!==null&&reply.error!==undefined)
   return done('conciliacion_requerida','issue_unknown');
  reserved=reply.data&&typeof reply.data==='object'?
   reply.data as {state?:unknown;request_id?:unknown}:null;
 }catch{return done('conciliacion_requerida','issue_unknown')}
 if(reserved?.state!=='issued')return done('sin_revision','not_issued_or_duplicate');
 const content=componerRevisionCompradorMvp279(reserved);
 const request=String(reserved.request_id);
 // Issue was already persisted: do NOT issue again if rendering fails.
 if(!content||!UUID.test(request))
  return done('conciliacion_requerida','rendering_after_issue');
 let accepted=false,id:string|null=null;
 try{
  const sent=await args.send(args.destinatario,content);
  accepted=sent.accepted===true&&typeof sent.messageId==='string'&&
   ID.test(sent.messageId);
  if(accepted)id=sent.messageId;
 }catch{/* Whapi result could be uncertain: no resend */ }
 try{
  const finish=await args.rpc('cotironda_piloto_ia_review_delivery_mvp279',{
   p_request:request,p_status:accepted?'api_accepted':'uncertain',
   p_whapi_message_id:id
  });
  if(finish.error!==null&&finish.error!==undefined||
     (finish.data as {state?:unknown}|null)?.state!=='recorded')
   return done('conciliacion_requerida','delivery_ledger_uncertain',1);
 }catch{return done('conciliacion_requerida','delivery_ledger_uncertain',1)}
 return done(accepted?'api_aceptada':'entrega_incierta',
   accepted?'whapi_api_accepted_not_delivery_proven':'no_retry',1);
}
type ConfirmState='no_es_confirmacion'|'apagado'|'no_autorizado'|
 'confirmado_sin_envio'|'publicado'|'conciliacion_requerida';
export type ResultadoConfirmacionMvp279=Readonly<{
 estado:ConfirmState;requestId:string|null;envioAutorizado:boolean;
}>;
const confirmed=(estado:ConfirmState,id:string|null=null):
 ResultadoConfirmacionMvp279=>Object.freeze({
 estado,requestId:id,envioAutorizado:estado==='publicado'
});
export async function confirmarPedidoCompradorMvp279(args:{
 habilitado:boolean;liberar:boolean;compradorAutenticado:boolean;
 chatHmac:string;replyHmac:string;textoOriginal:string;
 rpc:Rpc;
}):Promise<ResultadoConfirmacionMvp279>{
 if(!esRespuestaConfirmacionMvp279(args?.textoOriginal))
  return confirmed('no_es_confirmacion');
 if(args.habilitado!==true)return confirmed('apagado');
 if(!args.compradorAutenticado||!HASH.test(args.chatHmac)||
    !HASH.test(args.replyHmac)||typeof args.rpc!=='function')
  return confirmed('no_autorizado');
 let response;
 try{
  response=await args.rpc('cotironda_piloto_ia_review_confirm_mvp279',{
   p_chat_hmac:args.chatHmac,p_message_hmac:args.replyHmac,
   p_exact_text:args.textoOriginal
  });
 }catch{return confirmed('conciliacion_requerida')}
 if(response.error!==null&&response.error!==undefined)
  return confirmed('conciliacion_requerida');
 const data=response.data&&typeof response.data==='object'?
  response.data as Record<string,unknown>:null;
 if(data?.state!=='confirmed'||typeof data.request_id!=='string'||
    !UUID.test(data.request_id))return confirmed('no_autorizado');
 if(!args.liberar)return confirmed('confirmado_sin_envio',data.request_id);
 // SQL publish and dispatch CLAIM separately revalidate approval + buyer
 // consent + exact hash; no AI-written code or second interpretation.
 try{
  const published=await args.rpc('cotironda_piloto_ia_publish_mvp222',{
   p_request:data.request_id
  });
  if(published.error!==null&&published.error!==undefined)
   return confirmed('conciliacion_requerida');
  const p=published.data&&typeof published.data==='object'?
   published.data as Record<string,unknown>:null;
  if(p?.state==='ready_for_delivery')
   return confirmed('publicado',data.request_id);
  return confirmed('confirmado_sin_envio',data.request_id);
 }catch{return confirmed('conciliacion_requerida')}
}
