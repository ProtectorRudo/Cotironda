/** Cotironda V2-04c. Privado: analiza bytes PDF; no datos ni envíos. */
export type Evidence=Readonly<{pages:number;scanned:boolean;rows:readonly Readonly<{page:number;text:string}>[]}>;
export type Reader=(bytes:Uint8Array)=>Promise<Evidence>;
const HASH=/^[a-f0-9]{64}$/u;
const KEY=/^[A-Za-z0-9_-]{40,256}$/u;
const MAX=8*1024*1024;
const HEAD={'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store, max-age=0',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const deny=(status:number)=>new Response(JSON.stringify({state:'unavailable'}),{status,headers:HEAD});
const toHex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function sha(bytes:Uint8Array){return toHex(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes)))}
async function equalSecret(a:string,b:string){
 if(!KEY.test(a)||!KEY.test(b))return false;
 const encode=new TextEncoder();
 const [left,right]=await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(a)),
  crypto.subtle.digest('SHA-256',encode.encode(b))]);
 let difference=0;const x=new Uint8Array(left),y=new Uint8Array(right);
 for(let i=0;i<x.length;i++)difference|=x[i]^y[i];
 return difference===0;
}
async function readBounded(req:Request){
 const declared=req.headers.get('content-length');
 if(declared!==null&&(!/^\d{1,8}$/u.test(declared)||+declared<120||+declared>MAX))
  return null;
 if(!req.body)return null;
 const reader=req.body.getReader();let length=0;const parts:Uint8Array[]=[];
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   length+=value.byteLength;
   if(length>MAX){await reader.cancel().catch(()=>{});return null}
   parts.push(value);
  }
  if(length<120||(declared!==null&&Number(declared)!==length))return null;
  const bytes=new Uint8Array(length);let index=0;
  for(const part of parts){bytes.set(part,index);index+=part.length}
  return bytes;
 }finally{reader.releaseLock()}
}
/** Pure handler: test with real/synthetic PDF reader, never execute PDF JS. */
export async function resolverPdfPrivadoV2(req:Request,secret:string,reader:Reader):Promise<Response>{
 if(req.method!=='POST')return deny(405);
 if(!KEY.test(secret))return deny(503);
 const token=req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{40,256})$/u)?.[1]??'';
 if(!await equalSecret(token,secret))return deny(404);
 if(new URL(req.url).search||req.headers.get('content-type')!=='application/pdf')
  return deny(400);
 const expected=req.headers.get('x-original-sha256')??'';
 if(!HASH.test(expected))return deny(400);
 try{
  const bytes=await readBounded(req);
  if(!bytes||new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')return deny(422);
  const computed=await sha(bytes);
  if(computed!==expected)return deny(422);
  const parsed=await reader(bytes);
  if(parsed.scanned||parsed.pages<1||parsed.pages>12||parsed.rows.length<1||
   parsed.rows.length>300||parsed.rows.some(x=>x.page<1||x.page>parsed.pages||
    typeof x.text!=='string'||x.text.length>2000))return deny(422);
  const content=parsed.rows.map(x=>x.text.trim()).filter(Boolean).join('\n');
  if(content.length<40||content.length>24000||
   /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content))return deny(422);
  return new Response(JSON.stringify({state:'verified_pdf_text_v2',
   sourceSha256:computed,textSha256:await sha(new TextEncoder().encode(content)),
   pages:parsed.pages,text:content}),{status:200,headers:HEAD});
 }catch{return deny(422)}
}