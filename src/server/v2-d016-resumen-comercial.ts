/** Resumen COMERCIAL del documento autorizado, sin cálculos económicos de IA.
 * Los datos opcionales llegan de la MISMA fuente SHA que devolvió el RPC
 * privado de originales. Una extracción ambigua jamás se declara cobertura.
 */
export type LineaCompraV2=Readonly<{
 line:number;description:string;quantity:string;unit:string;
}>;
export type CoincidenciaMaterialV2=Readonly<{
 linea:number;solicitado:string;cotizado:string|null;
 estado:'coincidencia_automatica'|'por_verificar';
 motivo:string;
}>;
export type CoberturaCompraV2=Readonly<{
 identificados:number;solicitados:number;
 porVerificar:readonly string[];adicionales:number;
 detalle:readonly CoincidenciaMaterialV2[];
}>;
export type DetalleCotizadoV2=Readonly<{
 descripcion:string;cantidad:string;precioUnitario:string|null;
 subtotal:string|null;
}>;
export type ResumenComercialV2=Readonly<{
 totalDeclarado:string|null;
 articulosCotizados:number|null;articulosEnviados:number|null;
 detalleCotizado:readonly DetalleCotizadoV2[];
 descuento:string|null;
 tipoImporte:'Subtotal informado'|'Total informado'|'Importe informado'|'Importe no informado';
 solicitado:readonly LineaCompraV2[];
 cobertura:CoberturaCompraV2|null;
 condiciones:Readonly<{
  iva:string;flete:string;pago:string;entrega:string;
 }>;
}>;
type Punto=Readonly<{categoria:string;evidencia:string;observacion:string}>;
const RECORD=/^\$\s*\d[\d., ]{0,25}$|^(?:ARS|US\$|USD)\s*\d[\d., ]{0,25}$/u;
const CONTACT=/(?:\+?\d[\s().-]?){9,}|[\w.+-]+@[\w.-]+\.\w+|https?:\/\//iu;
const DISCOUNT=/(?:\bdscto\.?|\bdescuento)\s*(?:de\s*)?:?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/iu;
const IGNORED=new Set(['de','del','la','el','los','las','y','en','a','un','una',
 'para','por','kg','kgs','g','l','litro','litros','m3','metros','metro','cubico',
 'cubicos','bolsa','bolsas','bolson','bolsones','big','bag','unidad','unidades',
 'x','tipo','presentacion','envase','paquete','con','sin']);
