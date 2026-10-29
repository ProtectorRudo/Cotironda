/**
 * Limpieza conservadora de catálogos importados. No extrae PDF/Excel ni publica
 * productos: devuelve una propuesta pendiente de confirmación del proveedor.
 * El precio no se ingiere deliberadamente; el proveedor cotiza cada solicitud.
 */
export const RUBROS = [
  'corralon', 'pintureria', 'electricidad', 'construccion_seco', 'sanitarios'
] as const;
export const UNIDADES = [
  'unit', 'bag', 'box', 'kg', 'g', 'l', 'ml', 'm', 'm2', 'm3', 'roll', 'pack'
] as const;
export type Rubro = typeof RUBROS[number];
export type Unidad = typeof UNIDADES[number];
export type RegistroCrudo = {
  category_code?: unknown;
  product_name?: unknown;
  unit_code?: unknown;
  manufacturer?: unknown;
  manufacturer_sku?: unknown;
  [campo: string]: unknown;
};
export type ItemCatalogoPropuesto = {
  category_code: Rubro;
  product_name: string;
  unit_code: Unidad;
  manufacturer: string | null;
  manufacturer_sku: string | null;
};
export type ErrorCatalogo = { fila: number; codigo: string };
export type CatalogoPendiente = {
  estado: 'pendiente_confirmacion';
  items: ItemCatalogoPropuesto[];
  errores: ErrorCatalogo[];
  duplicados: { fila: number; primeraFila: number }[];
};

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const limpiar = (x: unknown): string | null =>
  typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : null;
const clave = (x: string): string =>
  x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR');
const rubroValido = (x: string): x is Rubro => (RUBROS as readonly string[]).includes(x);
const unidadValida = (x: string): x is Unidad => (UNIDADES as readonly string[]).includes(x);

export function prepararCatalogo(filas: readonly unknown[]): CatalogoPendiente {
  if (filas.length > 2000) throw new RangeError('catalogo_excede_limite');
  const items: ItemCatalogoPropuesto[] = [];
  const errores: ErrorCatalogo[] = [];
  const duplicados: {fila:number;primeraFila:number}[] = [];
  const vistas = new Map<string, number>();
  for (let i = 0; i < filas.length; i++) {
    const fila = i + 1;
    const valor = filas[i];
    if (!esObjeto(valor)) { errores.push({fila,codigo:'fila_invalida'}); continue; }
    const r: RegistroCrudo = valor;
    const categoria = limpiar(r.category_code);
    const nombre = limpiar(r.product_name);
    const unidad = limpiar(r.unit_code);
    const marca = r.manufacturer === undefined || r.manufacturer === null ? null : limpiar(r.manufacturer);
    const sku = r.manufacturer_sku === undefined || r.manufacturer_sku === null ? null : limpiar(r.manufacturer_sku);
    if (!categoria || !rubroValido(categoria)) { errores.push({fila,codigo:'rubro_desconocido'}); continue; }
    if (!nombre || nombre.length < 2 || nombre.length > 250) { errores.push({fila,codigo:'producto_invalido'}); continue; }
    if (!unidad || !unidadValida(unidad)) { errores.push({fila,codigo:'unidad_invalida'}); continue; }
    if (marca === null && r.manufacturer != null || marca !== null && marca.length > 160) {
      errores.push({fila,codigo:'marca_invalida'}); continue;
    }
    if (sku === null && r.manufacturer_sku != null || sku !== null && sku.length > 120) {
      errores.push({fila,codigo:'sku_invalido'}); continue;
    }
    // Mismas especificaciones declaradas; no inferimos equivalencias técnicas.
    const huella = [categoria, clave(nombre), unidad, clave(marca || ''), clave(sku || '')].join('|');
    const primeraFila = vistas.get(huella);
    if (primeraFila !== undefined) { duplicados.push({fila,primeraFila}); continue; }
    vistas.set(huella, fila);
    items.push({category_code:categoria,product_name:nombre,unit_code:unidad,
      manufacturer:marca || null,manufacturer_sku:sku || null});
  }
  return {estado:'pendiente_confirmacion',items,errores,duplicados};
}
