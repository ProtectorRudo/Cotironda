/**
 * P0: adapter for dedicated, non-exposed PostgreSQL terms-sender functions.
 * Each committedRpc MUST use its own AUTOCOMMITTED DB call through a vetted
 * DB LOGIN granted ONLY cotironda_pilot_terms_sender_p0.
 *
 * No global SQL pool, HTTP, env, service_role or Supabase Data API fallback.
 * Do not wire before explicit pilot authorization, approved terms, real AAL2
 * operator and demonstrated isolation/credentials.
 */
import type {AvisoClaimP0,AvisoPortsP0,AvisoPersistidoP0}
 from './whapi-terms-onboarding-p0.ts';
import {crearResolverContactoProveedorP0}
 from './whapi-terms-recipient-p0.ts';
import type {RecipientKeysP0} from './whapi-terms-recipient-p0.ts';

const CLAIM='select cotironda_piloto_privado.terms_claim_p0() as payload';
const BEGIN='select cotironda_piloto_privado.terms_begin_p0($1::uuid,$2::uuid) as payload';
const AUTHORIZE='select cotironda_piloto_privado.terms_authorize_p0($1::uuid,$2::uuid,$3::text) as payload';
const FINISH='select cotironda_piloto_privado.terms_finish_p0($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text) as payload';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{64}$/u;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const SUPPLIER=/^[a-z][a-z0-9_]{2,63}$/u;
function unavailable():never{throw Error('p0_terms_sql_no_autorizado')}
function isRecord(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function payload(v:unknown):unknown{
 if(!isRecord(v)||Object.keys(v).length!==1||!('payload' in v))
  unavailable();
 return v.payload;
}
export type TermsSqlPortP0=Readonly<{
 // Never use an ambient transaction: lost COMMIT before HTTP means no send.
 committedRpc:(query:string,args:readonly unknown[])=>Promise<unknown>;
 // Existing encrypted verified supplier resolver (not an HTTP user argument).
 verifiedRecipient:(claim:AvisoClaimP0)=>Promise<string>;
}>;
export function crearPuertosSqlAvisosP0(config:TermsSqlPortP0):AvisoPortsP0{
 if(!config||typeof config.committedRpc!=='function'||
   typeof config.verifiedRecipient!=='function')unavailable();
 async function rpc(sql:string,args:readonly unknown[]):Promise<unknown>{
  try{return payload(await config.committedRpc(sql,args))}
  catch{unavailable()}
 }
 return Object.freeze({
  claim:async()=>{
   const raw=await rpc(CLAIM,[]);
   if(raw!==null&&(!isRecord(raw)||raw.state!=='leased'))unavailable();
   return raw;
  },
  resolveRecipient:config.verifiedRecipient,
  beginCommitted:async(c)=>{
   if(!UUID.test(c.jobId)||!UUID.test(c.leaseToken))unavailable();
   const raw=await rpc(BEGIN,[c.jobId,c.leaseToken]);
   if(!isRecord(raw)||!['in_flight','cancelled'].includes(String(raw.state)))
     unavailable();
   return raw;
  },
  authorizeCommitted:async(c,chatHmac)=>{
   if(!UUID.test(c.jobId)||!UUID.test(c.leaseToken)||
     !SHA.test(chatHmac)||!CHANNEL.test(c.channel))unavailable();
   return (await rpc(AUTHORIZE,[c.jobId,c.leaseToken,chatHmac]))===true;
  },
  finishCommitted:async(result:AvisoPersistidoP0)=>{
   if(!UUID.test(result.jobId)||!UUID.test(result.leaseToken)||
     !SUPPLIER.test(result.supplierKey)||!SHA.test(result.termsSha256)||
     !SHA.test(result.outboundBodySha256)||
     result.termsVersion!=='cotironda-originales-alta-v1'||
     !['api_accepted','uncertain'].includes(result.state)||
     (result.state==='api_accepted'&&!SHA.test(result.noticeMessageHmac??''))||
     (result.state==='uncertain'&&result.noticeMessageHmac!==null))unavailable();
   const raw=await rpc(FINISH,[result.jobId,result.leaseToken,
     result.supplierKey,result.termsVersion,result.termsSha256,
     result.state,result.noticeMessageHmac,result.outboundBodySha256]);
   if(!isRecord(raw)||Object.keys(raw).length!==1||
     !['api_accepted','uncertain','rejected'].includes(String(raw.state)))
     unavailable();
   return raw;
  }
 });
}

/** Production-ready wiring contract, still disabled until operator/DB login
 * provisioned. Uses pilot MVP109 AES ciphertext, never a static phone map. */
export function crearPuertosSqlAvisosCifradosP0(
 config:Readonly<{
  committedRpc:(query:string,args:readonly unknown[])=>Promise<unknown>;
  keys:RecipientKeysP0;
 }>
):AvisoPortsP0{
 if(!config||typeof config.committedRpc!=='function')unavailable();
 const verifiedRecipient=crearResolverContactoProveedorP0(
  {committedRpc:config.committedRpc},config.keys);
 return crearPuertosSqlAvisosP0({
  committedRpc:config.committedRpc,verifiedRecipient
 });
}
