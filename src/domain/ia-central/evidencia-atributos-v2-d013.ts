import {leerMagnitudesV2D013,mismaPresentacionFisicaV2D013,
 unidadDimensionadaV2D013} from './magnitudes-universales-v2-d013.ts';
/** Cotironda V2: citas por atributo, nunca vocabulario de materiales.
 * Un parser aritmético controla cantidades; la IA reconoce los productos.
 * No usa redes, ni datos de compradores, ni escrituras ni autorización.
 */
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
 .toLocaleLowerCase('es-AR').trim().replace(/\s+/gu,' ');
const small:Readonly<Record<string,number>>={
 un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,
 siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,trece:13,
 catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,
 diecinueve:19,veinte:20,veintiuno:21,veintiun:21,veintiuna:21,
 veintidos:22,veintitres:23,veinticuatro:24,veinticinco:25,
 veintiseis:26,veintisiete:27,veintiocho:28,veintinueve:29
};
const tens:Readonly<Record<string,number>>={
 treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,
 ochenta:80,noventa:90
};
const hundreds:Readonly<Record<string,number>>={
 cien:100,ciento:100,doscientos:200,doscientas:200,
 trescientos:300,trescientas:300,cuatrocientos:400,cuatrocientas:400,
 quinientos:500,quinientas:500,seiscientos:600,seiscientas:600,
 setecientos:700,setecientas:700,ochocientos:800,ochocientas:800,
 novecientos:900,novecientas:900
};
const has=(o:Readonly<Record<string,number>>,s:string)=>
 Object.prototype.hasOwnProperty.call(o,s);
function belowHundred(s:string):number|null{
 if(has(small,s))return small[s];
 if(has(tens,s))return tens[s];
 const m=/^(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa) y (un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)$/u.exec(s);
 return m?tens[m[1]]+small[m[2]]:null;
}
function belowThousand(s:string):number|null{
 const v=belowHundred(s);if(v!==null)return v;
 for(const prefix of Object.keys(hundreds)){
  if(s===prefix)return hundreds[prefix];
  if(s.startsWith(prefix+' ')){
   const suffix=belowHundred(s.slice(prefix.length+1));
   return suffix===null?null:hundreds[prefix]+suffix;
  }
 }
 return null;
}
/** No inventar valores de lenguaje ambiguo (p.ej. "varios").
 * Los números son una gramática, no una lista de productos.
 */
export function numeroNaturalV2D013(literal:string):number|null{
 if(typeof literal!=='string'||!literal.trim()||literal.length>120)return null;
 const t=fold(literal);
 if(/^\d{1,3}(?:\.\d{3})+$/u.test(t)){
  const thousands=Number(t.replace(/\./gu,''));
  return thousands>0&&thousands<=1000000?thousands:null;
 }
 if(/^\d{1,6}(?:[.,]\d{1,3})?$/u.test(t)){
  const n=Number(t.replace(',','.'));return n>0&&n<=1000000?n:null;
 }
 if(t==='medio'||t==='media')return 0.5;
 const v=belowThousand(t);if(v!==null)return v>0?v:null;
 const quantifiers=[['docena','docenas',12],['par','pares',2],
  ['centena','centenas',100]] as const;
 for(const [singular,plural,multiplier] of quantifiers){
  if(t===singular||t===plural)return multiplier;
  if(t==='media '+singular||t==='medio '+singular)return multiplier/2;
  const suffix=t.endsWith(' '+singular)?singular:
   t.endsWith(' '+plural)?plural:null;
  if(suffix!==null){
   const n=belowThousand(t.slice(0,-suffix.length-1));
   return n!==null&&n>0&&n*multiplier<=1000000?n*multiplier:null;
  }
 }
 const words=t.split(' '),idx=words.indexOf('mil');
 if(idx>=0&&words.lastIndexOf('mil')===idx){
  const prefix=words.slice(0,idx).join(' '),rest=words.slice(idx+1).join(' ');
  const k=prefix?belowThousand(prefix):1,r=rest?belowThousand(rest):0;
  if(k!==null&&r!==null&&k>0&&k*1000+r<=1000000)
   return k*1000+r;
 }
 return null;
}
const letterOrDigit=/[\p{L}\p{N}]/u;
function citations(source:string,quote:string):number[]{
 const found:number[]=[];if(!quote||quote.length>source.length)return found;
 let p=source.indexOf(quote);
 while(p>=0){
  const before=p===0?'':source[p-1];
  const after=p+quote.length===source.length?'':source[p+quote.length];
  if(!letterOrDigit.test(before)&&!letterOrDigit.test(after))
   found.push(p);
  p=source.indexOf(quote,p+1);
 }
 return found;
}
/** La cantidad debe tener cita textual propia y diferente a la presentación.
 * Incluso si el mismo renglón tiene más cifras, no usarlas como cantidad.
 */
export function probarAtributosV2D013(a:{
 evidencia:string;cantidad:string;unidad:string;presentacion:string|null;
 citaCantidad:unknown;citaProducto:unknown;citaPresentacion:unknown;
}):boolean{
 const {evidencia,cantidad,presentacion,citaCantidad,citaProducto,citaPresentacion,unidad}=a;
 if(typeof evidencia!=='string'||typeof citaCantidad!=='string'||
   typeof citaProducto!=='string'||!citaCantidad.trim()||
   citaProducto.trim().length<2||citaCantidad.length>120||citaProducto.length>250)
  return false;
 if(numeroNaturalV2D013(citaCantidad)!==Number(cantidad))return false;
 const quantities=citations(evidencia,citaCantidad);
 if(!quantities.length||!citations(evidencia,citaProducto).length)return false;
 // Un número seguido de peso, volumen o dimensión describe una magnitud,
 // no necesariamente cantidad de envases. Rechazar cuando la unidad
 // comprada NO es física, incluso si el modelo omitió la presentación.
 const compraFisica=unidadDimensionadaV2D013(unidad)!==null;
 if(!compraFisica){
  const magnitudes=leerMagnitudesV2D013(evidencia);
  // Ambigüedad explícita (por ejemplo "ml") no habilita envases.
  if(magnitudes===null)return false;
  if(quantities.every(q=>magnitudes.some(m=>m.inicio===q)))
   return false;
 }
 if(presentacion===null)return citaPresentacion===null;
 if(typeof citaPresentacion!=='string'||!citaPresentacion.trim()||
   citaPresentacion.length>120)return false;
 const measures=citations(evidencia,citaPresentacion);
 if(!measures.length||
    !quantities.some(q=>measures.some(m=>
     q+citaCantidad.length<=m||m+citaPresentacion.length<=q)))
  return false;
 // El exponente de m²/m³ (o m2/m3) no es una cantidad comprada.
 // La IA puede normalizar «1 m³» como «1 m3»: son la misma presentación.
 // No permitir que esa normalización convierta superficie en volumen.
 return mismaPresentacionFisicaV2D013(presentacion,citaPresentacion);
}
