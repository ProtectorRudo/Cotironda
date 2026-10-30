/**
 * D015/D016 — benchmark INDEPENDIENTE de extracción y cobertura comercial.
 * No compara nombre de SKU ni total de cotizaciones: la invitación se mide
 * por producto canónico, evidencia literal y proveedor esperado.
 * Un PASS de mocks NO mide precisión real de ningún modelo.
 */
import type {Unidad,Rubro} from './catalogo.ts';
import type {PlanCalidadPrioritaria} from '../server/flujo-calidad-ia.ts';

export type GoldProducto = Readonly<{
  linea_fuente:number;
  descripcion:string;
  cantidad:string;
  unidad:Unidad;
  rubro:Rubro;
  producto_id:string|null;
  proveedores_esperados:readonly string[];
}>;
export type InformeBenchmarkProducto = Readonly<{
  modo:'benchmark_producto_offline';
  extraccion:{
    esperados:number;
    exactos:number;
    omitidos:number;
    alterados_o_no_reconocidos:number;
    precision:number|null;
    cobertura:number|null;
  };
  invitaciones:{
    esperadas:number;
    correctas:number;
    omitidas:number;
    incorrectas:number;
    precision:number|null;
    cobertura:number|null;
  };
  lineas_fuente:{
    total:number;
    parciales:number;
    omitidas:number;
    retenidas:number;
    sin_proveedor:number;
  };
  puerta_seguridad:'PASS'|'FAIL';
  puerta_cobertura:'PASS'|'FAIL';
  apto_para_envio_real:false;
}>;

const normalizar=(s:string):string=>s.normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-AR')
  .replace(/\s+/g,' ').trim();
const seguro=(s:unknown,max=300):s is string=>
  typeof s==='string'&&s.trim().length>0&&s.length<=max&&
  !/[\u0000-\u001f]/.test(s);
const id=(s:unknown):s is string=>typeof s==='string'&&
  /^[a-z0-9][a-z0-9_-]{2,79}$/.test(s);
const ratio=(a:number,b:number):number|null=>b>0?a/b:null;
const clave=(e:{
  linea_fuente:number;descripcion:string;cantidad:string;unidad:Unidad;
  rubro:Rubro;producto_id:string|null;
}):string=>JSON.stringify([
  e.linea_fuente,normalizar(e.descripcion),e.cantidad,e.unidad,
  e.rubro,e.producto_id
]);
function comprobar(gold:readonly GoldProducto[],r:PlanCalidadPrioritaria,
  coberturaMinima:number) {
  if(!Array.isArray(gold)||gold.length>150||
    !Number.isFinite(coberturaMinima)||coberturaMinima<0||coberturaMinima>1||
    r?.estado!=='plan_calidad_prioritaria_sin_envio'||
    r.resultado?.distribucion?.plan?.estado!=='invitaciones_por_producto_sin_envio'||
    !Array.isArray(r.resultado.extraccion.borrador.lineas)||
    !Array.isArray(r.resultado.distribucion.resolucion.requisitos)||
    !Array.isArray(r.resultado.distribucion.plan.invitaciones)||
    !Array.isArray(r.lineas))
    throw new TypeError('benchmark_producto_entrada_invalida');
  const lineasTotal=r.resumen.lineas_originales;
  if(!Number.isInteger(lineasTotal)||lineasTotal<1||lineasTotal>25||
    gold.length>lineasTotal*6)throw new TypeError('benchmark_gold_invalido');
  for(const e of gold){
    if(!Number.isInteger(e?.linea_fuente)||e.linea_fuente<1||
      e.linea_fuente>lineasTotal||!seguro(e.descripcion)||
      !/^\d{1,6}(?:[,.]\d{1,2})?$/.test(e.cantidad)||
      !seguro(e.unidad,30)||!seguro(e.rubro,40)||
      !(e.producto_id===null||id(e.producto_id))||
      !Array.isArray(e.proveedores_esperados)||
      e.proveedores_esperados.length>100||
      e.proveedores_esperados.some(v=>!id(v))||
      new Set(e.proveedores_esperados).size!==e.proveedores_esperados.length)
      throw new TypeError('benchmark_gold_invalido');
  }
}
/**
 * Crea una asignación uno-a-uno entre artículos esperados y respuestas.
 * Igualdad exige ubicación, descripción, cantidad, unidad, rubro y producto_id.
 * Proveedores se comparan DESPUÉS: una marca/envase alternativo puede ser válida.
 */
