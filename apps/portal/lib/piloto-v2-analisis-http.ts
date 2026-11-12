/** V2-04b: server-only Supabase port for signed-in buyer's automatic analysis.
 * No API secret goes to client. Independently audited source and claim RPC.
 */
import {createClient} from '@supabase/supabase-js';
import {bearerPiloto} from '../../../src/server/originales-piloto-http-runtime.ts';
import {respuestasV2Habilitadas} from '../../../src/server/v2-03-respuestas-http.ts';
import {analizarOriginalPorPedidoV2,type AnalysisPorts}
 from '../../../src/server/v2-04b-analisis-automatica-http.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const BUCKET='cotironda-piloto-originals';
const NO_SESSION={
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
} as const;
const DENY:AnalysisPorts={
 getUser:async()=>null,source:async()=>null,claim:async()=>null,
 read:async()=>null,finish:async()=>false
};
export async function responderAnalisisAutomaticaV2(
 req:Request,rondaId:string,documentoId:string
):Promise<Response>{
 const env=process.env;
 if(!respuestasV2Habilitadas(env)||
  env.COTIRONDA_PILOT_V2_ANALYSIS_ENABLED!=='true')
  return analizarOriginalPorPedidoV2(req,rondaId,documentoId,DENY,env);
 const token=bearerPiloto(req);
 if(!token)return analizarOriginalPorPedidoV2(req,rondaId,documentoId,DENY,env);
 const url=env.COTIRONDA_PILOT_SUPABASE_URL;
 const pub=env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY;
 const secret=env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY;
 if(url!==PILOT||!pub||!secret)
  return analizarOriginalPorPedidoV2(req,rondaId,documentoId,DENY,{
   ...env,COTIRONDA_PILOT_V2_ANALYSIS_ENABLED:'false'
  });
 const auth=createClient(url,pub,{
  ...NO_SESSION,global:{headers:{Authorization:'Bearer '+token}}
 });
 const db=createClient(url,secret,NO_SESSION);
 const ports:AnalysisPorts={
  getUser:async jwt=>{
   if(jwt!==token)return null;
   const {data,error}=await auth.auth.getUser(jwt);
   if(error||!data.user)return null;
   return {
    id:data.user.id,phone:data.user.phone??null,
    phone_confirmed_at:data.user.phone_confirmed_at??null,
    is_anonymous:data.user.is_anonymous??null
   };
  },
  source:async q=>{
   const {data,error}=await db.rpc(
    'cotironda_piloto_v2_original_source_private',{
     p_request_id:q.rondaId,p_auth_user_id:q.usuarioId,
     p_auth_session_id:q.sessionId,p_document_id:q.documentoId
    });
   if(error)throw Error('v2_analysis_source_unavailable');
   return data;
  },
  claim:async q=>{
   const {data,error}=await db.rpc(
    'cotironda_piloto_v2_analysis_claim_private',{
     p_request_id:q.rondaId,p_auth_user_id:q.usuarioId,
     p_auth_session_id:q.sessionId,p_document_id:q.documentoId
    });
   if(error)throw Error('v2_analysis_claim_unavailable');
   return data;
  },
  read:async(bucket,path)=>{
   if(bucket!==BUCKET||!/^media\/[a-f0-9]{64}$/u.test(path))
    return null;
   const {data,error}=await db.storage.from(BUCKET).download(path);
   if(error||!data||data.size<1||data.size>8388608)return null;
   return new Uint8Array(await data.arrayBuffer());
  },
  finish:async q=>{
   const {data,error}=await db.rpc(
    'cotironda_piloto_v2_analysis_finish_private',{
     p_request_id:q.rondaId,p_auth_user_id:q.usuarioId,
     p_auth_session_id:q.sessionId,p_document_id:q.documentoId,
     p_job_token:q.jobToken,p_source_sha256:q.sourceSha256,
     p_text_sha256:q.textSha256,p_points:q.points,p_status:q.status
    });
   return !error&&data===true;
  }
 };
 return analizarOriginalPorPedidoV2(req,rondaId,documentoId,ports,env);
}
