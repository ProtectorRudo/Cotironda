/**
 * MVP-011: server-only inbound quote coordinator.
 * D061 reads an ALREADY PERSISTED & LINKED encrypted message with trusted
 * items. AES-GCM authenticated content is handed to an injectable parser;
 * D060 writes an offer version and declared prices atomically, NO "Confirmo".
 *
 * No endpoint, no credentials, no cron, no WhatsApp calls or live IA included.
 * Interpreter output is UNTRUSTED: validate source, mapping, units, citations
 * and commercial terms. Uncertain or ambiguous text is NOT an offer.
 */
import type {EntradaCifradaD028} from './whapi-crypto-broker.ts';
import type {CotizacionFuenteMvp007} from '../domain/cotizacion-evidencia-mvp007.ts';
import {prepararCotizacionDocumentalD060} from './whapi-quote-source-builder-d060.ts';
import {crearPuertoRecepcionDirectaD059,type DbRecepcionD059}
 from './whapi-quote-direct-postgres-d059.ts';

type RoundItem=Readonly<{itemId:string;line_no:number;unit:string}>;
export type InterpreteCotizacionD061=(
 text:string,items:readonly RoundItem[]
)=>Promise<CotizacionFuenteMvp007|null>;
export type VerificadorCifradoD061=(
 input:EntradaCifradaD028
)=>Readonly<{tipo:string;texto:string|null;marcaTiempoUnix:number}>;
const LOAD='select cotironda_private.whapi_quote_read_d061($1::text,$2::text) as payload';
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/;
const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY=/^[a-z][a-z0-9_]{2,40}$/;
const CODE=/^[a-z][a-z0-9_]{2,49}$/;
const UNITS=new Set(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
const FIELDS=['channel','messageKey','chatKey','supplierOrgId','roundId',
 'kind','sourceUnix','cryptoKeyId','fingerprint','cipherHex','nonceHex','tagHex',
 'expectedRevision','roundItems'];
const ITEM_FIELDS=['itemId','line_no','unit'];
function reject():never{throw new Error('d061_cotizacion_no_disponible')}
function obj(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return obj(v)&&Object.keys(v).length===keys.length&&
  Object.keys(v).every(k=>keys.includes(k));
}
function regexp(v:unknown,re:RegExp):v is string{
 return typeof v==='string'&&re.test(v);
}
function integer(v:unknown,min:number,max:number):v is number{
 return typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
}
function decode(v:unknown,min:number,max:number):Buffer{
 if(typeof v!=='string'||v.length%2!==0||v.length<min*2||
   v.length>max*2||!/^[a-f0-9]+$/.test(v))reject();
 return Buffer.from(v,'hex');
}
function snapshot(v:unknown):v is RoundItem[]{
 if(!Array.isArray(v)||v.length<1||v.length>8)return false;
 const ids=new Set<string>(),lines=new Set<number>();
 return v.every(item=>{
  if(!exact(item,ITEM_FIELDS)||
   !regexp(item.itemId,CODE)||!integer(item.line_no,1,8)||
   !UNITS.has(String(item.unit))||
   ids.has(item.itemId as string)||lines.has(item.line_no as number))return false;
  ids.add(item.itemId as string);lines.add(item.line_no as number);
  return true;
 });
}
export function crearRecepcionDirectaDeInboxD061(
 db:DbRecepcionD059,
 verificarContenido:VerificadorCifradoD061,
 interpretar:InterpreteCotizacionD061
){
 if(!db||typeof db.query!=='function'||
  typeof verificarContenido!=='function'||typeof interpretar!=='function')reject();
 const destination=crearPuertoRecepcionDirectaD059(db);
 async function procesar(channel:string,messageKey:string){
  if(!regexp(channel,CHANNEL)||!regexp(messageKey,HEX))reject();
  let raw:unknown;
  try{
   const out=await db.query(LOAD,[channel,messageKey]);
   if(!obj(out)||!Array.isArray(out.rows)||out.rows.length!==1||
       !exact(out.rows[0],['payload']))reject();
   raw=out.rows[0].payload;
  }catch{reject();}
  if(raw===null)return Object.freeze({estado:'no_disponible_o_no_habilitado'} as const);
  if(!exact(raw,FIELDS)||raw.channel!==channel||raw.messageKey!==messageKey||
    !regexp(raw.chatKey,HEX)||!regexp(raw.supplierOrgId,UUID)||
    !regexp(raw.roundId,UUID)||raw.kind!=='text'||
    !regexp(raw.fingerprint,HEX)||!regexp(raw.cryptoKeyId,KEY)||
    !integer(raw.sourceUnix,1,Number.MAX_SAFE_INTEGER)||
    !integer(raw.expectedRevision,0,99999)||!snapshot(raw.roundItems))reject();
  const encrypted:EntradaCifradaD028=Object.freeze({
   channel,chatKey:raw.chatKey as string,messageKey,
   fingerprint:raw.fingerprint as string,kind:'text',
   sourceUnix:raw.sourceUnix as number,cryptoKeyId:raw.cryptoKeyId as string,
   ciphertext:decode(raw.cipherHex,1,8192),
   nonce:decode(raw.nonceHex,12,12),
   tag:decode(raw.tagHex,16,16)
  });
  let message:ReturnType<VerificadorCifradoD061>;
  try{message=verificarContenido(encrypted)}catch{reject()}
  if(!obj(message)||message.tipo!=='text'||
    !integer(message.marcaTiempoUnix,1,Number.MAX_SAFE_INTEGER)||
    message.marcaTiempoUnix!==encrypted.sourceUnix||
    typeof message.texto!=='string'||message.texto.length<5||
    message.texto.length>3000||
    /^(confirmo|baja)$/iu.test(message.texto.trim()))reject();
  // Do not let an interpreter choose a product, unit, sender or buyer's terms.
  const items=Object.freeze((raw.roundItems as RoundItem[])
   .map(x=>Object.freeze({...x})));
  let proposal:CotizacionFuenteMvp007|null;
  try{proposal=await interpretar(message.texto,items)}catch{reject()}
  if(proposal===null)return Object.freeze({estado:'sin_precio_atribuible'} as const);
  if(!exact(proposal,['textoFuente','moneda','formaPago','plazoEntregaDias',
    'minimoCompraFinal','fleteInformado','evidenciaFlete','items','condicionIvaComprador'])||
    proposal.textoFuente!==message.texto||
    proposal.condicionIvaComprador!=='no_especificado'||
    proposal.moneda!=='ARS'||!Array.isArray(proposal.items)||
    proposal.items.length<1||proposal.items.length>items.length)reject();
  const byId=new Map(items.map(item=>[item.itemId,item]));
  const found=new Set<string>();
  const mapping:Readonly<{itemId:string;line_no:number}>[]=[];
  for(const row of proposal.items){
   if(!obj(row)||typeof row.itemId!=='string'||
      found.has(row.itemId)||!byId.has(row.itemId)||
      row.unidad!==byId.get(row.itemId)!.unit)reject();
   found.add(row.itemId);
   mapping.push({itemId:row.itemId,line_no:byId.get(row.itemId)!.line_no});
  }
  let prepared:ReturnType<typeof prepararCotizacionDocumentalD060>;
  try{prepared=prepararCotizacionDocumentalD060(proposal,mapping)}catch{reject()}
  // A quote is accepted only if at least one price was literally grounded.
  // Avoid fake 0-price offers from vague text or guesses. Missing other prices
  // is fine: partial offers are normal and must remain visible.
  if(!prepared.prices.some(x=>x.quoted_unit_price!==null))
    return Object.freeze({estado:'sin_precio_atribuible'} as const);
  try{
   const receipt=await destination.registrarConPrecios({
    channel,messageKey,expectedRevision:raw.expectedRevision as number,
    quote:prepared.quote,prices:prepared.prices
   });
   return Object.freeze({estado:'cotizacion_recibida' as const,
    version:receipt.version,repetido:receipt.repetido,
    precios:prepared.prices.length,
    datosNoInformados:prepared.avisos.length});
  }catch{reject()}
 }
 return Object.freeze({procesar});
}
