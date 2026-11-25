import {createHash,createHmac} from 'node:crypto';
import {sharedHistoryToken,verifySharedHistoryToken} from '../../../src/server/v2-shared-history-token.ts';
import {importeVisiblePesosV2} from '../../../src/server/v2-d016-resumen-comercial.ts';
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
import {proyectarPerfilComercialD022}
 from '../../../src/server/v2-d022-perfil-comercial.ts';
import {recuperarContactoVerificadoD023}
 from '../../../src/server/v2-d023-contacto-verificado.ts';

import {proyectarRespuestasV2}
 from '../../../src/server/v2-03-catalogo-respondedores.ts';
import {proyectarHistorialPrivadoD017}
 from '../../../src/server/v2-d017-historial-comprador.ts';
import {descargarConWhatsappD016,descargarArchivoCompartidoV2}
 from '../../../src/server/v2-d016-descarga-privada.ts';
import {leerTextoOriginalEdgeD016}
 from '../../../src/server/v2-d016-texto-edge-client.ts';
import {analizarOriginalWhatsAppD016}
 from '../../../src/server/v2-d016-analisis-automatica.ts';
import {leerPdfOriginalPorEdgeV2}
 from '../../../src/server/v2-04c-pdf-edge-client.ts';
import {componerInformeFinalD016}
 from '../../../src/server/v2-d016-informe-final.ts';

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
  const {data,error}=await db.rpc('cotironda_piloto_v2_d021_grouped_responders_private',{
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

/** Descarga privada de PDFs/Excel/Word/CSV y texto de proveedor.
 * El texto SOLO se descifra en Edge D016, sin clave AES en Vercel.
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
  leerTexto:async(source,sesionHmac)=>leerTextoOriginalEdgeD016(
   source,sesionHmac,{
    COTIRONDA_PILOT_SUPABASE_URL:env.COTIRONDA_PILOT_SUPABASE_URL,
    COTIRONDA_PILOT_SUPABASE_SECRET_KEY:env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY,
    COTIRONDA_D016_TEXT_ENABLED:env.COTIRONDA_D016_TEXT_ENABLED,
    COTIRONDA_D016_TEXT_SHARED_SECRET:env.COTIRONDA_D016_TEXT_SHARED_SECRET
   }),
  registrarAuditoriaTexto:async({sesionHmac,rondaId,documentoId,sha256,byteCount})=>{
   const {data,error}=await db.rpc(
    'cotironda_piloto_v2_d016_record_text_download_private',{
     p_request_id:rondaId,p_sesion_hmac:sesionHmac,
     p_document_id:documentoId,p_source_sha256:sha256,
     p_byte_count:byteCount
    });
   return !error&&data===true;
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

/** D016: POST automático desde navegador del comprador autenticado,
 * sin botones de IA; SQL limita a 3 intentos por SHA con lease de 90 s.
 * No exponer modelos, fuentes ni secretos al navegador.
 */
export async function analizarOriginalWhatsAppPortalD016(
 req:Request,rondaId:string,documentoId:string,
 env:Record<string,string|undefined>=process.env
):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);
 const db=gate?privateDb(env):null;
 if(!gate||!db)return deny(503);
 return analizarOriginalWhatsAppD016(gate,req,rondaId,documentoId,{
  habilitado:env.COTIRONDA_D016_ANALYSIS_ENABLED==='true',
  apiKey:env.COTIRONDA_PILOT_OPENAI_API_KEY??'',
  pdfHabilitado:env.COTIRONDA_PILOT_V2_PDF_ENABLED==='true',
  pdfSecret:env.COTIRONDA_PILOT_V2_PDF_SHARED_SECRET??''
 },{
  verificarSesion:async({sesionHmac,rondaId})=>
   sessionContext(db,sesionHmac,rondaId),
  fuente:async({sesionHmac,rondaId,documentoId})=>{
   const {data,error}=await db.rpc(
    'cotironda_piloto_v2_d016_original_source_private',{
     p_request_id:rondaId,p_sesion_hmac:sesionHmac,
     p_document_id:documentoId
    });
   if(error)throw Error('d016_analysis_source_failed');
   return data;
  },
  reclamar:async({sesionHmac,rondaId,documentoId})=>{
   const {data,error}=await db.rpc(
    'cotironda_piloto_v2_d016_analysis_claim_private',{
     p_request_id:rondaId,p_sesion_hmac:sesionHmac,
     p_document_id:documentoId
    });
   if(error)throw Error('d016_analysis_claim_failed');
   return data;
  },
  leerArchivo:async({bucket,path})=>{
   if(bucket!=='cotironda-piloto-originals'||
    !/^media\/[a-f0-9]{64}$/u.test(path))return null;
   const {data,error}=await db.storage.from(bucket).download(path);
   if(error||!data||data.size<40||data.size>8388608)return null;
   const bytes=new Uint8Array(await data.arrayBuffer());
   return bytes.length===data.size?bytes:null;
  },
  leerTexto:async(source,sesionHmac)=>leerTextoOriginalEdgeD016(
   source,sesionHmac,{
    COTIRONDA_PILOT_SUPABASE_URL:env.COTIRONDA_PILOT_SUPABASE_URL,
    COTIRONDA_PILOT_SUPABASE_SECRET_KEY:env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY,
    COTIRONDA_D016_TEXT_ENABLED:env.COTIRONDA_D016_TEXT_ENABLED,
    COTIRONDA_D016_TEXT_SHARED_SECRET:env.COTIRONDA_D016_TEXT_SHARED_SECRET
   }),
  leerPdf:async(bytes,sha)=>leerPdfOriginalPorEdgeV2(bytes,sha,{
   COTIRONDA_PILOT_SUPABASE_URL:env.COTIRONDA_PILOT_SUPABASE_URL,
   COTIRONDA_PILOT_V2_PDF_ENABLED:env.COTIRONDA_PILOT_V2_PDF_ENABLED,
   COTIRONDA_PILOT_V2_PDF_SHARED_SECRET:
    env.COTIRONDA_PILOT_V2_PDF_SHARED_SECRET
  }),
  finalizar:async({sesionHmac,rondaId,documentoId,jobToken,
   sourceSha256,textSha256,points,status})=>{
   const {data,error}=await db.rpc(
    'cotironda_piloto_v2_d016_analysis_finish_private',{
     p_request_id:rondaId,p_sesion_hmac:sesionHmac,
     p_document_id:documentoId,p_job_token:jobToken,
     p_source_sha256:sourceSha256,p_text_sha256:textSha256,
     p_points:points,p_status:status
    });
   return !error&&data===true;
  }
 });
}

