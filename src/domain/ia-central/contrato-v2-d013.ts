import {unidadCompradaCanonicaV2D013,unidadDimensionadaV2D013,
 leerMagnitudesV2D013,mismaPresentacionFisicaV2D013} from './magnitudes-universales-v2-d013.ts';
/** D013: conciliador semántico V2 sin alterar el contrato histórico pinneado.
 * El rubro es una etiqueta; cantidad, unidad y origen literal son prueba.
 */
import {RUBROS_MVP216,type RubroMvp216} from '../rubros-comprador-mvp216.ts';
import type {PropuestaArticulo,PropuestaPedido,ResultadoLectura as ResultadoLecturaBase} from './contrato-v1.ts';
export type {PropuestaArticulo,PropuestaPedido} from './contrato-v1.ts';
/** Todos los materiales interpretados quedan en el pedido, incluso los que
 * no se deben distribuir por falta de corroboración de la segunda lectura.
 * Índices siempre relativos al pedido ORIGINAL: nunca renumerar en SQL.
 */
export type PedidoConRevisionV2D013=PropuestaPedido&Readonly<{
 articulosEnRevision?:readonly number[];
}>;
export type ResultadoLectura=Omit<ResultadoLecturaBase,'pedido'>&Readonly<{
 pedido:PedidoConRevisionV2D013|null;
}>;
export {localizarEvidenciasV1} from './contrato-v1.ts';
import {probarAtributosV2D013,numeroNaturalV2D013} from './evidencia-atributos-v2-d013.ts';
const decimal=/^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/u;
const texto=(v:unknown,max:number):v is string=>typeof v==='string'&&
 v.trim().length>0&&v.length<=max&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const rubro=(v:unknown):v is RubroMvp216=>
 typeof v==='string'&&Object.hasOwn(RUBROS_MVP216,v);
function cantidad(v:unknown):v is string{
 return typeof v==='string'&&decimal.test(v)&&
 Number.isFinite(Number(v))&&Number(v)>0&&Number(v)<=1000000;
}
/** MVP287: dos modelos pueden citar subtramos distintos del MISMO ítem.
 * La cita secundaria se busca en el ORIGINAL y debe solaparse con la
 * primaria, demostrar la MISMA cantidad y no tomarla de otro artículo.
 * No igualar unidades de volumen con bultos: eso cambia el presupuesto.
 */
function unidadCanonica(v:string):string{return unidadCompradaCanonicaV2D013(v)}
function unidadEquivalente(a:string,b:string,evidencia:string):boolean{
 const x=unidadCanonica(a),y=unidadCanonica(b);
 if(x===y)return true;
 // Contar envases no equivale a convertir su peso/volumen. Aceptar
 // "2 rollos" == "2 unidades" SOLO si la fuente menciona ese envase.
 const e=evidencia.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .toLocaleLowerCase('es-AR');
 const envases=[
  {unidad:'bag',patron:/\bbolsas?\b/u},
  {unidad:'bigbag',patron:/\b(?:bolson(?:es)?|big\s?bags?)\b/u},
  {unidad:'roll',patron:/\brollos?\b/u},
  {unidad:'bucket',patron:/\bbaldes?\b/u},
  {unidad:'box',patron:/\bcajas?\b/u},
  {unidad:'pack',patron:/\b(?:packs?|paquetes?)\b/u}
 ];
 if(x==='bag'&&y==='bigbag'||x==='bigbag'&&y==='bag')
  return /\b(?:bolson(?:es)?|big\s?bags?)\b/u.test(e);
 return envases.some(p=>p.patron.test(e)&&
  ((x===p.unidad&&y==='unit')||(x==='unit'&&y===p.unidad)));
}
/** El modelo aporta la semántica; la fuente original acredita el dato.
 * Una segunda cita puede ser un subtramo de producto y usar "3" por "tres":
 * eso NO modifica el cuantificador del primer lector, ya validado contra
 * el original. La cita secundaria debe anclarse a UN SOLO artículo real,
 * solapando su producto, y nunca tocar otro renglón del pedido.
 */
