/**
 * MVP-060 — PREVIEW-only private worker tick for buyer WhatsApp queue.
 * Separate from Whapi inbound webhook. No scheduler, transport or sender.
 * No body or caller-supplied channel, customer, job ID or SQL is accepted.
 */
import {timingSafeEqual} from 'node:crypto';
import {crearRecorridoCompradorWhatsAppMvp059}
 from './buyer-whatsapp-pipeline-mvp059.ts';
import type {PuertosSqlCompradorMvp059}
 from './buyer-whatsapp-pipeline-mvp059.ts';
import type {EntradaCifradaCompradorMvp042}
 from './whapi-crypto-broker.ts';

type Env=Readonly<Record<string,string|undefined>>;
type Decoded=Readonly<{
 tipo:'text'|'image'|'document'|'audio'|'voice';
 texto:string|null;marcaTiempoUnix:number;
}>;
export type RecursosWorkerMvp060=Readonly<{
 sql:PuertosSqlCompradorMvp059;
 verificarContenidoComprador:(e:EntradaCifradaCompradorMvp042)=>Decoded;
 cerrar:()=>Promise<void>;
}>;
const CH=/^[A-Za-z0-9_-]{4,64}$/u;
function respuesta(status:number,payload:Record<string,unknown>):Response{
 return new Response(JSON.stringify(payload),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store, max-age=0',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'x-robots-tag':'noindex, nofollow, noarchive'
 }});
}
function equalSafe(got:string,want:string):boolean{
 const a=Buffer.from(got),b=Buffer.from(want);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export function habilitadoWorkerCompradorMvp060(env:Env):boolean{
 return !!env&&env.VERCEL_ENV==='preview'&&
  env.VERCEL_GIT_COMMIT_REF==='integration/mvp-piloto-20261031'&&
  env.COTIRONDA_REGISTRATION_ENABLED!=='true'&&
  env.COTIRONDA_BUYER_WORKER_ENABLED==='true'&&
  env.COTIRONDA_BUYER_WORKER_PILOT_AUTHORIZED==='true';
}
export async function atenderTickCompradorMvp060(req:Request,cfg:Readonly<{
 env:Env;abrirRecursos?:()=>Promise<RecursosWorkerMvp060>;
}>):Promise<Response>{
 if(req.method!=='POST')return respuesta(405,{error:'metodo_no_permitido'});
 if(!cfg?.env||!habilitadoWorkerCompradorMvp060(cfg.env))
  return respuesta(503,{error:'worker_no_habilitado'});
 const secret=cfg.env.COTIRONDA_BUYER_WORKER_SECRET;
 const channel=cfg.env.COTIRONDA_WHAPI_CHANNEL;
 if(typeof secret!=='string'||secret.length<32||secret.length>256||
    typeof channel!=='string'||!CH.test(channel))
  return respuesta(503,{error:'worker_no_configurado'});
 if(!equalSafe(req.headers.get('x-cotironda-worker-key')??'',secret))
  return respuesta(401,{error:'acceso_no_autorizado'});
 const cl=req.headers.get('content-length');
 if(cl!==null&&(!/^\d+$/u.test(cl)||cl!=='0'&&Number(cl)!==0)||
    req.body!==null)return respuesta(415,{error:'cuerpo_no_admitido'});
 if(typeof cfg.abrirRecursos!=='function')
  return respuesta(503,{error:'worker_no_configurado'});
 let resource:RecursosWorkerMvp060|undefined;
 try{
  resource=await cfg.abrirRecursos();
  if(!resource||!resource.sql||
    typeof resource.verificarContenidoComprador!=='function'||
    typeof resource.cerrar!=='function')throw Error('worker_invalid');
  const work=crearRecorridoCompradorWhatsAppMvp059({
   habilitado:true,canal:channel,
   sql:resource.sql,
   verificarContenidoComprador:resource.verificarContenidoComprador
  });
  // Fixed upper bound: no message loops of unbounded runtime or cost.
  const result=await work.procesarLote(3);
  return respuesta(200,{estado:'ejecutado',...result,mensajesEnviados:0});
 }catch{
  // Do not expose database credentials, encrypted contents or any identifiers.
  return respuesta(503,{error:'worker_privado_no_disponible'});
 }finally{
  try{await resource?.cerrar()}catch{/* A committed ACK must not be replayed. */}
 }
}