/** Estado final SOLO después de cierre comercial válido y calendario aprobado.
 * La tabla de respondedores se vuelve a comprobar después del snapshot.
 * Nunca se calcula "ganador" ni se suman totales heterogéneos.
 */
export async function responderInformeFinalWhatsappD016(
 req:Request,rondaId:string,
 env:Record<string,string|undefined>=process.env
):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);
 const db=gate?privateDb(env):null;
 if(!gate||!db)return deny(503);
 if(req.method!=='GET')return deny(405);
 if(!UUID.test(rondaId)||new URL(req.url).search!=='')return deny(400);
 const cookie=cookieSesionD016(req);
 const digest=cookie?digestSesionPrivadaD016(cookie,gate.claveHmacHex):null;
 if(!digest)return deny();
 try{
  const before=await sessionContext(db,digest,rondaId);
  if(!before)return deny();
  const q={p_request_id:rondaId,p_sesion_hmac:digest};
  const status=await db.rpc('cotironda_piloto_v2_d016_final_status_private',q);
  if(status.error||!status.data)return deny(503);
  const state=status.data as {state?:string};
  if(state.state==='waiting_for_close')
   return new Response(JSON.stringify({estado:'ronda_en_curso'}),{
    status:202,headers:HEADERS
   });
  if(state.state!=='closed_verified_business_two_days')return deny();
  const catalogRes=await db.rpc(
   'cotironda_piloto_v2_d021_grouped_responders_private',q);
  if(catalogRes.error||!catalogRes.data)return deny(503);
  if((catalogRes.data as {buyerKey?:unknown}).buyerKey!==before.buyerKey)
   return deny();
  const catalog=proyectarRespuestasV2(catalogRes.data);
  if(!catalog)return deny();
  const after=await sessionContext(db,digest,rondaId);
  const gateAgain=await db.rpc(
   'cotironda_piloto_v2_d016_final_status_private',q);
  if(!after||after.buyerKey!==before.buyerKey||gateAgain.error||
   !gateAgain.data||(gateAgain.data as {state?:string}).state!==
    'closed_verified_business_two_days')return deny();
  const report=componerInformeFinalD016(gateAgain.data,catalog,Date.now());
  if(!report)return deny();
  return new Response(JSON.stringify(report),{status:200,headers:HEADERS});
 }catch{return deny(503)}
}


