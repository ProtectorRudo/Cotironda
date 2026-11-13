/** Cotironda V2-15 — sólo PILOTO, NO desplegar sin "Publicalo".
 * Supabase gateway: verify_jwt=true (el comprador presenta JWT Auth firmado).
 * Segundo factor: x-cotironda-text-internal, secreto segregado del AES.
 * No hay CORS ni almacenamiento público de textos.
 */
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {resolverTextoPrivadoV2} from './text-core.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
function namedKey(envName:string,legacyName:string):string{
 try{
  const obj=JSON.parse(Deno.env.get(envName)??'{}');
  if(obj&&typeof obj==='object'&&typeof obj.default==='string')
   return obj.default;
 }catch{/* falla cerrado si no existe fallback estándar */}
 return Deno.env.get(legacyName)??'';
}

Deno.serve(req=>{
 const url=Deno.env.get('SUPABASE_URL')??'';
 const pub=namedKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
 const secret=namedKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 const config={
  enabled:Deno.env.get('COTIRONDA_PILOT_V2_TEXT_ENABLED')==='true'&&
   url===PILOT&&pub.length>=20&&secret.length>=20,
  url,sharedSecret:Deno.env.get('COTIRONDA_PILOT_V2_TEXT_SHARED_SECRET')??'',
  aesHex:Deno.env.get('COTIRONDA_PILOT_AES_HEX')??''
 };
 // No se consultan datos, clave ni Auth si faltan los gates.
 if(!config.enabled)return new Response('unavailable',{status:503,
  headers:{'cache-control':'no-store','content-type':'text/plain'}});
 const options={auth:{autoRefreshToken:false,persistSession:false}};
 const auth=createClient(url,pub,options);
 const privateDb=createClient(url,secret,options);
 return resolverTextoPrivadoV2(req,config,{
  getUser:async jwt=>{
   const {data,error}=await auth.auth.getUser(jwt);
   if(error||!data.user)return null;
   return {
    id:data.user.id,phone:data.user.phone??null,
    phone_confirmed_at:data.user.phone_confirmed_at??null,
    is_anonymous:data.user.is_anonymous??null
   };
  },
  source:async q=>{
   const {data,error}=await privateDb.rpc(
    'cotironda_piloto_v2_original_source_private',{
     p_request_id:q.requestId,p_auth_user_id:q.authUserId,
     p_auth_session_id:q.authSessionId,p_document_id:q.documentId
    });
   if(error)return null;
   return data;
  }
 });
});
