/** Cotironda V2 D016 background analyzer. Edge ONLY; no browser session.
 * Every SQL call and original is independently gated by buyer WhatsApp proof,
 * supplier consent, pilot V2 policies and approved calendar. Max ONE offer/tick.
 * No PII, ciphertext, price list, AI response or API keys in HTTP/log output.
 */
import {obtenerTextoVerificadoV2,type PdfSourceReaderV2}
 from '../../../src/server/v2-04b-texto-original-verificado.ts';
import {analizarOriginalTextoConIAV2,type ResultadoAnalisisV2}
 from '../../../src/server/v2-04-analisis-individual.ts';
import {descifrarFuenteWorkerD016}
 from '../cotironda-piloto-v2-text-reader-d016/text-core.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const HMAC=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SERVICE=/^sb_secret_[A-Za-z0-9_-]{16,}$/u;
const INTERNAL=/^[A-Za-z0-9_-]{40,256}$/u;
const API=/^sk-[A-Za-z0-9_-]{16,}$/u;
const UUIDDOC=UUID;
const HEADER={
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'content-type':'application/json; charset=utf-8',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
 'vary':'apikey, x-cotironda-d016-worker-internal',
 'cross-origin-resource-policy':'same-origin'
} as const;
type Source=Record<string,unknown> & {
 state:'authorized_original_v2'|'authorized_text_v2';
 requestId:string;documentId:string;buyerKey:string;supplierKey:string;
 sha256:string;mime:string;
};
type Job=Readonly<{requestId:string;documentId:string;sourceSha256:string;mime:string}>;
export type WorkerD016Config=Readonly<{
 enabled:boolean;url:string;serviceKey:string;internalSecret:string;
 apiKey:string;aesHex:string;
}>;
export type WorkerD016Ports=Readonly<{
 due:()=>Promise<unknown>;
 source:(job:Pick<Job,'requestId'|'documentId'>)=>Promise<unknown>;
 claim:(job:Pick<Job,'requestId'|'documentId'>)=>Promise<unknown>;
 finish:(job:{requestId:string;documentId:string;jobToken:string;
  sourceSha256:string;textSha256:string|null;
  points:unknown;status:'ready'|'review'})=>Promise<boolean>;
 readStorage:(input:{bucket:string;path:string})=>Promise<Uint8Array|null>;
 pdfReader?:PdfSourceReaderV2;
 analyze?:(input:Parameters<typeof analizarOriginalTextoConIAV2>[0])=>
  Promise<ResultadoAnalisisV2>;
}>;
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const output=(status:number,state:string,counts?:Record<string,number>)=>
 new Response(JSON.stringify({state,...counts}),{status,headers:HEADER});
async function eqSecure(a:string,b:string){
 if(a.length!==b.length||a.length>512)return false;
 const enc=new TextEncoder();
 const [x,y]=await Promise.all([a,b].map(s=>
  crypto.subtle.digest('SHA-256',enc.encode(s).buffer as ArrayBuffer)));
 const l=new Uint8Array(x),r=new Uint8Array(y);let acc=0;
 for(let i=0;i<l.length;i++)acc|=l[i]^r[i];
 return acc===0;
}
function gateValid(c:WorkerD016Config){
 return c.enabled===true&&c.url===PILOT&&SERVICE.test(c.serviceKey)&&
  INTERNAL.test(c.internalSecret)&&new Set(c.internalSecret).size>=8&&
  c.internalSecret!==c.serviceKey&&API.test(c.apiKey)&&
  HMAC.test(c.aesHex)&&!/^0{64}$/u.test(c.aesHex);
}
function sourceOk(raw:unknown,j:Job):Source|null{
 if(!obj(raw)||!['authorized_original_v2','authorized_text_v2'].includes(
  String(raw.state))||
  raw.requestId!==j.requestId||raw.documentId!==j.documentId||
  raw.sha256!==j.sourceSha256||raw.mime!==j.mime||
  typeof raw.buyerKey!=='string'||raw.buyerKey.length<3||
  typeof raw.supplierKey!=='string'||raw.supplierKey.length<3||
  typeof raw.messageHmac!=='string'||!HMAC.test(raw.messageHmac)||
  typeof raw.consentAt!=='number'||raw.consentAt<=0||
  typeof raw.invitedAt!=='number'||raw.invitedAt<raw.consentAt)return null;
 if(raw.state==='authorized_text_v2'){
  if(raw.mime!=='text/plain'||typeof raw.chatHmac!=='string'||
   !HMAC.test(raw.chatHmac))return null;
 }else if(raw.bucket!=='cotironda-piloto-originals'||
  raw.path!=='media/'+raw.messageHmac||
  typeof raw.byteCount!=='number'||!Number.isSafeInteger(raw.byteCount)||
  raw.byteCount<1||raw.byteCount>8388608)return null;
 return raw as Source;
}
function jobOk(v:unknown):Job|null{
 if(!obj(v)||typeof v.requestId!=='string'||!UUID.test(v.requestId)||
  typeof v.documentId!=='string'||!UUIDDOC.test(v.documentId)||
  typeof v.sourceSha256!=='string'||!HMAC.test(v.sourceSha256)||
  typeof v.mime!=='string'||v.mime.length>125)return null;
 return v as Job;
}
/** Protects from URL probes, session cookies, arbitrary jobs and redeliveries.
 * Requires TWO service credentials; API key alone is not sufficient. */