/** D017: índice de TODAS las solicitudes del comprador de la sesión D016.
 * No acepta buyerKey/phone/customerId desde cliente ni muestra invitados.
 * El detalle de cada presupuesto usa el mismo control D016 que ya funciona.
 */
export async function listarHistorialWhatsappD017(
 req:Request,env:Record<string,string|undefined>=process.env
):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);
 const db=gate?privateDb(env):null;
 if(!gate||!db)return deny(503);
 if(req.method!=='GET')return deny(405);
 const url=new URL(req.url);
 if(url.origin!==gate.origenPortal||
  url.pathname!=='/api/piloto/v2/mi-cotironda'||
  url.search!==''||url.hash!=='')return deny(400);
 const cookie=cookieSesionD016(req);
 const digest=cookie?digestSesionPrivadaD016(cookie,gate.claveHmacHex):null;
 if(!digest)return deny();
 try{
  const first=await db.rpc('cotironda_piloto_v2_d017_buyer_history_private',{
   p_sesion_hmac:digest
  });
  if(first.error)return deny(503);
  const history=proyectarHistorialPrivadoD017(first.data);
  if(!history)return deny();
  // Segundo control: logout/revocación no deja publicar una vista cacheada.
  const after=await db.rpc('cotironda_piloto_v2_d017_buyer_history_private',{
   p_sesion_hmac:digest
  });
  if(after.error||!proyectarHistorialPrivadoD017(after.data))return deny();
  return new Response(JSON.stringify(history),{status:200,headers:HEADERS});
 }catch{return deny(503)}
}

/** Recuperación de la sesión D016 desde Mi Cotironda.
 * El navegador NO elige chat, teléfono, empresa ni ronda. Solo envía un
 * POST same-origin con cookie HttpOnly; el Edge resuelve el WhatsApp cifrado.
 * Aislado y deshabilitado hasta Publicalo (doble flag portal + Edge).
 */
