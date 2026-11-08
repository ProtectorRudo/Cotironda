/** MVP313: decrypt *only* a DB-lease-scoped encrypted recipient.
 * Whapi numbers never leave the trusted Edge runtime. No network/sends.
 * The DB verifies supplier, owner consent, closed gates, locality and lease.
 * Crypto independently checks channel, HMAC, SHA and AES-GCM integrity.
 */
const SHA313=/^[a-f0-9]{64}$/u;
const ID313=/^[a-z][a-z0-9_]{2,60}$/u;
const UUID313=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const CHANNEL313=/^[A-Za-z0-9_-]{4,64}$/u;
const E164_313=/^[1-9][0-9]{7,14}$/u;
type LeaseMvp313=Readonly<{requestId:string;supplierKey:string;leaseToken:string;chatHmac:string}>;
type EnvelopeMvp313=Readonly<{state:'ready';request_id:string;supplier_key:string;chat_hmac:string;
 contact_sha256:string;nonce_b64:string;ciphertext_b64:string;channel_id:string;
 source:'authenticated_whapi'|'owner_statement'}>;
export type CredsMvp313=Readonly<{hmacKey:CryptoKey;aesKey:CryptoKey;channel:string}>;
type RpcMvp313=(name:string,args:Record<string,unknown>)=>Promise<Readonly<{data:unknown;error:unknown}>>;
function denyMvp313():never{throw Error('mvp313_recipient_unavailable')}
function objectMvp313(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function b64Mvp313(s:string):Uint8Array{
 const raw=atob(s);
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function equalMvp313(a:string,b:string):boolean{
 if(!SHA313.test(a)||!SHA313.test(b))return false;
 let diff=0;
 for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
function hexMvp313(a:ArrayBuffer):string{
 return Array.from(new Uint8Array(a)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function inspectMvp313(raw:unknown,lease:LeaseMvp313,keys:CredsMvp313):Promise<string>{
 if(!objectMvp313(raw)||Object.keys(raw).length!==9||
   raw.state!=='ready'||raw.request_id!==lease.requestId||
   raw.supplier_key!==lease.supplierKey||
   !equalMvp313(String(raw.chat_hmac),lease.chatHmac)||
   raw.channel_id!==keys.channel||
   !['authenticated_whapi','owner_statement'].includes(String(raw.source))||
   typeof raw.contact_sha256!=='string'||!SHA313.test(raw.contact_sha256)||
   typeof raw.nonce_b64!=='string'||!/^([A-Za-z0-9+/]{16})$/u.test(raw.nonce_b64)||
   typeof raw.ciphertext_b64!=='string'||
   !/^[A-Za-z0-9+/]{20,255}={0,2}$/u.test(raw.ciphertext_b64))
  denyMvp313();
 let recipient:string;
 try{
  const iv=b64Mvp313(raw.nonce_b64);
  const cipher=b64Mvp313(raw.ciphertext_b64);
  if(iv.length!==12||cipher.length<24||cipher.length>225)denyMvp313();
  const plain=await crypto.subtle.decrypt(
   {name:'AES-GCM',iv,additionalData:new TextEncoder().encode(
    lease.chatHmac+'|cotironda-contact-v1'),tagLength:128},
   keys.aesKey,cipher);
  recipient=new TextDecoder('utf-8',{fatal:true}).decode(plain);
 }catch{denyMvp313()}
 if(!recipient.endsWith('@s.whatsapp.net')||
   !E164_313.test(recipient.slice(0,-'@s.whatsapp.net'.length)))
  denyMvp313();
 const encoder=new TextEncoder();
 const recomputed=hexMvp313(await crypto.subtle.sign(
  'HMAC',keys.hmacKey,encoder.encode(
   'cotironda|pilot|chat|'+keys.channel+'|'+recipient)));
 const digest=hexMvp313(await crypto.subtle.digest('SHA-256',encoder.encode(recipient)));
 if(!equalMvp313(recomputed,lease.chatHmac)||
   !equalMvp313(digest,raw.contact_sha256))denyMvp313();
 return recipient.slice(0,-'@s.whatsapp.net'.length);
}
/** No fallback to historical number allowlist in MVP313. */
export async function resolverDestinatarioMvp313(
 lease:LeaseMvp313,creds:CredsMvp313,rpc:RpcMvp313
):Promise<string>{
 if(!lease||!UUID313.test(lease.requestId)||!ID313.test(lease.supplierKey)||
  !UUID313.test(lease.leaseToken)||!SHA313.test(lease.chatHmac)||
  !creds||!CHANNEL313.test(creds.channel)||
  !creds.aesKey||!creds.hmacKey||typeof rpc!=='function')denyMvp313();
 const result=await rpc('cotironda_piloto_ia_recipient_packet_mvp313',{
  p_request:lease.requestId,p_supplier:lease.supplierKey,
  p_lease:lease.leaseToken,p_chat_hmac:lease.chatHmac,
  p_channel:creds.channel
 });
 if(result.error||!result.data)denyMvp313();
 return inspectMvp313(result.data,lease,creds);
}
