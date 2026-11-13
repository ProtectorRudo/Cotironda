/** D016: lectura de texto WhatsApp bajo sesión PRIVADA; NO JWT falso.
 * El AES de Whapi permanece EXCLUSIVAMENTE en Supabase Edge.
 * No desplegar sin Preview+release y «Publicalo».
 */
export type TextoD016Config=Readonly<{
 enabled:boolean;url:string;internalSecret:string;
 serviceKey:string;aesHex:string;
}>;
export type TextoD016Ports=Readonly<{
 contexto:(q:Readonly<{sessionHmac:string;requestId:string}>)
  =>Promise<unknown>;
 fuente:(q:Readonly<{sessionHmac:string;requestId:string;documentId:string}>)
  =>Promise<unknown>;
}>;
const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const HMAC=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const KEY=/^[A-Za-z0-9_-]{40,256}$/u;
const AES=/^[a-f0-9]{64}$/u;
const HEAD={
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'content-security-policy':"default-src 'none'; sandbox",
 'content-type':'application/json; charset=utf-8',
 'referrer-policy':'no-referrer',
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'vary':'apikey, X-Cotironda-D016-Text-Internal',
 'cross-origin-resource-policy':'same-origin'
} as const;
const no=(code:number)=>new Response(JSON.stringify({state:'unavailable'}),{
 status:code,headers:HEAD
});
type Context={buyerKey:string;requestId:string};
type Source={
 state:'authorized_text_v2';requestId:string;documentId:string;
 buyerKey:string;supplierKey:string;messageHmac:string;chatHmac:string;
 nonceB64:string;ciphertextB64:string;mime:'text/plain';sha256:string;
 consentAt:number;invitedAt:number;
};
const object=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const BUYER=/^[a-z0-9_-]{3,100}$/u;

function configOk(c:TextoD016Config){
 return c.enabled===true&&c.url===PILOT&&KEY.test(c.internalSecret)&&
  new Set(c.internalSecret).size>=8&&
  /^sb_secret_[A-Za-z0-9_-]{16,}$/u.test(c.serviceKey)&&
  AES.test(c.aesHex)&&!/^0{64}$/u.test(c.aesHex)&&
  c.internalSecret!==c.serviceKey&&c.internalSecret!==c.aesHex;
}
/** Timing-safe comparison of the two backend-only credentials. */
async function secretMatch(raw:string,expected:string):Promise<boolean>{
 if(typeof raw!=='string'||raw.length!==expected.length||
  raw.length>512)return false;
 const enc=new TextEncoder();
 const [a,b]=await Promise.all([raw,expected].map(v=>
  crypto.subtle.digest('SHA-256',enc.encode(v).buffer as ArrayBuffer)));
 const left=new Uint8Array(a),right=new Uint8Array(b);
 let mismatch=0;
 for(let i=0;i<left.length;i++)mismatch|=left[i]^right[i];
 return mismatch===0;
}
async function limitedBody(req:Request):Promise<Record<string,unknown>|null>{
 const raw=req.headers.get('content-length');
 if(raw!==null&&(!/^\d{1,3}$/u.test(raw)||+raw>512))return null;
 const reader=req.body?.getReader();
 if(!reader)return null;
 let n=0;const parts:Uint8Array[]=[];
 try{
  for(;;){
   const x=await reader.read();
   if(x.done)break;
   n+=x.value.length;
   if(n>512){await reader.cancel().catch(()=>{});return null}
   parts.push(x.value);
  }
 }finally{reader.releaseLock()}
 if(n<45||(raw!==null&&n!==+raw))return null;
 const bytes=new Uint8Array(n);let off=0;
 for(const part of parts){bytes.set(part,off);off+=part.length}
 try{
  const data:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!object(data)||Object.keys(data).sort().join(',')!=='documentId,requestId,sessionHmac'||
   typeof data.requestId!=='string'||!UUID.test(data.requestId)||
   typeof data.documentId!=='string'||!UUID.test(data.documentId)||
   typeof data.sessionHmac!=='string'||!HMAC.test(data.sessionHmac))
   return null;
  return data;
 }catch{return null}
}
function contextOk(v:unknown,id:string):Context|null{
 if(!object(v)||v.state!=='authorized_buyer_whatsapp_session'||
  v.requestId!==id||typeof v.buyerKey!=='string'||
  !BUYER.test(v.buyerKey))return null;
 return {requestId:id,buyerKey:v.buyerKey};
}
function sourceOk(v:unknown,id:string,doc:string,buyer:string):Source|null{
 if(!object(v)||v.state!=='authorized_text_v2'||
  v.requestId!==id||v.documentId!==doc||v.buyerKey!==buyer||
  typeof v.supplierKey!=='string'||!BUYER.test(v.supplierKey)||
  v.mime!=='text/plain'||typeof v.sha256!=='string'||!HMAC.test(v.sha256)||
  typeof v.chatHmac!=='string'||!HMAC.test(v.chatHmac)||
  typeof v.messageHmac!=='string'||!HMAC.test(v.messageHmac)||
  typeof v.nonceB64!=='string'||v.nonceB64.length!==16||
  typeof v.ciphertextB64!=='string'||v.ciphertextB64.length<24||
  v.ciphertextB64.length>20000||
  typeof v.consentAt!=='number'||!Number.isSafeInteger(v.consentAt)||
  v.consentAt<=0||
  typeof v.invitedAt!=='number'||!Number.isSafeInteger(v.invitedAt)||
  v.invitedAt<v.consentAt)return null;
 return v as Source;
}
function b64(raw:string):Uint8Array|null{
 if(raw.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/u.test(raw))
  return null;
 try{
  const bytes=Uint8Array.from(atob(raw),x=>x.charCodeAt(0));
  if(btoa(String.fromCharCode(...bytes))!==raw)return null;
  return bytes;
 }catch{return null}
}
async function decrypt(s:Source,keyHex:string):Promise<Uint8Array|null>{
 try{
  const iv=b64(s.nonceB64),cipher=b64(s.ciphertextB64);
  if(!iv||iv.byteLength!==12||!cipher||cipher.byteLength<17||
   cipher.byteLength>10000)return null;
  const keyBytes=new Uint8Array(32);
  for(let i=0;i<32;i++)
   keyBytes[i]=parseInt(keyHex.slice(i*2,i*2+2),16);
  const key=await crypto.subtle.importKey(
   'raw',keyBytes.buffer as ArrayBuffer,'AES-GCM',false,['decrypt']);
  const aad=new TextEncoder().encode(s.chatHmac+'|'+s.messageHmac+'|text');
  const decrypted=await crypto.subtle.decrypt({
   name:'AES-GCM',iv:iv.buffer as ArrayBuffer,tagLength:128,
   additionalData:aad.buffer as ArrayBuffer
  },key,cipher.buffer as ArrayBuffer);
  const bytes=new Uint8Array(decrypted);
  if(bytes.byteLength<5||bytes.byteLength>4000)return null;
  const dig=await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer);
  const hash=Array.from(new Uint8Array(dig),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==s.sha256)return null;
  new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  return bytes;
 }catch{return null}
}

