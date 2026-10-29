/**
 * Un único proyecto Auth exclusivo de Cotironda y un flag deliberado.
 * La creación usa JWT PostgREST: no requiere contraseña ni conexión SQL.
 */
export type VariablesPortal = Record<string,string|undefined>;
const refValida=/^[a-z]{20}$/;
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
 return refValida.test(ref) &&
   env.NEXT_PUBLIC_SUPABASE_URL==='https://'+ref+'.supabase.co' &&
   Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) &&
   !env.COTIRONDA_DATABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY;
}
export function portalHabilitado(env:VariablesPortal):boolean {
 return env.COTIRONDA_REGISTRATION_ENABLED==='true' &&
    origenSeguro(env.COTIRONDA_SITE_ORIGIN) &&
    credencialesCotironda(env);
}