export async function enviarNuevoAccesoWhatsappD016(
 req:Request,env:Record<string,string|undefined>=process.env
):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);
 if(!gate||env.COTIRONDA_D016_REISSUE_ENABLED!=='true')
  return deny(503);
 const url=new URL(req.url);
 if(req.method!=='POST'||url.origin!==gate.origenPortal||
  url.pathname!=='/api/piloto/v2/mi-cotironda/enviar-acceso'||
  url.search!==''||url.hash!==''||
  req.headers.get('origin')!==gate.origenPortal||
  req.headers.get('sec-fetch-site')!=='same-origin'||
  req.headers.get('x-cotironda-reissue')!=='1')
  return deny(403);
 if((await req.text().catch(()=>'')).length!==0)return deny(400);
 const db=privateDb(env);
 const rawCookie=cookieSesionD016(req);
 const digest=rawCookie?digestSesionPrivadaD016(rawCookie,gate.claveHmacHex):null;
 if(!db||!digest)return deny();
 try{
  const first=await db.rpc('cotironda_piloto_v2_d017_buyer_history_private',{
   p_sesion_hmac:digest
  });
  if(first.error)return deny(503);
  const history=proyectarHistorialPrivadoD017(first.data);
  if(!history)return deny();
  // Elegir SIEMPRE una ronda V2 autorizada del comprador autenticado.
  const selected=history.cotizaciones.find(r=>r.ofertasDisponibles);
  if(!selected)return deny(403);
  const after=await db.rpc('cotironda_piloto_v2_d017_buyer_history_private',{
   p_sesion_hmac:digest
  });
  const again=after.error?null:proyectarHistorialPrivadoD017(after.data);
  if(!again||!again.cotizaciones.some(r=>
    r.rondaId===selected.rondaId&&r.ofertasDisponibles))return deny();
  const body=JSON.stringify({requestId:selected.rondaId,
   sessionHmac:digest,operationId:crypto.randomUUID()});
  const sentAt=String(Date.now());
  const signature=createHmac('sha256',Buffer.from(gate.claveHmacHex,'hex'))
   .update('cotironda/d016/reissue/v1\\n'+sentAt+'\\n'+body,'utf8')
   .digest('hex');
  const reply=await fetch(PILOT+'/functions/v1/cotironda-piloto-v2-reemitir-acceso',{
   method:'POST',headers:{'content-type':'application/json',
    'x-cotironda-time':sentAt,'x-cotironda-signature':signature},
   body,cache:'no-store',signal:AbortSignal.timeout(18000)
  });
  if(!reply.ok)return deny(reply.status===403?429:503);
  const state:unknown=await reply.json().catch(()=>null);
  if(!state||typeof state!=='object'||
   (state as Record<string,unknown>).state!=='api_accepted')return deny(503);
  return new Response(JSON.stringify({state:'sent'}),{
   status:200,headers:HEADERS
  });
 }catch{return deny(503)}
}

/** D016: ÚNICO comprador del piloto, SIN cookie y SIN elección de destinatario.
 * Seguro ante múltiples compradores: la RPC deniega cualquier caso ambiguo.
 * El POST anónimo solo puede pedir entregar al WhatsApp YA verificado, nunca
 * revela el teléfono ni obtiene sesión, presupuestos o buyerKey.
 * Habilitación limitada a Preview; release sigue sujeto al gate D016.
 */
export async function solicitarAccesoPilotoSinSesionD016(
 req:Request,env:Record<string,string|undefined>=process.env
):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);
 if(!gate||env.COTIRONDA_D016_REISSUE_ENABLED!=='true')
  return deny(503);
 const u=new URL(req.url);
 if(req.method!=='POST'||u.origin!==gate.origenPortal||
  u.pathname!=='/api/piloto/v2/acceso/recuperar'||
  u.search!==''||u.hash!==''||
  req.headers.get('origin')!==gate.origenPortal||
  req.headers.get('sec-fetch-site')!=='same-origin'||
  req.headers.get('x-cotironda-reissue')!=='1')
  return deny(403);
 if((await req.text().catch(()=>'')).length!==0)return deny(400);
 try{
  // Sin campos del usuario, y HMAC del servidor sobre el cuerpo exacto.
  // La firma HMAC certifica también el commit que Vercel ya aprobó en
  // puertaWhatsappPortalD016; Edge no necesita dos pins divergentes.
  const body=JSON.stringify({mode:'pilot_unique',operationId:crypto.randomUUID(),
   releaseSha:gate.shaDesplegado});
  const sentAt=String(Date.now());
  const signature=createHmac('sha256',Buffer.from(gate.claveHmacHex,'hex'))
   .update('cotironda/d016/reissue/v1\\n'+sentAt+'\\n'+body,'utf8')
   .digest('hex');
  const r=await fetch(PILOT+'/functions/v1/cotironda-piloto-v2-reemitir-acceso',{
   method:'POST',headers:{'content-type':'application/json',
    'x-cotironda-time':sentAt,'x-cotironda-signature':signature},
   body,cache:'no-store',signal:AbortSignal.timeout(18_000)
  });
  // Denegación de elegibilidad o cuota devuelve respuesta opaca;
  // fallas reales 5xx NO deben aparentar una solicitud tramitada.
  if(!r.ok&&r.status!==403&&r.status!==429)return deny(503);
  // Respuesta genérica sin confirmar existencia de comprador o número.
  // Estado de envío auditable solo internamente en Supabase.
  return new Response(JSON.stringify({state:'request_processed'}),{
   status:202,headers:HEADERS
  });
 }catch{return deny(503)}
}


