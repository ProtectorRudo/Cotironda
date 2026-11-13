/** Cotironda V2 / P0 #838. Núcleo D016 prospectivo SIN ACTIVACIÓN.
 * El aviso viaja EN EL MISMO mensaje del pedido (o su caption), nunca en otro
 * WhatsApp. Esta prueba de forma NO reemplaza las RPC de autorización SQL.
 * La fuente de verdad de los originales continúa en Whapi/Storage.
 */
const SHA=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const ID=/^[A-Za-z0-9._:-]{8,160}$/u;
const KEY=/^[a-z0-9_-]{3,100}$/u;
const TS=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>0;
export const AVISO_ORIGINALES_D016_VERSION='cotironda-originales-v2-respuesta-20261113' as const;
export const AVISO_ORIGINALES_D016=
 'Cotironda compartirá tu presupuesto original y un análisis con el comprador de esta solicitud. '+
 'Si respondés enviando tu cotización después de recibir este pedido, autorizás ese uso para esta solicitud. '+
 'Podés pedir que dejemos de compartirlo escribiendo NO COMPARTIR por este WhatsApp.';
const SEPARADOR='\n\n';

/** Solo compone el cuerpo/caption del MISMO pedido; NO lo envía ni lo persiste.
 * Si no cabe, devuelve null: está prohibido suprimir el aviso o el pedido.
 * Un archivo original recibido jamás se modifica para agregar el aviso.
 */
export function adjuntarAvisoOriginalesD016(
 pedido:string,maxCaracteres:number
):string|null{
 if(typeof pedido!=='string'||pedido.trim().length<1||
  pedido!==pedido.trim()||pedido.includes(AVISO_ORIGINALES_D016)||
  !Number.isSafeInteger(maxCaracteres)||maxCaracteres<AVISO_ORIGINALES_D016.length+10)
  return null;
 const cuerpo=pedido+SEPARADOR+AVISO_ORIGINALES_D016;
 return cuerpo.length<=maxCaracteres?cuerpo:null;
}

export type DespachoOriginalesD016=Readonly<{
 requestId:string;supplierKey:string;chatHmac:string;
 whapiMessageId:string;apiState:'api_accepted'|'uncertain'|'failed';
 apiAcceptedAtMs:number;body:string;bodySha256:string;
 version:string;invitationCreatedAtMs:number;
}>;
export type RespuestaOriginalesD016=Readonly<{
 requestId:string;supplierKey:string;chatHmac:string;
 messageHmac:string;sourceSha256:string;receivedAtMs:number;
 whapiAuthenticada:boolean;vinculoRondaVerificado:boolean;
 hayCotizacion:boolean;reenviado:boolean;solicitaNoCompartir:boolean;
 association:'quoted_whapi_id'|'single_active_round'|'prior_supplier_preamble'|
  'semantic_unique_mvp291'|'unresolved';
 quotedWhapiMessageId:string|null;
 rondaUnicaVerificada:boolean;
}>;
export type ContextoOriginalesD016=Readonly<{
 requestId:string;supplierKey:string;chatHmac:string;
 proveedorActivo:boolean;proveedorConsentimientoGeneral:boolean;
 revokedAtMs:number|null;requestCreatedAtMs:number;
 closesAtMs:number;policyActivatedAtMs:number;nowMs:number;
}>;
export type PruebaOriginalesD016=Readonly<{
 requestId:string;supplierKey:string;messageHmac:string;
 avisoVersion:typeof AVISO_ORIGINALES_D016_VERSION;
 avisoBodySha256:string;avisoWhapiMessageId:string;
 avisoAceptadoPorApiMs:number;respuestaAutenticadaMs:number;
}>;

async function sha256(s:string):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
/** Prueba preliminar no autoritativa: SOLO datos recuperados del servidor.
 * La autorización real exige comparar esta evidencia con tablas inmutables:
 * dispatch Whapi, aviso registrado, whapi_inbox, enlace de ronda y revocaciones.
 * NO es permiso para habilitar share_policy, consultar o descargar originales.
 */
export async function validarRespuestaComoConsentimientoD016(
 c:ContextoOriginalesD016,d:DespachoOriginalesD016,r:RespuestaOriginalesD016
):Promise<PruebaOriginalesD016|null>{
 if(!c||!d||!r||!UUID.test(c.requestId)||!KEY.test(c.supplierKey)||
  !SHA.test(c.chatHmac)||c.proveedorActivo!==true||
  c.proveedorConsentimientoGeneral!==true||c.revokedAtMs!==null||
  !TS(c.requestCreatedAtMs)||!TS(c.closesAtMs)||
  !TS(c.policyActivatedAtMs)||!TS(c.nowMs)||
  c.requestCreatedAtMs<c.policyActivatedAtMs||
  c.closesAtMs<=c.requestCreatedAtMs||c.nowMs<c.requestCreatedAtMs||
  d.requestId!==c.requestId||d.supplierKey!==c.supplierKey||
  d.chatHmac!==c.chatHmac||d.apiState!=='api_accepted'||
  d.version!==AVISO_ORIGINALES_D016_VERSION||
  !ID.test(d.whapiMessageId)||!SHA.test(d.bodySha256)||
  !TS(d.invitationCreatedAtMs)||!TS(d.apiAcceptedAtMs)||
  d.invitationCreatedAtMs<c.requestCreatedAtMs||
  d.apiAcceptedAtMs<d.invitationCreatedAtMs||
  d.apiAcceptedAtMs>c.closesAtMs||
  r.requestId!==c.requestId||r.supplierKey!==c.supplierKey||
  r.chatHmac!==c.chatHmac||!SHA.test(r.messageHmac)||
  !SHA.test(r.sourceSha256)||r.messageHmac===d.bodySha256||
  r.whapiAuthenticada!==true||r.vinculoRondaVerificado!==true||
  r.hayCotizacion!==true||r.reenviado!==false||
  r.solicitaNoCompartir!==false||!TS(r.receivedAtMs)||
  r.receivedAtMs<=d.apiAcceptedAtMs||r.receivedAtMs>c.closesAtMs||
  r.receivedAtMs>c.nowMs||r.association==='unresolved')return null;
 const quoted=r.association==='quoted_whapi_id'&&
  r.quotedWhapiMessageId===d.whapiMessageId;
 const unambiguous=r.association==='single_active_round'&&
  r.rondaUnicaVerificada===true&&r.quotedWhapiMessageId===null;
 if(!quoted&&!unambiguous)return null;
 if(typeof d.body!=='string'||
  !d.body.endsWith(SEPARADOR+AVISO_ORIGINALES_D016)||
  d.body.slice(0,-(SEPARADOR+AVISO_ORIGINALES_D016).length).trim().length<1||
  (await sha256(d.body))!==d.bodySha256)return null;
 return Object.freeze({requestId:c.requestId,supplierKey:c.supplierKey,
  messageHmac:r.messageHmac,
  avisoVersion:AVISO_ORIGINALES_D016_VERSION,
  avisoBodySha256:d.bodySha256,avisoWhapiMessageId:d.whapiMessageId,
  avisoAceptadoPorApiMs:d.apiAcceptedAtMs,
  respuestaAutenticadaMs:r.receivedAtMs});
}
