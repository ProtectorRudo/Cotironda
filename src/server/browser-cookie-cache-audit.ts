/**
 * Evaluación pura de seguridad observable en el navegador.
 *
 * SOLO recibe metadatos de cookie y cabeceras de caché. No acepta ni expone
 * valores de cookies, sesiones, JWT, contraseñas, IDs de usuario o IP.
 *
 * CookieStore puede estar ausente; jamás convertir "sin datos" en PASS.
 * Las cabeceras Set-Cookie están vedadas por Fetch y NO se inspeccionan aquí.
 */
export type EstadoComprobacion = 'PASS' | 'FAIL' | 'INCONCLUSO';

export type AtributosCookie = Readonly<{
  name: string;
  secure?: boolean;
  sameSite?: string;
  path?: string;
}>;

export type RespuestaSegura = Readonly<{
  https: boolean;
  mismoOrigen: boolean;
  rutaFinal: string;
  status: number;
  redirigio: boolean;
  cacheControl: string | null;
  vercelCache: string | null;
}>;

export type InformeSeguridad = Readonly<{
  cookies: EstadoComprobacion;
  cache: EstadoComprobacion;
  paginaPrivada: EstadoComprobacion;
  general: EstadoComprobacion;
}>;

export function evaluarCookiesProyecto(
  cookies: readonly AtributosCookie[] | null,
  projectRef: string
): EstadoComprobacion {
  if (!cookies) return 'INCONCLUSO';
  if (!/^[a-z0-9]{20}$/.test(projectRef)) return 'FAIL';

  const nombrePrincipal = 'sb-' + projectRef + '-auth-token';
  const propias = cookies.filter(({name}) =>
    name === nombrePrincipal ||
    (name.startsWith(nombrePrincipal + '.') &&
      /^\d+$/.test(name.slice(nombrePrincipal.length + 1)))
  );
  if (propias.length === 0) return 'INCONCLUSO';

  // Un atributo explícitamente inseguro nunca puede considerarse "desconocido".
  if (propias.some(x =>
      x.secure === false ||
      (x.sameSite != null && x.sameSite.toLowerCase() !== 'lax') ||
      (x.path != null && x.path !== '/')
    )) return 'FAIL';

  if (propias.some(x =>
      x.secure !== true || x.sameSite?.toLowerCase() !== 'lax' || x.path !== '/'
    )) return 'INCONCLUSO';

  return 'PASS';
}

export function evaluarCachePrivada(
  respuesta: RespuestaSegura
): EstadoComprobacion {
  if (!respuesta.https || !respuesta.mismoOrigen) return 'FAIL';
  if (respuesta.rutaFinal !== '/alta' || respuesta.status !== 200 ||
      respuesta.redirigio) return 'INCONCLUSO';
  if (respuesta.vercelCache?.trim().toUpperCase() === 'HIT') return 'FAIL';

  const cc = respuesta.cacheControl?.toLowerCase().split(',')
    .map(x=>x.trim()) || [];
  if (cc.some(x => /^public(?:$|=)|^s-maxage(?:$|=)/.test(x))) return 'FAIL';
  if (!cc.includes('no-store')) return respuesta.cacheControl ? 'FAIL' : 'INCONCLUSO';
  if (!cc.includes('private')) return 'INCONCLUSO';
  return 'PASS';
}

export function evaluarPaginaPrivada(
  respuesta: RespuestaSegura
): EstadoComprobacion {
  if (!respuesta.https || !respuesta.mismoOrigen) return 'FAIL';
  if (respuesta.status === 200 && !respuesta.redirigio &&
      respuesta.rutaFinal === '/alta') return 'PASS';
  return 'INCONCLUSO';
}

export function evaluarAuditoriaSesion(
  cookies: readonly AtributosCookie[] | null,
  projectRef: string,
  respuesta: RespuestaSegura
): InformeSeguridad {
  const items = {
    cookies: evaluarCookiesProyecto(cookies, projectRef),
    cache: evaluarCachePrivada(respuesta),
    paginaPrivada: evaluarPaginaPrivada(respuesta)
  };
  const states = Object.values(items);
  const general: EstadoComprobacion = states.includes('FAIL') ? 'FAIL'
    : states.every(s=>s==='PASS') ? 'PASS' : 'INCONCLUSO';
  return {...items,general};
}
