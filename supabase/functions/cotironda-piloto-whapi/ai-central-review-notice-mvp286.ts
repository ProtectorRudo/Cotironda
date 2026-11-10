/** MVP286: mensaje único de aviso para fallo de lectura de comprador.
 * Nunca reintenta IA ni envía invitaciones. Solo el RPC autorizado decide
 * si se permite responder a un mensaje recibido y verificado.
 */
type Rpc=(name:string,params:Readonly<Record<string,unknown>>)=>
 Promise<{data:unknown;error:unknown}>;
type Send=(recipient:string,body:string)=>
 Promise<{accepted:boolean;messageId:string|null}>;

const HASH=/^[a-f0-9]{64}$/u;
const ID=/^[A-Za-z0-9._:-]{8,160}$/u;
/** Only the provider's response status is examined. No messages or
 * addresses are returned, and HTTP 200 alone is NEVER a delivery receipt.
 * A provider's explicit sent:false/failed cannot be called accepted.
 */
export function aceptarRespuestaWhapiMvp287(httpOk:boolean,
 payload:unknown):Readonly<{accepted:boolean;messageId:string|null}>{
 const d=payload!==null&&typeof payload==='object'&&!Array.isArray(payload)
  ?payload as Record<string,unknown>:null;
 const m=d?.message!==null&&typeof d?.message==='object'&&!Array.isArray(d?.message)
  ?d.message as Record<string,unknown>:null;
 const id=d?.message_id??m?.id??d?.id;
 const good=typeof id==='string'&&ID.test(id);
 const failed=d?.sent===false||m?.sent===false||
   d?.status==='failed'||m?.status==='failed';
 return {accepted:httpOk&&good&&!failed,
  messageId:good?(id as string):null};
}
export const AVISO_LECTURA_NO_VALIDADA_MVP286=
 'Recibí tu mensaje, pero no pude validar el pedido en este intento. '+
 'No envié nada a los proveedores. Revisá que figuren materiales, '+
 'cantidades y localidad, y probá de nuevo más tarde.';

export async function avisarRevisionSemanticaMvp286(args:{
 habilitado:boolean;compradorAutenticado:boolean;
 chatHmac:string;messageHmac:string;destinatario:string;
 rpc:Rpc;send:Send;
}):Promise<Readonly<{
 estado:'desactivado'|'no_autorizado'|'no_elegible'|
 'api_aceptada'|'incierto'|'conciliacion_requerida';
 whatsappIdVerificado:boolean;
}>>{
 const result=(estado:'desactivado'|'no_autorizado'|'no_elegible'|
  'api_aceptada'|'incierto'|'conciliacion_requerida',
  whatsappIdVerificado=false)=>Object.freeze({estado,whatsappIdVerificado});
 if(!args?.habilitado)return result('desactivado');
 if(args.compradorAutenticado!==true||!HASH.test(args.chatHmac)||
    !HASH.test(args.messageHmac)||typeof args.destinatario!=='string'||
    !/^[0-9]{9,16}@s\.whatsapp\.net$/u.test(args.destinatario)||
    typeof args.rpc!=='function'||typeof args.send!=='function')
  return result('no_autorizado');
 let lease;
 try{
  lease=await args.rpc('cotironda_piloto_ia_reserve_review_notice_mvp286',{
   p_chat_hmac:args.chatHmac,p_message_hmac:args.messageHmac
  });
 }catch{return result('conciliacion_requerida')}
 if(lease.error||!lease.data||typeof lease.data!=='object')
  return result('conciliacion_requerida');
 if((lease.data as Record<string,unknown>).state!=='leased')
  return result('no_elegible');
 let accepted=false,whapiId:string|null=null;
 try{
  const sent=await args.send(args.destinatario,AVISO_LECTURA_NO_VALIDADA_MVP286);
  if(sent.accepted===true&&typeof sent.messageId==='string'&&
     ID.test(sent.messageId)){
   accepted=true;whapiId=sent.messageId;
  }
 }catch{/* entrega incierta, no se reintenta */}
 const state=accepted?'api_accepted':'uncertain';
 try{
  const saved=await args.rpc('cotironda_piloto_ia_finish_review_notice_mvp286',{
   p_chat_hmac:args.chatHmac,p_message_hmac:args.messageHmac,
   p_state:state,p_whapi_message_id:whapiId
  });
  if(saved.error||saved.data!==true)
   return result('conciliacion_requerida');
 }catch{return result('conciliacion_requerida')}
 return result(accepted?'api_aceptada':'incierto',accepted);
}
