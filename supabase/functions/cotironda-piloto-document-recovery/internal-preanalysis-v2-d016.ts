/**
 * V2 D016: reutiliza EL MISMO cron privado protegido por Vault MVP132.
 * Análisis PREVIO INTERNO; jamás autoriza a mostrar originales al comprador.
 * La única puerta de red es la recuperación cron (sello Vault verificado).
 * Las credenciales efímeras sólo protegen el puente local en memoria.
 * Datos del original únicamente en RPC service_role + Storage privada + IA.
 */
import {procesarTrabajoOfflineD016} from '../cotironda-piloto-v2-worker-d016/worker-core.ts';
import {leerPdfOriginalPorEdgeV2} from '../../../src/server/v2-04c-pdf-edge-client.ts';

type Trabajo=Readonly<{
  url:string;apiKey:string;aesHex:string;
  pdfEnabled:string;pdfSecret:string;
  rpc:(name:string,params:Record<string,unknown>)=>Promise<unknown>;
  readPrivate:(path:string)=>Promise<Uint8Array|null>;
}>;
const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const HEX64=/^[a-f0-9]{64}$/u;
const OPENAI=/^sk-[A-Za-z0-9_-]{16,}$/u;
const PRIVATE_PATH=/^media\/[a-f0-9]{64}$/u;
function secretHex(){
 const bytes=crypto.getRandomValues(new Uint8Array(48));
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export async function runPrivatePreanalysisVaultD016(
 x:Trabajo
):Promise<'off'|'idle'|'ready'|'review'|'skipped'|'unavailable'>{
 // No runtime switch can enable this on another Supabase project.
 if(x.url!==PILOT||!OPENAI.test(x.apiKey)||!HEX64.test(x.aesHex))
  return 'off';
 // Existing cron checks its Vault token BEFORE invoking this function.
 // Random headers below never leave memory; no external worker endpoint call.
 const ephemeralKey='sb_secret_'+secretHex(),ephemeralSecond=secretHex();
 const req=new Request(PILOT+'/functions/v1/cotironda-piloto-v2-worker-d016',{
  method:'POST',redirect:'error',
  headers:{'content-type':'application/json','apikey':ephemeralKey,
   'x-cotironda-d016-worker-internal':ephemeralSecond},
  body:'{}'
 });
 try{
  const result=await procesarTrabajoOfflineD016(req,{
   enabled:true,url:PILOT,serviceKey:ephemeralKey,
   internalSecret:ephemeralSecond,apiKey:x.apiKey,aesHex:x.aesHex
  },{
   due:()=>x.rpc('cotironda_piloto_v2_d016_worker_due_private',{p_limit:1}),
   source:({requestId,documentId})=>x.rpc(
    'cotironda_piloto_v2_d016_worker_source_private',
    {p_request_id:requestId,p_document_id:documentId}),
   claim:({requestId,documentId})=>x.rpc(
    'cotironda_piloto_v2_d016_worker_claim_private',
    {p_request_id:requestId,p_document_id:documentId}),
   finish:async({requestId,documentId,jobToken,sourceSha256,textSha256,points,status})=>
    (await x.rpc('cotironda_piloto_v2_d016_worker_finish_private',{
     p_request_id:requestId,p_document_id:documentId,p_job_token:jobToken,
     p_source_sha256:sourceSha256,p_text_sha256:textSha256,
     p_points:points,p_status:status
    }))===true,
   readStorage:async({bucket,path})=>
    bucket==='cotironda-piloto-originals'&&PRIVATE_PATH.test(path)
     ?x.readPrivate(path):null,
   pdfReader:(bytes,sha)=>leerPdfOriginalPorEdgeV2(bytes,sha,{
    COTIRONDA_PILOT_SUPABASE_URL:x.url,
    COTIRONDA_PILOT_V2_PDF_ENABLED:x.pdfEnabled,
    COTIRONDA_PILOT_V2_PDF_SHARED_SECRET:x.pdfSecret
   })
  });
  if(result.status!==200)return 'unavailable';
  const payload=await result.json() as {state?:string};
  return payload?.state==='ready'?'ready':
   payload?.state==='review'?'review':
   payload?.state==='idle'?'idle':'skipped';
 }catch{return 'unavailable'}
}
