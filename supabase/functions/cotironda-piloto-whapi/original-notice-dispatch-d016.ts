/** D016 P0 #838 — adaptador del despacho Whapi, DESACTIVADO por defecto.
 * Genera el caption del MISMO PDF enviado por MVP223 y registra SHA previo.
 * Esto es sólo evidencia técnica: NO concede consentimiento ni descargas.
 */
import {adjuntarAvisoOriginalesD016,AVISO_ORIGINALES_D016_VERSION}
 from '../../../src/server/v2-d016-aviso-original-proveedor.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const KEY=/^[a-z][a-z0-9_]{2,63}$/u;
const HASH=/^[a-f0-9]{64}$/u;
const WHAPI=/^[A-Za-z0-9._:-]{8,160}$/u;
const PHONE=/^\d{8,17}$/u;
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a),
 b=>b.toString(16).padStart(2,'0')).join('');

export async function reservarAvisoOriginalEnDespachoD016(args:{
 enabled:boolean;requestId:string;supplierKey:string;chatHmac:string;
 leaseToken:string;recipient:string;captionBase:string;
 rpc:Rpc;
}):Promise<string|null>{
 if(!args||args.enabled!==true||!UUID.test(args.requestId)||
  !KEY.test(args.supplierKey)||!HASH.test(args.chatHmac)||
  !UUID.test(args.leaseToken)||!PHONE.test(args.recipient)||
  typeof args.rpc!=='function')return null;
 const caption=adjuntarAvisoOriginalesD016(args.captionBase,1024);
 if(!caption)return null;
 try{
  const hash=hex(await crypto.subtle.digest('SHA-256',
   new TextEncoder().encode(caption)));
  if(!HASH.test(hash))return null;
  const r=await args.rpc(
   'cotironda_piloto_v2_d016_reserve_original_notice_private',{
    p_request_id:args.requestId,p_supplier_key:args.supplierKey,
    p_chat_hmac:args.chatHmac,p_notice_body_sha256:hash,
    p_notice_version:AVISO_ORIGINALES_D016_VERSION
   });
  return r.error==null&&r.data===true?caption:null;
 }catch{return null}
}

/** Se llama DESPUÉS de que MVP222 persiste estado `api_accepted` e ID
 * Whapi en SQL. Si falla, no se vuelve a mandar el PDF. Queda conciliación.
 */
export async function registrarResultadoOriginalD016(args:{
 enabled:boolean;requestId:string;supplierKey:string;
 messageId:string;rpc:Rpc;
}):Promise<boolean>{
 if(!args||args.enabled!==true||!UUID.test(args.requestId)||
  !KEY.test(args.supplierKey)||!WHAPI.test(args.messageId)||
  typeof args.rpc!=='function')return false;
 try{
  const r=await args.rpc(
   'cotironda_piloto_v2_d016_finish_original_notice_private',{
    p_request_id:args.requestId,p_supplier_key:args.supplierKey,
    p_whapi_message_id:args.messageId
   });
  return r.error==null&&r.data===true;
 }catch{return false}
}
