/**
 * MVP-020 / D069. Server-only enrolment for a PREVERIFIED D028 supplier contact.
 * The trusted caller has already established ownership + opt-in independently.
 * D068 SQL independently revalidates the supplier, channel, HMAC and opt-out
 * at COMMIT. This port NEVER creates consent or a contact, and sends no HTTP.
 * It is valid before a round exists (unlike the D030 incoming quote resolver).
 */
import {cifrarDestinatarioD068} from './whapi-encrypted-recipient-d068.ts';
import type {D068Keys} from './whapi-encrypted-recipient-d068.ts';

const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const KEYID=/^[a-z][a-z0-9_]{2,40}$/u;
const SQL=`select cotironda_private.whapi_store_recipient_d068(
 $1::text,$2::text,$3::uuid,$4::text,
 pg_catalog.decode($5::text,'hex'),
 pg_catalog.decode($6::text,'hex'),
 pg_catalog.decode($7::text,'hex')) as payload`;
function deny():never{throw new Error('d069_enrolamiento_no_autorizado')}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
   Object.keys(v).length===keys.length&&
   Object.keys(v).every(k=>keys.includes(k));
}
export type IdentidadContactadaD069=Readonly<{
 channel:string;supplierOrgId:string;to:string;
}>;
export type IdentidadSeudonimaD069=Readonly<{
 channel:string;supplierOrgId:string;chatKey:string;
}>;
export type ConfigEnrolamientoD069=Readonly<{
 habilitado:boolean;channel:string;cryptoKeyId:string;
 keys:D068Keys;
 /** Strongly authenticated onboarding/broker, NOT WhatsApp body/AI/frontend. */
 autorizarContacto:(identity:IdentidadSeudonimaD069)=>Promise<boolean>;
 /** Exclusive server DB login; committed RPC, never a client Data API. */
 committedRpc:(query:string,args:readonly unknown[])=>Promise<unknown>;
}>;
export function crearEnroladorDestinatarioD069(config:ConfigEnrolamientoD069){
 if(!config||typeof config.habilitado!=='boolean'||
  typeof config.channel!=='string'||!CHANNEL.test(config.channel)||
  typeof config.cryptoKeyId!=='string'||!KEYID.test(config.cryptoKeyId)||
  typeof config.autorizarContacto!=='function'||
  typeof config.committedRpc!=='function')deny();
 // Keep crypto material inside the server module, never expose to caller.
 if(!config.keys||!Buffer.isBuffer(config.keys.hmacIdentity)||
   !Buffer.isBuffer(config.keys.recipientAes))deny();
 const keys:D068Keys={hmacIdentity:Buffer.from(config.keys.hmacIdentity),
  recipientAes:Buffer.from(config.keys.recipientAes)};
 // Validate both keys early using D068; failed, disabled, or missing secrets
 // cannot be used to generate stored data. The actual number is not recorded.
 if(keys.hmacIdentity.length!==32||keys.recipientAes.length!==32||
  keys.hmacIdentity.equals(keys.recipientAes))deny();
 async function registrarContactoVerificado(contact:IdentidadContactadaD069){
  if(config.habilitado!==true||!exact(contact,['channel','supplierOrgId','to'])||
    contact.channel!==config.channel)deny();
  let envelope:ReturnType<typeof cifrarDestinatarioD068>;
  try{
   envelope=cifrarDestinatarioD068({...contact,
    cryptoKeyId:config.cryptoKeyId},keys);
  }catch{deny()}
  const identity=Object.freeze({channel:envelope.channel,
    supplierOrgId:envelope.supplierOrgId,chatKey:envelope.chatKey});
  // A real authenticated contact-registration authority must approve this
  // exact tuple. D068 SQL will independently check verified_at, opt-in,
  // supplier and BAJA, including when the contact has no open invitation.
  try{
   if(await config.autorizarContacto(identity)!==true)deny();
  }catch{deny()}
  let result:unknown;
  try{
   result=await config.committedRpc(SQL,[
    envelope.channel,envelope.chatKey,envelope.supplierOrgId,
    envelope.cryptoKeyId,envelope.nonceHex,envelope.cipherHex,envelope.tagHex
   ]);
  }catch{deny()}
  if(!exact(result,['payload'])||!exact(result.payload,['state'])||
    !['saved','already_saved'].includes(String(result.payload.state)))deny();
  return Object.freeze({estado:result.payload.state==='saved'?
    'registrado' as const:'ya_registrado' as const});
 }
 return Object.freeze({registrarContactoVerificado});
}
