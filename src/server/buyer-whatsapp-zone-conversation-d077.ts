/**
 * MVP-045/D077: recover encrypted original request when buyer replies ONLY
 * with the delivery locality, and register one question in a private outbox.
 *
 * No real Whapi sends, no media fetch, no plaintext order persisted here.
 * SQL writer & reader use SEPARATE NOLOGIN EXECUTE-only gateway roles.
 */
import {crearConsumidorCompradorWhatsappD073,
 type PuertoCompradorD073} from './buyer-whatsapp-ingress-d073.ts';
import type {EntradaCifradaCompradorMvp042} from './whapi-crypto-broker.ts';

type Db=Readonly<{query:(sql:string,args:readonly unknown[])=>
 Promise<Readonly<{rows:readonly Record<string,unknown>[]}>>}>;
type Decoded=Readonly<{tipo:string;texto:string|null;marcaTiempoUnix:number}>;
const READ='select cotironda_private.whapi_zone_context_d077($1::text,$2::text) as payload';
const WRITE='select cotironda_private.whapi_zone_enqueue_d077($1::text,$2::text,$3::text,$4::uuid) as payload';
const CH=/^[A-Za-z0-9_-]{4,64}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const KEY=/^[a-z][a-z0-9_]{2,40}$/u;
const TYPES=new Set(['text','image','document','audio','voice']);
const FIELDS=['channel','messageKey','chatKey','buyerOrgId','kind',
 'sourceUnix','cryptoKeyId','fingerprint','cipherHex','nonceHex','tagHex'];
