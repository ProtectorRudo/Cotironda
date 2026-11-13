/** Cotironda V2-15: cliente PRIVADO para leer texto WhatsApp.
 * La clave AES histórica sigue únicamente en Supabase; Vercel tiene solo
 * un secreto segregado de alcance reducido para este lector Edge.
 */
import {createHash} from 'node:crypto';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const TARGET=PILOT+'/functions/v1/cotironda-piloto-v2-text-reader';
const SHA=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const KEY=/^[A-Za-z0-9_-]{40,256}$/u;
const JWT=/^[A-Za-z0-9_-]{2,1024}\.[A-Za-z0-9_-]{10,3072}\.[A-Za-z0-9_-]{20,1024}$/u;
const MAX=4000;

export type TextoEdgeEnvV2=Readonly<{
 COTIRONDA_PILOT_SUPABASE_URL?:string;
 COTIRONDA_PILOT_V2_TEXT_ENABLED?:string;
 COTIRONDA_PILOT_V2_TEXT_SHARED_SECRET?:string;
}>;

/** Sin URL, nonce, ciphertext ni clave AES elegidos por el comprador.
 * El broker hace una segunda autorización SQL con el JWT de la sesión.
 */
export async function leerTextoOriginalPorEdgeV2(
 source:unknown,jwt:string,env:TextoEdgeEnvV2,fetchImpl:typeof fetch=fetch
):Promise<Uint8Array|null>{
 if(!source||typeof source!=='object'||Array.isArray(source))return null;
 const s=source as Record<string,unknown>;
 const secret=env.COTIRONDA_PILOT_V2_TEXT_SHARED_SECRET??'';
 if(s.state!=='authorized_text_v2'||
  typeof s.requestId!=='string'||!UUID.test(s.requestId)||
  typeof s.documentId!=='string'||!UUID.test(s.documentId)||
  typeof s.sha256!=='string'||!SHA.test(s.sha256)||
  typeof jwt!=='string'||!JWT.test(jwt)||jwt.length>4096||
  env.COTIRONDA_PILOT_SUPABASE_URL!==PILOT||
  env.COTIRONDA_PILOT_V2_TEXT_ENABLED!=='true'||!KEY.test(secret))
  return null;
 try{
  const response=await fetchImpl(TARGET,{
   method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
   headers:{Authorization:'Bearer '+jwt,
    'X-Cotironda-Text-Internal':secret,'Content-Type':'application/json'},
   body:JSON.stringify({requestId:s.requestId,documentId:s.documentId}),
   signal:AbortSignal.timeout(12000)
  });
  if(response.status!==200||!response.ok||
   response.headers.get('content-type')!=='application/octet-stream'||
   response.headers.get('x-original-sha256')!==s.sha256)return null;
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d{1,4}$/u.test(length)||+length<5||+length>MAX))
   return null;
  const reader=response.body?.getReader();
  if(!reader)return null;
  let total=0;const chunks:Uint8Array[]=[];
  try{
   while(true){
    const next=await reader.read();
    if(next.done)break;
    total+=next.value.byteLength;
    if(total>MAX){await reader.cancel().catch(()=>{});return null}
    chunks.push(next.value);
   }
  }finally{reader.releaseLock()}
  if(total<5||(length!==null&&total!==+length))return null;
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  if(createHash('sha256').update(bytes).digest('hex')!==s.sha256)return null;
  new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  return bytes;
 }catch{return null}
}
