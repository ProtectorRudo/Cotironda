/** Resumen COMERCIAL del documento autorizado, sin cálculos económicos de IA.
 * Los datos opcionales llegan de la MISMA fuente SHA que devolvió el RPC
 * privado de originales. Una extracción ambigua jamás se declara cobertura.
 */
export type LineaCompraV2=Readonly<{
 line:number;description:string;quantity:string;unit:string;
}>;
export type CoberturaCompraV2=Readonly<{
 identificados:number;solicitados:number;
 porVerificar:readonly string[];adicionales:number;
}>;
export type ResumenComercialV2=Readonly<{
 totalDeclarado:string|null;
 cobertura:CoberturaCompraV2|null;
 condiciones:Readonly<{
  iva:string;flete:string;pago:string;entrega:string;
 }>;
}>;
type Punto=Readonly<{categoria:string;evidencia:string;observacion:string}>;
const RECORD=/^\$\s*\d[\d., ]{0,25}$|^(?:ARS|US\$|USD)\s*\d[\d., ]{0,25}$/u;
const CONTACT=/(?:\+?\d[\s().-]?){9,}|[\w.+-]+@[\w.-]+\.\w+|https?:\/\//iu;
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
 totalDeclarado:string|null;cobertura:CoberturaCompraV2|null;
}>{
 if(!object(raw))return {totalDeclarado:null,cobertura:null};
 const total=typeof raw.totalLiteral==='string'&&
  raw.totalLiteral.length<45&&RECORD.test(raw.totalLiteral.trim())?
  raw.totalLiteral.trim():null;
 const requested=parseLines(raw.requestItems,false);
 const offered=parseLines(raw.quotedItems,true);
 if(!requested||!offered||!requested.length||!offered.length)
  return {totalDeclarado:total,cobertura:null};
 const matched=new Set<number>();
 let identified=0;
 const still:string[]=[];
 for(const req of requested){
  const i=offered.findIndex((quote,index)=>
   !matched.has(index)&&sameProducts(req,quote));
  if(i<0){still.push(req.description);continue}
  matched.add(i);identified++;
 }
 return {
  totalDeclarado:total,
  cobertura:Object.freeze({
   identificados:identified,solicitados:requested.length,
   porVerificar:Object.freeze(still.slice(0,6)),
   adicionales:offered.length-matched.size
  })
 };
}
function cond(puntos:readonly Punto[]):ResumenComercialV2['condiciones']{
 const evidence=(cat:string)=>normal(puntos.find(p=>p.categoria===cat)?.evidencia??'');
 const iva=evidence('iva'),flete=evidence('flete'),plazo=evidence('plazo');
 const pago=evidence('forma_pago')||plazo;
 let i='No verificado';
 if(/iva[^.\n;]*no (?:esta )?incluido/u.test(iva))i='No incluido';
 else if(/iva[^.\n;]*incluido/u.test(iva))i='Incluido';
 else if(/iva[^.\n;]*no informad/u.test(iva))i='No informado';
 let f='No verificado';
 if(/flete[^.\n;]*no incluido/u.test(flete))
  f=/importe a cotizar/u.test(flete)?'No incluido · a cotizar':'No incluido';
 else if(/flete[^.\n;]*incluido/u.test(flete))f='Incluido';
 else if(/flete[^.\n;]*no informad/u.test(flete))f='No informado';
 const pay=/forma de pago[^.\n;]*no informad/u.test(pago)||
  /forma de pago y plazo de entrega[^.\n;]*no informad/u.test(pago)?
  'No informado':'No verificado';
 const delivery=/plazo(?: de entrega)?[^.\n;]*no informad/u.test(plazo)?
  'No informado':'No verificado';
 return Object.freeze({iva:i,flete:f,pago:pay,entrega:delivery});
}
export function resumirOfertaComercialV2(
 raw:unknown,puntos:readonly Punto[]
):ResumenComercialV2{
 const metadata=comercial(raw);
 return Object.freeze({...metadata,condiciones:cond(puntos)});
}
