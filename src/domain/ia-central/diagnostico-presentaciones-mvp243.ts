/**
 * MVP243 — Evidencia física NOMINAL de presentación comercial por línea.
 * Nunca prueba que dos materiales sean técnicamente sustituibles y NUNCA
 * publica precio o reemplaza el PDF original.
 *
 * El enlace semántico proveedor→pedido ya debe haber superado la validación
 * de fuente/identidad. No inferir un tipo de material desde esta función.
 */
import type {
 PedidoLineaMvp225,OfertaLineaMvp225
} from './calificador-cotizaciones-mvp225.ts';

export type DiagnosticoPresentacionMvp243=Readonly<{
 pedidoId:string;numeroOferta:number;
 estado:'cantidad_nominal_igual'|'cantidad_nominal_diferente'|
  'presentacion_sin_acreditar'|'base_incompatible';
 unidadBase:'kg'|'l'|'m3'|null;
 pedidoBaseMil:string|null;ofertaBaseMil:string|null;
 comparableTecnico:false;comparableEconomico:false;
}>;

const NORMAL=(s:string)=>s.normalize('NFD')
 .replace(/[\u0300-\u036f]/gu,'').toLocaleLowerCase('es')
 .replace(/m³/gu,'m3').replace(/\s+/gu,' ').trim();
const DECIMAL=/^(?:0|[1-9]\d{0,7})(?:\.\d{1,3})?$/u;
type Base='kg'|'l'|'m3';
type Measure=Readonly<{base:Base;inMilli:bigint;span:string}>;

function milDecimal(s:string):bigint|null{
 if(!DECIMAL.test(s))return null;
 const [ent,fraction='']=s.split('.');
 const n=BigInt(ent)*1000n+BigInt(fraction.padEnd(3,'0'));
 return n>0n&&n<=100000000000n?n:null;
}
function toMeasure(num:string,unit:string,span:string):Measure|null{
 const fixed=milDecimal(num.replace(',','.'));
 if(fixed===null)return null;
 if(/^(?:kg|kilo|kilos|kilogramo|kilogramos)$/u.test(unit))
  return {base:'kg',inMilli:fixed,span};
 if(unit==='g'||unit==='gramos'){
  if(fixed%1000n!==0n)return null; // 0,5 g no representable en milésimos kg.
  return {base:'kg',inMilli:fixed/1000n,span};
 }
 if(/^(?:l|lt|lts|litro|litros)$/u.test(unit))
  return {base:'l',inMilli:fixed,span};
 if(unit==='ml'||unit==='mililitros'){
  if(fixed%1000n!==0n)return null;
  return {base:'l',inMilli:fixed/1000n,span};
 }
 if(/^(?:m3|metro cubico|metros cubicos)$/u.test(unit))
  return {base:'m3',inMilli:fixed,span};
 return null;
}
function sizes(original:string):readonly Measure[]|null{
 const text=NORMAL(original);
 const candidates=[
  ...text.matchAll(/\b(\d{1,6}(?:[.,]\d{1,3})?)\s*(kg|kilos?|kilogramos?|g|gramos|ml|mililitros|l|lt|lts|litro|litros|m3|metro cubico|metros cubicos)\b/gu)
 ];
 const result:Measure[]=[];
 for(const m of candidates){
  const v=toMeasure(m[1],m[2],m[0]);
  if(!v)return null;
  result.push(v);
 }
 return result;
}
function baseOf(qty:string,unit:string,description:string):
 Measure|null{
 const count=milDecimal(qty);
 if(count===null)return null;
 const s=sizes(description);
 if(s===null)return null;
 if(['kg','g','l','ml','m3'].includes(unit)){
  // La cantidad ya está expresada en unidad base, no multiplicar
  // por otro tamaño de envase posiblemente citado en la descripción.
  const unitQuantity=toMeasure(qty,unit,qty+' '+unit);
  return unitQuantity;
 }
 if(!['bag','unit','pack','box'].includes(unit)||s.length!==1)
  return null;
 const amount=count*s[0].inMilli;
 if(amount%1000n!==0n||amount<=0n||amount>100000000000000n)
  return null;
 return {base:s[0].base,inMilli:amount/1000n,span:s[0].span};
}
function countWritten(line:OfertaLineaMvp225):boolean{
 if(typeof line.cantidad!=='string'||typeof line.textoOriginal!=='string')
  return false;
 const qty=milDecimal(line.cantidad);
 if(qty===null)return false;
 const withoutMoney=line.textoOriginal
  .replace(line.precioUnitarioLiteral??'',' ')
  .replace(line.totalLineaLiteral??'',' ')
  // Si el modelo omitió la cita del precio, el importe en la fuente
  // tampoco puede suplantar una cantidad de bolsas. Ej. $40.000.
  .replace(/(?:AR\$|US\$|U\$S|\$)\s*\d[\d.,]*/giu,' ');
 const all=sizes(withoutMoney);
 if(!all)return false;
 // Excluir los números de los envases; "25 kg" no demuestra 25 bolsas.
 let stripped=NORMAL(withoutMoney);
 for(const m of all)stripped=stripped.replace(m.span,' ');
 const remaining=stripped.match(/\b\d+(?:[.,]\d{1,3})?\b/gu)??[];
 return remaining.some(x=>milDecimal(x.replace(',','.'))===qty);
}
function empty(itemId:string,lineNo:number,
 state:DiagnosticoPresentacionMvp243['estado']=
 'presentacion_sin_acreditar'):DiagnosticoPresentacionMvp243{
 return {pedidoId:itemId,numeroOferta:lineNo,estado:state,unidadBase:null,
  pedidoBaseMil:null,ofertaBaseMil:null,
  comparableTecnico:false,comparableEconomico:false};
}
/** El material y el vínculo se mantienen bajo control semántico y catálogo.
 * Solo reportar si el VOLUMEN/PESO nominal recibido coincide, nunca
 * afirmar equivalencia de pintura de exterior/interior o cemento CPC/CPP.
 */
export function diagnosticarPresentacionMvp243(
 pedido:PedidoLineaMvp225,oferta:OfertaLineaMvp225
):DiagnosticoPresentacionMvp243{
 if(!pedido||!oferta||oferta.tipo!=='material'||
  !Number.isSafeInteger(oferta.numero)||oferta.numero<1||
  typeof oferta.cantidad!=='string'||typeof oferta.unidad!=='string'||
  typeof oferta.textoOriginal!=='string'||!countWritten(oferta))
  return empty(pedido?.id??'item_invalido',oferta?.numero??0);
 const wanted=baseOf(pedido.cantidad,pedido.unidad,pedido.descripcion);
 const offered=baseOf(oferta.cantidad,oferta.unidad,oferta.textoOriginal);
 if(!wanted||!offered)return empty(pedido.id,oferta.numero);
 if(wanted.base!==offered.base)
  return empty(pedido.id,oferta.numero,'base_incompatible');
 return {pedidoId:pedido.id,numeroOferta:oferta.numero,
  estado:wanted.inMilli===offered.inMilli?
   'cantidad_nominal_igual':'cantidad_nominal_diferente',
  unidadBase:wanted.base,pedidoBaseMil:wanted.inMilli.toString(),
  ofertaBaseMil:offered.inMilli.toString(),
  comparableTecnico:false,comparableEconomico:false};
}