const ALIASES:Readonly<Record<string,string>>={
 ceresita:'hidrofugo',tacuru:'ligante',bolsón:'bolson'
};
function object(v:unknown):v is Record<string,unknown>{
 return !!v&&typeof v==='object'&&!Array.isArray(v);
}
function normal(s:string):string{
 return s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .replace(/³/gu,'3').toLowerCase();
}
function safe(s:unknown,limit=180):s is string{
 return typeof s==='string'&&s.length>0&&s.length<=limit&&
  !/[\u0000-\u001f<>]/u.test(s)&&!CONTACT.test(s);
}
function tokens(s:string):readonly string[]{
 const n=normal(s);
 const words=n.match(/[a-z]+|\d+(?:[.,]\d+)?/gu)??[];
 const useful=words.filter(w=>!/^\d/u.test(w)&&!IGNORED.has(w))
  .map(w=>ALIASES[w]??w);
 return [...new Set(useful)];
}
function qty(input:string):number|null{
 if(!/^\d{1,6}(?:[.,]\d{1,3})?$/u.test(input.trim()))return null;
 const n=Number(input.trim().replace(',','.'));
 return Number.isFinite(n)&&n>0&&n<=1e6?n:null;
}
function presentation(s:string):Readonly<{unit:string;amount:number}>|null{
 const n=normal(s);
 const m=n.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|kgs|g|m3|litros?|l)\b/u);
 if(!m)return null;
 const amount=qty(m[1]);if(amount===null)return null;
 const unit=m[2]==='kgs'||m[2]==='kg'?'kg':
  m[2]==='g'?'kg':m[2]==='m3'?'m3':'l';
 const multiplier=m[2]==='g'?.001:1;
 return {unit,amount:amount*multiplier};
}
function sameProducts(a:LineaCompraV2,b:LineaCompraV2):boolean{
 const target=tokens(a.description),offer=tokens(b.description);
 if(target.length<1||offer.length<1||target.length>30||offer.length>30||
  target.some(word=>!offer.includes(word)))return false;
 const q1=qty(a.quantity),q2=qty(b.quantity);
 if(q1===null||q2===null)return false;
 const p1=presentation(a.description),p2=presentation(b.description);
 if(Boolean(p1)!==Boolean(p2))return false;
 if(p1&&p2){
  if(p1.unit!==p2.unit)return false;
  return Math.abs(q1*p1.amount-q2*p2.amount)<1e-6;
 }
 // Sin presentación convertible, no se supone cantidad equivalente.
 return Math.abs(q1-q2)<1e-6 &&
  normal(a.unit).replace(/s$/u,'')===normal(b.unit).replace(/s$/u,'');
}
function parseLines(v:unknown,ambiguous:boolean):readonly LineaCompraV2[]|null{
 if(!Array.isArray(v)||v.length>100)return null;
 const seen=new Set<number>(),out:LineaCompraV2[]=[];
 for(const raw of v){
  if(!object(raw)||typeof raw.line!=='number'||
   !Number.isInteger(raw.line)||raw.line<1||raw.line>100||
   seen.has(raw.line)||!safe(raw.description)||
   typeof raw.quantity!=='string'||raw.quantity.length>24||
   typeof raw.unit!=='string'||raw.unit.length>35)
   return null;
  seen.add(raw.line);
  if(ambiguous&&raw.ambiguity!==null&&raw.ambiguity!==undefined)
   continue;
  out.push({line:raw.line,description:raw.description,
   quantity:raw.quantity,unit:raw.unit});
 }
 return out;
}
function comercial(raw:unknown):Readonly<{
 totalDeclarado:string|null;solicitado:readonly LineaCompraV2[];
 cobertura:CoberturaCompraV2|null;
 articulosCotizados:number|null;articulosEnviados:number|null;
 detalleCotizado:readonly DetalleCotizadoV2[];descuento:string|null;
 termsLiteral:string|null;
}>{
 const empty={totalDeclarado:null,solicitado:[],cobertura:null,
  articulosCotizados:null,articulosEnviados:null,detalleCotizado:[],
  descuento:null,termsLiteral:null};
 if(!object(raw))return empty;
 const total=typeof raw.totalLiteral==='string'&&
  raw.totalLiteral.length<45&&RECORD.test(raw.totalLiteral.trim())?
  raw.totalLiteral.trim():null;
 const requested=parseLines(raw.requestItems,false);
 // El comprador ve el pedido COMPLETO; el análisis individual considera
 // sólo las líneas EFECTIVAMENTE enviadas a este comercio.
 const assigned=raw.assignedItems===undefined?requested:
  parseLines(raw.assignedItems,false);
 const offered=parseLines(raw.quotedItems,true);
 const solicitado=Object.freeze(requested??[]);
 const quotedDetails:DetalleCotizadoV2[]=[];
 const descuentos:string[]=[];
 if(Array.isArray(raw.quotedItems)&&raw.quotedItems.length<=100){
  for(const item of raw.quotedItems){
   if(!object(item)||!safe(item.description)||
    typeof item.quantity!=='string'||item.quantity.length>30)continue;
   const money=(x:unknown)=>typeof x==='string'&&
    x.length<45&&RECORD.test(x.trim())?x.trim():null;
   quotedDetails.push(Object.freeze({descripcion:item.description,
    cantidad:item.quantity,precioUnitario:money(item.unitPrice),
    subtotal:money(item.lineTotal)}));
   const discount=item.description.match(DISCOUNT)?.[1];
   if(discount)descuentos.push(discount.replace('.',','));
  }
 }
 const descuento=descuentos.length>0&&descuentos.length===quotedDetails.length&&
  descuentos.every(x=>x===descuentos[0])?
  descuentos[0]+' % en todos los artículos':null;
 const termsLiteral=typeof raw.termsLiteral==='string'&&
  raw.termsLiteral.length<=1000&&safe(raw.termsLiteral,1000)?
  raw.termsLiteral:null;
 const extra={articulosCotizados:offered?.length??null,
  articulosEnviados:assigned?.length??null,
  detalleCotizado:Object.freeze(quotedDetails),descuento,termsLiteral};
 if(!requested||!assigned||!offered||!assigned.length||!offered.length)
  return {totalDeclarado:total,solicitado,cobertura:null,...extra};
 const matched=new Set<number>();
 let identified=0;
 const still:string[]=[];
 const detalle:CoincidenciaMaterialV2[]=[];
 for(const req of assigned){
  const i=offered.findIndex((quote,index)=>
   !matched.has(index)&&sameProducts(req,quote));
  if(i<0){
   still.push(req.description);
   // Una alternativa parecida NO es equivalencia. Se presenta únicamente
   // si hay una sola descripción candidata no vinculada a otra línea.
   const key=tokens(req.description);
   const candidates=offered.filter((quote,index)=>!matched.has(index)&&
    key.length>=2&&key.every(term=>tokens(quote.description).includes(term)));
   const alternative=candidates.length===1?candidates[0]:null;
   detalle.push(Object.freeze({linea:req.line,solicitado:req.description,
    cotizado:alternative?.description??null,estado:'por_verificar',
    motivo:alternative?
     'El original contiene una presentación relacionada, pero no se confirmó la equivalencia de cantidad o especificaciones.':
     'No se confirmó correspondencia de producto, cantidad y presentación.'}));
   continue;
  }
  const quote=offered[i];
  matched.add(i);identified++;
  detalle.push(Object.freeze({linea:req.line,solicitado:req.description,
   cotizado:quote.description,estado:'coincidencia_automatica',
   motivo:'Coinciden automáticamente descripción y cantidad nominal; revisar el original para especificaciones adicionales.'}));
 }
 return {
  totalDeclarado:total,solicitado,...extra,
  cobertura:Object.freeze({
   identificados:identified,solicitados:assigned.length,
   porVerificar:Object.freeze(still.slice(0,6)),
   adicionales:offered.length-matched.size,
   detalle:Object.freeze(detalle)
  })
 };
}
/** Nunca llamamos «total» a un subtotal ni calculamos montos sin el original. */
function tipoMonto(monto:string|null,puntos:readonly Punto[]):ResumenComercialV2['tipoImporte']{
 if(!monto)return 'Importe no informado';
 const cifra=monto.replace(/\D/gu,'');
 for(const p of puntos){
  if(p.categoria!=='precio')continue;
  // La etiqueta y el importe deben aparecer juntos. Una evidencia que
  // menciona ambos (SUBTOTAL y TOTAL) NO permite atribuirlos por separado.
  const evidence=normal(p.evidencia);
  const pairs=evidence.matchAll(/\b(sub\s*total|total)\b\s*(?:de\s+)?[:=\-]?\s*(?:\$|ars|usd|us\$)?\s*(\d[\d., ]{0,25})/gu);
  for(const match of pairs){
   if(match[2].trim().replace(/\D/gu,'')!==cifra)continue;
   return match[1].replace(/\s/gu,'')==='subtotal'?
    'Subtotal informado':'Total informado';
  }
 }
 return 'Importe informado';
}
function cond(puntos:readonly Punto[],conditionsText:string|null):ResumenComercialV2['condiciones']{
 const evidence=(cat:string)=>normal(puntos.find(p=>p.categoria===cat)?.evidencia??'');
 // La extracción comercial original sirve de fuente si el análisis de IA
 // todavía no existe. Nunca inferir IVA, descuento, pago o flete ausentes.
 const terms=normal(conditionsText??'');
 const iva=evidence('iva'),flete=evidence('flete');
 const directo=evidence('forma_pago');
 // Algunos originales combinan «forma de pago y plazo» en una misma cita.
 // Se lee SOLO la frase monetaria explícita; nunca se infiere del plazo.
 const combinado=normal(puntos.find(p=>p.categoria==='plazo'&&
  /\bcontado\b|\btransferencia\b|\bforma de pago\b/iu.test(p.evidencia))?.evidencia??'');
 const pago=directo||combinado||terms;
 let i=iva?'No verificado':'No informado';
 if(/iva[^.\n;]*no (?:esta )?incluido/u.test(iva))i='No incluido';
 else if(/iva[^.\n;]*incluido/u.test(iva))i='Incluido';
 else if(/iva[^.\n;]*no informad/u.test(iva))i='No informado';
 let f=flete?'No verificado':'No informado';
 if(/flete[^.\n;]*no incluido/u.test(flete))
  f=/importe a cotizar/u.test(flete)?'No incluido · a cotizar':'No incluido';
 else if(/flete[^.\n;]*incluido/u.test(flete))f='Incluido';
 else if(/flete[^.\n;]*no informad/u.test(flete))f='No informado';
 if(f==='No informado'&&/\bflete\s+a\s+convenir\b/u.test(terms))f='A convenir';
 else if(f==='No informado'&&/\bflete\s+no\s+incluido\b/u.test(terms))f='No incluido';
 else if(f==='No informado'&&/\bflete\s+incluido\b/u.test(terms))f='Incluido';
 let pay=pago?'No verificado':'No informado';
 if(!/\bno\s+(?:se\s+)?(?:acepta|admite|incluye)\s+(?:pago\s+)?(?:contado|efectivo)\b/u.test(pago)&&
  /\bcontado\s+(?:en\s+)?efectivo\b|\befectivo\s+al\s+contado\b/u.test(pago))
  pay='Contado en efectivo';
 else if(/\btransferencia\s+(?:bancaria)?\b/u.test(pago))
  pay='Transferencia bancaria';
 else if(/\bcontado\b/u.test(pago))pay='Contado';
 else if(/\bno informad/u.test(pago))pay='No informado';
 // Se conserva por compatibilidad con la proyección previa, pero NUNCA se
 // presenta el plazo de entrega en el portal o en el comparativo comercial.
 return Object.freeze({iva:i,flete:f,pago:pay,entrega:'No informado'});
}
export function resumirOfertaComercialV2(
 raw:unknown,puntos:readonly Punto[]
):ResumenComercialV2{
 const metadata=comercial(raw);
 return Object.freeze({...metadata,tipoImporte:tipoMonto(metadata.totalDeclarado,puntos),
  condiciones:cond(puntos,metadata.termsLiteral)});
}
