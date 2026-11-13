/** D016 P0 / #838 — receptor pasivo de evidencia Whapi.
 * Se invoca SOLO tras autenticar el webhook y guardar el mensaje en inbox.
 * NO interpreta precios ni comparte originales. No hace fetch ni mensajes.
 */
type Rpc=(name:string,args:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
export type ResultadoEntradaOriginalD016=
 'apagado'|'ignorado'|'registrado_sin_autorizacion'|
 'baja_registrada'|'conciliacion_requerida';
const SHA=/^[a-f0-9]{64}$/u;
const QUOTED=/^[A-Za-z0-9._:-]{8,160}$/u;
export function esBajaOriginalD016(texto:unknown):boolean{
 return typeof texto==='string'&&
  /^(?:NO COMPARTIR|No compartir|no compartir)\.?$/u.test(texto);
}
export async function registrarRespuestaOriginalEntranteD016(args:{
 enabled:boolean;webhookAutenticado:boolean;mensajePersistido:boolean;
 duplicado:boolean;proveedorVerificado:boolean;
 messageHmac:string;chatHmac:string;
 tipo:'text'|'document'|'image'|'audio'|'voice';
 texto:string|null;reconocidoComoCotizacion:boolean;
 archivoGuardadoYVerificado:boolean;
 quotedWhapiId:string|null;reenviado:boolean;
 rpc:Rpc;
}):Promise<ResultadoEntradaOriginalD016>{
 if(args?.enabled!==true)return 'apagado';
 if(args.webhookAutenticado!==true||args.mensajePersistido!==true||
  args.duplicado!==false||args.proveedorVerificado!==true||
  !SHA.test(args.messageHmac)||!SHA.test(args.chatHmac)||
  typeof args.rpc!=='function'||args.reenviado!==false||
  (args.quotedWhapiId!==null&&!QUOTED.test(args.quotedWhapiId)))
  return 'ignorado';
 // Baja no necesita una ronda elegida ni que el mensaje sea presupuesto.
 // SQL compara el SHA exacto del texto con whapi_inbox autenticado.
 if(args.tipo==='text'&&esBajaOriginalD016(args.texto)){
  try{
   const result=await args.rpc(
    'cotironda_piloto_v2_d016_revoke_by_whapi_text_private',{
     p_message_hmac:args.messageHmac,p_chat_hmac:args.chatHmac
    });
   if(result.error!=null||!Number.isSafeInteger(result.data)||
      Number(result.data)<0)return 'conciliacion_requerida';
   return Number(result.data)>0?'baja_registrada':'ignorado';
  }catch{return 'conciliacion_requerida'}
 }
 if(args.reconocidoComoCotizacion!==true||
  !(args.tipo==='text'||
   (['document','image'].includes(args.tipo)&&
    args.archivoGuardadoYVerificado===true)))
  return 'ignorado';
 try{
  const observed=await args.rpc(
   'cotironda_piloto_v2_d016_record_reply_event_private',{
    p_message_hmac:args.messageHmac,p_chat_hmac:args.chatHmac,
    p_quoted_whapi_id:args.quotedWhapiId,
    p_is_forwarded:false,p_is_quote:true
   });
  if(observed.error!=null||
   !['denied','verified_reply_not_authorization'].includes(
    String(observed.data)))
   return 'conciliacion_requerida';
  return observed.data==='verified_reply_not_authorization'
   ?'registrado_sin_autorizacion':'ignorado';
 }catch{return 'conciliacion_requerida'}
}
