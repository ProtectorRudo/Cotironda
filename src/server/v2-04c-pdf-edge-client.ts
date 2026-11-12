/** V2-04c. Server-to-server PDF text from scoped Supabase Edge only.
 * Never calls public URLs, passes no phone, only authenticated original bytes.
 * The remote extractor returns text, but cannot publish it to a buyer.
 */
import {createHash} from 'node:crypto';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const TARGET=PILOT+'/functions/v1/cotironda-piloto-v2-pdf-reader';
const SHA=/^[a-f0-9]{64}$/u;
const KEY=/^[A-Za-z0-9_-]{40,256}$/u;
const MAX=8*1024*1024;
export type PdfTextSourceV2=Readonly<{
 text:string;textSha256:string;sourceSha256:string;
}>;
export type PdfClientEnvV2=Readonly<{
 COTIRONDA_PILOT_SUPABASE_URL?:string;
 COTIRONDA_PILOT_V2_PDF_ENABLED?:string;
 COTIRONDA_PILOT_V2_PDF_SHARED_SECRET?:string;
}>;
const digest=(input:Uint8Array|string)=>createHash('sha256').update(input).digest('hex');
export async function leerPdfOriginalPorEdgeV2(
 bytes:Uint8Array,shaBinario:string,
 env:PdfClientEnvV2,fetchImpl:typeof fetch=fetch
):Promise<PdfTextSourceV2|null>{
 if(!(bytes instanceof Uint8Array)||bytes.length<120||bytes.length>MAX||
  !SHA.test(shaBinario)||digest(bytes)!==shaBinario||
  env.COTIRONDA_PILOT_SUPABASE_URL!==PILOT||
  env.COTIRONDA_PILOT_V2_PDF_ENABLED!=='true'||!KEY.test(
   env.COTIRONDA_PILOT_V2_PDF_SHARED_SECRET??''))return null;
 try{
  const response=await fetchImpl(TARGET,{
   method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
   headers:{Authorization:'Bearer '+env.COTIRONDA_PILOT_V2_PDF_SHARED_SECRET,
    'Content-Type':'application/pdf','X-Original-SHA256':shaBinario},
   body:new Blob([Uint8Array.from(bytes)],{type:'application/pdf'}),
   signal:AbortSignal.timeout(15000)
  });
  if(response.status!==200||!response.ok||
   !response.headers.get('content-type')?.includes('application/json')||
   Number(response.headers.get('content-length')??0)>30000)
   return null;
  const body=await response.text();
  if(body.length>30000)return null;
  const data:unknown=JSON.parse(body);
  if(!data||typeof data!=='object'||Array.isArray(data))return null;
  const result=data as Record<string,unknown>;
  if(result.state!=='verified_pdf_text_v2'||result.sourceSha256!==shaBinario||
   typeof result.text!=='string'||result.text.length<40||
   result.text.length>24000||typeof result.textSha256!=='string'||
   !SHA.test(result.textSha256)||digest(result.text)!==result.textSha256||
   typeof result.pages!=='number'||!Number.isInteger(result.pages)||
   result.pages<1||result.pages>12||
   /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result.text))return null;
  return Object.freeze({text:result.text,
   sourceSha256:shaBinario,textSha256:result.textSha256});
 }catch{return null}
}