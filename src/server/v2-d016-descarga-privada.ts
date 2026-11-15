/** D016: descarga de archivo original por cookie privada WhatsApp.
 * SEPARADA de la ruta GoTrue previa; jamás acepta token de seguimiento.
 * El texto se lee SOLO via Edge D016 (nunca clave AES en Next).
 */
import {createHash} from 'node:crypto';
import {puertaD016Lista,type PuertaD016}
 from './v2-d016-enlace-whatsapp.ts';
import {cookieSesionD016,digestSesionPrivadaD016}
 from './v2-d016-sesion-privada.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const HASH=/^[a-f0-9]{64}$/u;
const BUYER=/^[a-z0-9_-]{3,100}$/u;
const MAX=8388608;
const TYPES:Readonly<Record<string,string>>=Object.freeze({
 'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png',
 'image/webp':'webp',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
 'application/msword':'doc','application/vnd.ms-excel':'xls',
 'text/csv':'csv','text/plain':'txt'
});
const HEADERS={
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','cross-origin-resource-policy':'same-origin',
 'content-security-policy':"default-src 'none'; sandbox",'vary':'Cookie'
} as const;
type FuenteD016=Readonly<{
 state:'authorized_original_v2';requestId:string;documentId:string;
 buyerKey:string;supplierKey:string;messageHmac:string;
 bucket:'cotironda-piloto-originals';path:string;mime:string;
 byteCount:number;sha256:string;consentAt:number;invitedAt:number;
}>;
type FuenteTextoD016=Readonly<{
 state:'authorized_text_v2';requestId:string;documentId:string;
 buyerKey:string;supplierKey:string;messageHmac:string;chatHmac:string;
 nonceB64:string;ciphertextB64:string;sha256:string;mime:'text/plain';
 consentAt:number;invitedAt:number;
}>;
type Contexto=Readonly<{buyerKey:string;requestId:string}>;
export type DescargaWhatsappPortsD016=Readonly<{
 verificarSesion:(q:Readonly<{sesionHmac:string;rondaId:string}>)
  =>Promise<Contexto|null>;
 fuentePrivada:(q:Readonly<{sesionHmac:string;rondaId:string;documentoId:string}>)
  =>Promise<unknown>;
 leerStorage:(q:Readonly<{bucket:string;path:string}>)
  =>Promise<Uint8Array|null>;
 leerTexto?:(source:FuenteTextoD016,sessionHmac:string)
  =>Promise<Uint8Array|null>;
 registrarAuditoriaTexto?:(q:Readonly<{sesionHmac:string;rondaId:string;
  documentoId:string;sha256:string;byteCount:number}>)
  =>Promise<boolean>;
 registrarAuditoria:(q:Readonly<{sesionHmac:string;rondaId:string;
  documentoId:string;sha256:string;byteCount:number}>)
  =>Promise<boolean>;
}>;
const obj=(x:unknown):x is Record<string,unknown>=>
 !!x&&typeof x==='object'&&!Array.isArray(x);
