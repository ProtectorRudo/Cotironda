/**
 * Adapter: one verified PILOT Auth session -> private MVP191 identity check ->
 * MVP192 server-only source -> MVP190 byte-level download.
 *
 * NO HTTP ROUTE and NO deployment. The hosting server MUST supply callbacks
 * that actually verify the cookie-bound JWT with Supabase PILOTO and check a
 * live Auth session/membership; never derive identity from URL/body.
 * The tracking link from WhatsApp is NOT an Auth credential.
 */
import {evaluarDescargaOriginalMvp161,type AccesoOriginal}
 from '../domain/descarga-originales-mvp161.ts';
import {procesarDescargaOriginalMvp190,
 type ContextoDescargaMvp190,type SesionDescargaMvp190}
 from './originales-descarga-http-mvp190.ts';
import {proyectarCatalogoOriginalesMvp192,
 type CatalogoOriginalesMvp192}
 from './catalogo-originales-comprador-mvp192.ts';

export type IdentidadAuthPiloto=SesionDescargaMvp190 & Readonly<{
 /** session_id in a cryptographically verified JWT, also present in auth.sessions */
 authSessionId:string;
}>;
export type ConsultaPrivadaOriginales=Readonly<{
 rondaId:string;usuarioId:string;authSessionId:string;documentoId:string|null;
}>;
export type DependenciasOriginalesPiloto=Readonly<{
 habilitado:boolean;ahora:()=>number;
 /** Real Supabase PILOTO Auth + current DB membership; not getSession alone */
 verificarSesionAutentica:()=>Promise<IdentidadAuthPiloto|null>;
 /** Call MVP191 using the SAME normal authenticated PILOT JWT, never service_role */
 verificarVinculoPiloto:(rondaId:string)=>Promise<boolean>;
 /** Invoke MVP192 exclusively server-side with service_role; source identity
  * arguments MUST come from verificarSesionAutentica, never the request. */
 consultarOriginalesPrivados:(q:ConsultaPrivadaOriginales)=>Promise<unknown>;
 /** Private Storage API, exact bucket/path from source-only MVP192. */
 leerArchivo:(bucket:string,ruta:string)=>Promise<Uint8Array|null>;
 /** Mandatory on PILOT: private, durable audit after SHA/source checks. */
 registrarDescarga:(e:Readonly<{
  rondaId:string;documentoId:string;usuarioId:string;empresaId:string;
  sourceSha256:string;byteCount:number
 }>)=>Promise<boolean>;
}>;

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const COMPANY=/^[a-z0-9_-]{3,100}$/u;
function obj(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function identValida(x:IdentidadAuthPiloto|null,t:number):x is IdentidadAuthPiloto{
 return !!x&&Number.isSafeInteger(t)&&t>0&&UUID.test(x.usuarioId)&&
  UUID.test(x.authSessionId)&&COMPANY.test(x.empresaId)&&
  x.autenticada===true&&x.rol==='buyer'&&
  x.identidadVerificada===true&&x.anonima===false&&
  x.revocadaMs===null&&Number.isSafeInteger(x.venceMs)&&x.venceMs>t;
}
function mismaIdentidad(a:IdentidadAuthPiloto,b:IdentidadAuthPiloto):boolean{
 return a.usuarioId===b.usuarioId&&a.empresaId===b.empresaId&&
  a.authSessionId===b.authSessionId&&a.autenticada===b.autenticada&&
  a.rol===b.rol&&a.identidadVerificada===b.identidadVerificada&&
  a.anonima===b.anonima;
}
function copy(x:Record<string,unknown>,keys:readonly string[]):Record<string,unknown>{
 return Object.fromEntries(keys.map(k=>[k,x[k]]));
}
function projectContext(raw:unknown,rondaId:string,documentoId:string,
 auth:IdentidadAuthPiloto,t:number):ContextoDescargaMvp190|null{
 if(!obj(raw)||raw.state!=='authorized_original'||
    raw.documentoId!==documentoId||!obj(raw.autorizacion))return null;
 const a=raw.autorizacion;
 if(!obj(a.ronda)||!obj(a.invitacion)||!obj(a.consentimiento)||
    !obj(a.archivo)||!obj(a.prueba))return null;
 // A response for another round, user or company is NOT repaired or reused.
 if(a.ronda.id!==rondaId||a.ronda.compradorId!==auth.usuarioId||
    a.ronda.empresaId!==auth.empresaId)return null;
 // No identity, session, role, company or timestamp may be supplied by the
 // SQL payload's 'sesion' field. Project only verified source assertions.
 const context:ContextoDescargaMvp190={
  documentoId,
  autorizacion:{
   ahoraMs:t,politicaDesdeMs:a.politicaDesdeMs,
   ronda:copy(a.ronda,['id','compradorId','empresaId','estado',
    'creadaMs','venceMs','cerradaMs']),
   sesion:{autenticada:true,rol:'buyer',usuarioId:auth.usuarioId,
    empresaId:auth.empresaId,venceMs:auth.venceMs,revocadaMs:null},
   invitacion:copy(a.invitacion,['rondaId','proveedorId','enviadaMs']),
   consentimiento:copy(a.consentimiento,['rondaId','proveedorId','alcance',
    'version','aceptadoMs','revocadoMs']),
   archivo:copy(a.archivo,['rondaId','proveedorId','mensajeHmac','bucket',
    'ruta','mime','bytes','sha256','recibidoMs','vigente','almacenado']),
   prueba:copy(a.prueba,['rondaId','proveedorId','sha256','verificada',
    'revisionVigente'])
  } as AccesoOriginal
 };
 try{
  return evaluarDescargaOriginalMvp161(context.autorizacion).permitido?
   context:null;
 }catch{return null}
}
/** A new gate per request, never shared across buyers or HTTP calls. */
function gate(deps:DependenciasOriginalesPiloto){
 let first:IdentidadAuthPiloto|null=null;
 const verified=async():Promise<IdentidadAuthPiloto|null>=>{
  const value=await deps.verificarSesionAutentica();
  const now=deps.ahora();
  if(!identValida(value,now))return null;
  if(first&&!mismaIdentidad(first,value))return null;
  if(!first)first=value;
  return value;
 };
 const linked=async(rondaId:string):Promise<boolean>=>{
  if(!await verified())return false;
  return await deps.verificarVinculoPiloto(rondaId)===true;
 };
 const privateQuery=async(rondaId:string,documentoId:string|null)=>{
  const auth=await verified();
  if(!auth)return null;
  return await deps.consultarOriginalesPrivados({
   rondaId,usuarioId:auth.usuarioId,
   authSessionId:auth.authSessionId,documentoId
  });
 };
 return {verified,linked,privateQuery};
}
/** Only for a future authenticated buyer endpoint; no WhatsApp token accepted. */
export async function listarOriginalesPiloto(
 rondaId:string,deps:DependenciasOriginalesPiloto
):Promise<CatalogoOriginalesMvp192|null>{
 if(!deps?.habilitado||!UUID.test(rondaId))return null;
 const g=gate(deps);
 try{
  if(!await g.verified()||!await g.linked(rondaId))return null;
  const raw=await g.privateQuery(rondaId,null);
  const catalogo=proyectarCatalogoOriginalesMvp192(raw);
  if(!catalogo||!await g.verified()||!await g.linked(rondaId))return null;
  return catalogo;
 }catch{return null}
}
/** Delegates all download authorization/rehashing and revocation checks to
 * MVP190; MVP192's private source is converted to an MVP161 guard object. */
export async function descargarOriginalPiloto(
 req:Request,rondaId:string,documentoId:string,
 deps:DependenciasOriginalesPiloto
):Promise<Response>{
 // Feature flag is never controlled by a URL, client or provider.
 const g=gate(deps);
 return procesarDescargaOriginalMvp190(req,rondaId,documentoId,{
  habilitado:deps?.habilitado===true,
  ahora:deps.ahora,
  verificarSesion:async()=>{
   const x=await g.verified();
   if(!x)return null;
   const {usuarioId,empresaId,autenticada,rol,identidadVerificada,
    anonima,venceMs,revocadaMs}=x;
   return {usuarioId,empresaId,autenticada,rol,identidadVerificada,
    anonima,venceMs,revocadaMs};
  },
  verificarVinculoPiloto:g.linked,
  leerContexto:async q=>{
   const auth=await g.verified();
   if(!auth||q.usuarioId!==auth.usuarioId||
      q.empresaId!==auth.empresaId)return null;
   const raw=await g.privateQuery(q.rondaId,q.documentoId);
   return projectContext(raw,q.rondaId,q.documentoId,auth,deps.ahora());
  },
  leerArchivo:deps.leerArchivo,
  // Do not return a successful attachment without a durable audit event.
  // In the PILOT this hook cannot be omitted, unlike the standalone MVP190.
  registrarEntrega:async event=>{
   if(!deps.registrarDescarga)return false;
   return await deps.registrarDescarga(event)===true;
  }
 });
}
