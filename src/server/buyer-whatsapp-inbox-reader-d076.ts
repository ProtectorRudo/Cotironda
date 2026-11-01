/**
 * MVP-044 / D076 — server-only buyer inbox -> D073 WhatsApp order parser.
 * Consumes only already-persisted private HMAC/AES-GCM ciphertext.
 * DB read port requires EXECUTE-only role cotironda_buyer_gateway_d076.
 *
 * DOES NOT provide a real Whapi webhook, production secrets, media extraction,
 * buyer onboarding, ask-zone outbox, round SQL port, or send messages. These
 * must be separately implemented and rechecked by transaction-bound backend.
 */
import {crearConsumidorCompradorWhatsappD073,
 type PuertoCompradorD073} from './buyer-whatsapp-ingress-d073.ts';
import type {EntradaCifradaCompradorMvp042} from './whapi-crypto-broker.ts';

type Db=Readonly<{query:(sql:string,params:readonly unknown[])=>
 Promise<Readonly<{rows:readonly Record<string,unknown>[]}>>}>;
type Decoded=Readonly<{tipo:string;texto:string|null;marcaTiempoUnix:number}>;
const SQL='select cotironda_private.whapi_buyer_read_d076($1::text,$2::text) as payload';
const CH=/^[A-Za-z0-9_-]{4,64}$/u;
const HEX=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const KEY=/^[a-z][a-z0-9_]{2,40}$/u;
const KINDS=new Set(['text','image','document','audio','voice']);
const EXPECTED=['channel','messageKey','chatKey','buyerOrgId','kind',
 'sourceUnix','cryptoKeyId','fingerprint','cipherHex','nonceHex','tagHex'];
function deny():never{throw Error('d076_ingreso_no_disponible')}
function obj(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function exact(x:unknown,keys:readonly string[]):x is Record<string,unknown>{
 return obj(x)&&Object.keys(x).length===keys.length&&
  Object.keys(x).every(k=>keys.includes(k));
}
function valid(x:unknown,re:RegExp):x is string{
 return typeof x==='string'&&re.test(x);
}
function bytes(hex:unknown,min:number,max:number):Buffer{
 if(typeof hex!=='string'||hex.length%2!==0||
  hex.length<min*2||hex.length>max*2||
  !/^[a-f0-9]+$/u.test(hex))deny();
 return Buffer.from(hex,'hex');
}
export function crearLectorPedidoCompradorD076(input:Readonly<{
 habilitado:boolean;channel:string;db:Db;
 verificarComprador:(encrypted:EntradaCifradaCompradorMvp042)=>Decoded;
 acciones:Pick<PuertoCompradorD073,
  'registrarFaltaZona'|'crearRonda'|'prepararInvitaciones'>;
}>){
 if(!input||typeof input.habilitado!=='boolean'||!CH.test(input.channel)||
  !input.db||typeof input.db.query!=='function'||
  typeof input.verificarComprador!=='function'||!input.acciones||
  typeof input.acciones.registrarFaltaZona!=='function'||
  typeof input.acciones.crearRonda!=='function'||
  typeof input.acciones.prepararInvitaciones!=='function')deny();

 const port:PuertoCompradorD073={
  cargar:async(channel,messageKey)=>{
   if(channel!==input.channel||!valid(messageKey,HEX))deny();
   let raw:unknown;
   try{
    const out=await input.db.query(SQL,[channel,messageKey]);
    if(!obj(out)||!Array.isArray(out.rows)||out.rows.length!==1||
      !exact(out.rows[0],['payload']))deny();
    raw=out.rows[0].payload;
   }catch{deny()}
   if(raw===null)return null;
   if(!exact(raw,EXPECTED)||raw.channel!==channel||
    raw.messageKey!==messageKey||!valid(raw.chatKey,HEX)||
    !valid(raw.buyerOrgId,UUID)||!valid(raw.fingerprint,HEX)||
    !KINDS.has(String(raw.kind))||
    typeof raw.sourceUnix!=='number'||!Number.isSafeInteger(raw.sourceUnix)||
    raw.sourceUnix<1||!valid(raw.cryptoKeyId,KEY)||
    raw.cryptoKeyId==='legacy_d029')deny();
   const encrypted:EntradaCifradaCompradorMvp042={
    channel,chatKey:raw.chatKey as string,messageKey,
    buyerOrgId:raw.buyerOrgId as string,
    fingerprint:raw.fingerprint as string,
    kind:raw.kind as EntradaCifradaCompradorMvp042['kind'],
    sourceUnix:raw.sourceUnix as number,
    cryptoKeyId:raw.cryptoKeyId as string,
    ciphertext:bytes(raw.cipherHex,1,8192),
    nonce:bytes(raw.nonceHex,12,12),tag:bytes(raw.tagHex,16,16)
   };
   let data:Decoded;
   try{data=input.verificarComprador(encrypted)}catch{deny()}
   if(!obj(data)||data.tipo!==encrypted.kind||
    data.marcaTiempoUnix!==encrypted.sourceUnix||
    !(data.texto===null||
      (typeof data.texto==='string'&&data.texto.length>=3&&
       data.texto.length<=3000))||
    (encrypted.kind==='text'&&typeof data.texto!=='string')||
    (encrypted.kind!=='text'&&data.texto!==null))deny();
   // D074+D076 permit this read only while identity, current consent and
   // channel link are valid. Action ports MUST independently recheck the
   // same rights under SQL transaction at mutation time (TOCTOU).
   return {
    channel,messageKey,chatKey:encrypted.chatKey,
    buyerOrgId:encrypted.buyerOrgId,
    tipo:encrypted.kind,textoVerificado:data.texto,
    medioEscaneadoYExtraido:false,
    compartirContactoConsentido:true,pendienteZona:null
   };
  },
  registrarFaltaZona:input.acciones.registrarFaltaZona,
  crearRonda:input.acciones.crearRonda,
  prepararInvitaciones:input.acciones.prepararInvitaciones
 };
 return crearConsumidorCompradorWhatsappD073({
  habilitado:input.habilitado,channel:input.channel,puerto:port
 });
}
