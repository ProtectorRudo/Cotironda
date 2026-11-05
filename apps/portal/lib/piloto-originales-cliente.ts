/**
 * Node.js-only PILOT Supabase adapters for original documents.
 * Never import this module from client components; never pass secret keys to
 * browser code. DEV Auth and DEV PostgREST are deliberately NOT referenced.
 */
import {createClient} from '@supabase/supabase-js';
import type {PilotoOriginalesPorts,SupabaseUserPiloto}
 from '../../../src/server/originales-piloto-http-runtime.ts';
import type {ConsultaPrivadaOriginales}
 from '../../../src/server/originales-piloto-conexion-segura.ts';

const PILOT_URL='https://ilggkalaafhtiysyzlmg.supabase.co';
const STORAGE_BUCKET='cotironda-piloto-originals';
const NO_SESSION={
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
} as const;

/** Caller MUST check originalesHTTPHabilitados(process.env) first. */
export function puertosOriginalesSupabasePiloto(
 jwt:string
):PilotoOriginalesPorts{
 const url=process.env.COTIRONDA_PILOT_SUPABASE_URL;
 const pub=process.env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY;
 const secret=process.env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY;
 if(url!==PILOT_URL||!pub?.startsWith('sb_publishable_')||
    !secret?.startsWith('sb_secret_'))
  throw new Error('piloto_originales_no_configurado');
 // The buyer JWT only applies to the ordinary Auth/RPC client.
 const buyer=createClient(url,pub,{
  ...NO_SESSION,global:{headers:{Authorization:'Bearer '+jwt}}
 });
 // The privileged key is never shared with the buyer client.
 const privateClient=createClient(url,secret,NO_SESSION);
 return {
  getUser:async accessToken=>{
   if(accessToken!==jwt)return null;
   const {data,error}=await buyer.auth.getUser(jwt);
   if(error||!data.user)return null;
   return {
    id:data.user.id,phone:data.user.phone??null,
    phone_confirmed_at:data.user.phone_confirmed_at??null,
    is_anonymous:data.user.is_anonymous??null
   } satisfies SupabaseUserPiloto;
  },
  buyerIdentity:async(accessToken,rondaId)=>{
   if(accessToken!==jwt)return false;
   const {data,error}=await buyer.rpc('cotironda_piloto_buyer_identity_mvp191',
    {p_request_id:rondaId});
   return !error&&data===true;
  },
  privateOriginals:async(q:ConsultaPrivadaOriginales)=>{
   const {data,error}=await privateClient.rpc(
    'cotironda_piloto_originals_private_mvp192',{
     p_request_id:q.rondaId,
     p_auth_user_id:q.usuarioId,
     p_auth_session_id:q.authSessionId,
     p_document_id:q.documentoId
    });
   if(error)throw new Error('originales_fuente_no_disponible');
   return data;
  },
  auditOriginal:async q=>{
   const {data,error}=await privateClient.rpc(
    'cotironda_piloto_record_original_download_mvp201',{
     p_request_id:q.rondaId,
     p_auth_user_id:q.usuarioId,
     p_auth_session_id:q.authSessionId,
     p_document_id:q.documentoId,
     p_source_sha256:q.sourceSha256,
     p_byte_count:q.byteCount
    });
   return !error&&data===true;
  },
  readOriginal:async(bucket,path)=>{
   if(bucket!==STORAGE_BUCKET||
      !/^media\/[a-f0-9]{64}$/u.test(path))return null;
   const {data,error}=await privateClient.storage.from(STORAGE_BUCKET)
    .download(path);
   if(error||!data||data.size<1||data.size>8388608)return null;
   const bytes=new Uint8Array(await data.arrayBuffer());
   return bytes.byteLength===data.size?bytes:null;
  }
 };
}
