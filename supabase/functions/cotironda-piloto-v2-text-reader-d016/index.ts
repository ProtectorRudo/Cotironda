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
 const config={
  enabled:url===PILOT&&
   Deno.env.get('COTIRONDA_PILOT_D016_TEXT_ENABLED')==='true'&&
   Deno.env.get('COTIRONDA_PILOT_D016_ENABLED')==='true'&&
   serviceKey.startsWith('sb_secret_'),
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
