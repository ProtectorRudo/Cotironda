/** D016: adaptador Node/Next aislado, SIN SMS ni sesiones GoTrue falsas.
 * No se habilita sin Preview+SHA+secreto exactos ni RPC privada.
 */
import {createClient} from '@supabase/supabase-js';
import {puertaD016Lista,type PuertaD016}
 from '../../../src/server/v2-d016-enlace-whatsapp.ts';
import {canjearConSesionPrivadaD016,verificarAccesoSesionD016,
 cookieSesionD016,digestSesionPrivadaD016}
 from '../../../src/server/v2-d016-sesion-privada.ts';
import {D016_SESSION_COOKIE}
 from '../../../src/server/v2-d016-sesion-privada.ts';
import {proyectarRespuestasV2}
 from '../../../src/server/v2-03-catalogo-respondedores.ts';
import {descargarConWhatsappD016}
 from '../../../src/server/v2-d016-descarga-privada.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const NO_SESSION={
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
} as const;
const HEADERS={
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'content-type':'application/json; charset=utf-8',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','vary':'Cookie'
} as const;
type SessionCtx={buyerKey:string;requestId:string};
const uuid=(x:unknown):x is string=>typeof x==='string'&&UUID.test(x);

export function puertaWhatsappPortalD016(env:Record<string,string|undefined>):
 PuertaD016|null{
 const gate:PuertaD016={
  habilitada:env.COTIRONDA_D016_ENABLED==='true'&&
   env.COTIRONDA_REGISTRATION_ENABLED==='false'&&
   env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY?.startsWith('sb_secret_')===true,
  entorno:env.VERCEL_ENV==='preview'?'preview':
   env.VERCEL_ENV==='production'?'production':'development',
  proyectoUrl:env.COTIRONDA_PILOT_SUPABASE_URL??'',
  shaDesplegado:env.VERCEL_GIT_COMMIT_SHA??'',
  shaAprobado:env.COTIRONDA_D016_RELEASE_SHA??'',
  origenPortal:env.COTIRONDA_D016_PORTAL_ORIGIN??'',
  claveHmacHex:env.COTIRONDA_D016_HMAC_KEY_HEX??''
 };
 return puertaD016Lista(gate)?gate:null;
}
function deny(status=404):Response{
 return new Response(JSON.stringify({error:'recurso_no_disponible'}),{
  status,headers:HEADERS
 });
}
function privateDb(env:Record<string,string|undefined>){
 const url=env.COTIRONDA_PILOT_SUPABASE_URL;
 const key=env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY;
 if(url!==PILOT||!key?.startsWith('sb_secret_'))return null;
 return createClient(url,key,NO_SESSION);
}
function validContext(v:unknown,rondaId:string):SessionCtx|null{
 if(!v||typeof v!=='object'||Array.isArray(v))return null;
 const x=v as Record<string,unknown>;
 if(x.state!=='authorized_buyer_whatsapp_session'||
  typeof x.buyerKey!=='string'||!/^[a-z0-9_-]{3,100}$/u.test(x.buyerKey)||
  x.requestId!==rondaId)return null;
 return {buyerKey:x.buyerKey,requestId:rondaId};
}
async function sessionContext(
 db:NonNullable<ReturnType<typeof privateDb>>,
 sesionHmac:string,rondaId:string
):Promise<SessionCtx|null>{
 const {data,error}=await db.rpc('cotironda_piloto_v2_d016_session_context_private',{
  p_sesion_hmac:sesionHmac,p_request_id:rondaId
 });
 if(error)return null;
 return validContext(data,rondaId);
}

export async function canjearAccesoPortalD016(
 req:Request,env:Record<string,string|undefined>=process.env
):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);
 const db=gate?privateDb(env):null;
 if(!gate||!db)return deny(503);
 return canjearConSesionPrivadaD016(gate,req,{
  ahora:Date.now,
  reclamarYCrearSesion:async({ticketHmac,sesionHmac})=>{
   const {data,error}=await db.rpc('cotironda_piloto_v2_d016_claim_session_private',{
    p_ticket_hmac:ticketHmac,p_sesion_hmac:sesionHmac
   });
   return !error&&data===true;
  },
  verificarSesion:async({sesionHmac,rondaId})=>
   sessionContext(db,sesionHmac,rondaId)
 });
}

