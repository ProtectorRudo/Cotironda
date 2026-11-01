/**
 * Etapa 02: contrato puro para convertir una salida IA NO confiable en borrador.
 * No ejecuta acciones, interpreta archivos, crea solicitudes ni envía mensajes.
 * El comprador autoriza distribuir al ENVIAR la lista, sin revisar cada línea.
 * Líneas ambiguas/duplicadas se retienen; solo el matcher seguro selecciona proveedores.
 */
import { RUBROS, UNIDADES, type Rubro, type Unidad } from './catalogo.ts';

export type FormatoDocumento = 'texto' | 'pdf' | 'excel' | 'word' | 'imagen';
export type AvisoExtraccion =
  | 'producto_sin_normalizar'
  | 'cantidad_ambigua'
  | 'unidad_sin_confirmar'
  | 'rubro_sin_confirmar'
  | 'marca_obligatoria_sin_marca'
  | 'confianza_no_verificable'
  | 'campos_descartados'
  | 'posible_duplicado'
  | 'origen_no_verificado'
  | 'cantidad_sin_evidencia';
export type LineaDocumental = {
  fila: number;
  ubicacion: string;
  descripcion_original: string;
  producto_normalizado: string | null;
  cantidad: string | null;
  unidad: Unidad | null;
  rubro: Rubro | null;
  marca: string | null;
  marca_obligatoria: boolean;
  confianza_declarada: number | null;
  requiere_aclaracion: AvisoExtraccion[];
};
export type BorradorDocumental = {
  estado: 'pendiente_despacho_automatico';
  formato: FormatoDocumento;
  lineas: LineaDocumental[];
  errores: { fila: number; codigo: 'linea_invalida' | 'referencia_invalida' | 'descripcion_invalida' }[];
  posibles_duplicados: { fila: number; primeraFila: number }[];
};

const formatos: readonly string[] = ['texto', 'pdf', 'excel', 'word', 'imagen'];
const camposPermitidos = new Set([
  'ubicacion', 'descripcion_original', 'producto_normalizado', 'cantidad',
  'unidad', 'rubro', 'marca', 'marca_obligatoria', 'confianza'
]);

function objeto(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x) &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}
function texto(x: unknown, max: number): string | null {
  if (typeof x !== 'string' || x.length > max * 4) return null;
  const valor = x.trim().replace(/\s+/g, ' ');
  return valor.length >= 2 && valor.length <= max ? valor : null;
}
function opcional(x: unknown, max: number): string | null {
  return x === undefined || x === null || x === '' ? null : texto(x, max);
}
function cantidadExacta(x: unknown): string | null {
  if (typeof x !== 'string' || !/^\d{1,6}(?:[,.]\d{1,2})?$/.test(x)) return null;
  // En Argentina, "1.000" y "1,000" son ambiguos: no se adivina el separador.
  const partes = x.replace(',', '.').split('.');
  const entero = Number(partes[0]);
  if (!Number.isSafeInteger(entero) || entero > 999999) return null;
  const fraccion = partes[1] ?? '';
  if (entero === 0 && (!fraccion || Number(fraccion) === 0)) return null;
  const decimales = fraccion.replace(/0+$/, '');
  return String(entero) + (decimales ? '.' + decimales : '');
}
function codigoValido<T extends string>(x: unknown, codigos: readonly T[]): T | null {
  return typeof x === 'string' && codigos.includes(x as T) ? x as T : null;
}
function huella(linea: LineaDocumental): string {
  const n = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR').replace(/\s+/g, ' ').trim();
  return [n(linea.descripcion_original), linea.cantidad ?? '?', linea.unidad ?? '?',
    n(linea.marca ?? '')].join('|');
}

export function prepararBorradorDocumental(formato: FormatoDocumento, salidaIA: unknown): BorradorDocumental {
  if (!formatos.includes(formato)) throw new TypeError('formato_no_admitido');
  if (!objeto(salidaIA) || !Array.isArray(salidaIA.items)) throw new TypeError('salida_ia_invalida');
  if (salidaIA.items.length > 100) throw new RangeError('demasiadas_lineas');
  const lineas: LineaDocumental[] = [];
  const errores: BorradorDocumental['errores'] = [];
  const posibles_duplicados: BorradorDocumental['posibles_duplicados'] = [];
  const vistas = new Map<string, number>();

  for (let i = 0; i < salidaIA.items.length; i++) {
    const fila = i + 1;
    const dato: unknown = salidaIA.items[i];
    if (!objeto(dato)) { errores.push({fila, codigo: 'linea_invalida'}); continue; }
    const ubicacion = texto(dato.ubicacion, 100);
    const descripcion = texto(dato.descripcion_original, 300);
    if (!ubicacion) { errores.push({fila, codigo: 'referencia_invalida'}); continue; }
    if (!descripcion) { errores.push({fila, codigo: 'descripcion_invalida'}); continue; }

    const avisos: AvisoExtraccion[] = [];
    const producto = opcional(dato.producto_normalizado, 250);
    if (!producto) avisos.push('producto_sin_normalizar');
    const cantidad = cantidadExacta(dato.cantidad);
    if (!cantidad) avisos.push('cantidad_ambigua');
    const unidad = codigoValido(dato.unidad, UNIDADES);
    if (!unidad) avisos.push('unidad_sin_confirmar');
    const rubro = codigoValido(dato.rubro, RUBROS);
    if (!rubro) avisos.push('rubro_sin_confirmar');
    const marca = opcional(dato.marca, 160);
    const marca_obligatoria = dato.marca_obligatoria === true;
    if (marca_obligatoria && !marca) avisos.push('marca_obligatoria_sin_marca');
    const confianza = typeof dato.confianza === 'number' &&
      Number.isFinite(dato.confianza) && dato.confianza >= 0 && dato.confianza <= 1
      ? dato.confianza : null;
    if (confianza === null) avisos.push('confianza_no_verificable');
    if (Object.keys(dato).some(key => !camposPermitidos.has(key)) ||
        (dato.marca_obligatoria !== undefined && typeof dato.marca_obligatoria !== 'boolean')) {
      avisos.push('campos_descartados');
    }

    const linea: LineaDocumental = {
      fila, ubicacion, descripcion_original: descripcion,
      producto_normalizado: producto, cantidad, unidad, rubro, marca,
      marca_obligatoria, confianza_declarada: confianza,
      requiere_aclaracion: avisos
    };
    const clave = huella(linea);
    const primeraFila = vistas.get(clave);
    if (primeraFila !== undefined) {
      posibles_duplicados.push({fila, primeraFila});
      avisos.push('posible_duplicado');
    } else vistas.set(clave, fila);
    lineas.push(linea);
  }
  return {estado: 'pendiente_despacho_automatico', formato, lineas, errores, posibles_duplicados};
}