function citaVerificadaDelMismoItem(origen:string,
 primera:PropuestaArticulo,segunda:unknown,
 articulos:readonly PropuestaArticulo[]):boolean{
 if(!texto(segunda,1500))return false;
 const producto=(primera as PropuestaArticulo & {citaProducto?:unknown}).citaProducto;
 if(!texto(producto,250))return false;
 const starts:number[]=[];
 let at=primera.evidencia.indexOf(producto);
 while(at>=0){
  starts.push(primera.inicio+at);
  at=primera.evidencia.indexOf(producto,at+1);
 }
 if(starts.length===0)return false;
 let pos=origen.indexOf(segunda);
 let anclada=false;
 while(pos>=0){
  const fin=pos+segunda.length;
  const tocados=articulos.filter(x=>pos<x.fin&&fin>x.inicio);
  // Rechazar citas genéricas repetidas en otro artículo o citas
  // que cruzan dos artículos; no adjudicar un "cemento" arbitrario.
  if(tocados.some(x=>x!==primera)||tocados.length>1)return false;
  if(tocados.length===1&&starts.some(inicio=>{
   const solapado=origen.slice(Math.max(pos,inicio),
    Math.min(fin,inicio+producto.length));
   return [...solapado.matchAll(/[\p{L}\p{N}]/gu)].length>=3;
  }))anclada=true;
  pos=origen.indexOf(segunda,pos+1);
 }
 return anclada;
}
/** La cantidad de cada lector tiene que coincidir con su PROPIA cita.
 * Se comparan valores y dimensiones, no la misma grafía de la cita.
 * Nunca equiparar bolsas con kilos, metros con unidades ni kg con L.
 * Conservar siempre cantidad+unidad del primer lector (origen).
 */
function cantidadYUnidadCorroboradas(
 a:PropuestaArticulo,b:Record<string,unknown>
):boolean{
 if(!cantidad(b.cantidad)||!texto(b.citaCantidad,120)||
    !texto(b.unidad,80)||numeroNaturalV2D013(b.citaCantidad)!==Number(b.cantidad))
  return false;
 if(unidadEquivalente(a.unidad,b.unidad,a.evidencia))
  return Number(a.cantidad)===Number(b.cantidad);
 const x=unidadDimensionadaV2D013(a.unidad);
 const y=unidadDimensionadaV2D013(b.unidad);
 if(!x||!y||x.dimension!==y.dimension)return false;
 const milli=(v:string):bigint|null=>{
  if(!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/u.test(v))return null;
  const [entero,fraccion='']=v.split('.');
  return BigInt(entero)*1000n+BigInt(fraccion.padEnd(3,'0'));
 };
 const qa=milli(a.cantidad),qb=milli(b.cantidad);
 return qa!==null&&qb!==null&&qa*x.factor===qb*y.factor;
}
function mismaLocalidadLeida(a:string|null,b:string|null):boolean{
 if(a===null||b===null)return a===b;
 const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .trim().toLocaleLowerCase('es-AR').replace(/[.,]+/gu,' ')
  .replace(/\s+/gu,' ');
 return fold(a)===fold(b);
}
const rejection=(motivo:string):ResultadoLectura=>
 Object.freeze({estado:'rechazado',motivo,pedido:null});
