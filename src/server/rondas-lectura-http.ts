/**
 * D025: solo lectura de ronda propia desde servidor.
 * No autentica JWT por sí mismo: la dependencia utiliza SSR getUser().
 * La RPC revalida session_id contra auth.sessions y membresía ACTUAL en PostgreSQL.
 */
export type ActorLectura={userId:string;emailVerificado:boolean;anonimo:boolean};
export type ResumenRonda=Readonly<{
  round_id:string;round_status:'programada'|'abierta'|'cerrada'|'cancelada';
  begins_at:string;ends_at:string;
  items:readonly Readonly<{
    line_no:number;product_code:string;quantity:string;
    unit:'unit'|'bag'|'box'|'kg'|'g'|'l'|'ml'|'m'|'m2'|'m3'|'roll'|'pack';
  }>[];
}>;
export type DependenciasLecturaRonda={
  habilitado:boolean;
  verificarSesion:()=>Promise<ActorLectura|null>;
  leerPropia:(roundId:string)=>Promise<unknown>;
};
const HDR={'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
  'vary':'Cookie, Authorization','x-content-type-options':'nosniff'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE=/^[a-z][a-z0-9_]{2,49}$/;
const QTY=/^(?:0|[1-9]\d{0,14})\.\d{3}$/;
const UNITS=new Set(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
const STAGES=new Set(['programada','abierta','cerrada','cancelada']);
function response(status:number,payload:Record<string,unknown>):Response{
  return new Response(JSON.stringify(payload),{status,headers:HDR});
}
function exact(o:unknown,keys:readonly string[]):o is Record<string,unknown>{
  return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
    Object.keys(o).length===keys.length&&
    Object.keys(o).every(k=>keys.includes(k));
}
function goodDate(v:unknown):boolean{
  return typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:\+00:00|Z)$/.test(v)&&
    Number.isFinite(Date.parse(v));
}
function validate(raw:unknown,expected:string):raw is ResumenRonda{
  if(!exact(raw,['round_id','round_status','begins_at','ends_at','items']))return false;
  if(typeof raw.round_id!=='string'||raw.round_id.toLowerCase()!==expected.toLowerCase()||
    !STAGES.has(String(raw.round_status))||!goodDate(raw.begins_at)||
    !goodDate(raw.ends_at)||!Array.isArray(raw.items)||
    raw.items.length===0||raw.items.length>8)return false;
  const n=new Set<number>();
  for(const item of raw.items){
    if(!exact(item,['line_no','product_code','quantity','unit'])||
      !Number.isInteger(item.line_no)||Number(item.line_no)<1||
      Number(item.line_no)>8||n.has(Number(item.line_no))||
      typeof item.product_code!=='string'||!CODE.test(item.product_code)||
      typeof item.quantity!=='string'||!QTY.test(item.quantity)||
      typeof item.unit!=='string'||!UNITS.has(item.unit))return false;
    n.add(Number(item.line_no));
  }
  return true;
}
export function rondasLecturaHabilitada(env:Record<string,string|undefined>):boolean{
  return env.COTIRONDA_ROUNDS_READ_ENABLED==='true'&&
    env.COTIRONDA_REGISTRATION_ENABLED==='false'&&
    env.VERCEL_ENV==='preview'&&
    env.COTIRONDA_SUPABASE_PROJECT_REF==='qkercsoqhehbenbbncwk'&&
    env.NEXT_PUBLIC_SUPABASE_URL==='https://qkercsoqhehbenbbncwk.supabase.co'&&
    Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))&&
    !env.SUPABASE_SERVICE_ROLE_KEY&&!env.COTIRONDA_DATABASE_URL;
}
export async function procesarLecturaRonda(
  req:Request,roundId:string,deps:DependenciasLecturaRonda
):Promise<Response>{
  if(!deps.habilitado)return response(503,{error:'rondas_no_disponibles'});
  if(req.method!=='GET')return response(405,{error:'metodo_no_permitido'});
  if(!UUID.test(roundId))return response(400,{error:'ronda_invalida'});
  let actor:ActorLectura|null;
  try{actor=await deps.verificarSesion()}
  catch{return response(503,{error:'autenticacion_no_disponible'})}
  if(!actor||!UUID.test(actor.userId)||!actor.emailVerificado||actor.anonimo)
    return response(401,{error:'sesion_no_valida'});
  try{
    const raw=await deps.leerPropia(roundId);
    if(raw===null)return response(404,{error:'ronda_no_encontrada'});
    if(!validate(raw,roundId))
      return response(503,{error:'lectura_no_disponible'});
    return response(200,{ronda:raw});
  }catch{
    return response(503,{error:'lectura_no_disponible'});
  }
}
