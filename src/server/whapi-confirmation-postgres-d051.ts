/**
 * D051 — puerto server-only, sin conexión automática a DB, Whapi ni API.
 * La instancia db debe ser de un worker autenticado por infraestructura,
 * con EXECUTE exclusivamente de funciones privadas del rol D049 gateway.
 * NO aceptar ni reutilizar credenciales del frontend.
 */
import type {EntradaCifradaD028} from './whapi-crypto-broker.ts';
import {
 prepararConfirmacionWhapiD050,
 type PuertosConfirmacionD050,
 type ConfirmacionPreparadaD050
} from './whapi-quoted-confirmation-d050.ts';

export type PuertoDbConfirmacionD051=Readonly<{
 query:(sql:string,params:readonly unknown[])=>
   Promise<Readonly<{rows:readonly Record<string,unknown>[] }>>;
}>;
export type VerificarContenidoD051=PuertosConfirmacionD050['verificarContenido'];
const LOAD='select cotironda_private.whapi_confirm_load_inbox_d051($1::text,$2::text) as payload';
const FIND='select cotironda_private.whapi_confirm_find_ack_d051($1::text,$2::text) as payload';
const CONFIRM='select cotironda_private.whapi_confirm_from_inbox_d049($1::text,$2::text,$3::uuid,$4::uuid,$5::text,$6::text) as payload';
const CHANNEL=/^[a-zA-Z0-9_-]{4,64}$/;
const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY_ID=/^[a-z][a-z0-9_]{2,40}$/;
const H64=/^[a-f0-9]+$/;
function fail():never{throw new Error('d051_confirmacion_no_disponible')}
function obj(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return obj(v)&&Object.keys(v).length===keys.length&&
   Object.keys(v).every(k=>keys.includes(k));
}
function str(x:unknown,re:RegExp):x is string{return typeof x==='string'&&re.test(x)}
function num(x:unknown,min:number,max:number):x is number{
 return typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
}
function bytes(s:unknown,min:number,max:number):Buffer{
 if(typeof s!=='string'||s.length<min*2||s.length>max*2||
   s.length%2!==0||!H64.test(s))fail();
 return Buffer.from(s,'hex');
}
const INBOX_KEYS=['channel','chatKey','messageKey','supplierOrgId','roundId',
 'kind','sourceUnix','cryptoKeyId','fingerprint','cipherHex','nonceHex','tagHex'];
const ACK_KEYS=['jobId','roundId','supplierOrgId','channel','chatKey',
 'originMessageKey','revision','transportAckHmac','estado'];
const PROOF_KEYS=['estado','channel','messageKey','replyJobId',
 'confirmEventId','verifiedReplyAckHmac','intentHmac'];
export function crearPuertoPostgresConfirmacionD051(
 db:PuertoDbConfirmacionD051,verificarContenido:VerificarContenidoD051
){
 if(!db||typeof db.query!=='function'||typeof verificarContenido!=='function')fail();
 async function call(sql:string,params:readonly unknown[]):Promise<unknown>{
  try{
   const result=await db.query(sql,params);
   if(!obj(result)||!Array.isArray(result.rows)||result.rows.length!==1||
     !exact(result.rows[0],['payload']))fail();
   return result.rows[0].payload;
  }catch{fail()}
 }
 async function load(channel:string,messageKey:string){
  if(!str(channel,CHANNEL)||!str(messageKey,HEX))fail();
  const p=await call(LOAD,[channel,messageKey]);
  if(p===null)return null;
  if(!exact(p,INBOX_KEYS)||p.channel!==channel||p.messageKey!==messageKey||
    !str(p.chatKey,HEX)||!str(p.supplierOrgId,UUID)||
    !str(p.roundId,UUID)||p.kind!=='text'||
    !num(p.sourceUnix,1,Number.MAX_SAFE_INTEGER)||
    !str(p.cryptoKeyId,KEY_ID)||!str(p.fingerprint,HEX))fail();
  const d:EntradaCifradaD028=Object.freeze({
   channel,chatKey:p.chatKey,messageKey,
   fingerprint:p.fingerprint,kind:'text',
   sourceUnix:p.sourceUnix,cryptoKeyId:p.cryptoKeyId,
   ciphertext:bytes(p.cipherHex,1,8192),
   nonce:bytes(p.nonceHex,12,12),
   tag:bytes(p.tagHex,16,16)
  });
  return Object.freeze({encrypted:d,supplierOrgId:p.supplierOrgId,roundId:p.roundId});
 }
 const ports:PuertosConfirmacionD050={
  verificarContenido,
  buscarEntrada:async(channel,messageKey)=>{
   const row=await load(channel,messageKey);
   if(!row)return null;
   return {
    channel,chatKey:row.encrypted.chatKey,messageKey,
    supplierOrgId:row.supplierOrgId,roundId:row.roundId,persistido:true
   };
  },
  buscarAcuseSalida:async(channel,ackHmac)=>{
   if(!str(channel,CHANNEL)||!str(ackHmac,HEX))fail();
   const p=await call(FIND,[channel,ackHmac]);
   if(p===null)return null;
   if(!exact(p,ACK_KEYS)||p.channel!==channel||
      p.transportAckHmac!==ackHmac||
      !str(p.jobId,UUID)||!str(p.roundId,UUID)||!str(p.supplierOrgId,UUID)||
      !str(p.chatKey,HEX)||!str(p.originMessageKey,HEX)||
      !num(p.revision,1,100000)||p.estado!=='accepted_by_transport')fail();
   return {
    jobId:p.jobId,roundId:p.roundId,supplierOrgId:p.supplierOrgId,
    channel,chatKey:p.chatKey,originMessageKey:p.originMessageKey,
    revision:p.revision,transportAckHmac:ackHmac,estado:'accepted_by_transport'
   };
  }
 };
 async function confirmar(proof:ConfirmacionPreparadaD050){
  if(!exact(proof,PROOF_KEYS)||
    proof.estado!=='lista_para_confirmacion_privada'||
    !str(proof.channel,CHANNEL)||!str(proof.messageKey,HEX)||
    !str(proof.replyJobId,UUID)||!str(proof.confirmEventId,UUID)||
    !str(proof.verifiedReplyAckHmac,HEX)||!str(proof.intentHmac,HEX))fail();
  const raw=await call(CONFIRM,[proof.channel,proof.messageKey,
    proof.replyJobId,proof.confirmEventId,
    proof.verifiedReplyAckHmac,proof.intentHmac]);
  if(!exact(raw,['state','revision','version','repeated'])||
     raw.state!=='offer_confirmed'||
     !num(raw.revision,1,100000)||!num(raw.version,1,100000)||
     typeof raw.repeated!=='boolean')fail();
  return Object.freeze({estado:'cotizacion_confirmada_en_pg' as const,
   revision:raw.revision,version:raw.version,repetido:raw.repeated});
 }
 async function prepararYConfirmar(
  channel:string,messageKey:string,secret:Buffer
 ){
  const row=await load(channel,messageKey);
  if(!row)fail();
  // No hay pasos de red: D050 acredita reply-to y D049 revalida
  // transaccionalmente versión, opt-out, ventana e importes.
  const proof=await prepararConfirmacionWhapiD050(row.encrypted,ports,secret);
  return confirmar(proof);
 }
 return Object.freeze({cargarEntrada:load,puertos:ports,confirmar,
  prepararYConfirmar});
}
