/** Cotironda V2-03b: original exacto, sin cambiar MVP190/MVP161 antiguos.
 * Port abstraction permits verified offline tests and ZERO secret in client.
 */
import {bearerPiloto,claimsDeJwtValidado,type SupabaseUserPiloto}
 from './originales-piloto-http-runtime.ts';
import {respuestasV2Habilitadas,type RespuestasEnv}
 from './v2-03-respuestas-http.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const HMAC=/^[a-f0-9]{64}$/u;
const UID=/^[a-z0-9_-]{3,100}$/u;
const MAX=8388608;
const FORMATS:Readonly<Record<string,string>>=Object.freeze({
 'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png',
 'image/webp':'webp',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
 'application/msword':'doc','application/vnd.ms-excel':'xls',
 'text/csv':'csv','text/plain':'txt'
});
const BASE_HEADERS={
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','cross-origin-resource-policy':'same-origin',
 'content-security-policy':"default-src 'none'; sandbox",
 'vary':'Authorization'
} as const;
export type FuenteOriginalV2=Readonly<{
 state:'authorized_original_v2';requestId:string;documentId:string;
 buyerKey:string;supplierKey:string;messageHmac:string;
 bucket:'cotironda-piloto-originals';path:string;
 mime:string;byteCount:number;sha256:string;
 consentAt:number;invitedAt:number;
}>;
type Identity={userId:string;sessionId:string;expiresAt:number};
export type DescargaV2Ports=Readonly<{
 getUser:(jwt:string)=>Promise<SupabaseUserPiloto|null>;
 source:(q:Readonly<{rondaId:string;documentoId:string;usuarioId:string;
  sessionId:string}>)=>Promise<unknown>;
 read:(bucket:string,path:string)=>Promise<Uint8Array|null>;
 audit:(q:Readonly<{rondaId:string;documentoId:string;usuarioId:string;
  sessionId:string;sha256:string;byteCount:number}>)=>Promise<boolean>;
}>;
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&
 typeof x==='object'&&!Array.isArray(x);
function fail(status:number):Response{
 const code=status===401?'sesion_no_valida':status===400?'solicitud_invalida':
  status===405?'metodo_no_permitido':status===503?'funcion_no_disponible':
   'archivo_no_disponible';
 return new Response(JSON.stringify({error:code}),{status,headers:{
  ...BASE_HEADERS,'content-type':'application/json; charset=utf-8'}});
}
function sourceValid(raw:unknown,rondaId:string,documentoId:string):
 FuenteOriginalV2|null{
 if(!obj(raw)||raw.state!=='authorized_original_v2'||
  raw.requestId!==rondaId||raw.documentId!==documentoId||
  typeof raw.buyerKey!=='string'||!UID.test(raw.buyerKey)||
  typeof raw.supplierKey!=='string'||!UID.test(raw.supplierKey)||
  typeof raw.messageHmac!=='string'||!HMAC.test(raw.messageHmac)||
  raw.bucket!=='cotironda-piloto-originals'||
  raw.path!=='media/'+raw.messageHmac||
  typeof raw.mime!=='string'||!Object.hasOwn(FORMATS,raw.mime)||
  typeof raw.sha256!=='string'||!HMAC.test(raw.sha256)||
  typeof raw.byteCount!=='number'||!Number.isSafeInteger(raw.byteCount)||
  raw.byteCount<1||raw.byteCount>MAX||
  typeof raw.consentAt!=='number'||!Number.isSafeInteger(raw.consentAt)||
  raw.consentAt<=0||
  typeof raw.invitedAt!=='number'||!Number.isSafeInteger(raw.invitedAt)||
  raw.invitedAt<raw.consentAt)return null;
 return raw as FuenteOriginalV2;
}
async function hex(bytes:Uint8Array):Promise<string>{
 const copy=new Uint8Array(bytes);
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',copy));
 return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
}
/** Revalidates Supabase getUser and signed JWT claims; DB source rechecks
 * live Auth session + buyer phone proof + V2 supplier consent per request. */
async function auth(jwt:string,ports:DescargaV2Ports,now:number):
 Promise<Identity|null>{
 const user=await ports.getUser(jwt);
 if(!user||!user.phone_confirmed_at||user.is_anonymous!==false||
  typeof user.phone!=='string'||!/^[+ ]?[1-9]\d{7,15}$/u.test(user.phone))
  return null;
 const claims=claimsDeJwtValidado(jwt,user.id,now);
 if(!claims)return null;
 return {userId:claims.sub,sessionId:claims.sessionId,expiresAt:claims.expiresMs};
}
/** Does NOT accept query strings, cookies or WhatsApp tracking token. */
export async function descargarOriginalV2(
 req:Request,rondaId:string,documentoId:string,
 ports:DescargaV2Ports,env:RespuestasEnv,now:()=>number=Date.now
):Promise<Response>{
 if(!respuestasV2Habilitadas(env))return fail(503);
 if(req.method!=='GET')return fail(405);
 if(!UUID.test(rondaId)||!UUID.test(documentoId)||new URL(req.url).search)
  return fail(400);
 const jwt=bearerPiloto(req);
 if(!jwt)return fail(401);
 try{
  const start=now();
  if(!Number.isSafeInteger(start)||start<1)return fail(503);
  const buyer=await auth(jwt,ports,start);
  if(!buyer)return fail(404);
  const selector={
   rondaId,documentoId,usuarioId:buyer.userId,sessionId:buyer.sessionId
  };
  const first=sourceValid(await ports.source(selector),rondaId,documentoId);
  if(!first)return fail(404);

  // Private Storage reads are bounded & hashed BEFORE bytes can leave server.
  const raw=await ports.read(first.bucket,first.path);
  if(!(raw instanceof Uint8Array)||raw.byteLength!==first.byteCount||
    raw.byteLength<1||raw.byteLength>MAX)return fail(404);
  const bytes=new Uint8Array(raw);
  const sha256=await hex(bytes);
  if(sha256!==first.sha256)return fail(404);

  // Recheck authentication, current consent and immutable evidence AFTER I/O.
  const later=now();
  const again=await auth(jwt,ports,later);
  if(!again||again.userId!==buyer.userId||
   again.sessionId!==buyer.sessionId)return fail(404);
  const second=sourceValid(await ports.source(selector),rondaId,documentoId);
  if(!second||JSON.stringify(first)!==JSON.stringify(second))return fail(404);

  // Mandatory durable audit revalidates source and consents in SQL again.
  const recorded=await ports.audit({...selector,sha256,byteCount:bytes.length});
  if(recorded!==true)return fail(503);
  const suffix=FORMATS[first.mime];
  const safeName='cotironda-original-'+documentoId.slice(0,8)+'.'+suffix;
  // Uint8Array copied into an ArrayBuffer owned by this response.
  const output=new Uint8Array(bytes.length);output.set(bytes);
  return new Response(output.buffer,{status:200,headers:{
   ...BASE_HEADERS,'content-type':first.mime,
   'content-length':String(bytes.length),
   'content-disposition':'attachment; filename="'+safeName+'"'
  }});
 }catch{return fail(503)}
}
