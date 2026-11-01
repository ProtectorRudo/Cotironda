/**
 * D054 / Issue #211: worker server-only, NO Whapi HTTP adapter and NO timer.
 * Drives D047/D053 with independent, committed SQL calls and a transport
 * injected BY A TRUSTED TEST HARNESS. Production transport is not wired.
 *
 * SECURITY INVARIANT: begin_send_d053 MUST COMMIT before transport.sendText.
 * If a DB result is lost after commit, do not send: sweeper marks uncertain.
 * A send that MAY have begun is NEVER automatically retried.
 */
import {calcularAcuseSalidaD050} from './whapi-quoted-confirmation-d050.ts';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/;
const MESSAGE=/^[a-zA-Z0-9._:-]{8,160}$/;
const RECIPIENT=/^[0-9]{9,31}$/;
const CLAIM='select cotironda_private.whapi_lease_reply_d047() as payload';
const PREFLIGHT='select cotironda_private.whapi_finish_reply_d047($1::uuid,$2::uuid,false,null) as payload';
const BEGIN='select cotironda_private.whapi_begin_send_d053($1::uuid,$2::uuid) as payload';
const OUTCOME='select cotironda_private.whapi_record_send_outcome_d053($1::uuid,$2::uuid,$3::text,$4::text) as payload';

