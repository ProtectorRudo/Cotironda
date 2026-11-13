/** Only server-side: PILOT Auth and private Storage. No signed URLs.
 * Always disable without preview SHA flag; never import in browser.
 */
import {createClient} from '@supabase/supabase-js';
import {bearerPiloto} from '../../../src/server/originales-piloto-http-runtime.ts';
import {respuestasV2Habilitadas} from '../../../src/server/v2-03-respuestas-http.ts';
import {descargarOriginalV2,type DescargaV2Ports}
 from '../../../src/server/v2-03b-descarga-originales.ts';
import {descifrarTextoWhatsAppV2}
 from '../../../src/server/v2-14-texto-whatsapp-cifrado.ts';

const URL_PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const BUCKET='cotironda-piloto-originals';
const NO_SESSION={
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
} as const;
const DENY:DescargaV2Ports={
 getUser:async()=>null,source:async()=>null,read:async()=>null,
 audit:async()=>false
};
export async function responderDescargaV2(
 req:Request,rondaId:string,documentoId:string
):Promise<Response>{
 const env=process.env;
 if(!respuestasV2Habilitadas(env))
  return descargarOriginalV2(req,rondaId,documentoId,DENY,env);
 const jwt=bearerPiloto(req);
 if(!jwt)return descargarOriginalV2(req,rondaId,documentoId,DENY,env);
 const url=env.COTIRONDA_PILOT_SUPABASE_URL;
 const pub=env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY;
 const secret=env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY;
 if(url!==URL_PILOT||!pub||!secret)
  return descargarOriginalV2(req,rondaId,documentoId,DENY,{
   ...env,COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'false'
  });
 const buyer=createClient(url,pub,{
  ...NO_SESSION,global:{headers:{Authorization:'Bearer '+jwt}}
 });
 const privateClient=createClient(url,secret,NO_SESSION);
 const ports:DescargaV2Ports={
  getUser:async token=>{
   if(token!==jwt)return null;
   const {data,error}=await buyer.auth.getUser(jwt);
   if(error||!data.user)return null;
   return {
    id:data.user.id,phone:data.user.phone??null,
    phone_confirmed_at:data.user.phone_confirmed_at??null,
    is_anonymous:data.user.is_anonymous??null
   };
  },
  source:async q=>{
   const {data,error}=await privateClient.rpc(
    'cotironda_piloto_v2_original_source_private',{
     p_request_id:q.rondaId,p_auth_user_id:q.usuarioId,
     p_auth_session_id:q.sessionId,p_document_id:q.documentoId
    });
   if(error)throw Error('fuente_v2_no_disponible');
   return data;
  },
  read:async(bucket,path)=>{
   if(bucket!==BUCKET||!/^media\/[a-f0-9]{64}$/u.test(path))
    return null;
   const {data,error}=await privateClient.storage.from(BUCKET)
    .download(path);
   if(error||!data||data.size<1||data.size>8388608)return null;
   const bytes=new Uint8Array(await data.arrayBuffer());
   return bytes.length===data.size?bytes:null;
  },
  readText:async source=>descifrarTextoWhatsAppV2(
   source,env.COTIRONDA_PILOT_AES_HEX),
  auditText:async q=>{
   const {data,error}=await privateClient.rpc(
    'cotironda_piloto_v2_record_text_download',{
     p_request_id:q.rondaId,p_auth_user_id:q.usuarioId,
     p_auth_session_id:q.sessionId,p_document_id:q.documentoId,
     p_source_sha256:q.sha256,p_byte_count:q.byteCount
    });
   return !error&&data===true;
  },
  audit:async q=>{
   const {data,error}=await privateClient.rpc(
    'cotironda_piloto_v2_record_download',{
     p_request_id:q.rondaId,p_auth_user_id:q.usuarioId,
     p_auth_session_id:q.sessionId,p_document_id:q.documentoId,
     p_source_sha256:q.sha256,p_byte_count:q.byteCount
    });
   return !error&&data===true;
  }
 };
 return descargarOriginalV2(req,rondaId,documentoId,ports,env);
}