/** Solo nombres de comercios que respondieron; jamás invitados/pendientes. */
export async function listarPorWhatsappD016(
 req:Request,rondaId:string,
 env:Record<string,string|undefined>=process.env
):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);
 if(!gate)return deny(503);
 if(req.method!=='GET')return deny(405);
 if(!UUID.test(rondaId)||new URL(req.url).search)return deny(400);
 const db=privateDb(env);
 if(!db)return deny(503);
 const rawCookie=cookieSesionD016(req);
 const digest=rawCookie?digestSesionPrivadaD016(rawCookie,gate.claveHmacHex):null;
 if(!digest)return deny();
 try{
  const before=await sessionContext(db,digest,rondaId);
  if(!before)return deny();
  const {data,error}=await db.rpc('cotironda_piloto_v2_d016_responders_with_analysis_private',{
   p_request_id:rondaId,p_sesion_hmac:digest
  });
  if(error)return deny(503);
  const catalog=proyectarRespuestasV2(data);
  if(!catalog||data?.buyerKey!==before.buyerKey)return deny();
  // Protege logout/revocación entre el SELECT y la respuesta.
  const after=await sessionContext(db,digest,rondaId);
  if(!after||after.buyerKey!==before.buyerKey)return deny();
  return new Response(JSON.stringify(catalog),{status:200,headers:HEADERS});
 }catch{return deny(503)}
}

/** Descarga privada de archivos (PDF/Excel/Word/imagen/CSV).
 * Texto WhatsApp cifrado no se descifra por este canal: no eludir Edge/JWT.
 */
export async function descargarOriginalPorWhatsappD016(
 req:Request,rondaId:string,documentoId:string,
 env:Record<string,string|undefined>=process.env
):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);
 const db=gate?privateDb(env):null;
 if(!gate||!db)return deny(503);
 return descargarConWhatsappD016(gate,req,rondaId,documentoId,{
  verificarSesion:async({sesionHmac,rondaId})=>
   sessionContext(db,sesionHmac,rondaId),
  fuentePrivada:async({sesionHmac,rondaId,documentoId})=>{
   const {data,error}=await db.rpc(
    'cotironda_piloto_v2_d016_original_source_private',{
     p_request_id:rondaId,p_sesion_hmac:sesionHmac,p_document_id:documentoId
    });
   if(error)throw Error('source_unavailable');
   return data;
  },
  leerStorage:async({bucket,path})=>{
   if(bucket!=='cotironda-piloto-originals'||!/^media\/[a-f0-9]{64}$/u.test(path))
    return null;
   const {data,error}=await db.storage.from(bucket).download(path);
   if(error||!data||data.size<1||data.size>8388608)return null;
   const bytes=new Uint8Array(await data.arrayBuffer());
   return bytes.byteLength===data.size?bytes:null;
  },
  registrarAuditoria:async({sesionHmac,rondaId,documentoId,sha256,byteCount})=>{
   const {data,error}=await db.rpc(
    'cotironda_piloto_v2_d016_record_download_private',{
     p_request_id:rondaId,p_sesion_hmac:sesionHmac,
     p_document_id:documentoId,p_source_sha256:sha256,
     p_byte_count:byteCount
    });
   return !error&&data===true;
  }
 });
}

/** Logout D016: invalida la sesión en PostgreSQL ANTES de borrar cookie.
 * Con CSRF bloqueado por Origin y Sec-Fetch-Site, sin parámetros de comprador.
 */
export async function cerrarSesionPortalD016(
 req:Request,env:Record<string,string|undefined>=process.env
):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);
 const db=gate?privateDb(env):null;
 if(!gate||!db)return deny(503);
 if(req.method!=='POST')return deny(405);
 const url=new URL(req.url);
 if(url.origin!==gate.origenPortal||
  url.pathname!=='/api/piloto/v2/acceso/salir'||
  url.search!==''||url.hash!==''||
  req.headers.get('origin')!==gate.origenPortal||
  req.headers.get('sec-fetch-site')!=='same-origin')
  return deny(403);
 const cookie=cookieSesionD016(req);
 const digest=cookie?digestSesionPrivadaD016(cookie,gate.claveHmacHex):null;
 if(!digest)return deny(404);
 try{
  const {data,error}=await db.rpc('cotironda_piloto_v2_d016_logout_private',{
   p_sesion_hmac:digest
  });
  if(error||data!==true)return deny(404);
  return new Response(JSON.stringify({state:'SIGNED_OUT'}),{status:200,headers:{
   ...HEADERS,
   'set-cookie':D016_SESSION_COOKIE+
    '=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax'
  }});
 }catch{return deny(503)}
}
