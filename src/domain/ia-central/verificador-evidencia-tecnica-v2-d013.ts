/** V2 D013: deterministic second gate for product-level semantic proposals.
 * This guard NEVER makes up functional equivalence, stock, price or taxes.
 * A false positive leads to internal review, not a WhatsApp request.
 * Requires exact original descriptions from buyer and supplier catalog.
 */
import type {PropuestaArticulo} from './contrato-v1.ts';

export type PruebaTecnicaD013=Readonly<{
 estado:'evidencia_suficiente'|'revision_interna';
 motivo:string;
 conversion:Readonly<{
  unidad:'kg'|'l';
  cantidadSolicitadaBase:string;
  presentacionSolicitada:string;
  presentacionCatalogo:string;
  envasesEquivalentes:string;
 }> | null;
}>;

type Kind='kg'|'l';
type Pack=Readonly<{kind:Kind;amount:bigint;size:string}>;
const SEPARADOR=/[\s.,;:()\[\]{}«»"“”/\-]+/u;
const STOP=new Set([
 'bolsa','bolsas','bolson','bolsones','big','bag','bags','bidon','bidones',
 'envase','envases','unidades','unidad','paquete','paquetes','caja','cajas',
 'marca','marcas','de','del','la','el','las','los','para','con','sin','por',
 'solo','solamente','unicamente','exclusivamente','excluyente','obligatoria',
 'presentacion','x','tipo','cantidad','pedido','cotizar','original','otra'
]);
function fold(x:string):string{
 return x.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .toLowerCase().replace(/m²/gu,'m2').replace(/\s+/gu,' ').trim();
}
function refuse(motivo:string):PruebaTecnicaD013{
 return {estado:'revision_interna',motivo,conversion:null};
}
function pass(motivo:string,conversion:PruebaTecnicaD013['conversion']=null):
 PruebaTecnicaD013{
 return {estado:'evidencia_suficiente',motivo,conversion};
}
function normalizedWords(s:string):Set<string>{
 const tokens=fold(s).split(SEPARADOR).filter(x=>
  x.length>=4&&!STOP.has(x)&&!/^[\d]+$/u.test(x));
 return new Set(tokens);
}
function size(s:string):Pack|null{
 const all=[...fold(s).matchAll(/(?:^|\s)(\d{1,5}(?:[.,]\d{1,3})?)\s*(kg|g|litros?|lts?|ml)(?=\s|$|[.,;])/gu)];
 if(all.length!==1)return null;
 const [,number,unit]=all[0];
 const n=BigInt(number.replace(',','.').split('.')[0]) * 1000n+
  BigInt((number.replace(',','.').split('.')[1]??'').padEnd(3,'0'));
 if(n<=0n)return null;
 const type=/^(?:kg|g)$/u.test(unit)?'kg':'l';
 const per=/^(?:g|ml)$/u.test(unit)?1n:1000n;
 const scaled=n*per/1000n;
 if(scaled<=0n||n*per%1000n!==0n)return null;
 return {kind:type,amount:scaled,size:number+' '+unit};
}
function parseAmount(s:string):bigint|null{
 if(!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,3})?$/u.test(s))return null;
 const [a,b='']=s.split('.');
 const q=BigInt(a)*1000n+BigInt(b.padEnd(3,'0'));
 return q>0n?q:null;
}
function mandatoryPhrase(request:string):string|null{
 // A generic "solo" in narrative prose is ambiguous; forbid automatic
 // substitution unless an identifiable brand requirement has a clear span.
 const m=fold(request).match(/\b(?:solo\s+marca|marca\s+(?:excluyente|obligatoria|unica))\s*[:=-]?\s*([a-z][a-z0-9 ]{1,42})/u);
 if(m)return m[1].split(/\s+(?:de|en|presentacion|bolsas?|\d)/u)[0].trim();
 const marked=fold(request).match(/\bsolo\s+([a-z][a-z0-9]+(?:\s+[a-z][a-z0-9]+){0,2})(?=\s+\d|\s+bolsas?|[.,;]|$)/u);
 return marked?.[1]??null;
}
function cableSize(text:string):string|null{
 const items=[...fold(text).matchAll(/\b(\d{1,3}(?:[.,]\d{1,2})?)\s*mm\s*(?:2|²)(?=\W|$)/gu)];
 if(items.length!==1)return null;
 return String(Number(items[0][1].replace(',','.')));
}
/** Numeric thickness / dimensions (mm) are mandatory technical attributes.
 * This is intentionally a NEGATIVE guard, not universal equivalence logic. */