export async function procesarTrabajoOfflineD016(
 req:Request,config:WorkerD016Config,ports:WorkerD016Ports
):Promise<Response>{
 if(req.method!=='POST')return output(405,'unavailable');
 if(!gateValid(config))return output(503,'disabled');
 const url=new URL(req.url);
 if(url.pathname!=='/functions/v1/cotironda-piloto-v2-worker-d016'||
  url.search!==''||url.hash!==''||
  req.headers.has('cookie')||
  !await eqSecure(req.headers.get('apikey')??'',config.serviceKey)||
  !await eqSecure(req.headers.get('x-cotironda-d016-worker-internal')??'',
   config.internalSecret))
  return output(404,'unavailable');
 // Only empty body or {}; no arbitrary target round/document from caller.
 const raw=await req.text().catch(()=>null);
 if(raw===null||raw.length>4||!['','{}'].includes(raw))
  return output(400,'invalid');
 let job:Job|null=null,token:string|null=null;
 try{
  const due=await ports.due();
  if(!Array.isArray(due)||due.length>1)
   return output(503,'unavailable');
  if(due.length===0)return output(200,'idle',{checked:0,ready:0,review:0});
  job=jobOk(due[0]);
  if(!job)return output(503,'unavailable');
  let src=sourceOk(await ports.source(job),job);
  if(!src)return output(200,'skipped',{checked:1,ready:0,review:0});
  const claim=await ports.claim(job);
  if(!obj(claim)||claim.state!=='analysis_claimed_v2'||
   claim.sourceSha256!==src.sha256||
   typeof claim.jobToken!=='string'||!UUID.test(claim.jobToken))
   return output(200,'skipped',{checked:1,ready:0,review:0});
  token=claim.jobToken;
  let result:ResultadoAnalisisV2|null=null;
  let textSha:string|null=null;
  try{
   const bytes=src.state==='authorized_text_v2'?
    await descifrarFuenteWorkerD016(src,config.aesHex):
    await ports.readStorage({bucket:src.bucket as string,path:src.path as string});
   if(bytes instanceof Uint8Array&&
    bytes.length<=(src.state==='authorized_text_v2'?4000:8388608)&&
    (src.state==='authorized_text_v2'||bytes.length===src.byteCount)){
    const verified=await obtenerTextoVerificadoV2({
     bytes,mime:src.mime,shaBinario:src.sha256,pdfReader:ports.pdfReader
    });
    if(verified){
     // No IA with stale source/consent, even if original bytes are valid.
     const before=sourceOk(await ports.source(job),job);
     if(!before||JSON.stringify(before)!==JSON.stringify(src))
      return output(200,'revoked',{checked:1,ready:0,review:0});
     textSha=verified.shaTexto;
     result=await (ports.analyze??analizarOriginalTextoConIAV2)({
      fuente:{documentoId:job.documentId,sha256:verified.shaTexto,
       tipo:'texto_extraido_de_original',fuente:verified.fuente,
       originalAutenticado:true,proveedorAutenticado:true,
       consentimientoOriginalVerificado:true,compradorAutorizado:true
      },
      apiKey:config.apiKey,model:'gpt-6-luna'
     });
    }
   }
  }catch{/* Error no bloquea original: reintentar sólo según cuota SQL. */}
  const state: 'ready'|'review'=
   result?.estado==='analisis_disponible'?'ready':'review';
  src=sourceOk(await ports.source(job),job);
  if(!src)return output(200,'revoked',{checked:1,ready:0,review:0});
  const saved=await ports.finish({
   requestId:job.requestId,documentId:job.documentId,jobToken:token,
   sourceSha256:job.sourceSha256,
   textSha256:state==='ready'?textSha:null,
   points:state==='ready'?result!.puntos:null,status:state
  });
  return output(saved?200:503,saved?state:'unavailable',{
   checked:1,ready:saved&&state==='ready'?1:0,
   review:saved&&state==='review'?1:0
  });
 }catch{return output(503,'unavailable')}
}
