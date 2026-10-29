/**
 * Interruptor de seguridad del portal. Ningún entorno puede habilitar
 * cuentas usando accidentalmente el Supabase de otro negocio.
 */
export type VariablesPortal = Record<string, string | undefined>;
const refValida = /^[a-z]{20}$/;
export function origenSeguro(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const local = url.protocol === 'http:' && url.hostname === 'localhost';
    const publicSecure = url.protocol === 'https:' && Boolean(url.hostname);
    return (local || publicSecure) && url.origin === origin && !url.username && !url.password;
  } catch { return false; }
}
export function credencialesCotironda(env: VariablesPortal): boolean {
  const ref = env.COTIRONDA_SUPABASE_PROJECT_REF || '';
  if (!refValida.test(ref)) return false;
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) return false;
  if (env.NEXT_PUBLIC_SUPABASE_URL !== 'https://' + ref + '.supabase.co') return false;
  try {
    if (!env.COTIRONDA_DATABASE_URL) return false;
    const db = new URL(env.COTIRONDA_DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.password) return false;
    const direct = db.hostname === 'db.' + ref + '.supabase.co' &&
      decodeURIComponent(db.username) === 'cotironda_app';
    const pooled = db.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(db.username) === 'cotironda_app.' + ref;
    return direct || pooled;
  } catch { return false; }
}
export function portalHabilitado(env: VariablesPortal): boolean {
  return env.COTIRONDA_REGISTRATION_ENABLED === 'true' &&
    origenSeguro(env.COTIRONDA_SITE_ORIGIN) &&
    credencialesCotironda(env);
}
