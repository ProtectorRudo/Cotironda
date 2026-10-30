/**
 * Etapa 02 — recorrido local de texto a PLAN de solicitudes por proveedor.
 * No usa IA, no carga archivos, no lee secretos, no guarda datos ni envía mensajes.
 * Solo formatos explícitos de cantidad + unidad; todo lo dudoso queda retenido.
 */
import {prepararBorradorDocumental, type BorradorDocumental} from './extraccion-documental.ts';
import {
  planificarDespachoAutomatico,
  type PlanDespachoAutomatico, type ProveedorConfirmado, type SolicitudAutomatica
} from './despacho-automatico.ts';
import type {Rubro, Unidad} from './catalogo.ts';

export type ResultadoSimulacionTexto = Readonly<{
  estado: 'simulacion_sin_envio';
  borrador: BorradorDocumental;
  plan: PlanDespachoAutomatico;
  lineas_no_interpretadas: {fila: number; motivo: 'sintaxis_no_admitida' | 'linea_demasiado_larga'}[];
  lineas_sin_catalogo: number[];
  lineas_con_rubro_ambiguo: number[];
  resumen: {lineas_recibidas: number; lineas_preparadas: number; lineas_retenidas: number; proveedores_preparados: number};
}>;

const unidadEquivalente: Readonly<Record<string, Unidad>> = {
  bolsa:'bag',bolsas:'bag',saco:'bag',sacos:'bag',
  caja:'box',cajas:'box',
  unidad:'unit',unidades:'unit',un:'unit',pieza:'unit',piezas:'unit',u:'unit',
  kilogramo:'kg',kilogramos:'kg',kilo:'kg',kilos:'kg',kg:'kg',
  gramo:'g',gramos:'g',g:'g',
  litro:'l',litros:'l',l:'l',
  mililitro:'ml',mililitros:'ml',ml:'ml',
  metro:'m',metros:'m',mts:'m',mt:'m',m:'m',
  m2:'m2', 'm²':'m2',m3:'m3','m³':'m3',
  rollo:'roll',rollos:'roll',
  paquete:'pack',paquetes:'pack',pack:'pack'
};

function canonico(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('es-AR').replace(/\s+/g,' ').trim();
}
function extraerLinea(s: string): {cantidad: string; unidad: Unidad; producto: string} | null {
  // Ej: "20 bolsas de Cemento CPC 50 kg" o "Cemento CPC 50 kg - 20 bolsas".
  const n = '\\d{1,6}(?:[,.]\\d{1,3})?';
  const unidad = '[\\p{L}\\p{N}²³]+';
  const prefijo = new RegExp('^('+n+')\\s+('+unidad+')\\s+(?:de\\s+)?(.+)$','iu');
  const sufijo = new RegExp('^(.+?)\\s+[-–—:]\\s+('+n+')\\s+('+unidad+')$','iu');
  const a=s.match(prefijo);
  const b=a?null:s.match(sufijo);
  if (!a && !b) return null;
  const cantidad=(a?a[1]:b![2]);
  const tipo=(a?a[2]:b![3]);
  const producto=(a?a[3]:b![1]).trim().replace(/\s+/g,' ');
  const unidadCod=unidadEquivalente[canonico(tipo)];
  if (!unidadCod || producto.length<2 || producto.length>250) return null;
  return {cantidad, unidad:unidadCod, producto};
}

/** Catálogos aquí son exclusivamente fixtures/snapshots servidos por backend de confianza. */
function categoriasPorProducto(proveedores: readonly ProveedorConfirmado[]): Map<string, Set<Rubro>> {
  const categorias=new Map<string,Set<Rubro>>();
  for (const proveedor of proveedores) {
    for (const p of proveedor.catalogo_confirmado) {
      if (typeof p.descripcion!=='string' || p.descripcion.length>250) continue;
      const clave=canonico(p.descripcion)+'\u0000'+p.unidad;
      const set=categorias.get(clave)??new Set<Rubro>();
      set.add(p.rubro);
      categorias.set(clave,set);
    }
  }
  return categorias;
}

