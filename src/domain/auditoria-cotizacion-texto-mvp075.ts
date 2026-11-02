/**
 * MVP-075 — auditoria ECONOMICA OFFLINE de un presupuesto textual.
 * Nunca muta ni sustituye el original: no compara materiales, ni certifica IVA,
 * flete, equivalencias o disponibilidad. Sin acceso a red, WhatsApp o SQL.
 */
import {capturarPresupuestoOriginalMvp063} from './presupuesto-original-fiel-mvp063.ts';

type TipoLinea='total'|'subtotal'|'flete'|'descuento'|'embalaje'|
  'impuesto'|'concepto'|'nota';
type EstadoLinea='sin_importe'|'literal_ambiguo'|'importe_verificable'|
  'formato_no_verificado'|'aritmetica_incorrecta';
export type LineaAuditoriaMvp075=Readonly<{
 numero:number;textoExacto:string;tipo:TipoLinea;
 importesLiterales:readonly string[];
 estado:EstadoLinea;importeVerificable:string|null;
}>;
export type AuditoriaCotizacionTextoMvp075=Readonly<{
 fuenteOriginal:string;sha256:string;
 lineas:readonly LineaAuditoriaMvp075[];
 totalDeclaradoLiteral:string|null;
 totalDecimalVerificado:string|null;
 estadoTotal:'explicitamente_verificado'|'no_detectado'|'ambiguo_no_verificado';
 estadoIva:'incluido_explicito'|'excluido_explicito'|'no_aclarado'|'contradictorio';
 estadoFlete:'monto_explicito'|'a_convenir'|'incluido_explicito'|
  'no_informado'|'contradictorio';
 estadoConciliacion:'cuadra_suma_observada'|'diferencia_detectada'|'no_verificable';
 sumaObservada:string|null;
 integridadOriginal:'todas_las_lineas_conservadas';
 rankingHabilitado:false;adjudicacion:false;enviosWhatsapp:0;
}>;