function thicknessMillimeters(text:string):string|null{
 const all=[...fold(text).matchAll(/\b(\d{1,4}(?:[.,]\d{1,2})?)\s*mm(?!\s*(?:2|²))(?=\W|$)/gu)];
 if(all.length!==1)return null;
 return String(Number(all[0][1].replace(',','.')));
}
function materialGroup(text:string):string|null{
 const s=fold(text);
 if(/\bcemento\b/u.test(s)){
  if(/\balbanileria\b/u.test(s))return 'cemento_albanileria';
  if(/\bportland\b/u.test(s))return 'cemento_portland';
  return 'cemento_tipo_desconocido';
 }
 if(/\b(?:latex|pintura)\b/u.test(s)){
  if(/\bexterior\b/u.test(s))return 'pintura_exterior';
  if(/\binterior\b/u.test(s))return 'pintura_interior';
  return 'pintura_uso_desconocido';
 }
 if(/\bcable\b/u.test(s))return 'cable';
 if(/\bplaca\b/u.test(s)){
  if(/\bosb\b/u.test(s))return 'placa_osb';
  if(/\byeso\b/u.test(s))return 'placa_yeso';
  return 'placa_tipo_desconocido';
 }
 if(/\barena\b/u.test(s)){
  if(/\bfina\b/u.test(s))return 'arena_fina';
  if(/\bgruesa\b/u.test(s))return 'arena_gruesa';
  return 'arena_tipo_desconocido';
 }
 return null;
}
export function verificarCorrespondenciaTecnicaD013(
 pedido:PropuestaArticulo,catalogo:string,tipo:'producto_declarado'|'alternativa_razonable'
):PruebaTecnicaD013{
 if(!pedido||typeof pedido.descripcion!=='string'||
  typeof pedido.evidencia!=='string'||typeof catalogo!=='string'||
  !catalogo.trim()||catalogo.length>250)return refuse('fuentes_invalidas');
 const demand=[pedido.descripcion,pedido.evidencia,pedido.presentacion??'',
  pedido.aclaracion??''].join(' ');
 const supplied=fold(catalogo);
 const must=mandatoryPhrase(demand);
 if(must&&(!supplied.includes(must)||must.length<3))
  return refuse('marca_excluyente_no_acreditada');

 const wantedGroup=materialGroup(demand),offeredGroup=materialGroup(catalogo);
 if(wantedGroup&&offeredGroup&&wantedGroup!==offeredGroup)
  return refuse('tipo_o_aplicacion_tecnica_diferente');
 if(wantedGroup&&!offeredGroup||!wantedGroup&&offeredGroup)
  return refuse('prestacion_tecnica_sin_acreditar');

 const wantedCable=cableSize(pedido.descripcion)||cableSize(pedido.evidencia),
  offeredCable=cableSize(catalogo);
 if((wantedCable||offeredCable)&&wantedCable!==offeredCable)
  return refuse('seccion_cable_no_equivalente');
 const wantThickness=thicknessMillimeters(pedido.descripcion)||
  thicknessMillimeters(pedido.evidencia);
 const haveThickness=thicknessMillimeters(catalogo);
 if(wantThickness&&wantThickness!==haveThickness)
  return refuse('dimension_tecnica_no_equivalente');

 // The AI's narrative is NEVER accepted as proof of a missing product;
 // product identity must have evidence in BOTH original description strings.
 const buyerWords=normalizedWords(pedido.descripcion+' '+pedido.evidencia);
 const sellerWords=normalizedWords(catalogo);
 if(![...buyerWords].some(x=>sellerWords.has(x)))
  return refuse('sin_identidad_material_comprobable');

 let conversion:PruebaTecnicaD013['conversion']=null;
 if(['bag','unit','pack','box'].includes(pedido.unidad)){
  const want=size(pedido.descripcion)||size(pedido.presentacion??'')||
   size(pedido.evidencia),have=size(catalogo),q=parseAmount(pedido.cantidad);
  if(want&&have){
   if(want.kind!==have.kind)return refuse('base_de_medida_incompatible');
   if(q===null)return refuse('cantidad_no_comprobable');
   // q is milli-pack; amount is milli-kg or milli-l.
   const packsMilli=q*want.amount/have.amount;
   if(q*want.amount%have.amount!==0n||packsMilli%1000n!==0n)
    return refuse('conversion_de_envases_no_entera');
   conversion={
    unidad:want.kind,
    cantidadSolicitadaBase:(q*want.amount/1000000n).toString(),
    presentacionSolicitada:want.size,
    presentacionCatalogo:have.size,
    envasesEquivalentes:(packsMilli/1000n).toString()
   };
  }else if(want&&!have&&tipo==='alternativa_razonable'){
   return refuse('presentacion_alternativa_sin_acreditar');
  }
 }
 return pass('identidad_material_y_restricciones_comprobadas',conversion);
}
