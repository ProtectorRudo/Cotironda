/**
 * MVP-025 / D073. Public UI can only REQUEST a prefilled WhatsApp link.
 * The server alone runs the user's SSR RPC; SQL D072 revalidates live Auth,
 * membership and quotas. No webhook, messaging, recipient or secret here.
 */
import {autenticacionPortalHabilitada,origenSeguro}
 from './portal-entorno.ts';
import {crearEmisorEnlaceProveedorD072}
 from './whapi-supplier-self-enroll-d072.ts';
import type {ActorLectura} from './rondas-lectura-http.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const PHONE=/^[1-9][0-9]{8,14}$/u;
const JSON_HDR={
 'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'referrer-policy':'no-referrer',
 'vary':'Cookie, Authorization','x-content-type-options':'nosniff',
 'x-robots-tag':'noindex, nofollow'
};
function result(status:number,body:Record<string,unknown>):Response{
 return new Response(JSON.stringify(body),{status,headers:JSON_HDR});
}
export function habilitarPantallaAltaWhatsAppD073(
 env:Record<string,string|undefined>
):boolean{
 return env.COTIRONDA_SUPPLIER_WA_UI_ENABLED==='true'&&
  env.VERCEL_ENV==='preview'&&
  autenticacionPortalHabilitada(env)&&
  origenSeguro(env.COTIRONDA_SITE_ORIGIN)&&
  typeof env.COTIRONDA_SUPPLIER_WA_CHANNEL==='string'&&
  CHANNEL.test(env.COTIRONDA_SUPPLIER_WA_CHANNEL)&&
  typeof env.COTIRONDA_SUPPLIER_WA_BOT_NUMBER==='string'&&
  PHONE.test(env.COTIRONDA_SUPPLIER_WA_BOT_NUMBER)&&
  env.COTIRONDA_WHAPI_SEND_ENABLED!=='true'&&!env.SUPABASE_SERVICE_ROLE_KEY&&
  !env.COTIRONDA_DATABASE_URL;
}
async function leerCuerpoLimitado(req:Request):Promise<string>{
 if(!req.body)throw Error('sin_cuerpo');
 const reader=req.body.getReader();
 const parts:Uint8Array[]=[];
 let size=0;
 try{
  while(true){
   const chunk=await reader.read();
   if(chunk.done)break;
   size+=chunk.value.byteLength;
   if(size>256){await reader.cancel();throw RangeError('limite');}
   parts.push(chunk.value);
  }
 }finally{reader.releaseLock();}
 const raw=new Uint8Array(size);
 let off=0;
 for(const part of parts){raw.set(part,off);off+=part.byteLength;}
 return new TextDecoder('utf-8',{fatal:true}).decode(raw);
}
export async function procesarEnlaceAltaProveedorD073(req:Request,deps:{
 habilitado:boolean;originPermitido:string;channel:string;botNumber:string;
 verificarSesion:()=>Promise<ActorLectura|null>;
 emitir:(query:string,args:readonly unknown[])=>Promise<unknown>;
}):Promise<Response>{
 if(!deps.habilitado)return result(503,{error:'alta_whatsapp_no_disponible'});
 if(req.method!=='POST')return result(405,{error:'metodo_no_permitido'});
 const origin=req.headers.get('origin');
 if(!origenSeguro(deps.originPermitido)||origin!==deps.originPermitido||
  req.headers.get('sec-fetch-site')==='cross-site')
  return result(403,{error:'origen_no_autorizado'});
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
  req.headers.get('content-type')??''))
  return result(415,{error:'formato_no_permitido'});
 const contentLength=req.headers.get('content-length');
 if(contentLength!==null&&(!/^\d+$/u.test(contentLength)||
  Number(contentLength)>256))return result(413,{error:'solicitud_demasiado_grande'});
 let body:unknown;
 try{body=JSON.parse(await leerCuerpoLimitado(req));}
 catch(e){return e instanceof RangeError?
  result(413,{error:'solicitud_demasiado_grande'}):
  result(400,{error:'solicitud_invalida'});}
 if(body===null||typeof body!=='object'||Array.isArray(body)||
  Object.keys(body).length!==1||!Object.hasOwn(body,'supplierOrgId')||
  typeof (body as {supplierOrgId:unknown}).supplierOrgId!=='string'||
  !UUID.test((body as {supplierOrgId:string}).supplierOrgId))
  return result(400,{error:'solicitud_invalida'});
 let actor:ActorLectura|null;
 try{actor=await deps.verificarSesion()}catch{
  return result(503,{error:'autenticacion_no_disponible'});
 }
 if(!actor||!UUID.test(actor.userId)||actor.anonimo||!actor.emailVerificado)
  return result(401,{error:'sesion_no_valida'});
 try{
  const issuer=crearEmisorEnlaceProveedorD072({
   habilitado:true,channel:deps.channel,botNumber:deps.botNumber,
   emitir:deps.emitir
  });
  const link=await issuer.enlaceParaProveedor(
   (body as {supplierOrgId:string}).supplierOrgId);
  const target=new URL(link.url);
  if(target.origin!=='https://wa.me'||target.pathname!=='/'+deps.botNumber||
   target.searchParams.size!==1||!/^COTI ALTA [a-f0-9]{32}$/u.test(
    target.searchParams.get('text')??''))throw Error('invalid_outbound_link');
  return result(200,{url:link.url,venceEnSegundos:900});
 }catch{return result(503,{error:'enlace_no_disponible'})}
}
