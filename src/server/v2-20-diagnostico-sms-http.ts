/** Cotironda V2-20: consulta PÚBLICA de settings GoTrue desde
 * la Preview protegida. No requiere usuario, JWT ni secret service_role.
 * NO habilita teléfono, originales, WhatsApp ni usuarios Auth.
 */
import {comprobarAuthPublicaPilotoV2}
 from './v2-18-auth-publica-preflight.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const SHA=/^[a-f0-9]{40}$/u;
const PUB=/^sb_publishable_[A-Za-z0-9_-]{15,256}$/u;
type Env=Readonly<Record<string,string|undefined>>;
const HEADERS={
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'content-type':'application/json; charset=utf-8',
 'x-content-type-options':'nosniff',
 'x-frame-options':'DENY',
 'x-robots-tag':'noindex, nofollow, noarchive',
 'referrer-policy':'no-referrer'
} as const;

export function diagnosticoSmsV2Permitido(env:Env):boolean{
 const release=env.COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA;
 return env.VERCEL_ENV==='preview'&&
  env.COTIRONDA_AUTH_PREVIEW_ENABLED==='true'&&
  env.COTIRONDA_REGISTRATION_ENABLED==='false'&&
  env.COTIRONDA_PILOT_SUPABASE_URL===PILOT&&
  env.NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_URL===PILOT&&
  typeof release==='string'&&SHA.test(release)&&
  env.VERCEL_GIT_COMMIT_SHA===release&&
  typeof env.NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY==='string'&&
  PUB.test(env.NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY);
}
function json(status:number,data:Readonly<Record<string,unknown>>):Response{
 return new Response(JSON.stringify(data),{status,headers:HEADERS});
}
/** Requiere la protección SSO activa del proyecto Vercel por separado.
 * No usa COTIRONDA_PILOT_V2_AUTH_PAGE_ENABLED porque debe poder comprobar
 * el proveedor SMS ANTES de abrir la página de ingreso.
 */
export async function responderDiagnosticoSmsV2(
 req:Request,env:Env,fetchImpl:typeof fetch=fetch
):Promise<Response>{
 if(!diagnosticoSmsV2Permitido(env))
  return json(503,{state:'BLOCKED',code:'diagnostico_preview_no_configurado'});
 if(req.method!=='GET')return json(405,{state:'BLOCKED',code:'metodo_no_permitido'});
 const parsed=new URL(req.url);
 if(parsed.search||parsed.hash)
  return json(400,{state:'BLOCKED',code:'solicitud_invalida'});
 const estado=await comprobarAuthPublicaPilotoV2(
  PILOT,env.NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY!,fetchImpl);
 // Estado generado en server: ningún dato crudo de GoTrue ni clave en JSON.
 return json(200,{
  state:estado.state,code:estado.code,
  serviceAccessible:estado.serviceAccessible,
  signupClosed:estado.signupClosed,
  phoneConfigured:estado.phoneConfigured,
  smsConfirmedByUser:false,
  writesPerformed:false
 });
}