function deny():never{throw Error('d077_zona_no_disponible')}
function obj(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function exact(x:unknown,fields:readonly string[]):x is Record<string,unknown>{
 return obj(x)&&Object.keys(x).length===fields.length&&
  Object.keys(x).every(k=>fields.includes(k));
}
function valid(x:unknown,re:RegExp):x is string{
 return typeof x==='string'&&re.test(x);
}
function buf(x:unknown,min:number,max:number):Buffer{
 if(typeof x!=='string'||x.length%2!==0||x.length<2*min||
  x.length>2*max||!/^[a-f0-9]+$/u.test(x))deny();
 return Buffer.from(x,'hex');
}
function decode(raw:unknown,channel:string,messageKey:string,
 verifier:(encrypted:EntradaCifradaCompradorMvp042)=>Decoded){
 if(!exact(raw,FIELDS)||raw.channel!==channel||
  raw.messageKey!==messageKey||!valid(raw.chatKey,SHA)||
  !valid(raw.buyerOrgId,UUID)||!valid(raw.fingerprint,SHA)||
  !TYPES.has(String(raw.kind))||!valid(raw.cryptoKeyId,KEY)||
  raw.cryptoKeyId==='legacy_d029'||typeof raw.sourceUnix!=='number'||
  !Number.isSafeInteger(raw.sourceUnix)||raw.sourceUnix<1)deny();
 const enc:EntradaCifradaCompradorMvp042={
  channel,messageKey,chatKey:raw.chatKey as string,
  buyerOrgId:raw.buyerOrgId as string,
  kind:raw.kind as EntradaCifradaCompradorMvp042['kind'],
  sourceUnix:raw.sourceUnix as number,
  cryptoKeyId:raw.cryptoKeyId as string,
  fingerprint:raw.fingerprint as string,
  ciphertext:buf(raw.cipherHex,1,8192),
  nonce:buf(raw.nonceHex,12,12),tag:buf(raw.tagHex,16,16)
 };
 let data:Decoded;
 try{data=verifier(enc)}catch{deny()}
 if(!obj(data)||data.tipo!==enc.kind||
  data.marcaTiempoUnix!==enc.sourceUnix||
  !(data.texto===null||(typeof data.texto==='string'&&
   data.texto.length>=3&&data.texto.length<=3000))||
  (enc.kind==='text'&&typeof data.texto!=='string')||
  (enc.kind!=='text'&&data.texto!==null))deny();
 return {enc,data};
}
export function crearLectorCompradorConZonaD077(config:Readonly<{
 habilitado:boolean;channel:string;readDb:Db;zoneDb:Db;
 verificarComprador:(encrypted:EntradaCifradaCompradorMvp042)=>Decoded;
 acciones:Pick<PuertoCompradorD073,'crearRonda'|'prepararInvitaciones'>;
}>){
 if(!config||typeof config.habilitado!=='boolean'||!CH.test(config.channel)||
  !config.readDb||typeof config.readDb.query!=='function'||
  !config.zoneDb||typeof config.zoneDb.query!=='function'||
  typeof config.verificarComprador!=='function'||!config.acciones||
  typeof config.acciones.crearRonda!=='function'||
  typeof config.acciones.prepararInvitaciones!=='function')deny();
 const puerto:PuertoCompradorD073={
  cargar:async(channel,messageKey)=>{
   if(channel!==config.channel||!valid(messageKey,SHA))deny();
   let out:unknown;
   try{
    const response=await config.readDb.query(READ,[channel,messageKey]);
    if(!obj(response)||!Array.isArray(response.rows)||
     response.rows.length!==1||!exact(response.rows[0],['payload']))deny();
    out=response.rows[0].payload;
   }catch{deny()}
   if(out===null)return null;
   if(!exact(out,['entry','original'])||!obj(out.entry))deny();
   const current=decode(out.entry,channel,messageKey,config.verificarComprador);
   let pending:null|{origenMessageKey:string;chatKey:string;
    textoOriginal:string}=null;
   if(out.original!==null){
    const origin=out.original;
    if(!obj(origin)||!valid(origin.messageKey,SHA)||
     origin.messageKey===messageKey)deny();
    const original=decode(origin,channel,origin.messageKey,config.verificarComprador);
    if(original.enc.kind!=='text'||current.enc.kind!=='text'||
     original.enc.chatKey!==current.enc.chatKey||
     original.enc.buyerOrgId!==current.enc.buyerOrgId||
     original.enc.sourceUnix>=current.enc.sourceUnix||
     typeof original.data.texto!=='string')deny();
    pending={origenMessageKey:original.enc.messageKey,
     chatKey:original.enc.chatKey,textoOriginal:original.data.texto};
   }
   return {
    channel,messageKey,chatKey:current.enc.chatKey,
    buyerOrgId:current.enc.buyerOrgId,
    tipo:current.enc.kind,textoVerificado:current.data.texto,
    medioEscaneadoYExtraido:false,
    compartirContactoConsentido:true,
    pendienteZona:pending
   };
  },
  registrarFaltaZona:async args=>{
   if(args.channel!==config.channel||!valid(args.chatKey,SHA)||
    !valid(args.originMessageKey,SHA)||!valid(args.buyerOrgId,UUID)||
    args.pregunta!=='¿En qué localidad se entregan los materiales?'||
    typeof args.textoOriginal!=='string'||
    args.textoOriginal.length<3||args.textoOriginal.length>4000)deny();
   // D077 references the SOURCE ENCRYPTED INBOX by HMAC. Never send the
   // plaintext original or arbitrary question to database or Whapi here.
   let result:unknown;
   try{
    const out=await config.zoneDb.query(WRITE,[
     args.channel,args.chatKey,args.originMessageKey,args.buyerOrgId
    ]);
    if(!obj(out)||!Array.isArray(out.rows)||out.rows.length!==1||
     !exact(out.rows[0],['payload']))deny();
    result=out.rows[0].payload;
   }catch{deny()}
   if(!exact(result,['estado','repetido'])||
    result.estado!=='zona_solicitada_en_cola'||
    typeof result.repetido!=='boolean')deny();
   return result.repetido?'duplicada':'registrada';
  },
  crearRonda:config.acciones.crearRonda,
  prepararInvitaciones:config.acciones.prepararInvitaciones
 };
 return crearConsumidorCompradorWhatsappD073({
  habilitado:config.habilitado,channel:config.channel,puerto
 });
}
