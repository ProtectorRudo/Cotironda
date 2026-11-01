/**
 * MVP-021 / D070: dedicated supplier-invitation sender. Server-only.
 * COMMITTED SQL begin before HTTP; D055 is the existing Whapi transport.
 * Any error after begin is UNCERTAIN and NEVER automatically retried.
 * Disabled by default. No env lookup, timers, routes, global fetch or logs.
 */
import {calcularAcuseSalidaD050} from './whapi-quoted-confirmation-d050.ts';
import {calcularChatDestinatarioD056} from './whapi-send-authorization-d056.ts';
import {crearTransporteWhapiCloudD055} from './whapi-cloud-transport-d055.ts';
import {crearResolverInvitacionD068} from './whapi-encrypted-recipient-d068.ts';
import type {D068Keys} from './whapi-encrypted-recipient-d068.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{64}$/u,CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const MESSAGE=/^[A-Za-z0-9._:-]{8,160}$/u;
const CLAIM='select cotironda_private.whapi_claim_invite_d070() as payload';
const FAIL='select cotironda_private.whapi_fail_preflight_invite_d070($1::uuid,$2::uuid) as payload';
const BEGIN='select cotironda_private.whapi_begin_invite_d070($1::uuid,$2::uuid) as payload';
const CHECK='select cotironda_private.whapi_authorize_invite_d070($1::uuid,$2::text,$3::text) as payload';
const FINISH='select cotironda_private.whapi_finish_invite_d070($1::uuid,$2::uuid,$3::text,$4::text) as payload';
function denied():never{throw new Error('d070_sender_unavailable')}
function obj(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return obj(v)&&Object.keys(v).length===keys.length&&
  Object.keys(v).every(k=>keys.includes(k));
}
function payload(v:unknown):unknown{
 if(!exact(v,['payload']))denied();
 return v.payload;
}
type Claim=Readonly<{
 state:'leased';jobId:string;leaseToken:string;roundId:string;
 supplierOrgId:string;channel:string;chatKey:string;
}>;
export type OpcionesEmisorD070=Readonly<{
 habilitado:boolean;pilotoAutorizado:boolean;
 channel:string;token?:string;destinatariosPermitidos?:readonly string[];
 keys:D068Keys;ackKey:Buffer;
 committedRpc:(sql:string,params:readonly unknown[])=>Promise<unknown>;
 fetcher?:typeof fetch;
}>;
export function crearEmisorInvitacionD070(config:OpcionesEmisorD070){
 if(!config||typeof config.habilitado!=='boolean'||
  typeof config.pilotoAutorizado!=='boolean'||
  typeof config.channel!=='string'||!CHANNEL.test(config.channel)||
  typeof config.committedRpc!=='function'||
  !Buffer.isBuffer(config.ackKey)||config.ackKey.length!==32||
  !config.keys||!Buffer.isBuffer(config.keys.hmacIdentity)||
  !Buffer.isBuffer(config.keys.recipientAes)||
  config.keys.hmacIdentity.length!==32||config.keys.recipientAes.length!==32||
  config.keys.hmacIdentity.equals(config.keys.recipientAes)||
  config.ackKey.equals(config.keys.hmacIdentity)||
  config.ackKey.equals(config.keys.recipientAes))denied();
 const keys:D068Keys={hmacIdentity:Buffer.from(config.keys.hmacIdentity),
  recipientAes:Buffer.from(config.keys.recipientAes)};
 const ackKey=Buffer.from(config.ackKey);
 async function rpc(sql:string,args:readonly unknown[]):Promise<unknown>{
  return payload(await config.committedRpc(sql,args));
 }
 const resolver=crearResolverInvitacionD068({committedRpc:config.committedRpc},keys);
 const transport=crearTransporteWhapiCloudD055({
  habilitado:config.habilitado,pilotoAutorizado:config.pilotoAutorizado,
  token:config.token,
  destinatariosPermitidos:config.destinatariosPermitidos,
  fetcher:config.fetcher,
  autorizarIntento:async request=>{
   try{
    if(!UUID.test(request.jobId))return false;
    const chatKey=calcularChatDestinatarioD056(
      config.channel,request.to,keys.hmacIdentity);
    const result=await rpc(CHECK,[request.jobId,config.channel,chatKey]);
    return result===true;
   }catch{return false;}
  }
 });
 async function procesarUno(){
  // Avoid consuming any lease while feature is disabled or unconfigured.
  if(config.habilitado!==true||config.pilotoAutorizado!==true||
    typeof config.fetcher!=='function'||typeof config.token!=='string'||
    !Array.isArray(config.destinatariosPermitidos)||
    config.destinatariosPermitidos.length===0)
   return Object.freeze({estado:'desactivado' as const});
  let claim:Claim;
  try{
   const raw=await rpc(CLAIM,[]);
   if(raw===null)return Object.freeze({estado:'cola_vacia' as const});
   if(!exact(raw,['state','jobId','leaseToken','roundId',
    'supplierOrgId','channel','chatKey'])||
    raw.state!=='leased'||typeof raw.jobId!=='string'||
    !UUID.test(raw.jobId)||typeof raw.leaseToken!=='string'||
    !UUID.test(raw.leaseToken)||typeof raw.roundId!=='string'||
    !UUID.test(raw.roundId)||typeof raw.supplierOrgId!=='string'||
    !UUID.test(raw.supplierOrgId)||raw.channel!==config.channel||
    typeof raw.chatKey!=='string'||!SHA.test(raw.chatKey))denied();
   claim=raw as Claim;
  }catch{return Object.freeze({estado:'estado_desconocido_sin_envio' as const});}
  let outgoing:Awaited<ReturnType<typeof resolver.preparar>>;
  try{
   outgoing=await resolver.preparar({
    roundId:claim.roundId,supplierOrgId:claim.supplierOrgId,
    channel:claim.channel,chatKey:claim.chatKey
   });
   if(!exact(outgoing,['roundId','supplierOrgId','channel',
     'chatKey','to','body','estado'])||
    outgoing.estado!=='preparado_sin_envio'||
    outgoing.roundId!==claim.roundId||
    outgoing.supplierOrgId!==claim.supplierOrgId||
    outgoing.channel!==claim.channel||
    outgoing.chatKey!==claim.chatKey)denied();
  }catch{
   try{
    const state=await rpc(FAIL,[claim.jobId,claim.leaseToken]);
    if(!exact(state,['state'])||
     !['queued','exhausted'].includes(String(state.state)))denied();
    return Object.freeze({estado:state.state==='queued'?
      'reintento_preenvio' as const:'agotado_preenvio' as const});
   }catch{return Object.freeze({estado:'estado_desconocido_sin_envio' as const});}
  }
  try{
   const begin=await rpc(BEGIN,[claim.jobId,claim.leaseToken]);
   if(!exact(begin,['state','jobId'])||
     begin.state!=='in_flight'||begin.jobId!==claim.jobId) {
    if(exact(begin,['state'])&&begin.state==='cancelled')
     return Object.freeze({estado:'cancelado_preenvio' as const});
    denied();
   }
  }catch{
   // ACK lost after commit: the database may be in_flight. Never send.
   return Object.freeze({estado:'estado_desconocido_sin_envio' as const});
  }
  let outcome:'accepted_by_transport'|'uncertain'='uncertain',ack:string|null=null;
  try{
   const response=await transport.sendText({
    jobId:claim.jobId,to:outgoing.to,body:outgoing.body});
   if(exact(response,['state','messageId'])&&response.state==='accepted'&&
     typeof response.messageId==='string'&&MESSAGE.test(response.messageId)){
    outcome='accepted_by_transport';
    ack=calcularAcuseSalidaD050(ackKey,claim.channel,response.messageId);
   }
  }catch{
   // Timeout, 429, malformed ACK, final BAJA: might have been sent; no retry.
  }
  try{
   const recorded=await rpc(FINISH,[claim.jobId,claim.leaseToken,outcome,ack]);
   if(!obj(recorded)||recorded.state!==outcome)denied();
   return Object.freeze({estado:outcome==='accepted_by_transport'?
    'aceptado_por_transporte' as const:'incierto_sin_reenvio' as const});
  }catch{
   return Object.freeze({estado:'incierto_sin_reenvio' as const});
  }
 }
 return Object.freeze({procesarUno});
}