export function evaluarLecturasSemanticasV2D013(
 origen:unknown,primera:unknown,segunda:unknown
):ResultadoLectura{
 if(!texto(origen,12000)||!obj(primera)||!obj(segunda))
  return rejection('entrada_invalida');
 if(!['cotizar','consulta','saludo','otro'].includes(String(primera.intencion))||
    !Array.isArray(primera.articulos)||!Array.isArray(primera.dudas)||
    primera.articulos.length>200||primera.dudas.length>20)
  return rejection('esquema_invalido');
 if(primera.intencion!=='cotizar')
  return Object.freeze({estado:'no_es_pedido',motivo:'intencion_no_comercial',pedido:null});
 if(primera.articulos.length<1)return rejection('sin_articulos');
 if(!(primera.zona_entrega===null||texto(primera.zona_entrega,120))||
    primera.dudas.some((x:unknown)=>!texto(x,250)))
  return rejection('campos_inseguros');
 if(!['completa','faltan_articulos','dudosa'].includes(String(segunda.integridad))||
    !Array.isArray(segunda.articulos)||
    !(segunda.zona_entrega===null||texto(segunda.zona_entrega,120)))
  return rejection('segunda_lectura_invalida');
 const accepted:PropuestaArticulo[]=[];
 const intervals:{inicio:number;fin:number}[]=[];
 for(const entry of primera.articulos){
  if(!obj(entry))return rejection('articulo_sin_evidencia_verificable');
  const start=entry.inicio,end=entry.fin,ev=entry.evidencia;
  if(!texto(ev,1500)||typeof start!=='number'||typeof end!=='number'||
     !Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
     start<0||end<=start||end>origen.length||
     origen.slice(start,end)!==ev||
     !texto(entry.descripcion,500)||!cantidad(entry.cantidad)||
     !texto(entry.unidad,80)||!rubro(entry.rubro)||
     !(entry.presentacion===null||texto(entry.presentacion,200))||
     !(entry.aclaracion===null||texto(entry.aclaracion,250))||
     !probarAtributosV2D013({
      evidencia:ev,cantidad:entry.cantidad,unidad:entry.unidad as string,
      presentacion:entry.presentacion as string|null,citaCantidad:entry.citaCantidad,
      citaProducto:entry.citaProducto,
      citaPresentacion:entry.citaPresentacion
     }))
   return rejection('articulo_sin_evidencia_verificable');
  if(intervals.some(x=>start<x.fin&&end>x.inicio))
   return rejection('evidencias_superpuestas');
  intervals.push({inicio:start,fin:end});
  accepted.push(entry as unknown as PropuestaArticulo);
 }
 // La zona no es un atributo de producto: una divergencia real de localidad
 // sigue frenando el envío comercial de TODA la ronda.
 if(!mismaLocalidadLeida(primera.zona_entrega,segunda.zona_entrega))
  return Object.freeze({
   estado:'requiere_aclaracion',motivo:'lecturas_incompletas_o_divergentes',
   pedido:null
  });
 // Si el segundo lector afirma que faltan artículos AUN habiendo listado
 // tantos como el primero, hay indicio de ítem nunca registrado en el
 // pedido. No autorizar un pedido que podría ocultar ese producto.
 if(segunda.integridad==='faltan_articulos'&&
    segunda.articulos.length>=accepted.length)
  return Object.freeze({
   estado:'requiere_aclaracion',motivo:'posibles_articulos_no_representados',
   pedido:null
  });
 // No perder un artículo original porque el verificador lo omita, altere
 // cantidad, mezcle un renglón o lo considere ambiguo.
 // Lo dejamos en el pedido, pero SIN enviarlo hasta corroborarlo.
 const itemsSegunda=segunda.articulos as unknown[];
 const sinUsar=new Set(itemsSegunda.map((_:unknown,i:number)=>i));
 const enRevision=new Set<number>();
 for(let indice=0;indice<accepted.length;indice++){
  const articulo=accepted[indice];
  const posibles=[...sinUsar].filter(i=>{
   const b=itemsSegunda[i];
   return obj(b)&&rubro(b.rubro)&&
    citaVerificadaDelMismoItem(origen,articulo,b.evidencia,accepted)&&
    cantidadYUnidadCorroboradas(articulo,b);
  });
  if(posibles.length!==1){
   enRevision.add(indice);
   continue;
  }
  sinUsar.delete(posibles[0]);
 }
 // Una segunda lectura con artículo EXTRA no anclable a ningún renglón
 // primario indica que el primer lector pudo omitir un material: nunca
 // cerrar ese pedido como si estuviera completo.
 for(const idx of sinUsar){
  const b=itemsSegunda[idx];
  if(!obj(b)||!texto(b.evidencia,1500))
   return rejection('segunda_lectura_invalida');
  const dueños=accepted.map((a,i)=>
   citaVerificadaDelMismoItem(origen,a,b.evidencia,accepted)?i:-1)
   .filter(i=>i>=0);
  if(dueños.length!==1)
   return Object.freeze({
    estado:'requiere_aclaracion',
    motivo:'segundo_lector_identifica_articulo_sin_fuente',
    pedido:null
   });
  enRevision.add(dueños[0]);
 }
 // 'faltan_articulos' / 'dudosa' en una segunda lectura no son errores
 // globales si una parte sí fue corroborada, pero ninguna línea se borra.
 // Primer lector no aporta evidencia verificable => sigue fallando cerrado.
 if(enRevision.size===accepted.length)
  return Object.freeze({
   estado:'requiere_aclaracion',motivo:'ningun_articulo_conciliado',
   pedido:null
  });
 if(primera.zona_entrega===null)
  return Object.freeze({
   estado:'requiere_aclaracion',motivo:'zona_de_entrega_faltante',
   pedido:null
  });
 return Object.freeze({
  estado:'listo_para_preparar',
  motivo:enRevision.size>0?'articulos_en_revision_sin_bloquear_ronda':
   'doble_lectura_con_fuente',
  pedido:Object.freeze({
   intencion:'cotizar' as const,zona_entrega:primera.zona_entrega as string,
   articulos:Object.freeze(accepted),
   articulosEnRevision:Object.freeze([...enRevision].sort((a,b)=>a-b)),
   dudas:Object.freeze([] as string[])
  })
 });
}