export function evaluarCalidadInvitacionesPorProducto(args:{
  esperados:readonly GoldProducto[];
  resultado:PlanCalidadPrioritaria;
  cobertura_minima?:number;
}):InformeBenchmarkProducto {
  const {esperados,resultado:r}=args;
  const threshold=args.cobertura_minima??1;
  comprobar(esperados,r,threshold);
  const requisitos=new Map(r.resultado.distribucion.resolucion.requisitos
    .map(x=>[x.fila,x]));
  const respuestas=r.resultado.extraccion.borrador.lineas;
  const goldIndices=new Map<string,number[]>();
  for(let i=0;i<esperados.length;i++){
    const k=clave(esperados[i]);
    const items=goldIndices.get(k)??[];
    items.push(i);
    goldIndices.set(k,items);
  }
  const usos=new Map<string,number>();
  const asignacion=new Map<number,number>();
  for(const articulo of respuestas){
    const m=/^Texto, línea ([1-9]\d*)$/u.exec(articulo.ubicacion);
    if(!m||articulo.cantidad===null||articulo.unidad===null||
      articulo.rubro===null)continue;
    const k=clave({
      linea_fuente:Number(m[1]),
      descripcion:articulo.descripcion_original,
      cantidad:articulo.cantidad,
      unidad:articulo.unidad,
      rubro:articulo.rubro,
      producto_id:requisitos.get(articulo.fila)?.producto_id??null
    });
    const indices=goldIndices.get(k)??[];
    const usado=usos.get(k)??0;
    if(usado<indices.length){
      asignacion.set(articulo.fila,indices[usado]);
      usos.set(k,usado+1);
    }
  }
  const expectedCount=esperados.reduce((n,x)=>n+x.proveedores_esperados.length,0);
  let correctas=0,incorrectas=0;
  const vistos=new Set<string>();
  let cantidadInvitaciones=0;
  for(const invitacion of r.resultado.distribucion.plan.invitaciones){
    for(const item of invitacion.items){
      cantidadInvitaciones++;
      const i=asignacion.get(item.fila);
      const k=JSON.stringify([i??null,invitacion.proveedor_id]);
      if(i===undefined||vistos.has(k)||
        !esperados[i].proveedores_esperados.includes(invitacion.proveedor_id)){
        incorrectas++;
      }else{
        vistos.add(k);
        correctas++;
      }
    }
  }
  const exactos=asignacion.size;
  const discrepancias=respuestas.length-exactos;
  const seguridad=discrepancias===0&&incorrectas===0;
  const coberturaArticulos=ratio(exactos,esperados.length);
  const coberturaDestinos=ratio(correctas,expectedCount);
  const cubre= (esperados.length===0||coberturaArticulos!==null&&coberturaArticulos>=threshold)&&
    (expectedCount===0||coberturaDestinos!==null&&coberturaDestinos>=threshold);
  return{
    modo:'benchmark_producto_offline',
    extraccion:{
      esperados:esperados.length,exactos,
      omitidos:Math.max(0,esperados.length-exactos),
      alterados_o_no_reconocidos:discrepancias,
      precision:ratio(exactos,respuestas.length),
      cobertura:coberturaArticulos
    },
    invitaciones:{
      esperadas:expectedCount,correctas,
      omitidas:Math.max(0,expectedCount-correctas),
      incorrectas,
      precision:ratio(correctas,cantidadInvitaciones),
      cobertura:coberturaDestinos
    },
    lineas_fuente:{
      total:r.resumen.lineas_originales,
      parciales:r.resumen.parciales,
      omitidas:r.resumen.omitidas,
      retenidas:r.resumen.retenidas,
      sin_proveedor:r.resumen.sin_proveedor
    },
    puerta_seguridad:seguridad?'PASS':'FAIL',
    puerta_cobertura:cubre?'PASS':'FAIL',
    apto_para_envio_real:false
  };
}
