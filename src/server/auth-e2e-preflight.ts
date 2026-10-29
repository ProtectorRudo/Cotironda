/** Preflight exclusivo de desarrollo, sin llamadas de red ni secretos impresos. */
export const SUPABASE_COTIRONDA_DEV_REF = 'qkercsoqhehbenbbncwk';
export const SUPABASE_COTIRONDA_DEV_URL = 'https://' + SUPABASE_COTIRONDA_DEV_REF + '.supabase.co';

export function validarEntornoE2E(env: Record<string,string|undefined>) {
  if (env.COTIRONDA_E2E_SUPABASE_URL !== SUPABASE_COTIRONDA_DEV_URL ||
      env.COTIRONDA_E2E_PROJECT_REF !== SUPABASE_COTIRONDA_DEV_REF) {
    throw new Error('proyecto_fuera_de_entorno_cotironda_dev');
  }
  if (!env.COTIRONDA_E2E_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
    throw new Error('clave_publicable_invalida');
  }
  if (env.COTIRONDA_E2E_ALLOW_AUTH_REQUESTS !== 'true') {
    throw new Error('pruebas_auth_no_habilitadas');
  }
  const vEmail=env.COTIRONDA_E2E_VERIFIED_EMAIL||'';
  const uEmail=env.COTIRONDA_E2E_UNVERIFIED_EMAIL||'';
  const vPassword=env.COTIRONDA_E2E_VERIFIED_PASSWORD||'';
  const uPassword=env.COTIRONDA_E2E_UNVERIFIED_PASSWORD||'';
  const emailValido=(s:string)=> /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length<=254;
  if(!emailValido(vEmail)||!emailValido(uEmail)||vEmail.toLowerCase()===uEmail.toLowerCase()) {
    throw new Error('cuentas_prueba_invalidas');
  }
  if(vPassword.length<8||uPassword.length<8)throw new Error('passwords_prueba_invalidos');
  if(vEmail.endsWith('@example.invalid')||uEmail.endsWith('@example.invalid')) {
    throw new Error('cuentas_ficticias_no_utilizables');
  }
  return {
    url:SUPABASE_COTIRONDA_DEV_URL,
    key:env.COTIRONDA_E2E_PUBLISHABLE_KEY,
    verified:{email:vEmail,password:vPassword},
    unverified:{email:uEmail,password:uPassword}
  };
}

/** Una llamada de E2E nunca puede generar una empresa aunque el flag DB
 * fuera activado por error: el nombre 1 caracter es inválido por dominio. */
export function cargaRpcNoPersistente(requestId:string) {
  return {
    p_request_id:requestId,
    p_name:'X',
    p_type:'buyer',
    p_trade_name:null
  };
}
