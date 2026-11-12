/** Pilot V2 responses API boundary, separated from OLD post-close downloads.
 * Backend ONLY. No WhatsApp tracking token grants Auth or Storage access.
 */
import {bearerPiloto,claimsDeJwtValidado,type SupabaseUserPiloto}
 from './originales-piloto-http-runtime.ts';
import {proyectarRespuestasV2} from './v2-03-catalogo-respondedores.ts';

const URL='https://ilggkalaafhtiysyzlmg.supabase.co';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const HEADERS={
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'content-type':'application/json; charset=utf-8','referrer-policy':'no-referrer',
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'vary':'Authorization'
} as const;
export type RespuestasEnv=Record<string,string|undefined>;
export type RespuestasPorts=Readonly<{
 /** Must validate token using Supabase PILOT getUser(jwt), not getSession. */
 getUser:(jwt:string)=>Promise<SupabaseUserPiloto|null>;
 /** Service-role PRIVATE RPC, arguments only from the verified token. */
 consultarPrivado:(q:Readonly<{
  rondaId:string;usuarioId:string;sessionId:string;
 }>)=>Promise<unknown>;
}>;
export function respuestasV2Habilitadas(env:RespuestasEnv):boolean{
 const sha=env.COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA;
 return env.COTIRONDA_PILOT_V2_RESPONDERS_ENABLED==='true'&&
  env.VERCEL_ENV==='preview'&&env.COTIRONDA_REGISTRATION_ENABLED==='false'&&
  env.COTIRONDA_PILOT_SUPABASE_URL===URL&&
  env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')===true&&
  env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY?.startsWith('sb_secret_')===true&&
  typeof sha==='string'&&SHA.test(sha)&&env.VERCEL_GIT_COMMIT_SHA===sha;
}
function failure(status:number):Response{
 const msg=status===401?'sesion_no_valida':
  status===400?'solicitud_invalida':
  status===405?'metodo_no_permitido':
  status===503?'funcion_no_disponible':'recurso_no_disponible';
 return new Response(JSON.stringify({error:msg}),{
  status,headers:HEADERS
 });
}
/** No userId/company/session received from browser inputs. */
export async function responderCotizacionesV2(
 req:Request,rondaId:string,ports:RespuestasPorts,
 env:RespuestasEnv,now:()=>number=Date.now
):Promise<Response>{
 if(!respuestasV2Habilitadas(env))return failure(503);
 if(req.method!=='GET')return failure(405);
 if(new URL(req.url).search||!UUID.test(rondaId))return failure(400);
 const jwt=bearerPiloto(req);
 if(!jwt)return failure(401);
 try{
  const user=await ports.getUser(jwt);
  if(!user||!user.phone_confirmed_at||
     user.is_anonymous!==false||typeof user.phone!=='string'||
     !/^\+?[1-9]\d{7,15}$/u.test(user.phone))return failure(404);
  const claims=claimsDeJwtValidado(jwt,user.id,now());
  if(!claims)return failure(404);
  const raw=await ports.consultarPrivado({
   rondaId,usuarioId:claims.sub,sessionId:claims.sessionId
  });
  const catalogo=proyectarRespuestasV2(raw);
  if(!catalogo)return failure(404);
  return new Response(JSON.stringify(catalogo),{status:200,headers:HEADERS});
 }catch{return failure(503)}
}
