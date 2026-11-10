/** MVP315: complete a buyer tracking notice independently of inbound WhatsApp.
 * Only SQL can select the eligible buyer after ALL suppliers were accepted.
 * No chat IDs are returned to caller/UI; AES and hashes stay inside Edge.
 */
import {notificarSeguimientoMvp289} from './buyer-tracking-confirmation-mvp289.ts';
const H=/^[a-f0-9]{64}$/u;
const U=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const CH=/^[A-Za-z0-9_-]{4,64}$/u;
const E164=/^[1-9][0-9]{7,14}$/u;
const B64=/^[A-Za-z0-9+/]{20,255}={0,2}$/u;
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Packet=Readonly<{state:'ready';request_id:string;chat_hmac:string;event_hmac:string;
 channel_id:string;contact_sha256:string;nonce_b64:string;ciphertext_b64:string;
 source:'authenticated_whapi'|'owner_statement'}>;
export type BuyerNoticeKeys315=Readonly<{hmacKey:CryptoKey;aesKey:CryptoKey;channel:string}>;
export type Result315=Readonly<{estado:
 'apagado'|'sin_trabajos'|'limite_diario'|'api_aceptada'|
 'entrega_incierta'|'conciliacion_requerida';intentos:0|1}>;
const result=(estado:Result315['estado'],intentos:0|1=0):Result315=>
 Object.freeze({estado,intentos});
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const equal=(a:string,b:string)=>{
 if(!H.test(a)||!H.test(b))return false;
 let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
};
function packet(raw:unknown,expectedChannel:string):Packet{
 if(!obj(raw)||Object.keys(raw).length!==9||
 raw.state!=='ready'||typeof raw.request_id!=='string'||!U.test(raw.request_id)||
 typeof raw.chat_hmac!=='string'||!H.test(raw.chat_hmac)||
 typeof raw.event_hmac!=='string'||!H.test(raw.event_hmac)||
 raw.channel_id!==expectedChannel||
 !['authenticated_whapi','owner_statement'].includes(String(raw.source))||
 typeof raw.contact_sha256!=='string'||!H.test(raw.contact_sha256)||
 typeof raw.nonce_b64!=='string'||!/^[A-Za-z0-9+/]{16}$/u.test(raw.nonce_b64)||
 typeof raw.ciphertext_b64!=='string'||!B64.test(raw.ciphertext_b64))
 throw Error('mvp315_unverified_buyer_packet');
 return raw as Packet;
}
async function decrypt(raw:Packet,keys:BuyerNoticeKeys315):Promise<string>{
 const ivRaw=Uint8Array.from(atob(raw.nonce_b64),c=>c.charCodeAt(0));
 const cipherRaw=Uint8Array.from(atob(raw.ciphertext_b64),c=>c.charCodeAt(0));
 if(ivRaw.length!==12||cipherRaw.length<24||cipherRaw.length>225)
  throw Error('mvp315_invalid_envelope');
 const iv=new Uint8Array(12);iv.set(ivRaw);
 const encrypted=new Uint8Array(cipherRaw.length);encrypted.set(cipherRaw);
 const enc=new TextEncoder();
 const clear=await crypto.subtle.decrypt({
  name:'AES-GCM',iv,
  additionalData:enc.encode(raw.chat_hmac+'|cotironda-contact-v1'),
  tagLength:128
 },keys.aesKey,encrypted);
 const jid=new TextDecoder('utf-8',{fatal:true}).decode(clear);
 if(!jid.endsWith('@s.whatsapp.net')||
   !E164.test(jid.slice(0,-'@s.whatsapp.net'.length)))
  throw Error('mvp315_invalid_phone');
 const computed=hex(await crypto.subtle.sign('HMAC',keys.hmacKey,
  enc.encode('cotironda|pilot|chat|'+keys.channel+'|'+jid)));
 const sha=hex(await crypto.subtle.digest('SHA-256',enc.encode(jid)));
 if(!equal(computed,raw.chat_hmac)||!equal(sha,raw.contact_sha256))
  throw Error('mvp315_phone_not_authorized');
 return jid;
}
export async function avisarCompradorTrasLoteMvp315(args:{
 enabled:boolean;keys:BuyerNoticeKeys315;rpc:Rpc;
 send:(to:string,body:string)=>Promise<{accepted:boolean;messageId:string|null}>;
}):Promise<Result315>{
 if(!args.enabled)return result('apagado');
 if(!args.keys||!CH.test(args.keys.channel)||
 !args.keys.hmacKey||!args.keys.aesKey||
 typeof args.rpc!=='function'||typeof args.send!=='function')
  return result('conciliacion_requerida');
 let packet_:Packet,recipient:string;
 try{
  const next=await args.rpc('cotironda_piloto_ia_next_buyer_notice_mvp315',{
   p_channel:args.keys.channel
  });
  if(next.error||!obj(next.data))return result('conciliacion_requerida');
  if(next.data.state==='disabled'||next.data.state==='empty')
   return result('sin_trabajos');
  if(next.data.state==='budget_exhausted')
   return result('limite_diario');
  packet_=packet(next.data,args.keys.channel);
  recipient=await decrypt(packet_,args.keys);
 }catch{return result('conciliacion_requerida')}
 const outcome=await notificarSeguimientoMvp289({
  enabled:true,buyerVerified:true,mode:'auto',
  requestId:packet_.request_id,chatHmac:packet_.chat_hmac,
  eventHmac:packet_.event_hmac,recipient,
  rpc:args.rpc,send:args.send,
  issueRpc:'cotironda_piloto_ia_issue_buyer_notice_mvp315',
  noticeChannel:args.keys.channel,
  authorizeBeforeSend:async tokenHash=>{
   // A fresh SQL packet confirms identity, token, completed dispatch,
   // consent and active channel. Any mutation blocks the HTTP request.
   const latest=await args.rpc('cotironda_piloto_ia_buyer_packet_mvp315',{
    p_request:packet_.request_id,p_channel:args.keys.channel,
    p_token_hash:tokenHash
   });
   if(latest.error||!latest.data)return false;
   const verified=packet(latest.data,args.keys.channel);
   if(verified.request_id!==packet_.request_id||
      verified.chat_hmac!==packet_.chat_hmac||
      verified.event_hmac!==packet_.event_hmac)return false;
   if(await decrypt(verified,args.keys)!==recipient)return false;
   const permit=await args.rpc('cotironda_piloto_ia_authorize_buyer_notice_mvp315',{
    p_request:packet_.request_id,p_chat_hmac:packet_.chat_hmac,
    p_token_hash:tokenHash,p_channel:args.keys.channel
   });
   return !permit.error&&permit.data===true;
  }
 });
 if(outcome.estado==='api_aceptada')return result('api_aceptada',1);
 if(outcome.estado==='entrega_incierta')return result('entrega_incierta',1);
 if(outcome.estado==='no_elegible')return result('sin_trabajos');
 return result('conciliacion_requerida',outcome.intentos);
}
