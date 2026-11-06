/**
 * Etapa 3 / MVP244 — ninguna línea comercial con importe explícito
 * puede desaparecer de la interpretación de IA. No identifica productos.
 * Es una barrera de integridad económica, NO un extractor de precios.
 */
export type LineaCitadaMvp244=Readonly<{textoOriginal:string}>;

// Regex de LITERALES monetarios inequívocos: prefijo monetario + cifra.
// No suponer moneda ARS por $, eso lo verifica MVP241 por separado.
const MONTO=/(?:(?:AR\$|US\$|U\$S|\$)\s*|(?:ARS|USD)\s+)\d+(?:\.\d{3})*(?:,\d{1,2})?/giu;
// Total y subtotal se preservan en fuente, NO son líneas nuevas de
// producto, y deben conciliarse por otros controles.
const RESUMEN=/^(?:total(?:\s+(?:general|final|a\s+pagar|presupuesto|cotizaci[oó]n))?|subtotal|importe\s+total|monto\s+total)(?:\s*[:=$]|\s|$)/iu;
const CLEAN=(v:string)=>v.replace(/\s+/gu,'').toUpperCase();
function montos(raw:string):string[]{
 return [...raw.matchAll(MONTO)].map(x=>CLEAN(x[0]));
}
const FREQUENCY=(values:readonly string[]):Map<string,number>=>{
 const counts=new Map<string,number>();
 for(const v of values)counts.set(v,(counts.get(v)??0)+1);
 return counts;
};
/** Si retorna false, conservar fuente y pedir revisión, sin comparar
 * una oferta a la que le falten cargos monetarios expresos.
 * Los resúmenes totales siguen en la fuente original inmutable.
 */
export function importesOriginalesRepresentadosMvp244(
 fuente:unknown,lineas:unknown
):boolean{
 if(typeof fuente!=='string'||!fuente.trim()||
    fuente.length>150000||!Array.isArray(lineas)||
    lineas.length>200)return false;
 if(!lineas.every(x=>x!==null&&typeof x==='object'&&
     typeof (x as LineaCitadaMvp244).textoOriginal==='string'&&
     (x as LineaCitadaMvp244).textoOriginal.length<=1500))
  return false;
 // Dividir por filas y punto y coma: no imponer planilla ni catálogo.
 const segments=fuente.split(/\r?\n|;\s*(?=[^\n]{3,1500})/gu);
 const sourceAmounts=segments.flatMap(segment=>{
  const part=segment.trim();
  return RESUMEN.test(part)?[]:montos(part);
 });
 const citedAmounts=(lineas as LineaCitadaMvp244[]).flatMap(line=>
  RESUMEN.test(line.textoOriginal.trim())?[]:montos(line.textoOriginal));
 const source=FREQUENCY(sourceAmounts),cited=FREQUENCY(citedAmounts);
 // No duplicar importes ni reemplazar uno de la fuente por otro.
 if(source.size!==cited.size)return false;
 for(const [value,count] of source){
  if(cited.get(value)!==count)return false;
 }
 return true;
}
