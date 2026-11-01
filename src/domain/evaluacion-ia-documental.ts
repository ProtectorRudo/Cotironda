/**
 * Auditoría DETERMINISTA de calidad documental y distribución.
 * No llama IA ni servicios externos. NO aprueba compras ni autoriza mensajes.
 *
 * Un modelo puede retener artículos; eso baja cobertura, pero NUNCA se cuenta
 * como envío correcto. Proveedores falsos y cantidades cambiadas son FAIL.
 */
import type {BorradorDocumental} from './extraccion-documental.ts';
import type {PlanDespachoAutomatico} from './despacho-automatico.ts';
import type {Rubro, Unidad} from './catalogo.ts';

export type ArticuloEsperado = Readonly<{
  ubicacion:string;
  descripcion:string;
  cantidad:string|null;
  unidad:Unidad|null;
  rubro:Rubro|null;
}>;
export type DestinoEsperado = Readonly<{
  proveedor_id:string;
  fila:number;
  descripcion:string;
  cantidad:string;
  unidad:Unidad;
  rubro:Rubro;
}>;
export type InformeCalidadIA=Readonly<{
  modo:'evaluacion_offline';
  extraccion:{
    esperados:number; exactos:number; omitidos:number; inventados:number;
    precision:number|null; cobertura:number|null;
    errores_cantidad_unidad:number;
  };
  distribucion:{
    destinos_esperados:number; correctos:number; omitidos:number; incorrectos:number;
    precision:number|null; cobertura:number|null;
    lineas_retenidas:number;
  };
  puerta_seguridad:'PASS'|'FAIL';
  puerta_cobertura:'PASS'|'FAIL';
  apto_para_envio_real:false;
}>;

const canon=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es-AR').replace(/\s+/g,' ').trim();
const safe=(s:unknown,max=300):s is string =>
  typeof s==='string' && s.length>0 && s.length<=max &&
  !/[\u0000-\u001f]/.test(s);
const finite=(n:number|null)=>n===null?'?':n.toString();
function articuloKey(e:ArticuloEsperado):string {
  return [e.ubicacion,canon(e.descripcion),e.cantidad??'?',e.unidad??'?',e.rubro??'?'].join('\u001f');
}
function fuenteKey(e:ArticuloEsperado):string {
  return [e.ubicacion,canon(e.descripcion)].join('\u001f');
}
function destinoKey(e:DestinoEsperado):string {
  return [e.proveedor_id,e.fila,canon(e.descripcion),e.cantidad,e.unidad,e.rubro].join('\u001f');
}
function sinCantidadKey(e:DestinoEsperado):string {
  return [e.proveedor_id,e.fila,canon(e.descripcion)].join('\u001f');
}
function multiset(items:readonly string[]):Map<string,number> {
  const counts=new Map<string,number>();
  for(const item of items)counts.set(item,(counts.get(item)??0)+1);
  return counts;
}
function contarCoincidencias(a:Map<string,number>,b:Map<string,number>):number {
  let total=0;
  for(const [k,n] of a)total+=Math.min(n,b.get(k)??0);
  return total;
}
const ratio=(a:number,b:number):number|null=>b>0?a/b:null;

export function evaluarCalidadDocumental(args:{
  esperados: readonly ArticuloEsperado[];
  destinos_esperados: readonly DestinoEsperado[];
  borrador:BorradorDocumental;
  plan:PlanDespachoAutomatico;
  cobertura_minima?:number;
}):InformeCalidadIA {
  const {esperados,destinos_esperados,borrador,plan}=args;
  const umbral=args.cobertura_minima??0.9;
  if(!Array.isArray(esperados)||!Array.isArray(destinos_esperados)||
    esperados.length>100||destinos_esperados.length>1000||
    !Number.isFinite(umbral)||umbral<0||umbral>1||
    borrador?.estado!=='pendiente_despacho_automatico'||
    plan?.estado!=='plan_sin_envio_real' ||
    !Array.isArray(borrador.lineas) || !Array.isArray(plan.solicitudes) ||
    !Array.isArray(plan.retenidas))throw new TypeError('evaluacion_entrada_invalida');

  for(const e of esperados){
    if(!safe(e?.ubicacion,100)||!safe(e.descripcion)||!safe(e.cantidad??'?',30)||
      !safe(e.unidad??'?',50)||!safe(e.rubro??'?',80))throw new TypeError('gold_invalido');
  }
  for(const d of destinos_esperados){
    if(!safe(d?.proveedor_id,80)||!Number.isInteger(d.fila)||d.fila<1||d.fila>100||
      !safe(d.descripcion)||!safe(d.cantidad,30)||!safe(d.unidad,30)||
      !safe(d.rubro,80))throw new TypeError('destino_esperado_invalido');
  }

  const detectados:ArticuloEsperado[]=borrador.lineas.map(l=>({
    ubicacion:l.ubicacion,descripcion:l.descripcion_original,
    cantidad:l.cantidad,unidad:l.unidad,rubro:l.rubro
  }));
  const exactos=contarCoincidencias(
    multiset(esperados.map(articuloKey)),multiset(detectados.map(articuloKey)));
  const porFuenteEsperada=multiset(esperados.map(fuenteKey));
  const porFuenteDetectada=multiset(detectados.map(fuenteKey));
  const fuenteCoincide=contarCoincidencias(porFuenteEsperada,porFuenteDetectada);
  const errorCantidadUnidad=Math.max(0,fuenteCoincide-exactos);

  const actual:DestinoEsperado[]=plan.solicitudes.flatMap(s=>
    s.items.map(i=>({
      proveedor_id:s.proveedor_id,fila:i.fila,descripcion:i.descripcion,
      cantidad:i.cantidad,unidad:i.unidad,rubro:i.rubro
    })));
  if(actual.length>1000)throw new RangeError('demasiados_destinos');

  const correctos=contarCoincidencias(
    multiset(destinos_esperados.map(destinoKey)),
    multiset(actual.map(destinoKey)));
  const coincidenciasOrigen=contarCoincidencias(
    multiset(destinos_esperados.map(sinCantidadKey)),
    multiset(actual.map(sinCantidadKey)));
  const errorDestinoCantidad=Math.max(0,coincidenciasOrigen-correctos);
  const inventados=detectados.length-exactos;
  const incorrectos=actual.length-correctos;
  const coberturaExtraccion=ratio(exactos,esperados.length);
  const coberturaDistribucion=ratio(correctos,destinos_esperados.length);
  const seguridadSinErrores=incorrectos===0 && errorDestinoCantidad===0 &&
    errorCantidadUnidad===0 && inventados===0;
  const cobertura=destinos_esperados.length
    ? coberturaDistribucion!==null&&coberturaDistribucion>=umbral
    : (esperados.length===0||coberturaExtraccion!==null&&coberturaExtraccion>=umbral);
  return {
    modo:'evaluacion_offline',
    extraccion:{
      esperados:esperados.length,exactos,
      omitidos:Math.max(0,esperados.length-exactos),
      inventados,precision:ratio(exactos,detectados.length),
      cobertura:coberturaExtraccion,
      errores_cantidad_unidad:errorCantidadUnidad
    },
    distribucion:{
      destinos_esperados:destinos_esperados.length,correctos,
      omitidos:Math.max(0,destinos_esperados.length-correctos),
      incorrectos,precision:ratio(correctos,actual.length),
      cobertura:coberturaDistribucion,
      lineas_retenidas:plan.retenidas.length
    },
    puerta_seguridad:seguridadSinErrores?'PASS':'FAIL',
    puerta_cobertura:cobertura?'PASS':'FAIL',
    apto_para_envio_real:false
  };
}