function sourceValid(x:unknown,ronda:string,doc:string):FuenteD016|null{
 if(!obj(x)||x.state!=='authorized_original_v2'||
  x.requestId!==ronda||x.documentId!==doc||
  typeof x.buyerKey!=='string'||!BUYER.test(x.buyerKey)||
  typeof x.supplierKey!=='string'||!BUYER.test(x.supplierKey)||
  typeof x.messageHmac!=='string'||!HASH.test(x.messageHmac)||
  x.bucket!=='cotironda-piloto-originals'||
  x.path!=='media/'+x.messageHmac||
  typeof x.mime!=='string'||!Object.hasOwn(TYPES,x.mime)||
  typeof x.sha256!=='string'||!HASH.test(x.sha256)||
  typeof x.byteCount!=='number'||!Number.isSafeInteger(x.byteCount)||
  x.byteCount<1||x.byteCount>MAX||
  typeof x.consentAt!=='number'||!Number.isSafeInteger(x.consentAt)||
  x.consentAt<=0||
  typeof x.invitedAt!=='number'||!Number.isSafeInteger(x.invitedAt)||
  x.invitedAt<x.consentAt)return null;
 return x as FuenteD016;
}
function textSourceValid(x:unknown,ronda:string,doc:string):
 FuenteTextoD016|null{
 if(!obj(x)||x.state!=='authorized_text_v2'||
  x.requestId!==ronda||x.documentId!==doc||
  typeof x.buyerKey!=='string'||!BUYER.test(x.buyerKey)||
  typeof x.supplierKey!=='string'||!BUYER.test(x.supplierKey)||
  typeof x.messageHmac!=='string'||!HASH.test(x.messageHmac)||
  typeof x.chatHmac!=='string'||!HASH.test(x.chatHmac)||
  typeof x.nonceB64!=='string'||x.nonceB64.length!==16||
  typeof x.ciphertextB64!=='string'||x.ciphertextB64.length<24||
  x.ciphertextB64.length>20000||
  x.mime!=='text/plain'||
  typeof x.sha256!=='string'||!HASH.test(x.sha256)||
  typeof x.consentAt!=='number'||!Number.isSafeInteger(x.consentAt)||
  x.consentAt<=0||
  typeof x.invitedAt!=='number'||!Number.isSafeInteger(x.invitedAt)||
  x.invitedAt<x.consentAt)return null;
 return x as FuenteTextoD016;
}
function deny(status:number):Response{
 return new Response(JSON.stringify({error:'archivo_no_disponible'}),{
  status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}
 });
}
export async function descargarConWhatsappD016(
 gate:PuertaD016,req:Request,rondaId:string,documentoId:string,
 ports:DescargaWhatsappPortsD016
):Promise<Response>{
 if(!puertaD016Lista(gate))return deny(503);
 if(req.method!=='GET')return deny(405);
 if(!UUID.test(rondaId)||!UUID.test(documentoId)||
  new URL(req.url).search!=='')return deny(400);
 const rawCookie=cookieSesionD016(req);
 const sesionHmac=rawCookie?
  digestSesionPrivadaD016(rawCookie,gate.claveHmacHex):null;
 if(!sesionHmac)return deny(404);
 try{
  const ctx=await ports.verificarSesion({sesionHmac,rondaId});
  if(!ctx||!BUYER.test(ctx.buyerKey)||ctx.requestId!==rondaId)
   return deny(404);
  const q={sesionHmac,rondaId,documentoId};
  const firstRaw=await ports.fuentePrivada(q);
  const file=sourceValid(firstRaw,rondaId,documentoId);
  const text=textSourceValid(firstRaw,rondaId,documentoId);
  if((!file&&!text)||(file??text)!.buyerKey!==ctx.buyerKey)
   return deny(404);
  if(text&&(!ports.leerTexto||!ports.registrarAuditoriaTexto))
   return deny(503);
  const bytes=text?await ports.leerTexto!(text,sesionHmac):
   await ports.leerStorage({bucket:file!.bucket,path:file!.path});
  const limit=text?4000:MAX;
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<(text?5:1)||
   bytes.byteLength>limit||
   (file&&bytes.byteLength!==file.byteCount))return deny(404);
  const copied=Uint8Array.from(bytes);
  const sha=createHash('sha256').update(copied).digest('hex');
  if(sha!==(file??text)!.sha256)return deny(404);
  if(text)new TextDecoder('utf-8',{fatal:true}).decode(copied);
  // Revocaciones durante lectura/AES invalidan este pedido y su documento.
  const again=await ports.verificarSesion({sesionHmac,rondaId});
  if(!again||again.buyerKey!==ctx.buyerKey||again.requestId!==rondaId)
   return deny(404);
  const later=await ports.fuentePrivada(q);
  const second=text?textSourceValid(later,rondaId,documentoId):
   sourceValid(later,rondaId,documentoId);
  if(!second||JSON.stringify(firstRaw)!==JSON.stringify(second))
   return deny(404);
  const proof={...q,sha256:sha,byteCount:copied.byteLength};
  const audited=text?await ports.registrarAuditoriaTexto!(proof):
   await ports.registrarAuditoria(proof);
  if(audited!==true)return deny(503);
  const mime=text?'text/plain':file!.mime;
  const name='cotironda-original-'+documentoId.slice(0,8)+'.'+TYPES[mime];
  const output=new Uint8Array(copied.length);output.set(copied);
  return new Response(output.buffer,{status:200,headers:{
   ...HEADERS,'content-type':mime,
   'content-length':String(output.length),
   'content-disposition':'attachment; filename="'+name+'"'
  }});
 }catch{return deny(503)}
}
