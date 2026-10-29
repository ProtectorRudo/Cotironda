import { ErrorRegistro, registrarEmpresa, type ActorVerificado, type AltaEmpresaPort } from '../domain/onboarding.ts';

export type DependenciasRegistro = {
  /** Origen público canónico, por ejemplo https://portal.cotironda.com.ar. */
  originPermitido: string;
  configurado: boolean;
  verificarSesion: () => Promise<ActorVerificado | null>;
  autorizarIntento: (actorId: string) => Promise<boolean>;
  persistencia: AltaEmpresaPort;
};

const RESPUESTA = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const MAX_BYTES = 10_240;
function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPUESTA });
}
async function leerLimitado(req: Request): Promise<string> {
  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('demasiado_grande');
  const reader = req.body?.getReader();
  if (!reader) throw new Error('sin_cuerpo');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('demasiado_grande');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(data);
}

/** Lógica HTTP sin Next.js ni credenciales: ideal para inyectar servicios falsos en pruebas. */
export async function procesarAlta(request: Request, deps: DependenciasRegistro): Promise<Response> {
  if (!deps.configurado || !deps.originPermitido) return json(503, { error: 'registro_no_disponible' });
  if (request.method !== 'POST') return json(405, { error: 'metodo_no_permitido' });
  if (request.headers.get('origin') !== deps.originPermitido) {
    return json(403, { error: 'origen_no_permitido' });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    return json(415, { error: 'tipo_de_contenido_no_permitido' });
  }
  let actor: ActorVerificado | null;
  try { actor = await deps.verificarSesion(); }
  catch { return json(503, { error: 'autenticacion_no_disponible' }); }
  if (!actor || !actor.emailVerificado || actor.anonimo) return json(401, { error: 'sesion_no_valida' });
  let permitido: boolean;
  try { permitido = await deps.autorizarIntento(actor.userId); }
  catch { return json(503, { error: 'limite_no_disponible' }); }
  if (!permitido) return json(429, { error: 'demasiadas_solicitudes' });
  let entrada: unknown;
  try { entrada = JSON.parse(await leerLimitado(request)); }
  catch (e) {
    return json(e instanceof Error && e.message === 'demasiado_grande' ? 413 : 400,
      { error: 'solicitud_json_invalida' });
  }
  try {
    const resultado = await registrarEmpresa(actor, entrada, deps.persistencia);
    return json(resultado.replay ? 200 : 201, {
      organizationId: resultado.organizationId,
      replay: resultado.replay
    });
  } catch (e) {
    if (e instanceof ErrorRegistro) return json(400, { error: e.codigo });
    if (e instanceof Error && e.message === 'request_id_conflictivo') {
      return json(409, { error: 'request_id_conflictivo' });
    }
    return json(503, { error: 'registro_temporalmente_no_disponible' });
  }
}
