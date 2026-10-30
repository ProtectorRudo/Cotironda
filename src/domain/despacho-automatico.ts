/**
 * Etapa 02: plan determinista de solicitudes por proveedor.
 * CONTRATO OFFLINE: no consulta base, no usa Whapi y nunca envía mensajes.
 * Catálogo/zonas/consentimiento deben venir de un servicio servidor ya autorizado,
 * NO de la salida IA, del navegador ni de metadatos del comprador.
 */
import type {BorradorDocumental, LineaDocumental} from './extraccion-documental.ts';
import type {Rubro, Unidad} from './catalogo.ts';

export type ProductoConfirmado = Readonly<{
  descripcion: string;
  rubro: Rubro;
  unidad: Unidad;
  marca: string | null;
}>;
export type ProveedorConfirmado = Readonly<{
  id: string;
  activo: boolean;
  consentimiento_whatsapp: boolean;
  opt_out: boolean;
  zonas_entrega: readonly string[];
  catalogo_confirmado: readonly ProductoConfirmado[];
}>;
export type SolicitudAutomatica = Readonly<{
  id: string;
  zona_entrega: string;
  envio_autorizado_por_comprador: boolean;
}>;
export type ItemParaProveedor = Readonly<{
  fila: number;
  ubicacion: string;
  descripcion: string;
  cantidad: string;
  unidad: Unidad;
  rubro: Rubro;
  marca_obligatoria: boolean;
  marca: string | null;
}>;
export type PlanDespachoAutomatico = Readonly<{
  estado: 'plan_sin_envio_real';
  solicitudes: {proveedor_id: string; clave_idempotencia: string; items: ItemParaProveedor[]}[];
  retenidas: {fila: number; motivo: 'datos_inseguros' | 'duplicado' | 'sin_coincidencia_verificada'}[];
  lineas_sin_destinatario: number[];
}>;

const idValido=(v: unknown): v is string =>
  typeof v==='string' && /^[A-Za-z0-9_-]{8,80}$/.test(v);
const canonico=(s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es-AR').replace(/\s+/g,' ').trim();
const textoValido=(s: unknown): s is string => typeof s==='string' && s.length>1 && s.length<=300;
const zonaValida=(s: unknown): s is string => typeof s==='string' &&
  /^[A-Za-z0-9_-]{2,40}$/.test(s);
// Se exige que el modelo no haya reescrito marca, medida, espesor ni referencia.
// Las equivalencias o nombres alternativos requieren otro módulo de verificación.
// Confianza IA sola NO autoriza el envío.
function lineaConfiable(l: LineaDocumental): boolean {
  return l.requiere_aclaracion.length===0 &&
    l.confianza_declarada !== null && l.confianza_declarada >= 0.95 &&
    textoValido(l.producto_normalizado) &&
    canonico(l.descripcion_original)===canonico(l.producto_normalizado) &&
    l.cantidad!==null && /^[0-9]+(?:\.[0-9]{1,2})?$/.test(l.cantidad) &&
    Number(l.cantidad)>0 && l.unidad !== null && l.rubro !== null &&
    (!l.marca_obligatoria || textoValido(l.marca));
}
function productoCorresponde(l: LineaDocumental, p: ProductoConfirmado): boolean {
  if (!textoValido(p.descripcion) || !l.producto_normalizado) return false;
  if (canonico(p.descripcion)!==canonico(l.producto_normalizado)) return false;
  if (p.rubro!==l.rubro || p.unidad!==l.unidad) return false;
  return !l.marca_obligatoria || (textoValido(p.marca) && textoValido(l.marca) &&
    canonico(p.marca)===canonico(l.marca));
}

/** Devuelve un plan para la futura cola, pero NO encola ni envía nada. */
export function planificarDespachoAutomatico(
  solicitud: SolicitudAutomatica,
  borrador: BorradorDocumental,
  proveedores: readonly ProveedorConfirmado[]
): PlanDespachoAutomatico {
  if (!idValido(solicitud?.id) || !zonaValida(solicitud?.zona_entrega) ||
    solicitud.envio_autorizado_por_comprador!==true) {
    throw new TypeError('solicitud_sin_autorizacion');
  }
  if (borrador?.estado!=='pendiente_despacho_automatico' ||
    !Array.isArray(borrador.lineas) || borrador.lineas.length>100 ||
    !Array.isArray(proveedores) || proveedores.length>1000) {
    throw new TypeError('entrada_no_verificada');
  }
  const vistos = new Set<string>();
  for (const p of proveedores) {
    if (!idValido(p?.id) || vistos.has(p.id) ||
      !Array.isArray(p.zonas_entrega) || !Array.isArray(p.catalogo_confirmado) ||
      p.catalogo_confirmado.length>2000) throw new TypeError('catalogo_no_verificado');
    vistos.add(p.id);
  }
  const duplicados = new Set<number>();
  for (const d of borrador.posibles_duplicados) {
    duplicados.add(d.fila);
    duplicados.add(d.primeraFila);
  }
  const elegibles = proveedores.filter(p => p.activo===true &&
    p.consentimiento_whatsapp===true && p.opt_out===false &&
    p.zonas_entrega.some((z:string)=>zonaValida(z)&&canonico(z)===canonico(solicitud.zona_entrega)));
  const porProveedor = new Map<string, ItemParaProveedor[]>();
  const retenidas: PlanDespachoAutomatico['retenidas'] = [];
  const lineas_sin_destinatario: number[] = [];
  for (const linea of borrador.lineas) {
    if (duplicados.has(linea.fila)) {
      retenidas.push({fila:linea.fila,motivo:'duplicado'}); continue;
    }
    if (!lineaConfiable(linea)) {
      retenidas.push({fila:linea.fila,motivo:'datos_inseguros'}); continue;
    }
    let destinatarios=0;
    for (const p of elegibles) {
      if (!p.catalogo_confirmado.some((prod:ProductoConfirmado)=>productoCorresponde(linea,prod))) continue;
      const subset=porProveedor.get(p.id)??[];
      subset.push({
        fila:linea.fila,ubicacion:linea.ubicacion,
        descripcion:linea.producto_normalizado!,
        cantidad:linea.cantidad!,unidad:linea.unidad!,rubro:linea.rubro!,
        marca_obligatoria:linea.marca_obligatoria,marca:linea.marca
      });
      porProveedor.set(p.id,subset);
      destinatarios++;
    }
    if (destinatarios===0) {
      retenidas.push({fila:linea.fila,motivo:'sin_coincidencia_verificada'});
      lineas_sin_destinatario.push(linea.fila);
    }
  }
  return {
    estado:'plan_sin_envio_real',
    solicitudes:[...porProveedor.entries()].map(([proveedor_id,items])=>({
      proveedor_id,clave_idempotencia:solicitud.id+':'+proveedor_id,items
    })),
    retenidas,lineas_sin_destinatario
  };
}
