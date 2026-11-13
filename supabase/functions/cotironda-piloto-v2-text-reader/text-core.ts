/** Cotironda V2-15: lector Edge privado para TEXTO de proveedores.
 * Exclusivamente fuente acreditada SQL y JWT comprador (verify_jwt=true),
 * más secreto segregado Vercel→Edge. No expone texto a llamadas públicas.
 */
export type BuyerV2=Readonly<{
 id:string;phone?:string|null;phone_confirmed_at?:string|null;
 is_anonymous?:boolean|null;
}>;
export type TextPortsV2=Readonly<{
 getUser:(jwt:string)=>Promise<BuyerV2|null>;
 source:(params:Readonly<{requestId:string;documentId:string;
  authUserId:string;authSessionId:string}>)=>Promise<unknown>;
}>;
export type TextBrokerConfigV2=Readonly<{
 enabled:boolean;url:string;sharedSecret:string;aesHex:string;
}>;
const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const KEY=/^[A-Za-z0-9_-]{40,256}$/u;
const AES=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{64}$/u;
const JWT=/^[A-Za-z0-9_-]{2,1024}\.[A-Za-z0-9_-]{10,3072}\.[A-Za-z0-9_-]{20,1024}$/u;
const HEAD={
 'cache-control':'private, no-store, no-cache, max-age=0',
 'content-security-policy':"default-src 'none'; sandbox",
 'content-type':'application/json; charset=utf-8',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
 'cross-origin-resource-policy':'same-origin','vary':'Authorization'
} as const;
const deny=(status:number)=>new Response(JSON.stringify({state:'unavailable'}),{
 status,headers:HEAD
});
type Claims={sub:string;sessionId:string};
type Source=Readonly<{
 requestId:string;documentId:string;state:'authorized_text_v2';
 sha256:string;mime:'text/plain';chatHmac:string;messageHmac:string;
 nonceB64:string;ciphertextB64:string;consentAt:number;invitedAt:number;
}>;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&
 typeof v==='object'&&!Array.isArray(v);

function claimsValid(jwt:string,userId:string,nowMs:number):Claims|null{
 try{
  if(!JWT.test(jwt)||jwt.length>4096)return null;
  const p=jwt.split('.')[1];
  const json=atob(p.replace(/-/gu,'+').replace(/_/gu,'/')+
   '='.repeat((4-p.length%4)%4));
  if(json.length>4096)return null;
  const data:unknown=JSON.parse(json);
  if(!object(data)||data.iss!==PILOT+'/auth/v1'||
   data.sub!==userId||!UUID.test(data.sub)||
   data.role!=='authenticated'||data.aud!=='authenticated'||
   typeof data.session_id!=='string'||!UUID.test(data.session_id)||
   typeof data.exp!=='number'||!Number.isSafeInteger(data.exp)||
   data.exp*1000<=nowMs)return null;
  // La firma la verifica el gateway y getUser(); estos claims solo
  // transportan la sesión al SQL, que valida auth.sessions en vivo.
  return {sub:userId,sessionId:data.session_id};
 }catch{return null}
}
async function equalSecrets(received:string,expected:string):Promise<boolean>{
 if(!KEY.test(received)||!KEY.test(expected))return false;
 const encoder=new TextEncoder();
 const [a,b]=await Promise.all([received,expected].map(v=>
  crypto.subtle.digest('SHA-256',encoder.encode(v))));
 const x=new Uint8Array(a),y=new Uint8Array(b);let mismatch=0;
 for(let i=0;i<x.length;i++)mismatch|=x[i]^y[i];
 return mismatch===0;
}
async function requestBody(req:Request):Promise<unknown|null>{
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d{1,3}$/u.test(length)||+length>512))
  return null;
 const reader=req.body?.getReader();if(!reader)return null;
 let count=0;const chunks:Uint8Array[]=[];
 try{
  while(true){
   const v=await reader.read();if(v.done)break;
   count+=v.value.byteLength;
   if(count>512){await reader.cancel().catch(()=>{});return null}
   chunks.push(v.value);
  }
 }finally{reader.releaseLock()}
 if(count<20||(length!==null&&+length!==count))return null;
 const bytes=new Uint8Array(count);let pos=0;
 for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}
 catch{return null}
}
function sourceValid(v:unknown,requestId:string,documentId:string):Source|null{
 if(!object(v)||v.state!=='authorized_text_v2'||
  v.requestId!==requestId||v.documentId!==documentId||
  v.mime!=='text/plain'||typeof v.sha256!=='string'||!SHA.test(v.sha256)||
  typeof v.messageHmac!=='string'||!SHA.test(v.messageHmac)||
  typeof v.chatHmac!=='string'||!SHA.test(v.chatHmac)||
  typeof v.nonceB64!=='string'||v.nonceB64.length!==16||
  typeof v.ciphertextB64!=='string'||
  v.ciphertextB64.length<24||v.ciphertextB64.length>20000||
  typeof v.consentAt!=='number'||!Number.isSafeInteger(v.consentAt)||
  v.consentAt<=0||typeof v.invitedAt!=='number'||
  !Number.isSafeInteger(v.invitedAt)||v.invitedAt<v.consentAt)
  return null;
 return v as Source;
}
function b64(raw:string):Uint8Array|null{
 if(raw.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/u.test(raw))return null;
 try{
  const bytes=Uint8Array.from(atob(raw),v=>v.charCodeAt(0));
  const canonical=btoa(String.fromCharCode(...bytes));
  return canonical===raw?bytes:null;
 }catch{return null}
}
async function sha(data:Uint8Array){
 const digest=await crypto.subtle.digest('SHA-256',Uint8Array.from(data));
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
async function decrypt(v:Source,aesHex:string):Promise<Uint8Array|null>{
 try{
  if(!AES.test(aesHex)||/^0{64}$/u.test(aesHex))return null;
  const iv=b64(v.nonceB64),ciphertext=b64(v.ciphertextB64);
  if(!iv||iv.length!==12||!ciphertext||ciphertext.length<17||
   ciphertext.length>10000)return null;
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(
   aesHex.match(/.{2}/gu)!.map(x=>parseInt(x,16))),
   'AES-GCM',false,['decrypt']);
  const plaintext=await crypto.subtle.decrypt({
   name:'AES-GCM',iv:Uint8Array.from(iv),tagLength:128,
   additionalData:new TextEncoder().encode(v.chatHmac+'|'+v.messageHmac+'|text')
  },key,Uint8Array.from(ciphertext));
  const bytes=new Uint8Array(plaintext);
  if(bytes.length<5||bytes.length>4000||await sha(bytes)!==v.sha256)
   return null;
  new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  return bytes;
 }catch{return null}
}
/** No devuelve ni un byte sin autenticación, consentimiento actual y 2ª lectura.
 * El servidor Next realiza además su propia revalidación y auditoría SQL.
 */
