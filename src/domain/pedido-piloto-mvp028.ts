/**
 * MVP-028: strict, offline text -> D064 buyer-round payload.
 * Uses curated product FAMILY only as a provisional code; D065 needs its own
 * trusted map before ANY supplier can be invited. No guessed specifications.
 * Do NOT silently discard ambiguous lines; block submission until resolved.
 */
import {extraerLinea} from './flujo-texto.ts';
import {identificarProducto} from './taxonomia-materiales.ts';
import {encabezadoTablaMvp034,filaTablaMvp034,
 type OrdenTablaMvp034} from './filas-copiadas-mvp034.ts';
import {separarCondicionesComprador,type ExigenciaIva}
 from './condiciones-comprador-mvp006.ts';

export type PedidoPilotoMvp028=Readonly<{
 estado:'listo_para_registrar'|'requiere_aclaracion';
 zonaEntrega:string|null;
 vatRequest:ExigenciaIva;
 items:readonly Readonly<{
  line_no:number;product_code:string;quantity:string;unit:string;
  source_description:string;
 }>[];
 pendientes:readonly Readonly<{linea:number;texto:string;motivo:string}>[];
}>;

const QTY=/^[1-9][0-9]{0,8}(?:[.,][0-9]{1,3})?$/u;
const ZONE=/^[\p{L}\p{M}\d .,-]{3,65}$/u;
const SOURCE=/^[\p{L}\p{M}\p{N} .,()/+²³-]{3,90}$/u;
const UNSAFE=/https?:|www\.|\d{10,}/iu;
const DELIVERY=/^(?:(?:zona|localidad|direcci[oó]n)\s+de\s+entrega|entregar\s+en|entrega(?:\s+en)?|destino)\s*:\s*(.+?)\s*$/iu;
const REASON={
 parse:'No pudimos reconocer cantidad y unidad.',
 product:'Material fuera del diccionario verificado para este piloto.',
 quantity:'Cantidad ambigua o fuera de los límites admitidos.',
 source:'Falta verificar la descripción técnica (marca, modelo o presentación).',
 repeated:'Hay dos líneas de la misma familia de material. Deben conservarse por separado.',
 tooMany:'Este piloto admite hasta ocho artículos por pedido.',
 vat:'El pedido contiene condiciones contradictorias sobre IVA.',
 zone:'Necesitamos una única localidad de entrega.'
} as const;
function safeZone(s:string):boolean{
 return s.trim()===s&&ZONE.test(s)&&!UNSAFE.test(s);
}
export function prepararPedidoTextoMvp028(
 text:string,deliveryZone?:string|null
):PedidoPilotoMvp028{
 if(typeof text!=='string'||!text.trim()||text.length>4000||
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text))
  throw new TypeError('mvp028_pedido_invalido');
 const cond=separarCondicionesComprador(text);
 const zonas:string[]=[];
 const materiales:typeof cond.materiales[number][]=[];
 for(const line of cond.materiales){
  const match=line.texto.match(DELIVERY);
  if(match){
   zonas.push(match[1].trim());
  }else materiales.push(line);
 }
 const pend:PedidoPilotoMvp028['pendientes'][number][]=[];
 const typed=typeof deliveryZone==='string'&&deliveryZone.trim()?
   deliveryZone.trim():null;
 const foundZones=[...new Set(zonas.map(z=>z.toLocaleLowerCase('es-AR')))];
 // An old field value must never silently override a different delivery
 // location in the buyer's edited text. Multiple source zones also fail closed.
 const zoneConflict=foundZones.length>1||typed!==null&&foundZones.length===1&&
  foundZones[0]!==typed.toLocaleLowerCase('es-AR');
 const zone=zoneConflict?null:(typed??(foundZones.length===1?zonas[0]:null));
 if(!zone||!safeZone(zone))
  pend.push({linea:0,texto:'Zona de entrega',motivo:REASON.zone});
 if(cond.iva==='contradictorio')
  pend.push({linea:0,texto:'IVA',motivo:REASON.vat});
 const items:PedidoPilotoMvp028['items'][number][]=[];
 const codes=new Set<string>();
 let ordenTabla:OrdenTablaMvp034|null=null;
 let totalArticulos=0;
 for(const row of materiales){
  const encabezado=encabezadoTablaMvp034(row.texto);
  if(encabezado&&totalArticulos===0&&ordenTabla===null){
   ordenTabla=encabezado;
   continue;
  }
  totalArticulos++;
  const tabulada=row.texto.includes('\t')?
   filaTablaMvp034(row.texto,ordenTabla):null;
  const clean=(tabulada?.normalizada??row.texto)
   .replace(/^(?:[-*•]\s+|\d{1,3}[).]\s+)/u,'').trim();
  const parsed=row.texto.includes('\t')&&!tabulada?null:extraerLinea(clean);
  if(!parsed){
   pend.push({linea:row.numero,texto:row.texto,motivo:REASON.parse});continue;
  }
  if(!QTY.test(parsed.cantidad)||/[.,][0-9]{3}$/u.test(parsed.cantidad)){
   pend.push({linea:row.numero,texto:row.texto,motivo:REASON.quantity});continue;
  }
  // "15 placas de yeso" => keep "placas" as part of the identity;
  // a plain "yeso RH" would lose the D015 family evidence.
  const plate=parsed.unidad==='unit'?
   clean.match(/^\d{1,6}(?:[,.]\d{1,3})?\s+(placas?)\s+(de\s+)?(.+)$/iu):null;
  const literal=tabulada?.descripcionOriginal??
   (plate?(plate[1]+' '+(plate[2]??'')+plate[3]).trim():parsed.producto);
  const product=identificarProducto(literal);
  if(!product){
   pend.push({linea:row.numero,texto:row.texto,motivo:REASON.product});continue;
  }
  if(!SOURCE.test(literal)||literal.trim()!==literal||
    UNSAFE.test(literal)){
   pend.push({linea:row.numero,texto:row.texto,motivo:REASON.source});continue;
  }
  if(codes.has(product.producto_id)){
   pend.push({linea:row.numero,texto:row.texto,motivo:REASON.repeated});continue;
  }
  codes.add(product.producto_id);
  items.push({
   line_no:items.length+1,product_code:product.producto_id,
   quantity:parsed.cantidad.replace(',','.'),unit:parsed.unidad,
   source_description:literal
  });
 }
 if(totalArticulos>8)
  pend.push({linea:0,texto:'Cantidad de artículos',motivo:REASON.tooMany});
 if(items.length===0)
  pend.push({linea:0,texto:'Pedido',motivo:'No hay materiales identificados con seguridad.'});
 return Object.freeze({
  estado:pend.length?'requiere_aclaracion':'listo_para_registrar',
  zonaEntrega:zone&&safeZone(zone)?zone:null,
  vatRequest:cond.iva,
  items:Object.freeze(items),
  pendientes:Object.freeze(pend)
 });
}