/**
 * Aceptación de enviar la lista = permiso para intentar distribuir.
 * Este pipeline NO envía: devuelve el plan, y solo para los ítems exactos
 * que matchean un producto confirmado de proveedor, unidad y rubro únicos.
 */
export function simularDespachoDesdeTexto(
  texto: string, solicitud: SolicitudAutomatica, proveedores: readonly ProveedorConfirmado[],
  ubicaciones?: readonly string[]
): ResultadoSimulacionTexto {
  if (typeof texto!=='string' || texto.length===0 || texto.length>15000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(texto)) {
    throw new TypeError('texto_invalido');
  }
  if (!Array.isArray(proveedores) || proveedores.length>1000) throw new TypeError('proveedores_invalidos');
  const filas=texto.split(/\r\n|\n|\r/).map((raw,n)=>({raw:raw.trim(),numero:n+1}))
    .filter(x=>x.raw.length>0);
  if (filas.length===0 || filas.length>100) throw new RangeError('cantidad_de_lineas_invalida');
  if (ubicaciones !== undefined && (!Array.isArray(ubicaciones) ||
    ubicaciones.length!==filas.length || ubicaciones.some(u=>typeof u!=='string' ||
      u.length<2 || u.length>100 || /[\u0000-\u001f]/.test(u)))) {
    throw new TypeError('ubicaciones_invalidas');
  }
  const categorias=categoriasPorProducto(proveedores);
  const lineas_no_interpretadas: ResultadoSimulacionTexto['lineas_no_interpretadas']=[];
  const lineas_sin_catalogo: number[]=[];
  const lineas_con_rubro_ambiguo: number[]=[];
  const items=filas.map(({raw,numero},indice)=>{
    const ubicacion=ubicaciones?.[indice]??'Texto, línea '+numero;
    const original=raw.replace(/^(?:[-*•]\s+|\d{1,3}[).]\s+)/u,'').trim();
    const limpia=original.length<500?original:'';
    const parsed=extraerLinea(limpia);
    if (!parsed) lineas_no_interpretadas.push({
      fila:indice+1,
      motivo:original.length>300?'linea_demasiado_larga':'sintaxis_no_admitida'
    });
    const descripcion=parsed?.producto??(limpia.length<=300?limpia:'Línea sin lectura segura');
    const matches=parsed?categorias.get(canonico(parsed.producto)+'\u0000'+parsed.unidad):undefined;
    const rubro=matches?.size===1?[...matches][0]:null;
    if (parsed && !matches) lineas_sin_catalogo.push(indice+1);
    if (parsed && matches && matches.size!==1) lineas_con_rubro_ambiguo.push(indice+1);
    return {
      ubicacion,descripcion_original:descripcion,
      producto_normalizado:parsed?.producto??null,
      cantidad:parsed?.cantidad??null,
      unidad:parsed?.unidad??null,
      rubro,
      marca:null,marca_obligatoria:false,
      // 1 es la certeza de la REGLA exacta + sintaxis validada,
      // NO una "confianza de IA"; un catálogo inexistente produce null.
      confianza: parsed && rubro?1:null
    };
  });
  const borrador=prepararBorradorDocumental('texto',{items});
  const plan=planificarDespachoAutomatico(solicitud,borrador,proveedores);
  const preparados=new Set(plan.solicitudes.flatMap(x=>x.items.map(i=>i.fila)));
  const retenidas=new Set([...plan.retenidas.map(x=>x.fila),...borrador.errores.map(x=>x.fila)]);
  return {
    estado:'simulacion_sin_envio',borrador,plan,lineas_no_interpretadas,
    lineas_sin_catalogo,lineas_con_rubro_ambiguo,
    resumen: {
      lineas_recibidas:filas.length,
      lineas_preparadas:preparados.size,
      lineas_retenidas:retenidas.size,
      proveedores_preparados:plan.solicitudes.length
    }
  };
}
