/** D016 Next→Supabase Edge: sólo backend, texto AES descifrado en Supabase.
 * Ninguna clave AES ni sobre cifrado viaja a Vercel o al navegador.
 */
import {createHash} from 'node:crypto';
const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const TARGET=PILOT+'/functions/v1/cotironda-piloto-v2-text-reader-d016';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const HMAC=/^[a-f0-9]{64}$/u;
const SECRET=/^[A-Za-z0-9_-]{40,256}$/u;
const KEY=/^sb_secret_[A-Za-z0-9_-]{16,}$/u;
const MAX=4000;
export type TextoD016Env=Readonly<{
 COTIRONDA_PILOT_SUPABASE_URL?:string;
 COTIRONDA_PILOT_SUPABASE_SECRET_KEY?:string;
 COTIRONDA_D016_TEXT_ENABLED?:string;
 COTIRONDA_D016_TEXT_SHARED_SECRET?:string;
}>;
export async function leerTextoOriginalEdgeD016(
 source:unknown,sessionHmac:string,
 env:TextoD016Env,fetchImpl:typeof fetch=fetch
):Promise<Uint8Array|null>{
 if(!source||typeof source!=='object'||Array.isArray(source))return null;
 const s=source as Record<string,unknown>;
 const secret=env.COTIRONDA_D016_TEXT_SHARED_SECRET??'';
 const apikey=env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY??'';
 if(s.state!=='authorized_text_v2'||
  typeof s.requestId!=='string'||!UUID.test(s.requestId)||
  typeof s.documentId!=='string'||!UUID.test(s.documentId)||
  typeof s.sha256!=='string'||!HMAC.test(s.sha256)||
  typeof sessionHmac!=='string'||!HMAC.test(sessionHmac)||
  env.COTIRONDA_PILOT_SUPABASE_URL!==PILOT||
  env.COTIRONDA_D016_TEXT_ENABLED!=='true'||
  !SECRET.test(secret)||new Set(secret).size<8||
  !KEY.test(apikey)||secret===apikey)
  return null;
 try{
  const response=await fetchImpl(TARGET,{
   method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
   headers:{
    'apikey':apikey,'x-cotironda-d016-text-internal':secret,
    'content-type':'application/json'
   },
   body:JSON.stringify({
    requestId:s.requestId,documentId:s.documentId,sessionHmac
   }),
   signal:AbortSignal.timeout(12000)
  });
  if(response.status!==200||!response.ok||
   response.headers.get('content-type')!=='application/octet-stream'||
   response.headers.get('x-original-sha256')!==s.sha256)return null;
  const len=response.headers.get('content-length');
  if(len!==null&&(!/^\d{1,4}$/u.test(len)||+len<5||+len>MAX))
   return null;
  const reader=response.body?.getReader();if(!reader)return null;
  let count=0;const chunks:Uint8Array[]=[];
  try{
   for(;;){
    const next=await reader.read();if(next.done)break;
    count+=next.value.byteLength;
    if(count>MAX){await reader.cancel().catch(()=>{});return null}
    chunks.push(next.value);
   }
  }finally{reader.releaseLock()}
  if(count<5||(len!==null&&count!==+len))return null;
  const bytes=new Uint8Array(count);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  if(createHash('sha256').update(bytes).digest('hex')!==s.sha256)
   return null;
  new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  return bytes;
 }catch{return null}
}
