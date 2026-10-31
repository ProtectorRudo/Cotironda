/**
 * MVP-019 / D068. AES-256-GCM envelope for verified private Whapi recipient
 * IDs. D028 keeps only HMAC: the recipient is intentionally non-reversible
 * unless the trusted enrolment broker stores an independently encrypted ID.
 *
 * SERVER-ONLY, NO process.env/global fetch/Whapi network. Secrets are injected.
 * SQL/JSON may contain ciphertext but NEVER a clear phone or chat ID.
 */
import {createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';
import {calcularChatDestinatarioD056} from './whapi-send-authorization-d056.ts';
import {formatearConsultaProveedorD066}
 from './whapi-invitation-preview-d066.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const KEYID=/^[a-z][a-z0-9_]{2,40}$/u;
const PHONE=/^[1-9][0-9]{8,14}$/u;
const HEX=/^[a-f0-9]+$/u;
const QUERY='select cotironda_private.whapi_read_recipient_packet_d068($1::uuid,$2::uuid,$3::text,$4::text) as payload';
export type D068Id=Readonly<{channel:string;chatKey:string;supplierOrgId:string}>;
export type D068Sealed=D068Id&Readonly<{
 cryptoKeyId:string;nonceHex:string;cipherHex:string;tagHex:string;
}>;
export type D068Keys=Readonly<{hmacIdentity:Buffer;recipientAes:Buffer}>;
function invalid():never{throw new Error('d068_recipient_unavailable')}
function object(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function exactly(x:unknown,keys:readonly string[]):x is Record<string,unknown>{
 return object(x)&&Object.keys(x).length===keys.length&&
  Object.keys(x).every(k=>keys.includes(k));
}
function ensureKeys(k:D068Keys):void{
 if(!k||!Buffer.isBuffer(k.hmacIdentity)||k.hmacIdentity.length!==32||
  !Buffer.isBuffer(k.recipientAes)||k.recipientAes.length!==32||
  timingSafeEqual(k.hmacIdentity,k.recipientAes))invalid();
}
function ensureIdentity(input:D068Id):void{
 if(!input||typeof input.channel!=='string'||!CHANNEL.test(input.channel)||
  typeof input.chatKey!=='string'||!SHA.test(input.chatKey)||
  typeof input.supplierOrgId!=='string'||!UUID.test(input.supplierOrgId))invalid();
}
function authenticatedContext(id:D068Id,keyId:string):Buffer{
 return Buffer.from(JSON.stringify([
  'cotironda','recipient','d068',1,id.channel,id.chatKey,
  id.supplierOrgId,keyId
 ]),'utf8');
}
function parseHex(s:unknown,min:number,max:number):Buffer{
 if(typeof s!=='string'||s.length%2!==0||s.length<min*2||
  s.length>max*2||!HEX.test(s))invalid();
 return Buffer.from(s,'hex');
}
/** The ENROLMENT broker must have verified the recipient and opt-in in SQL. */
export function cifrarDestinatarioD068(
 input:{channel:string;supplierOrgId:string;to:string;cryptoKeyId:string},
 keys:D068Keys
):D068Sealed{
 ensureKeys(keys);
 if(!input||typeof input.to!=='string'||!PHONE.test(input.to)||
  typeof input.cryptoKeyId!=='string'||!KEYID.test(input.cryptoKeyId)||
  typeof input.channel!=='string'||!CHANNEL.test(input.channel)||
  typeof input.supplierOrgId!=='string'||!UUID.test(input.supplierOrgId))invalid();
 const identity:D068Id={
  channel:input.channel,supplierOrgId:input.supplierOrgId,
  chatKey:calcularChatDestinatarioD056(input.channel,input.to,keys.hmacIdentity)
 };
 const nonce=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',keys.recipientAes,nonce);
 cipher.setAAD(authenticatedContext(identity,input.cryptoKeyId));
 const encrypted=Buffer.concat([
  cipher.update(input.to+'@s.whatsapp.net','utf8'),cipher.final()
 ]);
 return Object.freeze({...identity,cryptoKeyId:input.cryptoKeyId,
  nonceHex:nonce.toString('hex'),cipherHex:encrypted.toString('hex'),
  tagHex:cipher.getAuthTag().toString('hex')});
}
/** Only the trusted outbound worker may call this, never an API or UI. */
export function descifrarDestinatarioD068(input:unknown,keys:D068Keys):string{
 ensureKeys(keys);
 if(!exactly(input,['channel','chatKey','supplierOrgId',
  'cryptoKeyId','nonceHex','cipherHex','tagHex']))invalid();
 ensureIdentity(input as D068Id);
 if(typeof input.cryptoKeyId!=='string'||!KEYID.test(input.cryptoKeyId))invalid();
 const nonce=parseHex(input.nonceHex,12,12),ciphertext=parseHex(input.cipherHex,20,70),
  tag=parseHex(input.tagHex,16,16);
 let plaintext:string;
 try{
  const dec=createDecipheriv('aes-256-gcm',keys.recipientAes,nonce);
  dec.setAAD(authenticatedContext(input as D068Id,input.cryptoKeyId));
  dec.setAuthTag(tag);
  plaintext=Buffer.concat([dec.update(ciphertext),dec.final()]).toString('utf8');
 }catch{invalid()}
 if(!plaintext.endsWith('@s.whatsapp.net'))invalid();
 const to=plaintext.slice(0,-'@s.whatsapp.net'.length);
 if(!PHONE.test(to))invalid();
 const expected=calcularChatDestinatarioD056(
  input.channel as string,to,keys.hmacIdentity);
 if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(input.chatKey as string,'hex')))
  invalid();
 return to;
}
export type D068PacketQuery=Readonly<{
 roundId:string;supplierOrgId:string;channel:string;chatKey:string;
}>;
/**
 * Read encrypted recipient+scoped D066 material in ONE private SQL read.
 * Still NOT a send permission. Future sender must atomically reserve an
 * invitation and RECHECK current opt-out just before Whapi HTTP call.
 */
