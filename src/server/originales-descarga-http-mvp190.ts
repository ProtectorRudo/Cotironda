/**
 * MVP190 — ORIGINAL DOCUMENT download with server-only evidence.
 *
 * This is a transport-independent HTTP handler, NOT a public route.
 * Do not wire it to a shared WhatsApp tracking bearer. Caller must prove
 * live authenticated buyer identity and matching company with independent
 * server-side authorization. The Supabase pilot does not yet have that
 * identity bridge, so habilitado MUST stay false until separately released.
 *
 * No signed Storage URLs; source bytes are SHA-256 checked immediately
 * before delivering a private attachment. No identifiers or paths in JSON.
 */
import {evaluarDescargaOriginalMvp161,
 type AccesoOriginal} from '../domain/descarga-originales-mvp161.ts';

export type SesionDescargaMvp190=Readonly<{
 usuarioId:string;empresaId:string;autenticada:true;rol:'buyer';
 identidadVerificada:true;anonima:false;
 venceMs:number;revocadaMs:null;
}>;
export type ContextoDescargaMvp190=Readonly<{
 documentoId:string;
 autorizacion:AccesoOriginal;
}>;
export type DependenciasDescargaMvp190=Readonly<{
 habilitado:boolean;
 /** Must verify live Supabase Auth + its real session + current membership. */
 verificarSesion:()=>Promise<SesionDescargaMvp190|null>;
 /** MVP191: MUST call the PILOT authenticated-JWT phone+session gate,
  * cotironda_piloto_buyer_identity_mvp191(rondaId), using the SAME
  * cookie-bound session. Never use service_role or a WhatsApp bearer. */
 verificarVinculoPiloto:(rondaId:string)=>Promise<boolean>;
 /** Resolve documentId against round AND authenticated buyer, in ONE private
  * authorized SQL query. No user supplied supplier/HMAC is trusted. */
 leerContexto:(args:Readonly<{
  rondaId:string;documentoId:string;usuarioId:string;empresaId:string
 }>)=>Promise<ContextoDescargaMvp190|null>;
 /** Private Storage ONLY. Never fetch arbitrary caller-provided URLs. */
 leerArchivo:(bucket:string,ruta:string)=>Promise<Uint8Array|null>;
 /** Host-controlled monotonic/current wall clock, NEVER client input. */
 ahora:()=>number;
 /** Optional legacy transport hook; PILOT MUST provide it. Return false on audit failure. */
 registrarEntrega?:(event:Readonly<{
  rondaId:string;documentoId:string;usuarioId:string;empresaId:string;
  sourceSha256:string;byteCount:number
 }>)=>Promise<boolean>;
}>;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UID=/^[a-z0-9_-]{3,100}$/u;
const MAX_BYTES=8388608;
const MIME_EXT:Readonly<Record<string,string>>=Object.freeze({
 'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png',
 'image/webp':'webp',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
 'text/plain':'txt','text/csv':'csv'
});
const JSON_HEADERS={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','cross-origin-resource-policy':'same-origin',
 'vary':'Cookie, Authorization'
} as const;
function failure(status:number):Response{
 // Never say if an unknown document exists or which supplier submitted it.
 const code=status===401?'sesion_no_valida':
  status===405?'metodo_no_permitido':
  status===400?'solicitud_invalida':'archivo_no_disponible';
 return new Response(JSON.stringify({error:code}),{
  status,headers:{...JSON_HEADERS,'allow':status===405?'GET':''}
 });
}
function validSession(s:SesionDescargaMvp190|null,now:number):s is SesionDescargaMvp190{
 return s!==null&&typeof s==='object'&&
  UID.test(s.usuarioId)&&UID.test(s.empresaId)&&
  s.autenticada===true&&s.rol==='buyer'&&
  s.identidadVerificada===true&&s.anonima===false&&
  Number.isSafeInteger(s.venceMs)&&s.venceMs>now&&
  s.revocadaMs===null;
}
function allowedContext(
 context:ContextoDescargaMvp190|null,
 requested:Readonly<{rondaId:string;documentoId:string}>,
 session:SesionDescargaMvp190,now:number
):context is ContextoDescargaMvp190{
 if(!context||context.documentoId!==requested.documentoId||
  !context.autorizacion||context.autorizacion.ronda?.id!==requested.rondaId)
  return false;
 const a=context.autorizacion;
 if(a.sesion?.usuarioId!==session.usuarioId||
   a.sesion?.empresaId!==session.empresaId||
   a.sesion?.rol!==session.rol||
   a.sesion?.autenticada!==true||
   a.sesion?.venceMs!==session.venceMs||
   a.sesion?.revocadaMs!==session.revocadaMs)return false;
 return evaluarDescargaOriginalMvp161({...a,ahoraMs:now}).permitido===true;
}
function sameSource(a:ContextoDescargaMvp190,b:ContextoDescargaMvp190):boolean{
 // Re-reading must not silently switch a document/ref to another supplier,
 // source revision, HMAC, policy, consent or invitation.
 const x=a.autorizacion,y=b.autorizacion;
 return a.documentoId===b.documentoId&&
  x.politicaDesdeMs===y.politicaDesdeMs&&
  x.ronda.id===y.ronda.id&&x.ronda.creadaMs===y.ronda.creadaMs&&
  x.ronda.venceMs===y.ronda.venceMs&&x.ronda.cerradaMs===y.ronda.cerradaMs&&
  x.ronda.compradorId===y.ronda.compradorId&&
  x.ronda.empresaId===y.ronda.empresaId&&
  x.invitacion.rondaId===y.invitacion.rondaId&&
  x.invitacion.proveedorId===y.invitacion.proveedorId&&
  x.invitacion.enviadaMs===y.invitacion.enviadaMs&&
  x.consentimiento?.proveedorId===y.consentimiento?.proveedorId&&
  x.consentimiento?.aceptadoMs===y.consentimiento?.aceptadoMs&&
  x.consentimiento?.version===y.consentimiento?.version&&
  x.archivo.proveedorId===y.archivo.proveedorId&&
  x.archivo.mensajeHmac===y.archivo.mensajeHmac&&
  x.archivo.ruta===y.archivo.ruta&&x.archivo.bucket===y.archivo.bucket&&
  x.archivo.mime===y.archivo.mime&&x.archivo.bytes===y.archivo.bytes&&
  x.archivo.sha256===y.archivo.sha256&&
  x.prueba.sha256===y.prueba.sha256;
}
function hex(bytes:Uint8Array):string{
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

/** No separate HEAD or list route; attachment itself is the sole output. */
export async function procesarDescargaOriginalMvp190(
 req:Request,rondaId:string,documentoId:string,
 deps:DependenciasDescargaMvp190
):Promise<Response>{
 if(!deps?.habilitado)return failure(503);
 if(req.method!=='GET')return failure(405);
 if(!UUID.test(rondaId)||!UUID.test(documentoId))return failure(400);
 try{
  if(new URL(req.url).search)return failure(400);
  const now=deps.ahora();
  if(!Number.isSafeInteger(now)||now<=0)return failure(503);
  const session=await deps.verificarSesion();
  if(!validSession(session,now))return failure(401);
  if(await deps.verificarVinculoPiloto(rondaId)!==true)return failure(404);
  const selector={rondaId,documentoId,usuarioId:session.usuarioId,
   empresaId:session.empresaId};
  const first=await deps.leerContexto(selector);
  if(!allowedContext(first,{rondaId,documentoId},session,now))
    return failure(404);
  const {archivo}=first.autorizacion;
  if(!Object.hasOwn(MIME_EXT,archivo.mime))return failure(404);
  const raw=await deps.leerArchivo(archivo.bucket,archivo.ruta);
  if(!(raw instanceof Uint8Array)||raw.byteLength!==archivo.bytes||
    raw.byteLength<1||raw.byteLength>MAX_BYTES)return failure(404);
  // Copy before hashing to avoid accidental mutation of a shared buffer.
  const bytes=new Uint8Array(raw.byteLength);
  bytes.set(raw);
  const sum=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
  if(sum!==archivo.sha256)return failure(404);

  // Recheck revocation, session and immutable source binding AFTER I/O.
  // Any concurrent opt-out or revision change blocks delivery.
  const later=deps.ahora();
  const sessionAgain=await deps.verificarSesion();
  if(!validSession(sessionAgain,later)||sessionAgain.usuarioId!==session.usuarioId||
    sessionAgain.empresaId!==session.empresaId)return failure(404);
  if(await deps.verificarVinculoPiloto(rondaId)!==true)return failure(404);
  const second=await deps.leerContexto(selector);
  if(!allowedContext(second,{rondaId,documentoId},sessionAgain,later)||
    !sameSource(first,second))return failure(404);
  // The PILOT adapter always supplies this hook. Never send verified bytes
  // if its private database audit cannot be persisted after revalidation.
  if(deps.registrarEntrega&&await deps.registrarEntrega({
   rondaId,documentoId,usuarioId:session.usuarioId,empresaId:session.empresaId,
   sourceSha256:sum,byteCount:bytes.byteLength
  })!==true)return failure(503);
  const extension=MIME_EXT[archivo.mime];
  const safeFile='cotironda-original-'+documentoId.slice(0,8)+'.'+extension;
  return new Response(bytes.buffer,{
   status:200,
   headers:{
    'content-type':archivo.mime,
    'content-length':String(bytes.byteLength),
    'content-disposition':'attachment; filename="'+safeFile+'"',
    'cache-control':JSON_HEADERS['cache-control'],
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'cross-origin-resource-policy':'same-origin',
    'content-security-policy':"default-src 'none'; sandbox",
    'vary':'Cookie, Authorization'
   }
  });
 }catch{
  // No full URL, username, supplier, hash or storage path in public errors.
  return failure(503);
 }
}
