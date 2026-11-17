/** Cotironda V2: gramática dimensional; NO es un diccionario de materiales.
 * Contrasta magnitudes citadas del original y permite conversiones exactas,
 * sin inferir stock, precio, entrega ni sustituciones de productos.
 * Las grafías ambiguas se retienen para revisión.
 */
export type DimensionD013='longitud'|'superficie'|'volumen_aridos'|
 'volumen_liquidos'|'masa';
export type MagnitudD013=Readonly<{
 dimension:DimensionD013;unidad:string;valorBase:bigint;
 literal:string;inicio:number;fin:number;
}>;
const B=1000000000n;
const Q=1000000n;
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
 .toLocaleLowerCase('es-AR').replace(/\s+/gu,' ').trim();
function decimalAr(text:string):bigint|null{
 let t=text;
 if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,6})?$/u.test(t))
  t=t.replace(/\./gu,'');
 else if(!/^\d{1,6}(?:[.,]\d{1,6})?$/u.test(t))return null;
 t=t.replace(',','.');
 const [int,frac='']=t.split('.');
 try{
  const result=BigInt(int)*Q+BigInt(frac.padEnd(6,'0'));
  return result>0n&&result<=1000000n*Q?result:null;
 }catch{return null}
}
type Unidad=Readonly<{dimension:DimensionD013;canonica:string;factor:bigint}>;
const u=(dimension:DimensionD013,canonica:string,factor:bigint):Unidad=>
 ({dimension,canonica,factor});
/** Kg vs L y m³ vs L no se cruzan automáticamente: la física no prueba
 * identidad técnica ni presentación de los materiales.
 */
export function unidadDimensionadaV2D013(text:string):Unidad|null{
 if(typeof text!=='string'||text.length>100)return null;
 const original=text.trim();
 const t=fold(original).replace(/[²]/gu,'2').replace(/[³]/gu,'3')
  .replace(/\s*\.\s*/gu,'.');
 if(/^(?:m\.l\.?|metros?\s+lineales?|mts?\.?\s+(?:lineales?|lin\.?)|mts?\.?)$/u.test(t))
  return u('longitud','m',B);
 if(/^(?:metros?\s+cuadrados?|m2)$/u.test(t))
  return u('superficie','m2',B);
 if(/^(?:centimetros?\s+cuadrados?|cm2)$/u.test(t))
  return u('superficie','cm2',100000n);
 if(/^(?:milimetros?\s+cuadrados?|mm2)$/u.test(t))
  return u('superficie','mm2',1000n);
 if(/^(?:metros?\s+cubicos?|m3)$/u.test(t))
  return u('volumen_aridos','m3',B);
 if(/^(?:centimetros?\s+cubicos?|cm3)$/u.test(t))
  return u('volumen_aridos','cm3',1000n);
 if(/^(?:milimetros?\s+cubicos?|mm3)$/u.test(t))
  return u('volumen_aridos','mm3',1n);
 if(/^(?:milimetros?|mm)$/u.test(t))return u('longitud','mm',1000000n);
 if(/^(?:centimetros?|cm)$/u.test(t))return u('longitud','cm',10000000n);
 if(/^(?:metros?|m)$/u.test(t))return u('longitud','m',B);
 if(/^(?:kilometros?|km)$/u.test(t))return u('longitud','km',1000n*B);
 if(/^(?:kilogramos?|kilos?|kg)$/u.test(t))return u('masa','kg',B);
 if(/^(?:gramos?|grs?|gr|g)$/u.test(t))return u('masa','g',1000000n);
 if(/^(?:miligramos?|mg)$/u.test(t))return u('masa','mg',1000n);
 if(/^(?:toneladas?|tns?|tn)$/u.test(t))return u('masa','t',1000n*B);
 if(/^(?:litros?|lts?|lt|l)$/u.test(t))
  return u('volumen_liquidos','l',B);
 if(/^(?:mililitros?|mililiters?|cc|mℓ)$/u.test(t))
  return u('volumen_liquidos','ml',1000000n);
 if(/^(?:centilitros?|cl)$/u.test(t))
  return u('volumen_liquidos','cl',10000000n);
 if(/^(?:decilitros?|dl)$/u.test(t))
  return u('volumen_liquidos','dl',100000000n);
 // "ml" puede querer decir mililitros o metros lineales en un corralón.
 // mL (L mayúscula, símbolo inequívoco SI) significa mililitros.
 if(original==='mL')return u('volumen_liquidos','ml',1000000n);
 return null;
}
const REGEX=/(?<![\p{L}\p{N}])(\d{1,3}(?:\.\d{3})+(?:,\d{1,6})?|\d{1,6}(?:[.,]\d{1,6})?)\s*(metros?\s+(?:lineales?|cuadrados?|cubicos?)|mts?\.?\s+(?:lineales?|lin\.?)|milimetros?\s+(?:cuadrados?|cubicos?)|centimetros?\s+(?:cuadrados?|cubicos?)|kilogramos?|miligramos?|mililitros?|mililiters?|centilitros?|decilitros?|kilometros?|milimetros?|centimetros?|toneladas?|litros?|gramos?|kilos?|mts?\.?|m\s*\.\s*l\.?|mm[²³23]?|cm[²³23]?|m[²³23]?|km|kg|mg|grs?|tns?|lts?|mL|ml|cc|cl|dl|g|l)(?![\p{L}\p{N}²³])/giu;
/** null = escritura ambigua/no verificable, [] = ninguna magnitud física. */
export function leerMagnitudesV2D013(text:string):readonly MagnitudD013[]|null{
 if(typeof text!=='string'||text.length>1500)return null;
 const source=text.normalize('NFD').replace(/[\u0300-\u036f]/gu,'');
 const found:MagnitudD013[]=[];
 const re=new RegExp(REGEX.source,'giu');
 for(const m of source.matchAll(re)){
  const unit=unidadDimensionadaV2D013(m[2]);
  const number=decimalAr(m[1]);
  if(!unit||number===null)return null;
  const scaled=number*unit.factor;
  if(scaled%Q!==0n)return null;
  found.push({dimension:unit.dimension,unidad:unit.canonica,
   valorBase:scaled/Q,literal:m[0],inicio:m.index,fin:m.index+m[0].length});
 }
 return found;
}
/** Igualdad de todas las magnitudes y sus dimensiones, con conversión exacta.
 * No aceptar un número correcto con unidad incompatible (10 kg != 10 L).
 */
