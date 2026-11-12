/**
 * P0 — trusted-server human MFA review of encrypted Whapi enrollment replies.
 * Not an API route, browser module, automatic intent classifier or background
 * job. The injected RPC MUST use the live, verified SUPABASE OPERATOR JWT;
 * each SQL RPC independently checks operator_session_mvp267() (AAL2).
 *
 * The text is decrypted and displayed ONLY to that operator. A second,
 * deliberate action re-fetches the evidence, revalidates the original SHA,
 * and commits the decision. Never convert Whapi API ACK or a free-text AI
 * interpretation into consent.
 */
import {createDecipheriv,createHash,timingSafeEqual} from 'node:crypto';

const SHA=/^[a-f0-9]{64}$/u;
const B64=/^[A-Za-z0-9+/]+={0,2}$/u;
const VERSION='cotironda-originales-alta-v1';
const PACKET='cotironda_piloto_terms_review_packet_auth_p0';
const DECIDE='cotironda_piloto_terms_review_decide_auth_p0';
function deny():never{throw Error('p0_mfa_revision_no_disponible')}
function exact(v:unknown,ks:readonly string[]):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join(',')===[...ks].sort().join(',');
}
function equalHex(x:string,y:string):boolean{
 return SHA.test(x)&&SHA.test(y)&&
  timingSafeEqual(Buffer.from(x,'hex'),Buffer.from(y,'hex'));
}
function base64(v:string,min:number,max:number):Buffer{
 if(v.length<16||v.length>6000||v.length%4!==0||!B64.test(v))deny();
 const result=Buffer.from(v,'base64');
 if(result.length<min||result.length>max||
    result.toString('base64')!==v)deny();
 return result;
}
function hash(value:string):string{
 return createHash('sha256').update(value,'utf8').digest('hex');
}
export type ReviewRPCP0=(name:string,args:Readonly<Record<string,unknown>>)=>Promise<unknown>;
export type ReviewDecisionP0='explicit_accept'|'not_explicit';
export type ReviewViewP0=Readonly<{
 messageHmac:string;noticeMessageHmac:string;supplierKey:string;
 termsVersion:string;termsSha256:string;termsBody:string;
 plaintextSha256:string;receivedAt:string;text:string;
}>;
export function crearRevisorMfaOriginalesP0(
 port:Readonly<{authenticatedRpc:ReviewRPCP0;inboxAesKey:Buffer}>
){
 if(!port||typeof port.authenticatedRpc!=='function'||
   !Buffer.isBuffer(port.inboxAesKey)||port.inboxAesKey.length!==32)
  deny();
 const aes=Buffer.from(port.inboxAesKey);
 async function packet(messageHmac:string):Promise<ReviewViewP0>{
  if(typeof messageHmac!=='string'||!SHA.test(messageHmac))deny();
  let raw:unknown;
  try{raw=await port.authenticatedRpc(PACKET,{p_message_hmac:messageHmac})}
  catch{deny()}
  if(!exact(raw,['state','messageHmac','supplierKey',
    'noticeMessageHmac','termsVersion','termsSha256','termsBody',
    'chatHmac','receivedAt','plaintextSha256','nonceB64',
    'ciphertextB64']))deny();
  if(raw.state!=='ready'||raw.messageHmac!==messageHmac||
    typeof raw.supplierKey!=='string'||
    !/^[a-z][a-z0-9_]{2,63}$/u.test(raw.supplierKey)||
    typeof raw.noticeMessageHmac!=='string'||
    !SHA.test(raw.noticeMessageHmac)||raw.termsVersion!==VERSION||
    typeof raw.termsBody!=='string'||raw.termsBody.length<200||
    raw.termsBody.length>20000||typeof raw.termsSha256!=='string'||
    !SHA.test(raw.termsSha256)||hash(raw.termsBody)!==raw.termsSha256||
    typeof raw.chatHmac!=='string'||!SHA.test(raw.chatHmac)||
    typeof raw.plaintextSha256!=='string'||
    !SHA.test(raw.plaintextSha256)||
    typeof raw.receivedAt!=='string'||Number.isNaN(Date.parse(raw.receivedAt))||
    typeof raw.nonceB64!=='string'||typeof raw.ciphertextB64!=='string')
    deny();
  let plain:string;
  try{
   const nonce=base64(raw.nonceB64,12,12);
   const sealed=base64(raw.ciphertextB64,17,10000);
   const d=createDecipheriv('aes-256-gcm',aes,nonce);
   d.setAAD(Buffer.from(
     raw.chatHmac+'|'+messageHmac+'|text','utf8'));
   d.setAuthTag(sealed.subarray(sealed.length-16));
   const bytes=Buffer.concat([
     d.update(sealed.subarray(0,-16)),d.final()
   ]);
   plain=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }catch{deny()}
  if(plain.length===0||plain.length>3000||
    !equalHex(hash(plain),raw.plaintextSha256))deny();
  return Object.freeze({
   messageHmac,noticeMessageHmac:raw.noticeMessageHmac,
   supplierKey:raw.supplierKey,termsVersion:VERSION,
   termsSha256:raw.termsSha256,termsBody:raw.termsBody,
   plaintextSha256:raw.plaintextSha256,
   receivedAt:raw.receivedAt,text:plain
  });
 }
 async function decidir(input:Readonly<{
  messageHmac:string;noticeMessageHmac:string;
  reviewedPlaintextSha256:string;decision:ReviewDecisionP0;
  humanAttestation:boolean;
 }>):Promise<Readonly<{state:'recorded';decision:ReviewDecisionP0}>>{
  if(!exact(input,['messageHmac','noticeMessageHmac',
    'reviewedPlaintextSha256','decision','humanAttestation'])||
    typeof input.messageHmac!=='string'||!SHA.test(input.messageHmac)||
    typeof input.noticeMessageHmac!=='string'||!SHA.test(input.noticeMessageHmac)||
    typeof input.reviewedPlaintextSha256!=='string'||
    !SHA.test(input.reviewedPlaintextSha256)||
    !['explicit_accept','not_explicit'].includes(input.decision)||
    input.humanAttestation!==true)deny();
  // Re-read from authenticated source before submitting a decision, so
  // cached UI data, a changed notice or a replayed response cannot approve.
  const verified=await packet(input.messageHmac);
  if(verified.noticeMessageHmac!==input.noticeMessageHmac||
    !equalHex(verified.plaintextSha256,input.reviewedPlaintextSha256))
    deny();
  let r:unknown;
  try{r=await port.authenticatedRpc(DECIDE,{
   p_message_hmac:verified.messageHmac,
   p_notice_message_hmac:verified.noticeMessageHmac,
   p_reviewed_text:verified.text,p_decision:input.decision,
   p_human_attestation:true
  })}catch{deny()}
  if(!exact(r,['state','decision'])||
    r.state!=='recorded'||r.decision!==input.decision)deny();
  return Object.freeze({state:'recorded',decision:input.decision});
 }
 return Object.freeze({preparar:packet,decidir});
}