export async function resolverTextoPrivadoV2(
 req:Request,config:TextBrokerConfigV2,ports:TextPortsV2,
 now:()=>number=Date.now
):Promise<Response>{
 if(req.method!=='POST')return deny(405);
 if(!config.enabled||config.url!==PILOT||
  !KEY.test(config.sharedSecret)||!AES.test(config.aesHex)||
  config.sharedSecret===config.aesHex)return deny(503);
 if(new URL(req.url).search||
  req.headers.get('content-type')!=='application/json')return deny(400);
 const presented=req.headers.get('x-cotironda-text-internal')??'';
 if(!await equalSecrets(presented,config.sharedSecret))return deny(404);
 const bearer=req.headers.get('authorization')?.match(
  /^Bearer ([A-Za-z0-9_-]{2,1024}\.[A-Za-z0-9_-]{10,3072}\.[A-Za-z0-9_-]{20,1024})$/u)?.[1]??'';
 if(!JWT.test(bearer)||bearer.length>4096)return deny(404);
 try{
  const payload=await requestBody(req);
  if(!object(payload)||Object.keys(payload).sort().join(',')!=='documentId,requestId'||
   typeof payload.requestId!=='string'||!UUID.test(payload.requestId)||
   typeof payload.documentId!=='string'||!UUID.test(payload.documentId))
   return deny(400);
  const user=await ports.getUser(bearer);
  if(!user||user.is_anonymous!==false||!user.phone_confirmed_at||
   typeof user.phone!=='string'||!/^[+ ]?[1-9]\d{7,15}$/u.test(user.phone))
   return deny(404);
  const claims=claimsValid(bearer,user.id,now());
  if(!claims)return deny(404);
  const identity={requestId:payload.requestId,documentId:payload.documentId,
   authUserId:claims.sub,authSessionId:claims.sessionId};
  const raw=await ports.source(identity);
  const src=sourceValid(raw,payload.requestId,payload.documentId);
  if(!src)return deny(404);
  const bytes=await decrypt(src,config.aesHex);
  if(!bytes)return deny(404);
  const again=await ports.getUser(bearer);
  if(!again||again.id!==user.id||again.is_anonymous!==false||
   !again.phone_confirmed_at||!claimsValid(bearer,again.id,now()))
   return deny(404);
  const after=sourceValid(await ports.source(identity),
   payload.requestId,payload.documentId);
  if(!after||JSON.stringify(after)!==JSON.stringify(src))return deny(404);
  return new Response(Uint8Array.from(bytes).buffer,{status:200,headers:{
   ...HEAD,'content-type':'application/octet-stream',
   'content-length':String(bytes.byteLength),
   'x-original-sha256':src.sha256
  }});
 }catch{return deny(503)}
}
