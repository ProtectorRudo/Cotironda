/**
 * Contrato del registro inicial: sólo ejecutable desde un backend que haya
 * verificado la sesión con el proveedor de autenticación.
 * La capa que invoca este módulo NO debe obtener 'actor' del cuerpo HTTP.
 */
export type TipoEmpresa = 'buyer' | 'supplier' | 'both';
export type ActorVerificado = Readonly<{
  userId: string;
  emailVerificado: boolean;
  anonimo: boolean;
}>;
export type AltaEmpresa = Readonly<{
  requestId: string;
  nombre: string;
  tipo: TipoEmpresa;
  nombreComercial: string | null;
}>;
export type AltaPersistible = Readonly<{
  idempotencyKey: string;
  userId: string;
  nombre: string;
  tipo: TipoEmpresa;
  nombreComercial: string | null;
  rolInicial: 'owner';
  cotizacionesHabilitadas: false;
}>;
export type AltaCreada = Readonly<{
  organizationId: string;
  replay: boolean;
}>;
export interface AltaEmpresaPort {
  /** Transacción atómica: empresa + miembro propietario + perfil proveedor
   * cuando corresponde. Un mismo requestId+usuario+payload es idempotente;
   * repeticiones con payload distinto deben rechazarse. */
  crearEmpresaConPropietario(input: AltaPersistible): Promise<AltaCreada>;
}
export class ErrorRegistro extends Error {
  public readonly codigo: string;
  constructor(codigo: string) {
    super(codigo);
    this.codigo = codigo;
    this.name = 'ErrorRegistro';
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tipos = new Set<TipoEmpresa>(['buyer', 'supplier', 'both']);
const caracteresControl = /[\u0000-\u001f\u007f]/;
function nombreValido(value: unknown): string | null {
  if (typeof value !== 'string' || caracteresControl.test(value)) return null;
  const nombre = value.trim().replace(/\s+/g, ' ');
  return nombre.length >= 2 && nombre.length <= 160 ? nombre : null;
}
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Conservador: ninguna clave extra, ID de empresa o rol se acepta del cliente. */
export function validarSolicitudAlta(raw: unknown): AltaEmpresa {
  if (!isObject(raw)) throw new ErrorRegistro('solicitud_invalida');
  const keys = Object.keys(raw);
  if (keys.some(k => !['requestId', 'nombre', 'tipo', 'nombreComercial'].includes(k))) {
    throw new ErrorRegistro('campo_no_permitido');
  }
  if (typeof raw.requestId !== 'string' || !uuid.test(raw.requestId)) {
    throw new ErrorRegistro('request_id_invalido');
  }
  const nombre = nombreValido(raw.nombre);
  if (!nombre) throw new ErrorRegistro('nombre_invalido');
  if (typeof raw.tipo !== 'string' || !tipos.has(raw.tipo as TipoEmpresa)) {
    throw new ErrorRegistro('tipo_invalido');
  }
  const tipo = raw.tipo as TipoEmpresa;
  const requiereProveedor = tipo === 'supplier' || tipo === 'both';
  if (!requiereProveedor && raw.nombreComercial !== undefined && raw.nombreComercial !== null) {
    throw new ErrorRegistro('nombre_comercial_no_aplica');
  }
  let nombreComercial: string | null = null;
  if (requiereProveedor) {
    nombreComercial = nombreValido(raw.nombreComercial);
    if (!nombreComercial) throw new ErrorRegistro('nombre_comercial_invalido');
  }
  return { requestId: raw.requestId.toLowerCase(), nombre, tipo, nombreComercial };
}

export async function registrarEmpresa(
  actor: ActorVerificado | null,
  solicitud: unknown,
  port: AltaEmpresaPort
): Promise<AltaCreada> {
  if (!actor || !uuid.test(actor.userId) || !actor.emailVerificado || actor.anonimo) {
    throw new ErrorRegistro('usuario_no_autorizado');
  }
  const input = validarSolicitudAlta(solicitud);
  return port.crearEmpresaConPropietario({
    idempotencyKey: input.requestId,
    userId: actor.userId,
    nombre: input.nombre,
    tipo: input.tipo,
    nombreComercial: input.nombreComercial,
    rolInicial: 'owner',
    cotizacionesHabilitadas: false
  });
}
