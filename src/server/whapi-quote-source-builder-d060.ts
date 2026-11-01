/**
 * MVP-010: deterministic glue from source-cited supplier quote to D060 SQL.
 * The buyer's round item mapping MUST come from an authenticated private DB
 * snapshot, never from a Whapi message, IA or browser.
 * This does NOT authenticate the source document or resolve product equivalence.
 * No I/O; cannot send or "Confirmo" anything.
 */
import {createHash} from 'node:crypto';
import {prepararPropuestaEconomicaMvp007,type CotizacionFuenteMvp007}
 from '../domain/cotizacion-evidencia-mvp007.ts';
import type {CotizacionNormalizadaD059} from './whapi-quote-direct-postgres-d059.ts';

type Original=Readonly<{
 line_no:number;quoted_unit_price:string|null;
 vat_basis:'incluido'|'no_incluido'|'no_informado'|'contradictorio';
 source_line_no:number|null;source_sha256:string|null;
}>;
export type CotizacionConFuenteD060=Readonly<{
 quote:CotizacionNormalizadaD059;
 prices:readonly Original[];
 avisos:readonly string[];
}>;
function fail():never{throw new TypeError('d060_fuente_economica_invalida')}
const validId=/^[a-z][a-z0-9_]{2,49}$/u;
export function prepararCotizacionDocumentalD060(
 fuente:CotizacionFuenteMvp007,
 mapping:readonly Readonly<{itemId:string;line_no:number}>[]
):CotizacionConFuenteD060{
 if(!Array.isArray(mapping)||mapping.length!==fuente.items.length||
   mapping.length<1||mapping.length>8)fail();
 const matched=new Map<string,number>();
 const ids=new Set<number>();
 for(const item of mapping){
  if(!item||typeof item.itemId!=='string'||!validId.test(item.itemId)||
   !Number.isSafeInteger(item.line_no)||item.line_no<1||item.line_no>8||
   matched.has(item.itemId)||ids.has(item.line_no))fail();
  matched.set(item.itemId,item.line_no);
  ids.add(item.line_no);
 }
 const read=prepararPropuestaEconomicaMvp007(fuente);
 const verificados=new Map(read.fuentes.preciosVerificados.map(x=>[x.itemId,x]));
 const fuenteLineas=fuente.textoFuente.split(/\r\n|\n|\r/u);
 const quoteLines:CotizacionNormalizadaD059['lines_snapshot'][number][]=[];
 const prices:Original[]=[];
 for(const item of read.propuesta.items){
  const line_no=matched.get(item.itemId);
  if(line_no===undefined)fail();
  const proof=verificados.get(item.itemId);
  let source_line_no:number|null=null;
  let source_sha256:string|null=null;
  if(proof){
   if(!Number.isSafeInteger(proof.linea)||proof.linea<1||
      proof.linea>160||proof.linea>fuenteLineas.length)fail();
   source_line_no=proof.linea;
   source_sha256=createHash('sha256').update(
     fuenteLineas[proof.linea-1].trim(),'utf8').digest('hex');
  }
  const basis=read.condiciones.iva;
  prices.push(Object.freeze({
   line_no,quoted_unit_price:proof?.precioOriginal??null,
   vat_basis:basis,source_line_no,source_sha256
  }));
  quoteLines.push(Object.freeze({
   line_no,unit:item.unidad,available_qty:item.cantidadDisponible,
   net_unit_price:item.precioUnitarioNeto,vat_rate:item.ivaPorcentaje
  }));
 }
 const quote:CotizacionNormalizadaD059=Object.freeze({
  currency:read.propuesta.moneda,
  payment_method:read.propuesta.formaPago,
  lead_days:read.propuesta.plazoEntregaDias,
  freight_gross:read.propuesta.fleteFinal,
  min_goods_gross:read.propuesta.minimoCompraFinal,
  lines_snapshot:Object.freeze(quoteLines)
 });
 return Object.freeze({
  quote,prices:Object.freeze(prices),avisos:read.pendientes
 });
}
