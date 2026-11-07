/** Cotironda IA Central v1: el modelo COMPRENDE; el broker autoriza.
 * No diccionario de productos; la evidencia consiste en tramos literales
 * del mensaje original y un SEGUNDO lector semántico independiente.
 * Este módulo es puro: no envía WhatsApp, no accede a secretos ni suma dinero.
 */
import {RUBROS_MVP216,type RubroMvp216} from '../rubros-comprador-mvp216.ts';

export type PropuestaArticulo=Readonly<{
 evidencia:string;inicio:number;fin:number;
 descripcion:string;cantidad:string;unidad:string;
 rubro:RubroMvp216;presentacion:string|null;
 aclaracion:string|null;
}>;
export type PropuestaPedido=Readonly<{
 intencion:'cotizar'|'consulta'|'saludo'|'otro';
 zona_entrega:string|null;
 articulos:readonly PropuestaArticulo[];
 dudas:readonly string[];
}>;
export type ResultadoLectura=Readonly<{
 estado:'listo_para_preparar'|'requiere_aclaracion'|'no_es_pedido'|'rechazado';
 motivo:string;
 pedido:PropuestaPedido|null;
}>;
type SegundaLectura=Readonly<{
 integridad:'completa'|'faltan_articulos'|'dudosa';
 zona_entrega:string|null;
 articulos:readonly Readonly<{
  evidencia:string;cantidad:string;unidad:string;rubro:RubroMvp216
 }>[];
}>;

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
/** Verifica cifras evidentes sin conocer una sola palabra del producto.
 * «tres» (cantidad escrita con palabras) requiere doble lector semántico. */
function cantidadRespaldada(evidencia:string,cant:string):boolean{
 const numbers=evidencia.match(/\d+(?:[.,]\d{1,3})*/gu)??[];
 if(numbers.length===0)return true;
 const requested=Number(cant);
 return numbers.some(raw=>{
  const variants=new Set<number>();
  variants.add(Number(raw.replace(',','.')));
  if(/^\d{1,3}(?:\.\d{3})+$/u.test(raw))
   variants.add(Number(raw.replace(/\./gu,'')));
  return variants.has(requested);
 });
}
/** MVP287: dos modelos pueden citar subtramos distintos del MISMO ítem.
 * La cita secundaria se busca en el ORIGINAL y debe solaparse con la
 * primaria, demostrar la MISMA cantidad y no tomarla de otro artículo.
 * No igualar unidades de volumen con bultos: eso cambia el presupuesto.
 */
function unidadCanonica(v:string):string{
 const t=v.trim().normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .toLocaleLowerCase('es-AR');
 if(['bag','bolsa','bolsas','bolson','bolsones','bigbag','big bag'].includes(t))
  return 'bag';
 if(['unit','unidad','unidades','unid','u','un'].includes(t))
  return 'unit';
 if(['m3','m³','metro cubico','metros cubicos'].includes(t))return 'm3';
 if(['kg','kilo','kilos','kilogramo','kilogramos'].includes(t))return 'kg';
 if(['l','lt','lts','litro','litros'].includes(t))return 'l';
 if(['m','metro','metros'].includes(t))return 'm';
 if(['m2','m²','metro cuadrado','metros cuadrados'].includes(t))return 'm2';
 return t;
}
function unidadEquivalente(a:string,b:string,evidencia:string):boolean{
 const x=unidadCanonica(a),y=unidadCanonica(b);
 if(x===y)return true;
 // Una bolsa/bolsón identificada expresamente se cuenta por piezas.
 // Nunca convertir ese conteo en m³/kg ni asumir su capacidad.
 const paquete=/\b(?:bolsas?|bolson(?:es)?|big\s?bags?)\b/iu.test(
  evidencia.normalize('NFD').replace(/[\u0300-\u036f]/gu,''));
 return paquete&&
  ((x==='bag'&&y==='unit')||(x==='unit'&&y==='bag'));
}
function citaVerificadaDelMismoItem(origen:string,
 primera:PropuestaArticulo,segunda:unknown):boolean{
 if(!texto(segunda,1500))return false;
 // El segundo lector también debe mostrar la cantidad numérica presente
 // en la cita original; no basta con citar genéricamente el nombre.
 if(/\d/u.test(primera.evidencia)&&!/\d/u.test(segunda))return false;
 if(!cantidadRespaldada(segunda,primera.cantidad))return false;
 let pos=origen.indexOf(segunda);
 while(pos>=0){
  const end=pos+segunda.length;
  if(pos<primera.fin&&end>primera.inicio)return true;
  pos=origen.indexOf(segunda,pos+1);
 }
 return false;
}
const rejection=(motivo:string):ResultadoLectura=>
 Object.freeze({estado:'rechazado',motivo,pedido:null});