export function crearResolverInvitacionD068(
 backend:{committedRpc:(query:string,args:readonly unknown[])=>Promise<unknown>},
 keys:D068Keys
){
 if(!backend||typeof backend.committedRpc!=='function')invalid();
 ensureKeys(keys);
 const safeKeys={hmacIdentity:Buffer.from(keys.hmacIdentity),
  recipientAes:Buffer.from(keys.recipientAes)};
 async function preparar(request:D068PacketQuery){
  if(!exactly(request,['roundId','supplierOrgId','channel','chatKey'])||
   typeof request.roundId!=='string'||!UUID.test(request.roundId)||
   typeof request.supplierOrgId!=='string'||!UUID.test(request.supplierOrgId)||
   typeof request.channel!=='string'||!CHANNEL.test(request.channel)||
   typeof request.chatKey!=='string'||!SHA.test(request.chatKey))invalid();
  let raw:unknown;
  try{
   raw=await backend.committedRpc(QUERY,[
    request.roundId,request.supplierOrgId,request.channel,request.chatKey
   ]);
  }catch{invalid()}
  if(!exactly(raw,['payload'])||!exactly(raw.payload,[
   'packet','chatKey','cryptoKeyId','nonceHex','cipherHex','tagHex']))invalid();
  const p=raw.payload;
  if(!exactly(p.packet,['roundId','supplierOrgId','channel',
   'deliveryZone','vatRequest','items'])||
   p.packet.roundId!==request.roundId||
   p.packet.supplierOrgId!==request.supplierOrgId||
   p.packet.channel!==request.channel||
   p.chatKey!==request.chatKey)invalid();
  const sealed={
   channel:request.channel,chatKey:request.chatKey,
   supplierOrgId:request.supplierOrgId,cryptoKeyId:p.cryptoKeyId,
   nonceHex:p.nonceHex,cipherHex:p.cipherHex,tagHex:p.tagHex
  };
  const to=descifrarDestinatarioD068(sealed,safeKeys);
  const text=formatearConsultaProveedorD066(p.packet);
  if(text.mensajesEnviados!==0||text.contenido.length>1600)invalid();
  return Object.freeze({
   roundId:request.roundId,supplierOrgId:request.supplierOrgId,
   channel:request.channel,chatKey:request.chatKey,
   to,body:text.contenido,estado:'preparado_sin_envio' as const
  });
 }
 return Object.freeze({preparar});
}
