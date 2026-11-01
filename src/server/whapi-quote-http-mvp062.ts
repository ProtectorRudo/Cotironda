/**
 * MVP-062 — private quote inbox processor. No Whapi sends or AI bills.
 * All configuration OFF by default and limited to protected integration
 * Preview. HTTPS caller cannot supply a sender, price, item, SQL or job.
 */
import {timingSafeEqual} from 'node:crypto';
import {crearProcesadorCotizacionesMvp062}
 from './whapi-quote-pipeline-mvp062.ts';
import type {QuoteResourcesMvp062}
 from './whapi-quote-postgres-mvp062.ts';

type Env=Readonly<Record<string,string|undefined>>;
export function habilitadoCotizadorMvp062(env:Env):boolean{
 return !!env&&env.VERCEL_ENV==='preview'&&
  env.VERCEL_GIT_COMMIT_REF==='integration/mvp-piloto-20261031'&&
  env.COTIRONDA_REGISTRATION_ENABLED!=='true'&&
  env.COTIRONDA_QUOTE_WORKER_ENABLED==='true'&&
  env.COTIRONDA_QUOTE_WORKER_PILOT_AUTHORIZED==='true';
}
function res(status:number,payload:Record<string,unknown>):Response{
 return new Response(JSON.stringify(payload),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store, max-age=0',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'x-robots-tag':'noindex, nofollow, noarchive'
 }});
}
function equal(a:string,b:string):boolean{
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
export async function atenderCotizacionesMvp062(req:Request,config:Readonly<{
 env:Env;abrirRecursos?:()=>Promise<QuoteResourcesMvp062>;
}>):Promise<Response>{
 if(req.method!=='POST')return res(405,{error:'metodo_no_permitido'});
 if(!config?.env||!habilitadoCotizadorMvp062(config.env))
  return res(503,{error:'cotizador_no_habilitado'});
 const secret=config.env.COTIRONDA_QUOTE_WORKER_SECRET;
 if(typeof secret!=='string'||secret.length<32||secret.length>256||
   secret===config.env.COTIRONDA_BUYER_WORKER_SECRET||
   secret===config.env.COTIRONDA_WHAPI_WEBHOOK_SECRET||
   secret===config.env.COTIRONDA_INVITE_SEND_SECRET)
  return res(503,{error:'cotizador_no_configurado'});
 if(!equal(req.headers.get('x-cotironda-quote-worker-key')??'',secret))
  return res(401,{error:'acceso_no_autorizado'});
 const len=req.headers.get('content-length');
 if(req.body!==null||(len!==null&&(!/^\\d+$/u.test(len)||Number(len)!==0)))
  return res(415,{error:'cuerpo_no_admitido'});
 if(typeof config.abrirRecursos!=='function')
  return res(503,{error:'cotizador_no_configurado'});
 let opened:QuoteResourcesMvp062|undefined;
 try{
  opened=await config.abrirRecursos();
  if(!opened||!opened.sql||typeof opened.verificar!=='function'||
    typeof opened.cerrar!=='function')
   throw Error('invalid_ports');
  const worker=crearProcesadorCotizacionesMvp062({
   habilitado:true,puertos:opened.sql,verificar:opened.verificar
  });
  const result=await worker.procesarLote(2);
  return res(200,{estado:'procesado',...result,mensajesEnviados:0});
 }catch{
  return res(503,{error:'cotizador_privado_no_disponible'});
 }finally{
  try{await opened?.cerrar()}catch{}
 }
}