/** El modelo devuelve citas textuales exactas, NO posiciones numéricas.
 * Resolver offsets en el servidor para no hacerle contar UTF-16 ni exigir
 * un vocabulario predefinido. Permitir repeticiones de un mismo producto
 * cuando la fuente contiene realmente dos menciones separadas.
 */
export function localizarEvidenciasV1(
 origen:string,propuesta:Record<string,unknown>
):Record<string,unknown>|null{
 if(!texto(origen,12000)||!obj(propuesta)||
    !Array.isArray(propuesta.articulos)||propuesta.articulos.length>200)
  return null;
 const intervals:{inicio:number;fin:number}[]=[];
 const complete:Record<string,unknown>[]=[];
 for(const raw of propuesta.articulos){
  if(!obj(raw))return null;
  const evidence=raw.evidencia;
  if(!texto(evidence,1500))return null;
  let pos=origen.indexOf(evidence);
  while(pos>=0&&intervals.some(x=>
   pos<x.fin&&pos+evidence.length>x.inicio))
   pos=origen.indexOf(evidence,pos+1);
  if(pos<0)return null;
  const end=pos+evidence.length;
  intervals.push({inicio:pos,fin:end});
  complete.push({...raw,inicio:pos,fin:end});
 }
 return {...propuesta,articulos:complete};
}


/** Dos lecturas sobre la MISMA evidencia, no sobre texto reescrito por IA.
 * Se acepta cualquier jerga, typo o sinónimo: no se compara vocabulario
 * de materiales. Si ambos lectores no coinciden, se requiere aclaración.
 */
export function evaluarLecturasSemanticasV1(
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
     !cantidadRespaldada(ev,entry.cantidad)||
     !texto(entry.unidad,80)||!rubro(entry.rubro)||
     !(entry.presentacion===null||texto(entry.presentacion,200))||
     !(entry.aclaracion===null||texto(entry.aclaracion,250)))
   return rejection('articulo_sin_evidencia_verificable');
  if(intervals.some(x=>start<x.fin&&end>x.inicio))
   return rejection('evidencias_superpuestas');
  intervals.push({inicio:start,fin:end});
  accepted.push(entry as unknown as PropuestaArticulo);
 }
 if(segunda.integridad!=='completa'||
    segunda.zona_entrega!==primera.zona_entrega||
    segunda.articulos.length!==accepted.length||primera.dudas.length>0)
  return Object.freeze({
   estado:'requiere_aclaracion',motivo:'lecturas_incompletas_o_divergentes',
   pedido:null
  });
 for(let i=0;i<accepted.length;i++){
  const a=accepted[i],b=segunda.articulos[i];
  if(!obj(b)||
     !citaVerificadaDelMismoItem(origen,a,b.evidencia)||
     !cantidad(b.cantidad)||Number(b.cantidad)!==Number(a.cantidad)||
     !texto(b.unidad,80)||!unidadEquivalente(a.unidad,b.unidad,a.evidencia)||
     b.rubro!==a.rubro)
   return Object.freeze({
    estado:'requiere_aclaracion',motivo:'lecturas_discrepan_en_articulo',
    pedido:null
   });
 }
 if(primera.zona_entrega===null)
  return Object.freeze({
   estado:'requiere_aclaracion',motivo:'zona_de_entrega_faltante',
   pedido:null
  });
 return Object.freeze({
  estado:'listo_para_preparar',motivo:'doble_lectura_con_fuente',
  pedido:Object.freeze({
   intencion:'cotizar' as const,zona_entrega:primera.zona_entrega as string,
   articulos:Object.freeze(accepted),
   dudas:Object.freeze([] as string[])
  })
 });
}

