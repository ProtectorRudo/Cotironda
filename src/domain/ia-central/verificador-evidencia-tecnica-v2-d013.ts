import {leerMagnitudesV2D013} from './magnitudes-universales-v2-d013.ts';
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
 const medidas=leerMagnitudesV2D013(s);
 if(medidas===null)return null;
 const fisicas=medidas.filter(m=>
  m.dimension==='masa'||m.dimension==='volumen_liquidos');
 // Una sola presentación comercial acreditada, no elegir un número
 // conveniente entre varios. Valores a milésimas de kg o de litro.
 if(fisicas.length!==1||fisicas[0].valorBase%1000000n!==0n)return null;
 const dato=fisicas[0];
 const amount=dato.valorBase/1000000n;
 return amount>0n?{kind:dato.dimension==='masa'?'kg':'l',
  amount,size:dato.literal.trim()}:null;
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
 const values=leerMagnitudesV2D013(text);
 if(values===null)return null;
 const sections=values.filter(m=>m.dimension==='superficie'&&
  (m.unidad==='mm2'||m.unidad==='cm2'));
 if(sections.length!==1)return null;
 // Valor exacto en m², no comparar grafías (2,5 mm² = 0,025 cm²).
 return sections[0].valorBase.toString();
}
/** Espesor/dimensión técnica convertida a longitud base exacta.
 * No confundir sección de cable (área) ni metros comprados con espesor.
 */
function thicknessMillimeters(text:string):string|null{
 const values=leerMagnitudesV2D013(text);
 if(values===null)return null;
 const thickness=values.filter(m=>m.dimension==='longitud'&&
  (m.unidad==='mm'||m.unidad==='cm'));
 if(thickness.length!==1)return null;
 return thickness[0].valorBase.toString();
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
 pedido:PropuestaArticulo,catalogo:string,tipo:'producto_declarado'|'alternativa_razonable',
 /** Solo autorización interna tras segunda verificación IA independiente. */
 identidadCorroborada=false
):PruebaTecnicaD013{
 if(!pedido||typeof pedido.descripcion!=='string'||
  typeof pedido.evidencia!=='string'||typeof catalogo!=='string'||
  !catalogo.trim()||catalogo.length>250)return refuse('fuentes_invalidas');
 // Una categoría administrativa sirve para clasificar o pedir precios,
 // pero NO demuestra que exista un producto concreto en el catálogo.
 // Caso real del piloto: «Arena/Piedra sin subtipo (categoría de cotización)».
 // Eliminar esta falso positivo evita invitar por categoría en vez de SKU.
 if(/\bcategoria de cotizacion\b/u.test(fold(catalogo)))
  return refuse('entrada_de_catalogo_no_es_producto');
 const demand=[pedido.descripcion,pedido.evidencia,pedido.presentacion??'',
  pedido.aclaracion??''].join(' ');
 const supplied=fold(catalogo);
 const must=mandatoryPhrase(demand);
 if(must&&(!supplied.includes(must)||must.length<3))
  return refuse('marca_excluyente_no_acreditada');

 const wantedGroup=materialGroup(demand),offeredGroup=materialGroup(catalogo);
 const categoriaGenerica=(g:string|null)=>g===null||
  /_(?:tipo|uso)_desconocido$/u.test(g);
 // Sólo una CONTRADICCIÓN técnica explícita es negativa definitiva.
 // "cemento" frente a "cemento Portland" NO es una contradicción:
 // una segunda IA debe decidir si hay respaldo suficiente.
 if(wantedGroup&&offeredGroup&&wantedGroup!==offeredGroup&&
    !categoriaGenerica(wantedGroup)&&!categoriaGenerica(offeredGroup))
  return refuse('tipo_o_aplicacion_tecnica_diferente');
 const grupoIncompleto=wantedGroup!==offeredGroup;

 const wantedCable=cableSize(pedido.descripcion)||cableSize(pedido.evidencia),
  offeredCable=cableSize(catalogo);
 if((wantedCable||offeredCable)&&wantedCable!==offeredCable)
  return refuse('seccion_cable_no_equivalente');
 const wantThickness=thicknessMillimeters(pedido.descripcion)||
  thicknessMillimeters(pedido.evidencia);
 const haveThickness=thicknessMillimeters(catalogo);
 if(wantThickness&&wantThickness!==haveThickness)
  return refuse('dimension_tecnica_no_equivalente');

 // La coincidencia literal es un atajo seguro, NO una obligación de
 // vocabulario. Si faltan palabras comunes, una segunda lectura IA
 // contrastará DOS descripciones originales, con decisión fail-closed.
 const buyerWords=normalizedWords(pedido.descripcion+' '+pedido.evidencia);
 const sellerWords=normalizedWords(catalogo);
 const palabrasCoincidentes=[...buyerWords].some(x=>sellerWords.has(x));

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
 if(grupoIncompleto&&!identidadCorroborada)
  return refuse('prestacion_tecnica_sin_acreditar');
 if(!palabrasCoincidentes&&!identidadCorroborada)
  return refuse('sin_identidad_material_comprobable');
 return pass(identidadCorroborada?
  'identidad_conciliada_por_lecturas_independientes':
  'identidad_material_y_restricciones_comprobadas',conversion);
}