/** D022: ficha individual; mismo documento autorizado que la oferta visible.
 * Ni la ruta ni el navegador eligen un supplier_key.
 */
export async function consultarPerfilComercialWhatsappD022(
 req:Request,rondaId:string,documentoId:string,
 foto=false,env:Record<string,string|undefined>=process.env
):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);
 if(!gate)return deny(503);
 if(req.method!=='GET')return deny(405);
 if(!UUID.test(rondaId)||!UUID.test(documentoId)||
  new URL(req.url).search)return deny(400);
 const db=privateDb(env);
 if(!db)return deny(503);
 const cookie=cookieSesionD016(req);
 const digest=cookie?digestSesionPrivadaD016(cookie,gate.claveHmacHex):null;
 if(!digest)return deny();
 try{
  const before=await sessionContext(db,digest,rondaId);
  if(!before)return deny();
  const {data,error}=await db.rpc('cotironda_piloto_v2_d022_profile_private',{
   p_request_id:rondaId,p_sesion_hmac:digest,p_document_id:documentoId
  });
  if(error||!data)return deny();
  const profile=proyectarPerfilComercialD022(data);
  if(!profile)return deny();
  if(foto){
   if(!profile.fotoDisponible||
    typeof data.fotoPath!=='string'||
    typeof data.supplierKey!=='string')return deny();
   const path:string=data.fotoPath;
   if(!/^proveedores\/[a-z0-9_-]{3,100}\/[a-f0-9]{64}\.(jpg|png|webp)$/u.test(path)||
     !path.startsWith('proveedores/'+data.supplierKey+'/'))return deny();
   const {data:file,error:fileError}=await db.storage
    .from('cotironda-piloto-perfiles').download(path);
   if(fileError||!file||file.size<1||file.size>1048576)return deny();
   const mime=path.endsWith('.webp')?'image/webp':
    path.endsWith('.png')?'image/png':'image/jpeg';
   if(file.type!==mime)return deny();
   // El nombre de Storage incluye SHA256. No entregar bytes sustituidos.
   const expectedSha=path.split('/').at(-1)?.split('.')[0];
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(!expectedSha||bytes.byteLength!==file.size||
    createHash('sha256').update(bytes).digest('hex')!==expectedSha)return deny();
   // Reconsultar permisos de original y consentimiento tras leer Storage:
   // una baja/revocación concurrente también cierra esta respuesta.
   const recheck=await db.rpc('cotironda_piloto_v2_d022_profile_private',{
    p_request_id:rondaId,p_sesion_hmac:digest,p_document_id:documentoId
   });
   if(recheck.error||recheck.data?.fotoPath!==path||
    !proyectarPerfilComercialD022(recheck.data)?.fotoDisponible)return deny();
   const after=await sessionContext(db,digest,rondaId);
   if(!after||after.buyerKey!==before.buyerKey)return deny();
   return new Response(file,{status:200,headers:{
    'content-type':mime,'cache-control':'private, no-store, max-age=0',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
    'cross-origin-resource-policy':'same-origin','vary':'Cookie'
   }});
  }
  const recheck=await db.rpc('cotironda_piloto_v2_d022_profile_private',{
   p_request_id:rondaId,p_sesion_hmac:digest,p_document_id:documentoId
  });
  const current=recheck.error?null:proyectarPerfilComercialD022(recheck.data);
  if(!current||JSON.stringify(current)!==JSON.stringify(profile))return deny();
  // D023: el número operativo se descifra SOLO en Edge privado y solo si
  // existe una declaración individual del propietario, no una suposición
  // derivada de cotizar. El enlace del navegador nunca indica proveedor.
  const contacto=await recuperarContactoVerificadoD023(rondaId,documentoId,digest,env);
  let whatsappUrl=current.whatsappUrl;
  if(contacto){
   const fresh=await db.rpc('cotironda_piloto_v2_d023_supplier_contact_source_private',{
    p_request_id:rondaId,p_sesion_hmac:digest,p_document_id:documentoId
   });
   if(!fresh.error&&fresh.data?.state==='authorized_contact_envelope_d023')
    whatsappUrl=contacto;
  }
  const after=await sessionContext(db,digest,rondaId);
  if(!after||after.buyerKey!==before.buyerKey)return deny();
  return new Response(JSON.stringify({...current,whatsappUrl}),{status:200,headers:HEADERS});
 }catch{return deny(503)}
}