export type ProveedorAutorizado=Readonly<{
 key:string;consentido:boolean;activo:boolean;
 zona:string;rubros:readonly RubroMvp216[];
}>;
export type AsignacionPropuesta=Readonly<{
 proveedor:string;articulos:readonly number[];
}>;
export type ResultadoRuta=Readonly<{
 estado:'ruteo_verificado'|'requiere_revision';
 motivo:string;destinos:readonly AsignacionPropuesta[];
}>;
const safeKey=/^[a-z][a-z0-9_]{2,63}$/u;
/** La IA propone destinatarios tras leer catálogos, pero no puede inventar
 * comercios, salir de la zona ni incluir rubros no declarados.
 * La coincidencia de producto ES semántica; estos controles NO comparan nombres.
 */
export function validarRuteoSemanticoV1(
 pedido:PropuestaPedido,proveedores:readonly ProveedorAutorizado[],
 propuesta:readonly AsignacionPropuesta[]
):ResultadoRuta{
 const review=(motivo:string):ResultadoRuta=>({
  estado:'requiere_revision',motivo,destinos:[]
 });
 if(!pedido||!Array.isArray(pedido.articulos)||pedido.articulos.length<1||
    !texto(pedido.zona_entrega,120)||
    !Array.isArray(proveedores)||proveedores.length>200||
    !Array.isArray(propuesta)||propuesta.length>200)
  return review('entrada_invalida');
 const available=new Map<string,ProveedorAutorizado>();
 for(const p of proveedores){
  if(!p||!safeKey.test(p.key)||available.has(p.key)||!Array.isArray(p.rubros))
   return review('catalogo_invalido');
  available.set(p.key,p);
 }
 const seen=new Set<string>();
 const permitted:AsignacionPropuesta[]=[];
 for(const candidate of propuesta){
  if(!candidate||!safeKey.test(candidate.proveedor)||
     seen.has(candidate.proveedor)||!Array.isArray(candidate.articulos)||
     candidate.articulos.length<1||candidate.articulos.length>pedido.articulos.length)
   return review('destino_invalido');
  const supplier=available.get(candidate.proveedor);
  if(!supplier||!supplier.consentido||!supplier.activo||
     supplier.zona.trim().toLocaleLowerCase('es-AR')!==
       pedido.zona_entrega.trim().toLocaleLowerCase('es-AR'))
   return review('destino_no_autorizado');
  const positions=new Set<number>();
  for(const idx of candidate.articulos){
   if(!Number.isSafeInteger(idx)||idx<0||idx>=pedido.articulos.length||
      positions.has(idx)||!supplier.rubros.includes(pedido.articulos[idx].rubro))
    return review('articulo_no_cubierto_por_rubro');
   positions.add(idx);
  }
  seen.add(candidate.proveedor);
  permitted.push(Object.freeze({proveedor:candidate.proveedor,
   articulos:Object.freeze([...positions].sort((a,b)=>a-b))}));
 }
 return {estado:'ruteo_verificado',motivo:'destinos_restringidos_a_catalogo',
  destinos:Object.freeze(permitted)};
}

/** Asociación ANTES del análisis de precios: jamás resolver por similitud
 * lingüística si existen dos rondas plausibles de un mismo proveedor. */
export function asociarCotizacionV1(args:{
 proveedor:string;respuestaAWhapiId:string|null;
 codigoRonda:string|null;
 invitaciones:readonly Readonly<{
  idRonda:string;proveedor:string;whapiId:string|null;codigo:string;
  vigente:boolean
 }>[];
}):Readonly<{estado:'asociada'|'ambigua'|'sin_ronda';idRonda:string|null}>{
 const no=(estado:'ambigua'|'sin_ronda')=>({estado,idRonda:null});
 if(!args||!safeKey.test(args.proveedor)||!Array.isArray(args.invitaciones))
  return no('sin_ronda');
 const own=args.invitaciones.filter(x=>x&&x.proveedor===args.proveedor&&
  x.vigente&&typeof x.idRonda==='string');
 if(args.respuestaAWhapiId){
  const exact=own.filter(x=>x.whapiId===args.respuestaAWhapiId);
  return exact.length===1?{estado:'asociada',idRonda:exact[0].idRonda}:
   no(exact.length>1?'ambigua':'sin_ronda');
 }
 if(args.codigoRonda){
  const exact=own.filter(x=>x.codigo===args.codigoRonda);
  return exact.length===1?{estado:'asociada',idRonda:exact[0].idRonda}:
   no(exact.length>1?'ambigua':'sin_ronda');
 }
 // Una única invitación vigente del mismo proveedor basta como contexto.
 return own.length===1?{estado:'asociada',idRonda:own[0].idRonda}:
  no(own.length>1?'ambigua':'sin_ronda');
}
