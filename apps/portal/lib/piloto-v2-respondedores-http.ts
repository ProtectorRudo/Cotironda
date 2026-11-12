/** V2-03a: solo LISTADO privado, descarga aun no habilitada.
 * NO reutiliza MVP192/MVP161 (regla vieja de cierre), no envia bytes.
 */
import {createClient} from '@supabase/supabase-js';
import {responderCotizacionesV2,respuestasV2Habilitadas}
 from '../../../src/server/v2-03-respuestas-http.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const NO_SESSION={
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
} as const;

export async function responderListadoV2(req:Request,rondaId:string):Promise<Response>{
 if(!respuestasV2Habilitadas(process.env)){
  // The core produces a generic 503 without attempting Supabase/network.
  return responderCotizacionesV2(req,rondaId,{
   getUser:async()=>null,consultarPrivado:async()=>null
  },process.env);
 }
 const url=process.env.COTIRONDA_PILOT_SUPABASE_URL;
 const pub=process.env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY;
 const secret=process.env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY;
 if(url!==PILOT||!pub||!secret)
  return responderCotizacionesV2(req,rondaId,{
   getUser:async()=>null,consultarPrivado:async()=>null
  },{...process.env,COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'false'});
 return responderCotizacionesV2(req,rondaId,{
  getUser:async jwt=>{
   const auth=createClient(url,pub,{
    ...NO_SESSION,global:{headers:{Authorization:'Bearer '+jwt}}
   });
   const {data,error}=await auth.auth.getUser(jwt);
   if(error||!data.user)return null;
   return {
    id:data.user.id,phone:data.user.phone??null,
    phone_confirmed_at:data.user.phone_confirmed_at??null,
    is_anonymous:data.user.is_anonymous??null
   };
  },
  consultarPrivado:async q=>{
   const db=createClient(url,secret,NO_SESSION);
   const {data,error}=await db.rpc(
    'cotironda_piloto_v2_responders_private',{
      p_request_id:q.rondaId,
      p_auth_user_id:q.usuarioId,
      p_auth_session_id:q.sessionId
    });
   if(error)throw Error('v2_private_catalog_unavailable');
   return data;
  }
 },process.env);
}