/** Guest path is deliberately separate. Never accepts or issues a D016 session. */
const sharedHeaders={...HEADERS,'x-robots-tag':'noindex, nofollow, noarchive','vary':'Origin'};
function sharedPost(req:Request,origin:string,path:string){
 const u=new URL(req.url);
 return req.method==='POST'&&u.origin===origin&&u.pathname===path&&!u.search&&!u.hash&&
 req.headers.get('origin')===origin&&req.headers.get('sec-fetch-site')==='same-origin'&&
 req.headers.get('x-cotironda-share')==='1';
}
export async function gestionarHistorialCompartidoV2(req:Request,env:Record<string,string|undefined>=process.env):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);const db=gate?privateDb(env):null;
 if(!gate||!db)return deny(503);
 if(!sharedPost(req,gate.origenPortal,'/api/piloto/v2/mi-cotironda/compartir'))return deny(403);
 const raw=cookieSesionD016(req);const digest=raw?digestSesionPrivadaD016(raw,gate.claveHmacHex):null;
 if(!digest)return deny();
 try{
  const action=await req.text();if(!['get','create','revoke','enable-originals'].includes(action))return deny(400);
  const out=await db.rpc('cotironda_piloto_v2_manage_shared_history',{p_sesion_hmac:digest,p_action:action});
  if(out.error)return deny(503);
  if(out.data?.state==='inactive')return Response.json({state:'inactive'},{headers:sharedHeaders});
  if(out.data?.state!=='active'||typeof out.data.shareId!=='string')return deny();
  const token=sharedHistoryToken(out.data.shareId,gate.claveHmacHex);if(!token)return deny(503);
  return Response.json({state:'active',url:gate.origenPortal+'/piloto/v2/compartido#'+token,originalsEnabled:out.data.originalsEnabled===true},{headers:sharedHeaders});
 }catch{return deny(503)}
}
export async function leerHistorialCompartidoV2(req:Request,env:Record<string,string|undefined>=process.env):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);const db=gate?privateDb(env):null;
 if(!gate||!db)return deny(503);
 if(!sharedPost(req,gate.origenPortal,'/api/piloto/v2/compartido'))return deny(403);
 try{
  const body=await req.text();if(body.length>220)return deny(400);
  const parsed:unknown=JSON.parse(body);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return deny(400);
  const x=parsed as Record<string,unknown>;
  if(Object.keys(x).length!==2||!(x.rondaId===null||uuid(x.rondaId)))return deny(400);
  const shareId=verifySharedHistoryToken(x.token,gate.claveHmacHex);if(!shareId)return deny();
  const args={p_share_id:shareId,p_request_id:x.rondaId};
  const out=await db.rpc('cotironda_piloto_v2_read_shared_history',args);
  if(out.error)return deny(503);
  if(x.rondaId===null){
   const h=proyectarHistorialPrivadoD017(out.data);if(!h)return deny();
   return Response.json({estado:h.estado,cotizaciones:h.cotizaciones},{headers:sharedHeaders});
  }
  const catalog=proyectarRespuestasV2(out.data);if(!catalog)return deny();
  // IDs opacos únicamente para originales autorizados para invitados.
  // La descarga vuelve a validar el token, alcance, SHA y auditoría.
  const permitted=await db.rpc('cotironda_piloto_v2_shared_original_source',{...args,p_document_id:null});
  const ids=new Set<string>(!permitted.error&&Array.isArray(permitted.data)?permitted.data.filter(uuid):[]);
  const ofertas=catalog.respuestas.map(q=>({
   descargaId:ids.has(q.documentoId)?q.documentoId:null,
   comercio:q.comercio,formato:q.formato,
   importe:importeVisiblePesosV2(q.resumen.totalDeclarado??q.resumen.sumaCalculada),
   tipoImporte:q.resumen.totalDeclarado?q.resumen.tipoImporte:q.resumen.sumaCalculada?'Suma de renglones':'Importe no informado',
   cotizados:q.resumen.articulosCotizados,enviados:q.resumen.articulosEnviados,
   iva:q.resumen.condiciones.iva,flete:q.resumen.condiciones.flete,pago:q.resumen.condiciones.pago,
   discrepancia:q.resumen.discrepanciaTotal
  }));
  return Response.json({estado:'cotizaciones_compartidas',ofertas},{headers:sharedHeaders});
 }catch{return deny(503)}
}

