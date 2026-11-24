/** D016 Edge: broker INTERNO sin JWT GoTrue.
 * verify_jwt=false en config.toml porque sb_secret_ no es JWT,
 * pero el código exige DOS credenciales del servidor Next (apikey y secreto
 * segregado), más sesión D016 activa revalidada en SQL y consentimiento.
 * No acepta CORS, URL arbitraria ni material cifrado del navegador.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {resolverTextoPrivadoD016} from './text-core.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const namedKey=(envName:string,legacyName:string):string=>{
 try{
  const value=JSON.parse(Deno.env.get(envName)??'{}');
  if(value&&typeof value==='object'&&typeof value.default==='string')
   return value.default;
 }catch{}
 return Deno.env.get(legacyName)??'';
};

Deno.serve(req=>{
 const url=Deno.env.get('SUPABASE_URL')??'';
 const serviceKey=namedKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 const sharedSecret=Deno.env.get('COTIRONDA_PILOT_D016_TEXT_SHARED_SECRET')??'';
 const aesHex=Deno.env.get('COTIRONDA_PILOT_AES_HEX')??'';
 // Observabilidad privada: registrar SÓLO nombres de checks fallidos.
 // El 503 text/plain proviene de este preflight; jamás loguear valores,
 // cabeceras, contenido, identidad, SHA, contacto ni sobre cifrado.
 const checks={
  project_url:url===PILOT,
  text_enabled:Deno.env.get('COTIRONDA_PILOT_D016_TEXT_ENABLED')==='true',
  d016_enabled:/^true$/iu.test(Deno.env.get('COTIRONDA_PILOT_D016_ENABLED')??''),
  service_key:serviceKey.startsWith('sb_secret_'),
  shared_secret:/^[A-Za-z0-9_-]{40,256}$/u.test(sharedSecret)&&
   new Set(sharedSecret).size>=8,
  aes_key:/^[a-f0-9]{64}$/u.test(aesHex)&&!/^0{64}$/u.test(aesHex),
  separate_keys:sharedSecret!==serviceKey&&sharedSecret!==aesHex
 };
 const failures=Object.entries(checks)
  .filter(([,ok])=>!ok).map(([name])=>name);
 // Sólo cuando el backend intenta realmente leer texto; nunca en GET
 // ni en un healthcheck sin la cabecera interna. No se revelan valores.
 if(failures.length&&req.method==='POST'&&
  req.headers.get('content-type')==='application/json'&&
  req.headers.has('x-cotironda-d016-text-internal')){
  console.warn('cotironda_d016_text_preflight_failed',{checks:failures});
 }
 const config={
  enabled:checks.project_url&&checks.text_enabled&&
   checks.d016_enabled&&checks.service_key,
  url,serviceKey,internalSecret:sharedSecret,aesHex
 };
 if(!config.enabled)return new Response('unavailable',{status:503,
  headers:{'cache-control':'no-store','content-type':'text/plain'}});
 const db=createClient(url,serviceKey,{
  auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
 });
 return resolverTextoPrivadoD016(req,config,{
  contexto:async({requestId,sessionHmac})=>{
   const {data,error}=await db.rpc('cotironda_piloto_v2_d016_session_context_private',{
    p_request_id:requestId,p_sesion_hmac:sessionHmac
   });
   if(error)return null;
   return data;
  },
  fuente:async({requestId,documentId,sessionHmac})=>{
   const {data,error}=await db.rpc('cotironda_piloto_v2_d016_original_source_private',{
    p_request_id:requestId,p_document_id:documentId,
    p_sesion_hmac:sessionHmac
   });
   if(error)return null;
   return data;
  }
 });
});
