/**
 * D050 — verificador OFFLINE de intención "Confirmo" por cita Whapi.
 * Requiere un mensaje cifrado y guardado por D027/D029/D028, más
 * consultas al ledger interno, nunca identidad extraída del chat.
 * No crea endpoints, NO confirma en PG, NO conecta Whapi/OpenAI.
 */
import {createHmac,timingSafeEqual} from 'node:crypto';
import type {EntradaCifradaD028} from './whapi-crypto-broker.ts';

const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MESSAGE=/^[a-zA-Z0-9._:-]{8,160}$/;
const CHANNEL=/^[a-zA-Z0-9_-]{4,64}$/;

export type EntradaConfirmableD050=Readonly<{
  channel:string;chatKey:string;messageKey:string;
  supplierOrgId:string;roundId:string;persistido:true;
}>;
export type AcuseSalidaConfiableD050=Readonly<{
  jobId:string;roundId:string;supplierOrgId:string;channel:string;
  chatKey:string;originMessageKey:string;revision:number;
  transportAckHmac:string;estado:'accepted_by_transport';
}>;
export type PuertosConfirmacionD050=Readonly<{
  verificarContenido:(entrada:EntradaCifradaD028)=>Readonly<{
    tipo:string;texto:string|null;marcaTiempoUnix:number;quotedMessageId?:string;
  }>;
  buscarEntrada:(channel:string,messageKey:string)=>
    Promise<EntradaConfirmableD050|null>;
  buscarAcuseSalida:(channel:string,ackHmac:string)=>
    Promise<AcuseSalidaConfiableD050|null>;
}>;
export type ConfirmacionPreparadaD050=Readonly<{
  estado:'lista_para_confirmacion_privada';
  channel:string;messageKey:string;
  replyJobId:string;confirmEventId:string;
  verifiedReplyAckHmac:string;intentHmac:string;
}>;
function reject():never{throw new TypeError('d050_confirmacion_no_verificada')}
function hmac(key:Buffer,purpose:string,data:readonly unknown[]):string{
  return createHmac('sha256',key)
    .update(JSON.stringify(['cotironda','d050',1,purpose,...data]),'utf8')
    .digest('hex');
}
function equalHex(a:string,b:string):boolean{
  return SHA.test(a)&&SHA.test(b)&&timingSafeEqual(
    Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function validUuid(s:unknown):s is string{return typeof s==='string'&&UUID.test(s)}
function validHex(s:unknown):s is string{return typeof s==='string'&&SHA.test(s)}
function validChannel(s:unknown):s is string{return typeof s==='string'&&CHANNEL.test(s)}
function validRecord(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function deterministicUuid(key:Buffer,fields:readonly unknown[]):string{
  const bytes=Buffer.from(hmac(key,'confirm-event',fields),'hex').subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const s=bytes.toString('hex');
  return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
}
/** HMAC sobre ID saliente crudo: mismo algoritmo y clave en emisor/ledger. */
export function calcularAcuseSalidaD050(key:Buffer,channel:string,messageId:string):string{
  if(!Buffer.isBuffer(key)||key.length!==32||!validChannel(channel)||
    typeof messageId!=='string'||!MESSAGE.test(messageId))reject();
  return hmac(key,'outbound-ack',[channel,messageId]);
}
export async function prepararConfirmacionWhapiD050(
  entrada:EntradaCifradaD028,puertos:PuertosConfirmacionD050,claveHmac:Buffer
):Promise<ConfirmacionPreparadaD050>{
  if(!Buffer.isBuffer(claveHmac)||claveHmac.length!==32||
    !validRecord(entrada)||!validChannel(entrada.channel)||
    !validHex(entrada.chatKey)||!validHex(entrada.messageKey)||
    !puertos||typeof puertos.verificarContenido!=='function'||
    typeof puertos.buscarEntrada!=='function'||
    typeof puertos.buscarAcuseSalida!=='function')reject();
  let mensaje:ReturnType<PuertosConfirmacionD050['verificarContenido']>;
  try{mensaje=puertos.verificarContenido(entrada)}
  catch{reject()}
  if(!validRecord(mensaje)||mensaje.tipo!=='text'||
    typeof mensaje.texto!=='string'||!/^[ \t]*confirmo[ \t]*$/i.test(mensaje.texto)||
    mensaje.texto.length>32||
    typeof mensaje.quotedMessageId!=='string'||
    !MESSAGE.test(mensaje.quotedMessageId))reject();

  // Puerto backend deriva org/ronda del inbox D028, no del webhook original.
  let vinculo:EntradaConfirmableD050|null;
  try{vinculo=await puertos.buscarEntrada(entrada.channel,entrada.messageKey)}
  catch{reject()}
  if(!validRecord(vinculo)||vinculo.persistido!==true||
    vinculo.channel!==entrada.channel||vinculo.chatKey!==entrada.chatKey||
    vinculo.messageKey!==entrada.messageKey||
    !validUuid(vinculo.roundId)||!validUuid(vinculo.supplierOrgId))reject();

  const ackHmac=calcularAcuseSalidaD050(
    claveHmac,entrada.channel,mensaje.quotedMessageId);
  let ack:AcuseSalidaConfiableD050|null;
  try{ack=await puertos.buscarAcuseSalida(entrada.channel,ackHmac)}
  catch{reject()}
  if(!validRecord(ack)||ack.estado!=='accepted_by_transport'||
    !validUuid(ack.jobId)||!validUuid(ack.roundId)||
    !validUuid(ack.supplierOrgId)||!validChannel(ack.channel)||
    !validHex(ack.chatKey)||!validHex(ack.originMessageKey)||
    !validHex(ack.transportAckHmac)||
    !Number.isSafeInteger(ack.revision)||ack.revision<1||ack.revision>100000||
    ack.channel!==entrada.channel||ack.chatKey!==entrada.chatKey||
    ack.roundId!==vinculo.roundId||ack.supplierOrgId!==vinculo.supplierOrgId||
    ack.originMessageKey===entrada.messageKey||
    !equalHex(ack.transportAckHmac,ackHmac))reject();

  const identity=[entrada.channel,entrada.messageKey,ack.jobId,
    ack.roundId,ack.supplierOrgId,ack.revision,ackHmac];
  // D049 revalida el vínculo, la ronda, el consentimiento y los términos.
  return Object.freeze({
    estado:'lista_para_confirmacion_privada',
    channel:entrada.channel,messageKey:entrada.messageKey,
    replyJobId:ack.jobId,
    confirmEventId:deterministicUuid(claveHmac,identity),
    verifiedReplyAckHmac:ackHmac,
    intentHmac:hmac(claveHmac,'confirmo-intent',identity)
  });
}
