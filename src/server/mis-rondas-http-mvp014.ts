/**
 * MVP-014 current buyer's rounds. SQL enforces actual session + membership,
 * this layer validates and limits output, never sends company/supplier IDs.
 */
import {rondasLecturaHabilitada} from './rondas-lectura-http.ts';
import type {ActorLectura} from './rondas-lectura-http.ts';
export type RondaPropiaMvp014=Readonly<{
 round_id:string;round_status:'programada'|'abierta'|'cerrada'|'cancelada';
 begins_at:string;ends_at:string;item_count:number;
}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STATES=new Set(['programada','abierta','cerrada','cancelada']);
const FIELDS=['round_id','round_status','begins_at','ends_at','item_count'];
const HDR={'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'vary':'Cookie, Authorization','x-content-type-options':'nosniff'};
function response(status:number,obj:Record<string,unknown>):Response{
 return new Response(JSON.stringify(obj),{status,headers:HDR});
}
function valid(v:unknown):v is RondaPropiaMvp014[]{
 if(!Array.isArray(v)||v.length>40)return false;
 const seen=new Set<string>();
 for(const x of v){
  if(!x||typeof x!=='object'||Array.isArray(x)||
   Object.keys(x).length!==FIELDS.length||
   Object.keys(x).some(k=>!FIELDS.includes(k)))return false;
  const row=x as Record<string,unknown>;
  if(typeof row.round_id!=='string'||!UUID.test(row.round_id)||
    seen.has(row.round_id)||!STATES.has(String(row.round_status))||
    typeof row.begins_at!=='string'||!Number.isFinite(Date.parse(row.begins_at))||
    typeof row.ends_at!=='string'||!Number.isFinite(Date.parse(row.ends_at))||
    !Number.isSafeInteger(row.item_count)||
    Number(row.item_count)<1||Number(row.item_count)>8)return false;
  seen.add(row.round_id);
 }
 return true;
}
export async function procesarMisRondasMvp014(
 req:Request,deps:{habilitado:boolean;verificarSesion:()=>Promise<ActorLectura|null>;
 leer:()=>Promise<unknown>}
):Promise<Response>{
 if(!deps.habilitado)return response(503,{error:'rondas_no_disponibles'});
 if(req.method!=='GET')return response(405,{error:'metodo_no_permitido'});
 let actor:ActorLectura|null;
 try{actor=await deps.verificarSesion()}
 catch{return response(503,{error:'autenticacion_no_disponible'})}
 if(!actor||!UUID.test(actor.userId)||!actor.emailVerificado||actor.anonimo)
  return response(401,{error:'sesion_no_valida'});
 try{
  const list=await deps.leer();
  if(!valid(list))return response(503,{error:'rondas_no_disponibles'});
  return response(200,{rondas:list});
 }catch{return response(503,{error:'rondas_no_disponibles'});}
}
export function misRondasHabilitado(env:Record<string,string|undefined>):boolean{
 return rondasLecturaHabilitada(env);
}
