/**
 * MVP-040: buyer WhatsApp -> private round -> existing D071 invitation queue.
 * Server-only. NO HTTP endpoint, WhatsApp transport, media downloader, AI call
 * or direct Supabase Auth use; all ports MUST be a committed private backend.
 * Unlike supplier D027, an incoming buyer requires an independent verified
 * buyer-company binding, explicit sharing consent and durable idempotency.
 */
import {prepararPedidoTextoMvp028} from '../domain/pedido-piloto-mvp028.ts';
import {separarListaWhatsappNaturalMvp058} from '../domain/lista-whatsapp-natural-mvp058.ts';
import {extraerPlazoCotizacionMvp053} from '../domain/plazo-cotizacion-mvp053.ts';
import type {BuyerRoundInputD064} from './buyer-round-create-http-d064.ts';

type CanalEntrada='text'|'document'|'image'|'audio'|'voice';
type PendienteZona=Readonly<{
 origenMessageKey:string;chatKey:string;textoOriginal:string;
}>;
export type EntradaCompradorD073=Readonly<{
 channel:string;messageKey:string;chatKey:string;buyerOrgId:string;
 tipo:CanalEntrada;textoVerificado:string|null;
 medioEscaneadoYExtraido:boolean;
 compartirContactoConsentido:boolean;
 pendienteZona:PendienteZona|null;
}>;
export type PuertoCompradorD073=Readonly<{
 // MUST verify webhook/authenticated chat ownership, persisted encrypted
 // content + AAD and current company binding, not trust incoming body.
 cargar:(channel:string,messageKey:string)=>Promise<EntradaCompradorD073|null>;
 // ONE ACID commit: pending question + source text + orig ID +
 // authorized chat binding + outbox job unique by orig messageKey.
 // Never send HTTP inside this method. Duplicate => no second outbox.
 registrarFaltaZona:(input:Readonly<{
   channel:string;chatKey:string;buyerOrgId:string;
   originMessageKey:string;textoOriginal:string;
   pregunta:'¿En qué localidad se entregan los materiales?';
 }>)=>Promise<'registrada'|'duplicada'>;
 // ONE ACID idempotent transaction: buyer membership/current consent
 // rechecked, origin message bound to buyer and round; same origin returns
 // same stored round. It must atomically clear waiting-zone state.
 crearRonda:(input:Readonly<{
   buyerOrgId:string;chatKey:string;channel:string;originMessageKey:string;
   replyMessageKey:string;
   pedido:Omit<BuyerRoundInputD064,'requestId'|'companyId'> & {plazoDias:number};
 }>)=>Promise<Readonly<{roundId:string;repetida:boolean}>>;
 // Invoke private D071 only AFTER round COMMIT. D071 is idempotent, queues
 // by (round,supplier,channel); it does NOT send any actual WhatsApp.
 prepararInvitaciones:(roundId:string)=>Promise<Readonly<{
   estado:'queued_without_sending'|'needs_verified_location'|
    'needs_catalog_mapping'|'no_eligible_suppliers'|'desactivado';
   mensajesEnviados:0;
   nuevasInvitaciones?:number;
 }>>;
}>;
export type ResultadoCompradorD073=Readonly<{
 estado:'desactivado'|'sin_entrada_verificada'|'esperando_extraccion_segura'|
  'requiere_revision_interna'|'consentimiento_contacto_pendiente'|
  'zona_solicitada_en_cola'|'ronda_registrada_consultas_en_cola'|
  'ronda_registrada_sin_consultas'|'ronda_registrada_preparacion_pendiente';
 rondaId?:string;
 mensajesWhatsappEnviados:0;
}>;
const CH=/^[A-Za-z0-9_-]{4,64}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/iu;
const Z=/^[\p{L}\p{M}\d .,-]{3,65}$/u;
const answer=/^(?:(?:entrega\s+en|localidad|zona\s+de\s+entrega)\s*:\s*)?(.+)$/iu;
function fail():never{throw new Error('d073_ingreso_no_disponible');}
function obj(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function keys(x:unknown,wanted:readonly string[]):boolean{
 return obj(x)&&Object.keys(x).length===wanted.length&&
  Object.keys(x).every(k=>wanted.includes(k));
}
function validText(t:unknown):t is string{
 return typeof t==='string'&&t.length>=3&&t.length<=4000&&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(t);
}
function locality(text:string):string|null{
 if(text.includes('\n')||text.includes('\r')||text.includes('\t')||
    /https?:|www\.|@|\d{8,}|\$/iu.test(text)||
    /\b\d+(?:[.,]\d+)?\s*(?:bolsas?|unidades?|cajas?|kg|litros?|m2|m3|placas?|metros?)\b/iu.test(text))
   return null;
 const m=text.trim().match(answer);
 const v=m?.[1]?.trim()??'';
 return v&&Z.test(v)?v:null;
}
function done(estado:ResultadoCompradorD073['estado'],
 rondaId?:string):ResultadoCompradorD073{
 return Object.freeze({estado,...(rondaId?{rondaId}:{}),
  mensajesWhatsappEnviados:0 as const});
}
const FIELDS=['channel','messageKey','chatKey','buyerOrgId','tipo',
 'textoVerificado','medioEscaneadoYExtraido','compartirContactoConsentido','pendienteZona'];
const PENDING=['origenMessageKey','chatKey','textoOriginal'];
const TYPES=new Set<CanalEntrada>(['text','document','image','audio','voice']);
export function crearConsumidorCompradorWhatsappD073(config:Readonly<{
 habilitado:boolean;channel:string;puerto:PuertoCompradorD073;
}>){
 if(!config||typeof config.habilitado!=='boolean'||!CH.test(config.channel)||
  !config.puerto||typeof config.puerto.cargar!=='function'||
  typeof config.puerto.registrarFaltaZona!=='function'||
  typeof config.puerto.crearRonda!=='function'||
  typeof config.puerto.prepararInvitaciones!=='function')fail();
 async function procesar(messageKey:string):Promise<ResultadoCompradorD073>{
  if(!SHA.test(messageKey))fail();
  if(!config.habilitado)return done('desactivado');
  let source:EntradaCompradorD073|null;
  try{source=await config.puerto.cargar(config.channel,messageKey)}catch{fail()}
  if(source===null)return done('sin_entrada_verificada');
  if(!keys(source,FIELDS)||source.channel!==config.channel||
    source.messageKey!==messageKey||!SHA.test(source.chatKey)||
    !UUID.test(source.buyerOrgId)||!TYPES.has(source.tipo)||
    typeof source.medioEscaneadoYExtraido!=='boolean'||
    typeof source.compartirContactoConsentido!=='boolean'||
    !(source.textoVerificado===null||validText(source.textoVerificado))||
    !(source.pendienteZona===null||
      keys(source.pendienteZona,PENDING)&&
      SHA.test(source.pendienteZona.origenMessageKey)&&
      source.pendienteZona.chatKey===source.chatKey&&
      validText(source.pendienteZona.textoOriginal)))fail();
  if(!source.compartirContactoConsentido)
   return done('consentimiento_contacto_pendiente');
  // A document/audio is NOT its caption or a webhook URL. Its content must
  // already have been privately downloaded, scanned and extracted.
  if(source.tipo!=='text'&&!source.medioEscaneadoYExtraido)
   return done('esperando_extraccion_segura');
  if(!validText(source.textoVerificado))
   return done('esperando_extraccion_segura');
  const pending=source.pendienteZona;
  // The original pending request must stay attached to the SAME verified chat.
  const zone=pending?locality(source.textoVerificado):null;
  if(pending&&!zone)return done('requiere_revision_interna');
  const raw=pending?pending.textoOriginal:source.textoVerificado;
  let parsed:ReturnType<typeof prepararPedidoTextoMvp028>;
  let plazoDias:number;
  try{
   const solicitud=extraerPlazoCotizacionMvp053(
     separarListaWhatsappNaturalMvp058(raw));
   plazoDias=solicitud.dias;
   parsed=prepararPedidoTextoMvp028(solicitud.textoMateriales,zone);
  }catch{
   return done('requiere_revision_interna');
  }
  const other=parsed.pendientes.some(p=>p.motivo!==
   'Necesitamos una única localidad de entrega.');
  if(other||parsed.items.length===0)return done('requiere_revision_interna');
  const originMessageKey=pending?.origenMessageKey??messageKey;
  if(parsed.zonaEntrega===null){
   // Pending question is persisted by backend once, not sent by this function.
   let registered:'registrada'|'duplicada';
   try{
    registered=await config.puerto.registrarFaltaZona({
     channel:config.channel,chatKey:source.chatKey,
     buyerOrgId:source.buyerOrgId,originMessageKey,
     textoOriginal:raw,
     pregunta:'¿En qué localidad se entregan los materiales?'
    });
   }catch{fail()}
   if(!['registrada','duplicada'].includes(registered))fail();
   return done('zona_solicitada_en_cola');
  }
  if(parsed.estado!=='listo_para_registrar')return done('requiere_revision_interna');
  let saved:Awaited<ReturnType<PuertoCompradorD073['crearRonda']>>;
  try{
   saved=await config.puerto.crearRonda({
    buyerOrgId:source.buyerOrgId,chatKey:source.chatKey,
    channel:config.channel,originMessageKey,
    replyMessageKey:source.messageKey,
    pedido:{
     deliveryZone:parsed.zonaEntrega,vatRequest:parsed.vatRequest,
     plazoDias,items:parsed.items
    }
   });
  }catch{fail()}
  if(!obj(saved)||!UUID.test(saved.roundId)||
    typeof saved.repetida!=='boolean')fail();
  // A saved round is not an invite. Even if this fails, repeat runs are safe
  // ONLY if private createRonda/D071 honor their ACID idempotency contracts.
  try{
   const prepared=await config.puerto.prepararInvitaciones(saved.roundId);
   if(!obj(prepared)||prepared.mensajesEnviados!==0||
    !['queued_without_sending','needs_verified_location',
      'needs_catalog_mapping','no_eligible_suppliers','desactivado']
     .includes(String(prepared.estado)))fail();
   if(prepared.estado==='queued_without_sending')
    return done('ronda_registrada_consultas_en_cola',saved.roundId);
   return done('ronda_registrada_sin_consultas',saved.roundId);
  }catch{
   return done('ronda_registrada_preparacion_pendiente',saved.roundId);
  }
 }
 return Object.freeze({procesar});
}
