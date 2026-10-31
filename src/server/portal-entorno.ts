/**
 * Un único proyecto Auth exclusivo de Cotironda y un flag deliberado.
 * La creación usa JWT PostgREST: no requiere contraseña ni conexión SQL.
 */
export type VariablesPortal = Record<string,string|undefined>;
/** Entorno exclusivo de desarrollo, nunca inferido de variables de otro negocio. */
export const COTIRONDA_DEV_REF = 'qkercsoqhehbenbbncwk';
export function origenSeguro(origin: string|undefined): boolean {
 if(!origin)return false;
 try{
  const x=new URL(origin);
  return x.origin===origin && !x.username && !x.password &&
    (x.protocol==='https:' || (x.protocol==='http:' && x.hostname==='localhost'));
 }catch{return false;}
}
export function credencialesCotironda(env:VariablesPortal):boolean {
 const ref=env.COTIRONDA_SUPABASE_PROJECT_REF||'';
 return ref===COTIRONDA_DEV_REF &&
   env.NEXT_PUBLIC_SUPABASE_URL==='https://'+ref+'.supabase.co' &&
   Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) &&
   !env.COTIRONDA_DATABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY;
}
export function portalHabilitado(env:VariablesPortal):boolean {
 return env.COTIRONDA_REGISTRATION_ENABLED==='true' &&
    env.VERCEL_ENV!=='production' &&
    origenSeguro(env.COTIRONDA_SITE_ORIGIN) &&
    credencialesCotironda(env);
}

/**
 * Ensayo de login/logout en Vercel Preview, sin habilitar ni Auth signup desde UI
 * ni altas comerciales. Requiere bandera server-only, registro apagado
 * explícitamente, ref exacta de cotironda-dev y entorno NO productivo.
 * La autorización real de lectura permanece en Supabase Auth + RLS.
 */
export function autenticacionPreviewSoloIngreso(env:VariablesPortal):boolean {
 return env.COTIRONDA_AUTH_PREVIEW_ENABLED==='true' &&
   // Vercel aún no tiene repositorio Git vinculado: el flag no se puede
   // limitar por rama. Exigir la referencia REAL del deployment en servidor.
   (env.VERCEL_GIT_COMMIT_REF==='test/01-auth-only-preview' ||
    env.VERCEL_GIT_COMMIT_REF==='security/01-browser-cookie-cache-audit' ||
    env.VERCEL_GIT_COMMIT_REF==='security/01-auth-signup-readonly-check') &&
   env.VERCEL_ENV==='preview' &&
   env.COTIRONDA_REGISTRATION_ENABLED==='false' &&
   credencialesCotironda(env) &&
   (!env.COTIRONDA_SITE_ORIGIN||origenSeguro(env.COTIRONDA_SITE_ORIGIN));
}

/** Credenciales reales habilitadas para prueba de Auth sin activar empresas. */
export function autenticacionPortalHabilitada(env:VariablesPortal):boolean {
 return portalHabilitado(env)||autenticacionPreviewSoloIngreso(env);
}
