/**
 * MVP297 — safe, bounded diagnostic for *future* supplier quote reads.
 *
 * This is an observer of MVP225 evidence checks, not an alternate
 * validator: NEVER use this result to accept a price, assign a round,
 * recalculate totals or retry the model. No source text, prices,
 * identities, prompts or API errors are returned/stored.
 */
import {monedaExplicitaMvp241} from './evidencia-moneda-mvp241.ts';
import {importesOriginalesRepresentadosMvp244} from './fidelidad-importes-fuente-mvp244.ts';
import {evidenciaCondicionMvp242} from './evidencia-condiciones-mvp242.ts';

type Stage='first'|'second';
type Issue='schema_invalid'|'currency_unproven'|'iva_unproven'|
 'freight_unproven'|'payment_unproven'|'line_quote_unproven'|
 'commercial_lines_omitted'|'mapping_invalid'|'validation_unknown';
export type DiagnosticoMvp297=
 | `${Stage}_${Issue}`|'source_invalid'|'source_not_quote'|
 'readings_disagree'|'model_or_response_unavailable'|
 'diagnosis_not_preserved';
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const status=['no_informado','no_informada'];
const quoted=(source:string,v:unknown):boolean=>
 v===null||(typeof v==='string'&&v.length>0&&v.length<=240&&source.includes(v));
const allowed=new Set<string>([
 'source_invalid','source_not_quote','readings_disagree',
 'model_or_response_unavailable','diagnosis_not_preserved',
 ...(['first','second'] as const).flatMap(p=>
  (['schema_invalid','currency_unproven','iva_unproven',
   'freight_unproven','payment_unproven','line_quote_unproven',
   'commercial_lines_omitted','mapping_invalid',
   'validation_unknown'] as const).map(s=>p+'_'+s))
]);
export function diagnosticoPermitidoMvp297(value:unknown):value is DiagnosticoMvp297{
 return typeof value==='string'&&allowed.has(value);
}
/** Describe the FIRST failing evidence gate, following the same order
 * as MVP225. This result is private and deliberately contains no data.
 */
export function diagnosticarLecturaInvalidaMvp297(
 source:string,raw:unknown,requestedIds:readonly string[],
 stage:Stage
):DiagnosticoMvp297{
 const error=(code:Issue):DiagnosticoMvp297=>`${stage}_${code}`;
 if(typeof source!=='string'||source.length>150000||
    !Array.isArray(requestedIds)||requestedIds.length>200||!obj(raw)||
    Object.keys(raw).length!==11||!Array.isArray(raw.lineas)||
    raw.lineas.length>200||!Array.isArray(raw.vinculos)||
    raw.vinculos.length>200||
    !['presupuesto','otro'].includes(String(raw.intencion))||
    !['ARS','USD','no_informada'].includes(String(raw.moneda))||
    !['incluido_explicito','sin_iva_explicito','no_informado'].includes(String(raw.iva))||
    !['incluido_explicito','excluido_explicito','a_convenir','no_informado'].includes(String(raw.flete))||
    !['contado','transferencia','credito','no_informado'].includes(String(raw.pago)))
  return error('schema_invalid');
 for(const [field,code] of [
  ['moneda','currency_unproven'],['iva','iva_unproven'],
  ['flete','freight_unproven'],['pago','payment_unproven']
 ] as const){
  const ev=raw[field+'Evidencia'];
  if(!quoted(source,ev)||
     (!status.includes(String(raw[field]))&&ev===null))
   return error(code);
 }
 if(!monedaExplicitaMvp241(source,raw.moneda,raw.monedaEvidencia))
  return error('currency_unproven');
 for(const [field,code] of [
  ['iva','iva_unproven'],['flete','freight_unproven'],
  ['pago','payment_unproven']
 ] as const){
  if(!evidenciaCondicionMvp242(
    source,field,raw[field],raw[field+'Evidencia']))
   return error(code);
 }
 const used=new Set<number>();
 for(const v of raw.lineas){
  if(!obj(v)||typeof v.numero!=='number'||!Number.isSafeInteger(v.numero)||
     v.numero<1||v.numero>200||used.has(v.numero)||
     typeof v.textoOriginal!=='string'||!v.textoOriginal.trim()||
     v.textoOriginal.length>1500||!source.includes(v.textoOriginal)||
     typeof v.descripcion!=='string'||!v.descripcion.trim()||
     v.descripcion.length>500||
     !['material','cargo_adicional','aclaracion'].includes(String(v.tipo))||
     !['cantidad','unidad','precioUnitarioLiteral','totalLineaLiteral'].every(k=>
       v[k]===null||(typeof v[k]==='string'&&v[k].length<=100))||
     !['precioUnitarioLiteral','totalLineaLiteral'].every(k=>
       v[k]===null||(typeof v.textoOriginal==='string'&&
        v.textoOriginal.includes(String(v[k])))))
   return error('line_quote_unproven');
  used.add(v.numero);
 }
 if(!importesOriginalesRepresentadosMvp244(source,raw.lineas))
  return error('commercial_lines_omitted');
 const requestIds=new Set(requestedIds),linked=new Set<number>(),targets=new Set<string>();
 for(const v of raw.vinculos){
  if(!obj(v)||typeof v.lineaOferta!=='number'||
     !Number.isSafeInteger(v.lineaOferta)||
     !used.has(v.lineaOferta)||linked.has(v.lineaOferta)||
     typeof v.articuloPedido!=='string'||!requestIds.has(v.articuloPedido)||
     targets.has(v.articuloPedido)||
     !['misma_presentacion','alternativa_razonable','requiere_verificacion']
       .includes(String(v.equivalencia))||
     typeof v.explicacion!=='string'||!v.explicacion.trim()||
     v.explicacion.length>250)
   return error('mapping_invalid');
  linked.add(v.lineaOferta);targets.add(v.articuloPedido);
 }
 return error('validation_unknown');
}