type Claim=Readonly<{
  state:'leased';jobId:string;leaseToken:string;roundId:string;
  supplierOrgId:string;revision:number;channelId:string;chatKey:string;
}>;
export type MensajeSalienteD054=Readonly<{
  channelId:string;chatKey:string;roundId:string;supplierOrgId:string;
  revision:number;to:string;body:string;
}>;
export type PuertosEnvioD054=Readonly<{
  /**
   * This must use ONE isolated, AUTOCOMMITTING connection PER invocation.
   * No surrounding transaction or reused uncommitted session is permitted.
   */
  committedRpc:(query:string,params:readonly unknown[])=>Promise<unknown>;
  // All fields from a VERIFIED private resolver, not raw WhatsApp input.
  resolverMensaje:(claim:Claim)=>Promise<MensajeSalienteD054>;
  // In D054 ONLY fake transport is injected by tests; no real adapter.
  transport:Readonly<{sendText:(payload:Readonly<{
    to:string;body:string;jobId:string;
  }>)=>Promise<unknown>}>;
}>;
export type ResultadoEnvioD054=Readonly<{
  estado:'sin_trabajo'|'reintento_preenvio'|'agotado_preenvio'|'cancelado_preenvio'|
    'aceptado_por_transporte'|'incierto_sin_reenvio'|'sin_envio_estado_desconocido';
}>;
function record(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function validUuid(x:unknown):x is string{return typeof x==='string'&&UUID.test(x)}
function validHex(x:unknown):x is string{return typeof x==='string'&&HEX.test(x)}
function validChannel(x:unknown):x is string{return typeof x==='string'&&CHANNEL.test(x)}
function invalid():never{throw new TypeError('d054_invalid_private_contract')}
function payload(raw:unknown):unknown{
  if(!record(raw)||Object.keys(raw).length!==1||!('payload' in raw))invalid();
  return raw.payload;
}
function validarClaim(raw:unknown):Claim{
  if(!record(raw)||Object.keys(raw).sort().join(',')!==
    'channelId,chatKey,jobId,leaseToken,revision,roundId,state,supplierOrgId'||
    raw.state!=='leased'||!validUuid(raw.jobId)||!validUuid(raw.leaseToken)||
    !validUuid(raw.roundId)||!validUuid(raw.supplierOrgId)||
    !validChannel(raw.channelId)||!validHex(raw.chatKey)||
    !Number.isInteger(raw.revision)||Number(raw.revision)<1||
    Number(raw.revision)>100000)invalid();
  return raw as Claim;
}
function validarMensaje(x:unknown,claim:Claim):x is MensajeSalienteD054{
  if(!record(x)||Object.keys(x).sort().join(',')!==
    'body,channelId,chatKey,revision,roundId,supplierOrgId,to')return false;
  if(x.channelId!==claim.channelId||x.chatKey!==claim.chatKey||
    x.roundId!==claim.roundId||x.supplierOrgId!==claim.supplierOrgId||
    x.revision!==claim.revision)return false;
  return typeof x.to==='string'&&RECIPIENT.test(x.to)&&
    typeof x.body==='string'&&x.body.length>=4&&x.body.length<=1600&&
    !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(x.body);
}
function status(x:unknown,allowed:readonly string[]):string{
  const v=payload(x);
  if(!record(v)||typeof v.state!=='string'||!allowed.includes(v.state))invalid();
  return v.state;
}
export function crearTrabajadorSalidaD054(ports:PuertosEnvioD054,ackKey:Buffer){
  if(!ports||typeof ports.committedRpc!=='function'||
    typeof ports.resolverMensaje!=='function'||
    !ports.transport||typeof ports.transport.sendText!=='function'||
    !Buffer.isBuffer(ackKey)||ackKey.length!==32)invalid();
  async function rpc(query:string,args:readonly unknown[]):Promise<unknown>{
    // A rejection here must NEVER trigger network activity.
    return payload(await ports.committedRpc(query,args));
  }
  async function uno():Promise<ResultadoEnvioD054>{
    let c:Claim;
    try{
      const result=await rpc(CLAIM,[]);
      if(result===null)return Object.freeze({estado:'sin_trabajo'});
      c=validarClaim(result);
    }catch{return Object.freeze({estado:'sin_envio_estado_desconocido'});}
    let outgoing:MensajeSalienteD054;
    try{
      outgoing=await ports.resolverMensaje(c);
      if(!validarMensaje(outgoing,c))invalid();
    }catch{
      // We know no HTTP send was initiated. D047 handles retry budget.
      try{
        const result=await rpc(PREFLIGHT,[c.jobId,c.leaseToken]);
        if(!record(result)||!['queued','exhausted'].includes(String(result.state)))invalid();
        return Object.freeze({estado:result.state==='exhausted'?
          'agotado_preenvio':'reintento_preenvio'});
      }catch{return Object.freeze({estado:'sin_envio_estado_desconocido'});}
    }
    // An isolated DB transaction MUST be committed before sendText() is called.
    try{
      const begin=await rpc(BEGIN,[c.jobId,c.leaseToken]);
      if(!record(begin)||!['in_flight','cancelled'].includes(String(begin.state)))invalid();
      if(begin.state==='cancelled')return Object.freeze({estado:'cancelado_preenvio'});
      if(begin.jobId!==c.jobId)invalid();
    }catch{
      // Lost DB ACK could mean begin_send was committed; NEVER send or requeue.
      return Object.freeze({estado:'sin_envio_estado_desconocido'});
    }
    let outcome:'accepted_by_transport'|'uncertain'='uncertain';
    let ack:string|null=null;
    try{
      const answer=await ports.transport.sendText(Object.freeze({
        to:outgoing.to,body:outgoing.body,jobId:c.jobId
      }));
      // Only a strictly validated external ID can be HMAC'd.
      if(record(answer)&&Object.keys(answer).sort().join(',')==='messageId,state'&&
        answer.state==='accepted'&&
        typeof answer.messageId==='string'&&MESSAGE.test(answer.messageId)){
          ack=calcularAcuseSalidaD050(ackKey,c.channelId,answer.messageId);
          outcome='accepted_by_transport';
      }
    }catch{
      // timeout, disconnect, malformed response: possibly sent -> uncertain
    }
    try{
      const result=await rpc(OUTCOME,[c.jobId,c.leaseToken,outcome,ack]);
      if(!record(result)||result.state!==outcome)invalid();
      return Object.freeze({estado:outcome==='accepted_by_transport'?
        'aceptado_por_transporte':'incierto_sin_reenvio'});
    }catch{
      // HTTP may already have delivered; never issue a second send.
      return Object.freeze({estado:'incierto_sin_reenvio'});
    }
  }
  return Object.freeze({procesarUno:uno});
}
