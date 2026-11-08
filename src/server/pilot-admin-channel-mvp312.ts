/**
 * MVP312. ONLY trusted operator-side code. Converts a previously obtained,
 * operator-checked WhatsApp recipient into nonplaintext database arguments.
 * No network, log, storage or customer confirmation. Never exposes secrets.
 *
 * Consent provenance is MVP309 owner statement. A channel pre-bound by an
 * administrator is NOT falsely labeled WhatsApp-inbound verified.
 */
import {
 createCipheriv,createDecipheriv,createHash,createHmac,
 randomBytes,timingSafeEqual
} from 'node:crypto';
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const E164=/^[1-9][0-9]{7,14}$/u;
const SHA=/^[a-f0-9]{64}$/u;
function deny():never{throw Error('mvp312_channel_invalid')}
export type ClavesCanalMvp312=Readonly<{
 identityHmac:Buffer;contactAes:Buffer;
}>;
export type SobreCanalMvp312=Readonly<{
 p_channel_id:string;p_chat_hmac:string;p_contact_sha256:string;
 p_nonce_b64:string;p_ciphertext_b64:string;
}>;
export type EntradaCanalMvp312=Readonly<{
 channelId:string;number:string;numberConfirmation:string;
}>;
function checkKeys(keys:ClavesCanalMvp312){
 if(!keys||!Buffer.isBuffer(keys.identityHmac)||
  !Buffer.isBuffer(keys.contactAes)||keys.identityHmac.length!==32||
  keys.contactAes.length!==32||
  timingSafeEqual(keys.identityHmac,keys.contactAes))deny();
}
function recipientId(input:EntradaCanalMvp312){
 if(!input||typeof input.channelId!=='string'||!CHANNEL.test(input.channelId)||
  typeof input.number!=='string'||!E164.test(input.number)||
  typeof input.numberConfirmation!=='string'||
  !E164.test(input.numberConfirmation)||
  input.number!==input.numberConfirmation)deny();
 return input.number+'@s.whatsapp.net';
}
export function sellarCanalAdminMvp312(
 input:EntradaCanalMvp312,keys:ClavesCanalMvp312
):SobreCanalMvp312{
 checkKeys(keys);
 const recipient=recipientId(input);
 const chatHmac=createHmac('sha256',keys.identityHmac)
  .update('cotironda|pilot|chat|'+input.channelId+'|'+recipient,'utf8')
  .digest('hex');
 const digest=createHash('sha256').update(recipient,'utf8').digest('hex');
 const nonce=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',keys.contactAes,nonce);
 cipher.setAAD(Buffer.from(chatHmac+'|cotironda-contact-v1','utf8'));
 const payload=Buffer.concat([
  cipher.update(recipient,'utf8'),cipher.final(),cipher.getAuthTag()
 ]);
 return Object.freeze({
  p_channel_id:input.channelId,p_chat_hmac:chatHmac,
  p_contact_sha256:digest,
  p_nonce_b64:nonce.toString('base64'),
  p_ciphertext_b64:payload.toString('base64')
 });
}
/**
 * Recheck operator-supplied envelope at the last trusted outbound boundary.
 * No plaintext recipient is exposed to the browser or to arbitrary SQL RPCs.
 */
export function verificarYRecuperarCanalAdminMvp312(
 packet:SobreCanalMvp312,keys:ClavesCanalMvp312
):string{
 checkKeys(keys);
 if(!packet||!CHANNEL.test(packet.p_channel_id)||!SHA.test(packet.p_chat_hmac)||
  !SHA.test(packet.p_contact_sha256)||
  typeof packet.p_nonce_b64!=='string'||
  !/^[A-Za-z0-9+/]{16}$/u.test(packet.p_nonce_b64)||
  typeof packet.p_ciphertext_b64!=='string'||
  !/^[A-Za-z0-9+/]{20,296}={0,2}$/u.test(packet.p_ciphertext_b64))deny();
 const iv=Buffer.from(packet.p_nonce_b64,'base64');
 const bytes=Buffer.from(packet.p_ciphertext_b64,'base64');
 if(iv.length!==12||bytes.length<25||bytes.length>225)deny();
 let recipient:string;
 try{
  const cipher=createDecipheriv('aes-256-gcm',keys.contactAes,iv);
  cipher.setAAD(Buffer.from(packet.p_chat_hmac+'|cotironda-contact-v1','utf8'));
  cipher.setAuthTag(bytes.subarray(bytes.length-16));
  recipient=Buffer.concat([
   cipher.update(bytes.subarray(0,bytes.length-16)),cipher.final()
  ]).toString('utf8');
 }catch{deny()}
 const input=recipient.endsWith('@s.whatsapp.net')
  ?recipient.slice(0,-'@s.whatsapp.net'.length):'';
 if(!E164.test(input))deny();
 const expectedHmac=createHmac('sha256',keys.identityHmac)
  .update('cotironda|pilot|chat|'+packet.p_channel_id+'|'+recipient,'utf8')
  .digest('hex');
 const expectedSha=createHash('sha256').update(recipient,'utf8').digest('hex');
 if(!timingSafeEqual(Buffer.from(expectedHmac,'hex'),Buffer.from(packet.p_chat_hmac,'hex'))||
  !timingSafeEqual(Buffer.from(expectedSha,'hex'),Buffer.from(packet.p_contact_sha256,'hex')))
  deny();
 return recipient;
}