export function mismaPresentacionFisicaV2D013(
 normalizada:string,original:string
):boolean{
 const a=leerMagnitudesV2D013(normalizada),b=leerMagnitudesV2D013(original);
 if(a===null||b===null||a.length!==b.length)return false;
 if(a.length===0)return fold(normalizada)===fold(original);
 const signature=(v:readonly MagnitudD013[])=>
  v.map(x=>x.dimension+':'+x.valorBase.toString()).sort();
 const x=signature(a),y=signature(b);
 if(!x.every((entry,i)=>entry===y[i]))return false;
 // No esconder otros números dentro de la presentación: por ejemplo
 // «2 bolsas de 25 kg» no es «1 bolsa de 25 kg».
 const extras=(s:string,parsed:readonly MagnitudD013[])=>{
  const input=s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'');
  const array=[...input];
  for(const m of parsed)for(let i=m.inicio;i<m.fin;i++)array[i]=' ';
  return [...array.join('').matchAll(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)*(?![\p{L}\p{N}])/gu)]
   .map(m=>m[0].replace(',','.')).sort();
 };
 return JSON.stringify(extras(normalizada,a))===
  JSON.stringify(extras(original,b));
}
/** Une sinónimos de unidades de compra en lectores independientes SIN
 * convertir la cantidad de envases en litros/peso y sin asumir que bolsa
 * equivale a bolsón.
 */
export function unidadCompradaCanonicaV2D013(text:string):string{
 const t=fold(text);
 const containers:Readonly<Record<string,string>>={
  bag:'bag',bolsa:'bag',bolsas:'bag',
  bolson:'bigbag',bolsones:'bigbag',bigbag:'bigbag','big bag':'bigbag',
  bucket:'bucket',balde:'bucket',baldes:'bucket',
  roll:'roll',rollo:'roll',rollos:'roll',
  box:'box',caja:'box',cajas:'box',
  pack:'pack',packs:'pack',paquete:'pack',paquetes:'pack',
  unit:'unit',unidad:'unit',unidades:'unit',unid:'unit',u:'unit'
 };
 if(Object.prototype.hasOwnProperty.call(containers,t))
  return containers[t];
 const physical=unidadDimensionadaV2D013(text);
 return physical?.canonica??t;
}
