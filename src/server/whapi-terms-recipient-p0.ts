/**
 * P0 supplier recipient resolver before any round exists.
 * Reads only the exact lease-bound MVP109 AES-GCM envelope from a private
 * Postgres sender role; reproduces PILOT Edge's crypto contract.
 * No HTTP, env, global fetch, DB URL, fallback number list or outbound send.
 */
import {createDecipheriv,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {AvisoClaimP0} from './whapi-terms-onboarding-p0.ts';

const QUERY='select cotironda_piloto_privado.terms_recipient_packet_p0($1::uuid,$2::uuid) as payload';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA=/^[0-9a-f]{64}$/u;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const PHONE=/^[1-9][0-9]{7,14}$/u;
const B64=/^[A-Za-z0-9+/]+={0,2}$/u;
const SUFFIX='@s.whatsapp.net';
function denied():never{throw Error('p0_contacto_cifrado_no_disponible')}
function exact(x:unknown,keys:readonly string[]):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join(',')===[...keys].sort().join(',');
}
function sameHex(a:string,b:string):boolean{
 if(!SHA.test(a)||!SHA.test(b))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function decodeB64(raw:string,min:number,max:number):Buffer{
 if(raw.length>300||raw.length<16||raw.length%4!==0||!B64.test(raw))denied();
 const b=Buffer.from(raw,'base64');
 if(b.length<min||b.length>max||b.toString('base64')!==raw)denied();
 return b;
}
export type RecipientKeysP0=Readonly<{
 pilotHmacKey:Buffer;contactAesKey:Buffer;channel:string;
}>;
export type RecipientPortP0=Readonly<{
 committedRpc:(query:string,args:readonly unknown[])=>Promise<unknown>;
}>;
export function crearResolverContactoProveedorP0(
 io:RecipientPortP0,secret:RecipientKeysP0
){
 if(!io||typeof io.committedRpc!=='function'||!secret||
   !Buffer.isBuffer(secret.pilotHmacKey)||secret.pilotHmacKey.length!==32||
   !Buffer.isBuffer(secret.contactAesKey)||secret.contactAesKey.length!==32||
   timingSafeEqual(secret.pilotHmacKey,secret.contactAesKey)||
   typeof secret.channel!=='string'||!CHANNEL.test(secret.channel))denied();
 const hmacKey=Buffer.from(secret.pilotHmacKey);
 const aesKey=Buffer.from(secret.contactAesKey);
 return async function verifiedRecipient(claim:AvisoClaimP0):Promise<string>{
  if(!exact(claim,['state','jobId','leaseToken','supplierKey',
    'channel','chatHmac','termsVersion','termsSha256','body'])||
    claim.state!=='leased'||claim.channel!==secret.channel||
    typeof claim.jobId!=='string'||!UUID.test(claim.jobId)||
    typeof claim.leaseToken!=='string'||!UUID.test(claim.leaseToken)||
    typeof claim.chatHmac!=='string'||!SHA.test(claim.chatHmac))denied();
  let raw:unknown;
  try{raw=await io.committedRpc(QUERY,[claim.jobId,claim.leaseToken])}
  catch{denied()}
  if(!exact(raw,['payload'])||
    !exact(raw.payload,['state','jobId','leaseToken','supplierKey',
      'channel','chatHmac','contactSha256','nonceB64','ciphertextB64']))denied();
  const p=raw.payload;
  if(p.state!=='ready'||p.jobId!==claim.jobId||
    p.leaseToken!==claim.leaseToken||p.supplierKey!==claim.supplierKey||
    p.channel!==claim.channel||typeof p.chatHmac!=='string'||
    !sameHex(p.chatHmac,claim.chatHmac)||
    typeof p.contactSha256!=='string'||!SHA.test(p.contactSha256)||
    typeof p.nonceB64!=='string'||typeof p.ciphertextB64!=='string')denied();
  let recipient:string;
  try{
    const nonce=decodeB64(p.nonceB64,12,12);
    const sealed=decodeB64(p.ciphertextB64,24,225);
    const dec=createDecipheriv('aes-256-gcm',aesKey,nonce);
    dec.setAAD(Buffer.from(claim.chatHmac+'|cotironda-contact-v1','utf8'));
    dec.setAuthTag(sealed.subarray(sealed.length-16));
    recipient=Buffer.concat([
      dec.update(sealed.subarray(0,sealed.length-16)),dec.final()
    ]).toString('utf8');
  }catch{denied()}
  if(!recipient.endsWith(SUFFIX))denied();
  const to=recipient.slice(0,-SUFFIX.length);
  if(!PHONE.test(to))denied();
  const calcChat=createHmac('sha256',hmacKey)
    .update('cotironda|pilot|chat|'+secret.channel+'|'+recipient,'utf8')
    .digest('hex');
  const calcSha=createHash('sha256').update(recipient,'utf8').digest('hex');
  if(!sameHex(calcChat,claim.chatHmac)||
    !sameHex(calcSha,p.contactSha256))denied();
  return to;
 };
}