const tokenMoney=/^\$\s*[0-9][0-9.,]*$/u;
const signedMoney=/^\s*(-?)\s*(\$\s*[0-9][0-9.,]*)\s*(?:ARS|pesos)?\s*$/iu;
const multiply=/^\s*([1-9][0-9]{0,5})\s+.+?\s+[x×]\s*(\$\s*[0-9][0-9.,]*)\s*=\s*(\$\s*[0-9][0-9.,]*)\s*(?:ARS|pesos)?\s*$/iu;
const singleWithColon=/^\s*[^:\r\n]{2,200}:\s*(-?)\s*(\$\s*[0-9][0-9.,]*)\s*(?:ARS|pesos)?\s*$/iu;
const totalHead=/^\s*(?:total(?:\s+(?:final|general|a\s+pagar|declarado))?|importe\s+total)\b/iu;
const subtotalHead=/^\s*sub\s*total\b/iu;
const freight=/\b(?:flete|env[ií]o|transporte)\b/iu;
const discount=/\b(?:descuento|bonificaci[oó]n|rebaja)\b/iu;
const packaging=/\b(?:pallets?|bolsones?|bols[oó]n|envases?\s+retornables?|bolsas?\s+vac[ií]as?)\b/iu;
const tax=/\b(?:iva|impuestos?)\b/iu;
function moneyToCents(literal:string):bigint|null{
 if(!tokenMoney.test(literal))return null;
 const raw=literal.replace(/^\$\s*/u,'');
 let canonical:string;
 if(/^(?:0|[1-9]\d{0,8})(?:[.,]\d{1,2})?$/u.test(raw)){
  canonical=raw.replace(',','.');
 }else if(/^[1-9]\d{0,2}(?:\.\d{3})+,\d{1,2}$/u.test(raw)){
  canonical=raw.replace(/\./gu,'').replace(',','.');
 }else if(/^[1-9]\d{0,2}(?:,\d{3})+\.\d{1,2}$/u.test(raw)){
  canonical=raw.replace(/,/gu,'');
 }else return null;
 const [whole,dec='']=canonical.split('.');
 if(BigInt(whole)>999999999n)return null;
 return BigInt(whole)*100n+BigInt(dec.padEnd(2,'0'));
}
function decimal(value:bigint):string{
 const sign=value<0n?'-':'';
 const a=value<0n?-value:value;
 return sign+(a/100n).toString()+'.'+(a%100n).toString().padStart(2,'0');
}
function tipoDeLinea(texto:string,monedas:readonly string[]):TipoLinea{
 if(totalHead.test(texto))return 'total';
 if(subtotalHead.test(texto))return 'subtotal';
 if(discount.test(texto))return 'descuento';
 if(freight.test(texto))return 'flete';
 if(packaging.test(texto))return 'embalaje';
 if(/^\s*(?:iva|impuestos?)\s*[:= ]/iu.test(texto))return 'impuesto';
 return monedas.length>0?'concepto':'nota';
}
function valorDeConcepto(texto:string,tipo:TipoLinea,monedas:readonly string[]):{
 estado:EstadoLinea;valor:bigint|null
}{
 if(monedas.length===0)return {estado:'sin_importe',valor:null};
 if(tipo==='total'||tipo==='subtotal'||tipo==='impuesto')
  return {estado:'formato_no_verificado',valor:null};
 const mul=texto.match(multiply);
 if(mul){
  const unit=moneyToCents(mul[2]),total=moneyToCents(mul[3]);
  if(unit===null||total===null)return {estado:'literal_ambiguo',valor:null};
  return unit*BigInt(mul[1])===total
   ?{estado:'importe_verificable',valor:total}
   :{estado:'aritmetica_incorrecta',valor:null};
 }
 if(monedas.length!==1)return {estado:'formato_no_verificado',valor:null};
 const single=texto.match(singleWithColon);
 if(!single)return {estado:'formato_no_verificado',valor:null};
 const amount=moneyToCents(single[2]);
 if(amount===null)return {estado:'literal_ambiguo',valor:null};
 return {estado:'importe_verificable',valor:single[1]==='-'?-amount:amount};
}
/** Independent audit of only those amounts that are explicitly attributable. */
export function auditarCotizacionTextoMvp075(texto:string):AuditoriaCotizacionTextoMvp075{
 const original=capturarPresupuestoOriginalMvp063(texto);
 const lines=original.renglones.map((r):LineaAuditoriaMvp075=>{
  const tipo=tipoDeLinea(r.textoExacto,r.importesLiterales);
  const n=valorDeConcepto(r.textoExacto,tipo,r.importesLiterales);
  return Object.freeze({numero:r.numero,textoExacto:r.textoExacto,
   tipo,importesLiterales:r.importesLiterales,
   estado:n.estado,importeVerificable:n.valor===null?null:decimal(n.valor)});
 });
 const incl=/\b(?:iva\s+(?:incluido|inclu[ií]do)|con\s+iva|iva\s+incl\.)\b/iu.test(texto);
 const excl=/\b(?:sin\s+iva|iva\s+(?:no\s+incluido|excluido|aparte))\b/iu.test(texto);
 const estadoIva=incl&&excl?'contradictorio':
  incl?'incluido_explicito':excl?'excluido_explicito':'no_aclarado';
 const freights=lines.filter(l=>l.tipo==='flete');
 const fleteAConvenir=freights.some(x=>/\b(?:a\s+convenir|a\s+cotizar|a\s+definir)\b/iu.test(x.textoExacto));
 const fleteIncluido=freights.some(x=>/\b(?:incluido|sin\s+cargo|gratis)\b/iu.test(x.textoExacto));
 const fleteConMonto=freights.some(x=>x.importeVerificable!==null);
 const kinds=Number(fleteAConvenir)+Number(fleteIncluido)+Number(fleteConMonto);
 const estadoFlete=kinds>1?'contradictorio':
  fleteAConvenir?'a_convenir':fleteIncluido?'incluido_explicito':
  fleteConMonto?'monto_explicito':'no_informado';
 const conceptos=lines.filter(l=>!['total','subtotal','nota'].includes(l.tipo));
 const anyCurrencyOutside=lines.some(l=>l.tipo==='nota'&&l.importesLiterales.length>0);
 const allVerified=conceptos.length>0&&conceptos.every(l=>
  l.importesLiterales.length===0||l.importeVerificable!==null);
 // Unrecognized monetary lines, currency mixture, ambiguous rate or subtotal
 // prevent reconciliation even when the arithmetic of identified lines matches.
 const hasUnexpectedSubtotals=lines.some(l=>l.tipo==='subtotal'&&l.importesLiterales.length>0);
 const hasForeignCurrency=/\b(?:USD|U\$S|d[oó]lares?)\b/iu.test(texto);
 const hasUnsafe=lines.some(l=>l.importesLiterales.length>0&&
  l.tipo!=='total'&&l.importeVerificable===null);
 const reliable=original.totalDeclarado!==null&&allVerified&&!anyCurrencyOutside&&
  !hasUnexpectedSubtotals&&!hasForeignCurrency&&!hasUnsafe;
 let sum:bigint|null=null;
 if(reliable){
  sum=conceptos.reduce((n,l)=>{
   const v=l.importeVerificable;
   return n+(v===null?0n:(v.startsWith('-')?-1n:1n)*
    moneyToCents('$'+v.replace(/^-/,''))!);
  },0n);
 }
 // Calculation is ONLY a cross-check, never a replacement of original total.
 const totalCents=original.totalDeclarado===null?null:
  moneyToCents(original.totalDeclarado.importeLiteral);
 const estadoConciliacion=sum===null||totalCents===null?'no_verificable':
  sum===totalCents?'cuadra_suma_observada':'diferencia_detectada';
 const totalLiteral=original.totalDeclarado?.importeLiteral??
  lines.filter(l=>l.tipo==='total').flatMap(l=>l.importesLiterales)[0]??null;
 return Object.freeze({
  fuenteOriginal:original.textoOriginal,sha256:original.sha256,
  lineas:Object.freeze(lines),totalDeclaradoLiteral:totalLiteral,
  totalDecimalVerificado:original.totalDeclarado?.importeDecimal??null,
  estadoTotal:original.estadoTotal,estadoIva,estadoFlete,
  estadoConciliacion,sumaObservada:sum===null?null:decimal(sum),
  integridadOriginal:'todas_las_lineas_conservadas',
  rankingHabilitado:false,adjudicacion:false,enviosWhatsapp:0
 });
}
