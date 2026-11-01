import {pathToFileURL} from 'node:url';
import {COTIRONDA_DEV_REF} from '../../src/server/portal-entorno.ts';
import {comprobarRegistroAuthSoloLectura} from '../../src/server/auth-signup-readonly-audit.ts';

/**
 * Única petición pública GET a GoTrue, exclusivamente desde un PR propio de CI.
 * Ningún usuario, contraseña, JWT, email o service_role participa.
 * No registrar encabezados, key, JSON bruto ni excepciones de red.
 */
const rama='security/01-auth-settings-remote-probe';
const repo='ProtectorRudo/Cotironda';

export function entornoDeLecturaAutorizado(env){
 return env.GITHUB_ACTIONS==='true' &&
  env.GITHUB_EVENT_NAME==='pull_request' &&
  env.GITHUB_REPOSITORY===repo &&
  env.GITHUB_HEAD_REF===rama &&
  env.COTIRONDA_CI_AUTH_REMOTE==='true' &&
  typeof env.COTIRONDA_DEV_PUBLISHABLE_KEY==='string' &&
  /^sb_publishable_[A-Za-z0-9_-]{18,240}$/.test(env.COTIRONDA_DEV_PUBLISHABLE_KEY);
}

export async function verificarAuthRemoto(env,transport=fetch){
 if(!entornoDeLecturaAutorizado(env)){
  return {estado:'INCONCLUSO',codigo:'ejecucion_no_autorizada',exitCode:3};
 }
 const resultado=await comprobarRegistroAuthSoloLectura({
  projectRef:COTIRONDA_DEV_REF,
  url:'https://'+COTIRONDA_DEV_REF+'.supabase.co',
  publishableKey:env.COTIRONDA_DEV_PUBLISHABLE_KEY
 },transport);
 return {...resultado,exitCode:resultado.estado==='PASS'?0:
  resultado.estado==='FAIL'?1:2};
}

// La importación para unit tests NO accede a red.
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const r=await verificarAuthRemoto(process.env);
 // Solo estado y descripción genérica. Nunca respuesta JSON, API key ni PII.
 process.stdout.write('COTIRONDA_AUTH_SIGNUP='+r.estado+' / '+r.codigo+'\n');
 process.exitCode=r.exitCode;
}
