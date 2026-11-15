import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {procesarTrabajoOfflineD016} from './worker-core.ts';
import {leerPdfOriginalPorEdgeV2} from '../../../src/server/v2-04c-pdf-edge-client.ts';
const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
function serviceKey(){
 const value=Deno.env.get('SUPABASE_SECRET_KEYS')??'{}';
 try{
  const parsed=JSON.parse(value);
  if(typeof parsed?.default==='string')return parsed.default;
 }catch{}
 return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
}
Deno.serve(req=>{
 const url=Deno.env.get('SUPABASE_URL')??'';
 const key=serviceKey();
 const config={
  enabled:url===PILOT&&Deno.env.get('COTIRONDA_PILOT_D016_WORKER_ENABLED')==='true'&&
   Deno.env.get('COTIRONDA_PILOT_D016_ENABLED')==='true',
  url,serviceKey:key,
  internalSecret:Deno.env.get('COTIRONDA_PILOT_D016_WORKER_SHARED_SECRET')??'',
  apiKey:Deno.env.get('COTIRONDA_PILOT_OPENAI_API_KEY')??'',
  aesHex:Deno.env.get('COTIRONDA_PILOT_AES_HEX')??''
 };
 if(!config.enabled)return new Response('unavailable',{status:503,headers:{'cache-control':'no-store'}});
 const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
 async function rpc(name:string,values:Record<string,unknown>){
  const result=await db.rpc(name,values);
  if(result.error)throw Error('worker_database_unavailable');
  return result.data;
 }
 return procesarTrabajoOfflineD016(req,config,{
  due:()=>rpc('cotironda_piloto_v2_d016_worker_due_private',{p_limit:1}),
  source:({requestId,documentId})=>rpc('cotironda_piloto_v2_d016_worker_source_private',
   {p_request_id:requestId,p_document_id:documentId}),
  claim:({requestId,documentId})=>rpc('cotironda_piloto_v2_d016_worker_claim_private',
   {p_request_id:requestId,p_document_id:documentId}),
  finish:async({requestId,documentId,jobToken,sourceSha256,textSha256,points,status})=>
   (await rpc('cotironda_piloto_v2_d016_worker_finish_private',
    {p_request_id:requestId,p_document_id:documentId,p_job_token:jobToken,
     p_source_sha256:sourceSha256,p_text_sha256:textSha256,
     p_points:points,p_status:status}))===true,
  readStorage:async({bucket,path})=>{
   if(bucket!=='cotironda-piloto-originals'||!/^media\/[a-f0-9]{64}$/u.test(path))return null;
   const {data,error}=await db.storage.from(bucket).download(path);
   if(error||!data||data.size<1||data.size>8388608)return null;
   const bytes=new Uint8Array(await data.arrayBuffer());
   return bytes.byteLength===data.size?bytes:null;
  },
  pdfReader:(bytes,sha)=>leerPdfOriginalPorEdgeV2(bytes,sha,{
   COTIRONDA_PILOT_SUPABASE_URL:url,
   COTIRONDA_PILOT_V2_PDF_ENABLED:Deno.env.get('COTIRONDA_PILOT_V2_PDF_ENABLED')??'false',
   COTIRONDA_PILOT_V2_PDF_SHARED_SECRET:Deno.env.get('COTIRONDA_PILOT_V2_PDF_SHARED_SECRET')??''
  })
 });
});
