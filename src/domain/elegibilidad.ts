/**
 * Filtro inicial, no verificador de stock ni equivalencia tecnica.
 * Ejecutar solo en servidor sobre catalogo y consentimiento confirmados.
 */
export type Material = { codigo: string; cantidad: number };
export type Zona = { provincia: string; ciudad: string };
export type Proveedor = {
  organizationId: string;
  habilitado: boolean;
  aceptaSolicitudes: boolean;
  consentimientoWhatsApp: boolean;
  codigosConfirmados: readonly string[];
  zonasEntrega: readonly Zona[];
};
export type Resultado = {
  elegible: boolean;
  motivo: 'ok' | 'inactivo' | 'sin_consentimiento' | 'fuera_de_zona' | 'sin_productos';
  codigosCoincidentes: string[];
};
export function normalizar(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-AR');
}
export function evaluarProveedor(p: Proveedor, destino: Zona, materiales: readonly Material[]): Resultado {
  const negar = (motivo: Resultado['motivo']): Resultado =>
    ({ elegible: false, motivo, codigosCoincidentes: [] });
  if (!p.habilitado || !p.aceptaSolicitudes) return negar('inactivo');
  if (!p.consentimientoWhatsApp) return negar('sin_consentimiento');
  const entrega = p.zonasEntrega.some(z =>
    normalizar(z.provincia) !== '' && normalizar(z.ciudad) !== '' &&
    normalizar(z.provincia) === normalizar(destino.provincia) &&
    normalizar(z.ciudad) === normalizar(destino.ciudad));
  if (!entrega) return negar('fuera_de_zona');
  const catalogo = new Set(p.codigosConfirmados.map(normalizar).filter(Boolean));
  const encontrados = new Set<string>();
  const originales: string[] = [];
  for (const m of materiales) {
    const c = normalizar(m.codigo);
    if (c && Number.isFinite(m.cantidad) && m.cantidad > 0 &&
        catalogo.has(c) && !encontrados.has(c)) {
      encontrados.add(c);
      originales.push(m.codigo);
    }
  }
  if (!originales.length) return negar('sin_productos');
  return { elegible: true, motivo: 'ok', codigosCoincidentes: originales };
}