/** Dos verificaciones SQL; ante logout o baja durante AES NO se entregan bytes. */
export async function resolverTextoPrivadoD016(
 req:Request,config:TextoD016Config,ports:TextoD016Ports
):Promise<Response>{
 if(req.method!=='POST')return no(405);
 if(!configOk(config))return no(503);
 const url=new URL(req.url);
 if(url.search||url.hash||
  req.headers.get('content-type')!=='application/json')
  return no(400);
 if(!await secretMatch(req.headers.get('apikey')??'',config.serviceKey)||
  !await secretMatch(req.headers.get('x-cotironda-d016-text-internal')??'',
   config.internalSecret))return no(404);
 try{
  const body=await limitedBody(req);
  if(!body)return no(400);
  const requestId=body.requestId as string;
  const documentId=body.documentId as string;
  const sessionHmac=body.sessionHmac as string;
  const q={requestId,documentId,sessionHmac};
  const identity=contextOk(await ports.contexto({requestId,sessionHmac}),requestId);
  if(!identity)return no(404);
  const src=sourceOk(await ports.fuente(q),requestId,documentId,identity.buyerKey);
  if(!src)return no(404);
  const bytes=await decrypt(src,config.aesHex);
  if(!bytes)return no(404);
  const again=contextOk(await ports.contexto({requestId,sessionHmac}),requestId);
  if(!again||again.buyerKey!==identity.buyerKey)return no(404);
  const last=sourceOk(await ports.fuente(q),requestId,documentId,identity.buyerKey);
  if(!last||JSON.stringify(src)!==JSON.stringify(last))return no(404);
  const copy=Uint8Array.from(bytes);
  return new Response(copy.buffer as ArrayBuffer,{status:200,headers:{
   ...HEAD,'content-type':'application/octet-stream',
   'content-length':String(copy.byteLength),
   'x-original-sha256':src.sha256
  }});
 }catch{return no(503)}
}