/** D013 V2 — contrato ACTIVO para el comprador: una sola IA Central.
 * La fuente real (cita literal) decide los valores económicos y las unidades.
 * No requiere corroboración por un segundo modelo ni citas redundantes
 * de producto/presentación: la descripción utilizada en ruteo se deriva
 * del tramo ORIGINAL, no de una marca inventada por la respuesta de IA.
 * El conciliador doble de este archivo queda solo como compatibilidad
 * para sus pruebas históricas y NO se invoca en el webhook V2.
 */
/** Localiza citas sin depender de mayúsculas ni tildes, preservando offsets
 * UTF-16 exactos del ORIGINAL (la IA no puede alterar el documento).
 * Las coincidencias siguen exigiendo límites de palabra.
 */
const citacionesCantidadD013=(fuente:string,cita:string):number[]=>{
 if(!cita||cita.length>120||!fuente)return [];
 const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .toLocaleLowerCase('es-AR');
 const chars:string[]=[],offsets:number[]=[];
 for(let i=0;i<fuente.length;){
  const ch=String.fromCodePoint(fuente.codePointAt(i)!);
  const out=fold(ch);
  for(let j=0;j<out.length;j++)offsets.push(i);
  chars.push(out);i+=ch.length;
 }
 offsets.push(fuente.length);
 const textoNormal=chars.join(''),citaNormal=fold(cita);
 if(!citaNormal)return [];
 const found:number[]=[];
 const alfanum=/[\p{L}\p{N}]/u;
 let pos=textoNormal.indexOf(citaNormal);
 while(pos>=0){
  const inicio=offsets[pos],fin=offsets[pos+citaNormal.length];
  const pre=inicio===0?'':fuente.slice(0,inicio).slice(-1);
  const post=fin===fuente.length?'':fuente.slice(fin,fin+1);
  if(!alfanum.test(pre)&&!alfanum.test(post))found.push(inicio);
  pos=textoNormal.indexOf(citaNormal,pos+1);
 }
 return found;
};
/** Prueba SOLO una magnitud explícita de compra a continuación del numeral.
 * Acepta «10bolsas», «diez bolsas», «2 m³», «3 mts. lineales»,
 * pero NO toma los 25 kg de una bolsa como 25 bolsas.
 */
function unidadAdyacenteACompraD013(
 evidencia:string,fin:number,unidad:string
):boolean{
 const comprada=unidadCompradaCanonicaV2D013(unidad);
 const resto=evidencia.slice(fin).replace(/^[\s:.,-]+/u,'')
  .replace(/^de\s+/iu,'');
 const palabras=resto.split(/\s+/u);
 for(const n of [3,2,1]){
  const candidata=palabras.slice(0,n).join(' ').replace(/[.,;:]+$/u,'');
  const fisica=unidadDimensionadaV2D013(candidata);
  if(fisica?.canonica===comprada)return true;
  // Nunca validar «ml» minúscula: puede ser metro lineal o mililitro.
  if(candidata.toLowerCase()==='ml')continue;
  const envase=unidadCompradaCanonicaV2D013(candidata);
  if(envase===comprada&&
     ['bag','bigbag','bucket','roll','box','pack','unit'].includes(envase))
   return true;
  if(comprada==='unit'&&
     ['bag','bigbag','bucket','roll','box','pack'].includes(envase))
   return true;
 }
 return false;
}
/** La cantidad literal puede estar al lado de un envase técnico concreto.
 * No permitir «1 bolsón» como «1 bolsa», ni «2 cajas» como «2 baldes».
 */
function envaseExplicitoD013(evidencia:string,fin:number):string|null{
 const despues=evidencia.slice(fin).replace(/^\s+/u,'')
  .replace(/^de\s+/iu,'');
 const m=/^([\p{L}]+)(?![\p{L}\p{N}])/u.exec(despues);
 if(!m)return null;
 const unidad=unidadCompradaCanonicaV2D013(m[1]);
 return ['bag','bigbag','bucket','roll','box','pack','unit'].includes(unidad)
  ?unidad:null;
}
/** Una magnitud que especifica el tamaño/peso de un envase solicitado
 * no pasa a ser cantidad comprada por la IA (10 bolsas de 25 kg != 25 kg).
 * La evidencia del artículo es una única cita, nunca otro renglón.
 */
