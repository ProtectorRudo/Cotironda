/** D016 — automatic buyer access AFTER supplier dispatch, no buyer keyword.
 * Reuses the already installed D016 ticket issuer + one-time browser session.
 * A private SQL selector proves original buyer WhatsApp event + 2 accepted
 * supplier dispatches and returns only an AES-GCM envelope (never a number).
 * No retries of uncertain Whapi sends; no original documents are opened.
 */
import {notificarAccesoWhatsappD016} from
 '../cotironda-piloto-whapi/buyer-whatsapp-entry-d016.ts';

type Rpc=(name:string,args?:Record<string,unknown>)=>Promise<{
 data:unknown;error:unknown
}>;
type IO=Readonly<{
 rpc:Rpc;
 post:(url:string,init:RequestInit)=>Promise<Response>;
}>;
export type AutoBuyerAccessState='off'|'empty'|'api_accepted'|
 'uncertain'|'denied'|'reconciliation';
export type AutoBuyerAccessResult=Readonly<{state:AutoBuyerAccessState;attempts:0|1}>;
export type AutoBuyerConfig=Readonly<{
 enabled:boolean;
 channel:string;
 identityHmacHex:string;
 aesHex:string;
 linkHmacHex:string;
 portalOrigin:string;
 portalSha:string;
 approvedSha:string;
 whapiToken:string;
}>;
const HASH=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$/iu;
const WHAPI_CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const SHA=/^[a-f0-9]{40}$/u;
const CHAT=/^[1-9][0-9]{7,14}@s\.whatsapp\.net$/u;
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
function freshBytes(hex:string):ArrayBuffer{
 const input=new Uint8Array(32);
 for(let i=0;i<32;i++)input[i]=parseInt(hex.slice(i*2,i*2+2),16);
 return input.buffer;
}
function toHex(data:ArrayBuffer):string{
 return [...new Uint8Array(data)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function equalHex(a:string,b:string):boolean{
 if(!HASH.test(a)||!HASH.test(b))return false;
 let d=0;
 for(let i=0;i<64;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);
 return d===0;
}
function readB64(data:string):Uint8Array{
 return Uint8Array.from(atob(data),x=>x.charCodeAt(0));
}
async function decryptBuyerPacket(
 packet:Record<string,unknown>,config:AutoBuyerConfig
):Promise<string>{
 if(Object.keys(packet).length!==8||
   packet.state!=='ready'||packet.source!=='authenticated_whapi'||
   typeof packet.request_id!=='string'||!UUID.test(packet.request_id)||
   typeof packet.event_hmac!=='string'||!HASH.test(packet.event_hmac)||
   typeof packet.chat_hmac!=='string'||!HASH.test(packet.chat_hmac)||
   typeof packet.contact_sha256!=='string'||!HASH.test(packet.contact_sha256)||
   typeof packet.nonce_b64!=='string'||!/^([A-Za-z0-9+/]{16})$/u.test(packet.nonce_b64)||
   typeof packet.ciphertext_b64!=='string'||
   !/^[A-Za-z0-9+/]{20,255}={0,2}$/u.test(packet.ciphertext_b64))
  throw Error('d016_auto_buyer_contact_envelope_invalid');
 const nonce=new Uint8Array(12);
 const ciphertext=readB64(packet.ciphertext_b64);
 nonce.set(readB64(packet.nonce_b64));
 if(ciphertext.length<24||ciphertext.length>225)
  throw Error('d016_auto_buyer_ciphertext_invalid');
 const raw=new Uint8Array(ciphertext.length);
 raw.set(ciphertext);
 const key=await crypto.subtle.importKey('raw',freshBytes(config.aesHex),
  'AES-GCM',false,['decrypt']);
 const plaintext=await crypto.subtle.decrypt({
  name:'AES-GCM',iv:nonce,tagLength:128,
  additionalData:new TextEncoder().encode(packet.chat_hmac+'|cotironda-contact-v1')
 },key,raw);
 const contact=new TextDecoder('utf-8',{fatal:true}).decode(plaintext);
 if(!CHAT.test(contact))throw Error('d016_auto_buyer_recipient_not_whapi');
 const hmacKey=await crypto.subtle.importKey('raw',freshBytes(config.identityHmacHex),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=toHex(await crypto.subtle.sign('HMAC',hmacKey,
  new TextEncoder().encode('cotironda|pilot|chat|'+config.channel+'|'+contact)));
 const sha=toHex(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(contact)));
 if(!equalHex(signed,String(packet.chat_hmac))||
    !equalHex(sha,String(packet.contact_sha256)))
  throw Error('d016_auto_buyer_contact_integrity_failed');
 return contact;
}

/** Invoke only from the existing Vault-authenticated scheduled worker.
 * The SQL selector is the sole source of buyer identity/request/Whapi event.
 * Notifier itself rechecks ticket issuance, one-time/idempotency/quotas.
 */
export async function sendAutomaticBuyerLinkD016(
 config:AutoBuyerConfig,io:IO
):Promise<AutoBuyerAccessResult>{
 const result=(state:AutoBuyerAccessState,attempts:0|1=0)=>
  ({state,attempts} as const);
 if(!config.enabled)return result('off');
 if(!HASH.test(config.identityHmacHex)||!HASH.test(config.aesHex)||
    !HASH.test(config.linkHmacHex)||
    config.identityHmacHex===config.aesHex||
    !WHAPI_CHANNEL.test(config.channel)||
    !SHA.test(config.portalSha)||config.portalSha!==config.approvedSha||
    config.portalOrigin!=='https://app.cotironda.com'||
    typeof config.whapiToken!=='string'||config.whapiToken.length<16||
    config.whapiToken.length>300)
  throw Error('d016_auto_link_secure_configuration_unavailable');
 const selected=await io.rpc('cotironda_piloto_v2_d016_auto_buyer_packet_private');
 if(selected.error!=null||!obj(selected.data))
  throw Error('d016_auto_link_selector_unavailable');
 const packet=selected.data;
 if(packet.state==='empty')return result('empty');
 const recipient=await decryptBuyerPacket(packet,config);
 const row=await notificarAccesoWhatsappD016({
   enabled:true,webhookAutenticado:true,compradorVerificado:true,
   mode:'auto',requestId:String(packet.request_id),
   chatHmac:String(packet.chat_hmac),
   eventHmac:String(packet.event_hmac),
   recipient,portalOrigin:config.portalOrigin,
   portalSha:config.portalSha,approvedSha:config.approvedSha,
   hmacKeyHex:config.linkHmacHex,
   rpc:async(name,args)=>io.rpc(name,args),
   authorizeChat:async(value,hash)=>value===recipient&&
    equalHex(hash,String(packet.chat_hmac)),
   send:async(value,body)=>{
    if(value!==recipient)throw Error('d016_auto_buyer_receiver_changed');
    const http=await io.post('https://gate.whapi.cloud/messages/text',{
     method:'POST',headers:{
      Authorization:'Bearer '+config.whapiToken,
      'Content-Type':'application/json'
     },
     body:JSON.stringify({to:value,body}),
     signal:AbortSignal.timeout(12000)
    });
    const parsed=http.ok?await http.json().catch(()=>null):null;
    if(!obj(parsed))return {accepted:false,messageId:null};
    const nested=obj(parsed.message)?parsed.message:null;
    const id=parsed.message_id??nested?.id??parsed.id;
    return {accepted:http.ok&&parsed.sent===true,
      messageId:typeof id==='string'?id:null};
   }
 });
 const state:AutoBuyerAccessState=row.estado==='api_aceptada'?'api_accepted':
  row.estado==='entrega_incierta'?'uncertain':
  row.estado==='no_elegible'?'denied':
  row.estado==='conciliacion_requerida'?'reconciliation':
  'denied';
 return result(state,row.intentos);
}
