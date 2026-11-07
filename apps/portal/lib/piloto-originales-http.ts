/**
 * Future PILOT originals HTTP endpoints. Completely disabled by default;
 * registered Next.js paths are not evidence of an enabled download service.
 */
import {listarOriginalesPiloto,descargarOriginalPiloto}
 from '../../../src/server/originales-piloto-conexion-segura.ts';
import {bearerPiloto,conectarOriginalesAuthPiloto,
 originalesHTTPHabilitados}
 from '../../../src/server/originales-piloto-http-runtime.ts';
import {puertosOriginalesSupabasePiloto} from './piloto-originales-cliente.ts';

const NO_STORE={
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'content-type':'application/json; charset=utf-8',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','vary':'Authorization'
} as const;
function failure(status:number):Response{
 const error=status===401?'sesion_no_valida':
  status===400?'solicitud_invalida':
  status===405?'metodo_no_permitido':
  status===503?'funcion_no_disponible':'archivo_no_disponible';
 return new Response(JSON.stringify({error}),{status,headers:NO_STORE});
}
function ready(req:Request,rondaId:string):{
 token:string;error:null}|{token:null;error:Response}{
 if(!originalesHTTPHabilitados(process.env))
  return {token:null,error:failure(503)};
 if(req.method!=='GET')return {token:null,error:failure(405)};
 if(new URL(req.url).search)return {token:null,error:failure(400)};
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
  .test(rondaId))return {token:null,error:failure(400)};
 const token=bearerPiloto(req);
 if(!token)return {token:null,error:failure(401)};
 return {token,error:null};
}

export async function responderCatalogoOriginalesPiloto(
 req:Request,rondaId:string
):Promise<Response>{
 const r=ready(req,rondaId);
 if(r.error)return r.error;
 try{
  const ports=puertosOriginalesSupabasePiloto(r.token);
  const deps=conectarOriginalesAuthPiloto(req,rondaId,ports,true);
  const catalogo=await listarOriginalesPiloto(rondaId,deps);
  if(!catalogo)return failure(404);
  return new Response(JSON.stringify(catalogo),{status:200,headers:NO_STORE});
 }catch{return failure(503)}
}
export async function responderDescargaOriginalPiloto(
 req:Request,rondaId:string,documentoId:string
):Promise<Response>{
 const r=ready(req,rondaId);
 if(r.error)return r.error;
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
  .test(documentoId))return failure(400);
 try{
  const ports=puertosOriginalesSupabasePiloto(r.token);
  const deps=conectarOriginalesAuthPiloto(req,rondaId,ports,true);
  return await descargarOriginalPiloto(req,rondaId,documentoId,deps);
 }catch{return failure(503)}
}