function esPresentacionDeEnvaseD013(evidencia:string,pos:number):boolean{
 // También reconocer cuantificadores compuestos («media docena de bolsas»)
 // sin limitar el idioma a unos pocos números de una palabra.
 if(envaseUnicoAcreditadoD013(evidencia.slice(0,pos))!==null)return true;
 const antes=evidencia.slice(0,pos).normalize('NFD')
  .replace(/[\u0300-\u036f]/gu,'').toLocaleLowerCase('es-AR');
 return /(?<![\p{L}\p{N}])(?:\d{1,6}(?:[.,]\d{1,3})?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(?:bolsas?|bolson(?:es)?|rollos?|baldes?|cajas?|paquetes?|packs?|unidades?)\b/u.test(antes);
}
/** Recuperación SIN una segunda IA: cuando la cita del modelo se escribió
 * distinto al original, la cantidad sólo se acepta si el propio tramo del
 * original prueba el mismo número pegado a una unidad de COMPRA reconocida.
 * Nunca extrae números de otras líneas ni de una presentación técnica.
 */
function cantidadPorUnidadExplicitaD013(
 evidencia:string,cantidadNormalizada:string,unidad:string
):boolean{
 const cantidadObjetivo=Number(cantidadNormalizada);
 const numeros=/(?<![\p{L}\p{N}.,])(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|\d{1,6}(?:[.,]\d{1,3})?)(?![\d.,])/gu;
 for(const m of evidencia.matchAll(numeros)){
  if(numeroNaturalV2D013(m[0])===cantidadObjetivo&&
     !(unidadDimensionadaV2D013(unidad)&&
       esPresentacionDeEnvaseD013(evidencia,m.index))&&
     unidadAdyacenteACompraD013(evidencia,m.index+m[0].length,unidad))
   return true;
 }
 const palabras=[...evidencia.matchAll(/[\p{L}]+/gu)];
 for(let i=0;i<palabras.length;i++){
  // La gramática existente es la única fuente de cantidades con palabras.
  for(let n=1;n<=5&&i+n<=palabras.length;n++){
   const trozo=palabras.slice(i,i+n);
   const fragmento=evidencia.slice(trozo[0].index,
    trozo[trozo.length-1].index+trozo[trozo.length-1][0].length);
   if(!/^[\p{L}\s]+$/u.test(fragmento))break;
   const valor=numeroNaturalV2D013(fragmento);
   if(valor!==cantidadObjetivo)continue;
   const fin=trozo[trozo.length-1].index+trozo[trozo.length-1][0].length;
   if(unidadDimensionadaV2D013(unidad)&&
      esPresentacionDeEnvaseD013(evidencia,trozo[0].index))continue;
   if(unidadAdyacenteACompraD013(evidencia,fin,unidad))return true;
  }
 }
 return false;
}
/** Si el lector confundió una PRESENTACIÓN con una cantidad comprada,
 * el original puede corregirlo sin otra IA ni conversiones de envases.
 * Solo se acepta EXACTAMENTE un cuantificador unido a un envase concreto
 * dentro de la evidencia del artículo. No se usa vocabulario de materiales.
 */
export function envaseUnicoAcreditadoD013(evidencia:string):
 {cantidad:string;unidad:string}|null{
 if(!texto(evidencia,1500)||leerMagnitudesV2D013(evidencia)===null)return null;
 const hallados:{cantidad:string;unidad:string}[]=[];
 const registrar=(literal:string,fin:number)=>{
  const valor=numeroNaturalV2D013(literal);
  const unidad=envaseExplicitoD013(evidencia,fin);
  if(valor===null||unidad===null||!cantidad(String(valor)))return;
  hallados.push({cantidad:String(valor),unidad});
 };
 const digitos=/(?<![\p{L}\p{N}.,])(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|\d{1,6}(?:[.,]\d{1,3})?)(?![\d.,])/gu;
 for(const m of evidencia.matchAll(digitos))
  registrar(m[0],m.index+m[0].length);
 const palabras=[...evidencia.matchAll(/[\p{L}]+/gu)];
 for(let i=0;i<palabras.length;i++){
  // Solo expresiones numéricas COMPLETAS, sin contar subfragmentos.
  const candidatos:{literal:string;fin:number}[]=[];
  for(let n=1;n<=5&&i+n<=palabras.length;n++){
   const tramo=palabras.slice(i,i+n);
   const desde=tramo[0].index;
   const hasta=tramo[tramo.length-1].index+tramo[tramo.length-1][0].length;
   const literal=evidencia.slice(desde,hasta);
   if(!/^[\p{L}\s]+$/u.test(literal))break;
   if(numeroNaturalV2D013(literal)!==null)
    candidatos.push({literal,fin:hasta});
  }
  for(const candidato of candidatos){
   if(envaseExplicitoD013(evidencia,candidato.fin)!==null){
    // «media docena» vale 6; «docena» no se procesa otra vez.
    registrar(candidato.literal,candidato.fin);
    i+=candidato.literal.split(/\s+/u).length-1;
    break;
   }
  }
 }
 return hallados.length===1?hallados[0]:null;
}
/** Última recuperación determinista: una única magnitud COMPRADA puede
 * extraerse de la fuente incluso si la IA citó mal el número o la unidad.
 * No se deducen envases, stock ni equivalencias. Por seguridad solo
 * admite magnitudes al COMIENZO del ítem (o tras un verbo de pedido), y
 * descarta tamaños de envases, espesores, dos magnitudes y "ml" ambiguo.
 * Una medida suelta DESPUÉS del producto podría ser presentación/SKU.
 */
export function cantidadFisicaUnicaAcreditadaD013(
 evidencia:string
):{cantidad:string;unidad:string}|null{
 if(!texto(evidencia,1500))return null;
 const original=evidencia.trim().replace(/^[-*•]\s*/u,'');
 const source=original.replace(
  /^(?:necesito|quiero|pido|cotizar|preciso)\s+/iu,'');
 // "2 rollos de 25 m" acredita rollos, NO 25 m comprados.
 if(/(?<![\p{L}\p{N}])(?:bolsas?|bolson(?:es)?|big\s?bags?|baldes?|rollos?|cajas?|paquetes?|packs?|unidades?)\b/iu.test(source))
  return null;
 const medidas=leerMagnitudesV2D013(source);
 if(medidas===null||medidas.length>1)return null;
 const admitir=(literal:string,unidad:string)=>{
  const n=numeroNaturalV2D013(literal);
  const valor=n===null?null:String(n);
  // No transformar una medida de calibre/espesor en una compra.
  if(['mm','cm','mm2','cm2','mm3','cm3'].includes(unidad)||
    valor===null||!cantidad(valor))return null;
  return {cantidad:valor,unidad};
 };
 if(medidas.length===1){
  const m=medidas[0];
  if(source.slice(0,m.inicio).trim()!=='')return null;
  const number=/^(\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?|\d{1,6}(?:[.,]\d{1,3})?)/u
   .exec(m.literal);
  return number?admitir(number[1],m.unidad):null;
 }
 // "tres metros lineales de cable": numeral escrito en palabras.
 // Las palabras se analizan con la gramática existente, jamás con IA 2.
 const palabras=[...source.matchAll(/[\p{L}]+/gu)];
 if(palabras.length<2||palabras[0].index!==0)return null;
 const opciones:{cantidad:string;unidad:string}[]=[];
 for(let n=1;n<=5&&n<palabras.length;n++){
  const fin=palabras[n-1].index+palabras[n-1][0].length;
  const literal=source.slice(0,fin);
  if(!/^[\p{L}\s]+$/u.test(literal))break;
  const resto=source.slice(fin).trimStart();
  const tokens=resto.split(/\s+/u);
  for(let k=1;k<=3&&k<=tokens.length;k++){
   const unidad=unidadDimensionadaV2D013(tokens.slice(0,k).join(' '));
   if(!unidad)continue;
   const valor=admitir(literal,unidad.canonica);
   if(valor)opciones.push(valor);
  }
 }
 const unicas=[...new Map(opciones.map(x=>[x.cantidad+':'+x.unidad,x])).values()];
 return unicas.length===1?unicas[0]:null;
}
/** No incluye cantidades, unidades ni contenido del mensaje en observabilidad. */
export type DiagnosticoCantidadD013=
 'source_quantity_unreadable_magnitude'|
 'source_quantity_ai_citation_unparseable'|
 'source_quantity_ai_citation_missing'|
 'source_quantity_ai_unit_conflict'|
 'source_quantity_purchase_not_explicit';
export function diagnosticarCantidadD013(
 evidencia:string,cantidadNormalizada:string,unidad:string,
 citaCantidad:unknown
):DiagnosticoCantidadD013{
 if(leerMagnitudesV2D013(evidencia)===null)
  return 'source_quantity_unreadable_magnitude';
 if(typeof citaCantidad!=='string'||
    numeroNaturalV2D013(citaCantidad)!==Number(cantidadNormalizada))
  return 'source_quantity_ai_citation_unparseable';
 if(citacionesCantidadD013(evidencia,citaCantidad).length===0)
  return 'source_quantity_ai_citation_missing';
 if(unidadDimensionadaV2D013(unidad)||
    envaseExplicitoD013(evidencia,
     citacionesCantidadD013(evidencia,citaCantidad)[0]+citaCantidad.length))
  return 'source_quantity_ai_unit_conflict';
 return 'source_quantity_purchase_not_explicit';
}
/** Valida una cantidad comercial UNA SOLA VEZ sobre el original.
 * La cita IA ayuda a ubicar el cuantificador; si su grafía es distinta,
 * una cantidad explícita con su unidad puede acreditarse sin una segunda IA.
 * No hay conversión implícita de envases a kg/L ni cantidades inventadas.
 */
export function cantidadAcreditadaLecturaUnicaD013(
 evidencia:string,cantidadNormalizada:string,unidad:string,
 citaCantidad:unknown
):boolean{
 if(!texto(evidencia,1500)||!cantidad(cantidadNormalizada)||
    !texto(unidad,80))return false;
 const magnitudes=leerMagnitudesV2D013(evidencia);
 if(magnitudes===null)return false;
 const unidadComprada=unidadCompradaCanonicaV2D013(unidad);
 const unidadFisica=unidadDimensionadaV2D013(unidad);
 if(typeof citaCantidad==='string'&&
    numeroNaturalV2D013(citaCantidad)===Number(cantidadNormalizada)){
  const ubicaciones=citacionesCantidadD013(evidencia,citaCantidad);
  if(ubicaciones.some(pos=>{
   const medida=magnitudes.find(m=>m.inicio===pos);
   if(!unidadFisica){
    if(unidadComprada==='ml')return medida?.unidad==='ml';
    // Una especificación en kg, litros o m³ nunca cuenta envases.
    if(medida!==undefined)return false;
    const contenedor=envaseExplicitoD013(
     evidencia,pos+citaCantidad.length);
    return contenedor===null||contenedor===unidadComprada||
     (unidadComprada==='unit'&&contenedor!=='unit');
   }
   if(medida){
    if(esPresentacionDeEnvaseD013(evidencia,pos))return false;
    // «15» en «15,5 L» comparte inicio, pero NO es la cantidad 15 L.
    // Igualdad exacta de magnitud (milésimos) y dimensión, sin redondear.
    const [entero,fraccion='']=cantidadNormalizada.split('.');
    const milli=BigInt(entero)*1000n+
     BigInt(fraccion.padEnd(3,'0'));
    const base=milli*unidadFisica.factor;
    return medida.unidad===unidadComprada&&
     base%1000n===0n&&medida.valorBase===base/1000n;
   }
   return unidadAdyacenteACompraD013(
    evidencia,pos+citaCantidad.length,unidad);
  }))return true;
 }
 // Independiente del texto de la cita: sólo cuantificadores con unidad
 // explícita, inequívoca y localizada dentro de ESTE artículo.
 return cantidadPorUnidadExplicitaD013(evidencia,cantidadNormalizada,unidad);
}
const foldZonaUnicaD013=(s:string):string=>s.normalize('NFD')
 .replace(/[\u0300-\u036f]/gu,'').toLowerCase()
 .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/gu,' ').trim();