export async function descargarCompartidoV2(req:Request,env:Record<string,string|undefined>=process.env):Promise<Response>{
 const gate=puertaWhatsappPortalD016(env);const db=gate?privateDb(env):null;
 if(!gate||!db)return deny(503);
 if(!sharedPost(req,gate.origenPortal,'/api/piloto/v2/compartido/descargar'))return deny(403);
 try{
  const body=await req.text();if(body.length>300)return deny(400);
  const x=JSON.parse(body) as Record<string,unknown>;
  if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==3||!uuid(x.rondaId)||!uuid(x.descargaId))return deny(400);
  const shareId=verifySharedHistoryToken(x.token,gate.claveHmacHex);if(!shareId)return deny();
  const args={p_share_id:shareId,p_request_id:x.rondaId,p_document_id:x.descargaId};
  return descargarArchivoCompartidoV2(x.rondaId,x.descargaId,{
   fuente:async()=>{
    const out=await db.rpc('cotironda_piloto_v2_shared_original_source',args);
    if(out.error)throw Error('source_unavailable');return out.data;
   },
   leerStorage:async({bucket,path})=>{
    if(bucket!=='cotironda-piloto-originals'||!/^media\/[a-f0-9]{64}$/u.test(path))return null;
    const {data,error}=await db.storage.from(bucket).download(path);
    if(error||!data||data.size<1||data.size>8388608)return null;
    const bytes=new Uint8Array(await data.arrayBuffer());return bytes.byteLength===data.size?bytes:null;
   },
   auditar:async(sha256,byteCount)=>{
    const out=await db.rpc('cotironda_piloto_v2_shared_record_download',{...args,p_source_sha256:sha256,p_byte_count:byteCount});
    return !out.error&&out.data===true;
   }
  });
 }catch{return deny(503)}
}