/** No atribuir una localidad inventada por el modelo al comprador.
 * Una indicación "La Plata, Buenos Aires" es admisible si La Plata
 * aparece literalmente como ciudad; nunca transformar Berisso en La Plata.
 */
function zonaAcreditadaUnicaD013(fuente:string,zona:string):boolean{
 const real=foldZonaUnicaD013(fuente);
 const name=foldZonaUnicaD013(zona.split(',')[0]??'');
 if(name.length<3)return false;
 return (' '+real+' ').includes(' '+name+' ');
}
export function evaluarLecturaCentralUnicaD013(
 original:unknown,primera:unknown,
 onQuantityDiagnostic?:(code:DiagnosticoCantidadD013)=>void
):ResultadoLectura{
 if(!texto(original,12000)||!obj(primera))
  return rejection('entrada_invalida');
 if(!['cotizar','consulta','saludo','otro'].includes(String(primera.intencion))||
    !Array.isArray(primera.articulos)||primera.articulos.length>200||
    !Array.isArray(primera.dudas)||primera.dudas.length>20)
  return rejection('esquema_invalido');
 if(primera.intencion!=='cotizar')
  return Object.freeze({estado:'no_es_pedido',motivo:'intencion_no_comercial',pedido:null});
 if(primera.articulos.length<1)return rejection('sin_articulos');
 if(!(primera.zona_entrega===null||texto(primera.zona_entrega,120)))
  return rejection('campos_inseguros');
 const accepted:PropuestaArticulo[]=[];
 const intervals:{inicio:number;fin:number}[]=[];
 for(const raw of primera.articulos){
  if(!obj(raw))return rejection('articulo_sin_evidencia_verificable');
  const {inicio,fin,evidencia}=raw;
  if(typeof inicio!=='number'||typeof fin!=='number'||
     !Number.isSafeInteger(inicio)||!Number.isSafeInteger(fin)||
     inicio<0||fin<=inicio||fin>original.length||
     !texto(evidencia,1500)||original.slice(inicio,fin)!==evidencia||
     !texto(raw.descripcion,500)||!cantidad(raw.cantidad)||
     !texto(raw.unidad,80)||!rubro(raw.rubro)||
     !(raw.aclaracion===null||texto(raw.aclaracion,250)))
   return rejection('articulo_sin_evidencia_verificable');
  if(intervals.some(x=>inicio<x.fin&&fin>x.inicio))
   return rejection('evidencias_superpuestas');
  // La IA puede confundir «10 bolsas de 50 kg» con 50 kg. Nunca
  // permitir la cantidad inventada: usar la compra escrita en el original
  // si —y solo si— existe exactamente UN envase cuantificado.
  let cantidadFinal=raw.cantidad as string;
  let unidadFinal=raw.unidad as string;
  if(!cantidadAcreditadaLecturaUnicaD013(evidencia,
      cantidadFinal,unidadFinal,raw.citaCantidad)){
   const fuente=envaseUnicoAcreditadoD013(evidencia)??
    cantidadFisicaUnicaAcreditadaD013(evidencia);
   if(!fuente){
    try{onQuantityDiagnostic?.(diagnosticarCantidadD013(
     evidencia,cantidadFinal,unidadFinal,raw.citaCantidad))}
    catch{/* Observabilidad opcional, nunca modifica la aprobación */}
    return rejection('cantidad_sin_respaldo_en_fuente');
   }
   cantidadFinal=fuente.cantidad;
   unidadFinal=fuente.unidad;
  }
  // La presentación libre de IA es opcional; sólo conservar si su
  // cita existe y demuestra la MISMA magnitud en el texto original.
  const cita=raw.citaPresentacion;
  const presentacion=typeof raw.presentacion==='string'&&
   typeof cita==='string'&&
   citacionesCantidadD013(evidencia,cita).length>0&&
   mismaPresentacionFisicaV2D013(raw.presentacion,cita)
    ?raw.presentacion:null;
  intervals.push({inicio,fin});
  accepted.push(Object.freeze({
   evidencia,inicio,fin,
   // Ruteo/SQL trabajan con el tramo original, nunca una marca inventada.
   descripcion:evidencia.trim(),
   cantidad:cantidadFinal,unidad:unidadFinal,
   rubro:raw.rubro as RubroMvp216,presentacion,
   aclaracion:raw.aclaracion as string|null
  }));
 }
 if(primera.zona_entrega===null||
    !zonaAcreditadaUnicaD013(original,primera.zona_entrega as string))
  return Object.freeze({estado:'requiere_aclaracion',
   motivo:'zona_de_entrega_faltante',pedido:null});
 return Object.freeze({
  estado:'listo_para_preparar',motivo:'ia_central_unica_con_fuente',
  pedido:Object.freeze({intencion:'cotizar',zona_entrega:primera.zona_entrega as string,
   articulos:Object.freeze(accepted),
   articulosEnRevision:Object.freeze([] as number[]),
   dudas:Object.freeze([] as string[])})
 });
}
