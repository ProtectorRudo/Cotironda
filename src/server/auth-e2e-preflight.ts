/** Preflight exclusivo de desarrollo, sin llamadas de red ni secretos impresos. */
export const SUPABASE_COTIRONDA_DEV_REF = 'qkercsoqhehbenbbncwk';
export const SUPABASE_COTIRONDA_DEV_URL = 'https://' + SUPABASE_COTIRONDA_DEV_REF + '.supabase.co';

export function validarEntornoE2E(env: Record<string,string|undefined>) {
  // Cuentas de ensayo autenticas solo en equipo privado y entorno local.
  // Nunca habilitar credenciales reales en runners, Preview ni Vercel.
  if (env.GITHUB_ACTIONS==='true' || env.CI==='true' || env.VERCEL==='1') {
    throw new Error('auth_e2e_entorno_remoto_bloqueado');
  }
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
  if(vPassword.length<12||uPassword.length<12)throw new Error('passwords_prueba_invalidos');
  // Dos cuentas con un mismo secreto crean riesgo de exposición cruzada.
  if(vPassword===uPassword)throw new Error('passwords_prueba_reutilizados');
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


/** Validación estructural adicional sobre getClaims() (firma verificada por SDK).
 * No equivale a consultar auth.sessions ni a probar revocación del JWT.
 */
export function validarClaimsSesionFirmada(claims:unknown,userId:string):string {
  if(!claims || typeof claims!=='object' || Array.isArray(claims)){
    throw new Error('jwt_sin_claims');
  }
  const c=claims as Record<string,unknown>;
  if(c.sub!==userId || c.role!=='authenticated' ||
     c.is_anonymous!==false || c.cotironda_email_verified!==true){
    throw new Error('jwt_identidad_no_verificada');
  }
  const id=c.session_id;
  if(typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){
    throw new Error('jwt_sin_session_id_valido');
  }
  return id;
}

/** Nunca imprimir errores externos (SDK/red) o variables del entorno del E2E.
 * Mantener solo códigos controlados por Cotironda; sin secretos ni respuestas Auth. */
const ERRORES_SEGUROS_E2E=new Set([
  'proyecto_fuera_de_entorno_cotironda_dev',
  'clave_publicable_invalida',
  'pruebas_auth_no_habilitadas',
  'cuentas_prueba_invalidas',
  'passwords_prueba_invalidos',
  'passwords_prueba_reutilizados',
  'cuentas_ficticias_no_utilizables',
  'auth_e2e_entorno_remoto_bloqueado',
  'catalogo_no_disponible',
  'catalogo_http_inesperado',
  'catalogo_respuesta_invalida',
  'catalogo_vigente_no_visible',
  'catalogo_formato_incorrecto',
  'catalogo_categoria_invalida',
  'jwt_revocado_todavia_lee_catalogo',
  'jwt_no_valido_para_prueba',
  'jwt_no_apto_para_comparar_revocacion',
  'token_jwt_ausente',
  'entorno_cotironda_dev_incorrecto'
]);
export function codigoSeguroE2E(error:unknown):string {
  const codigo=error instanceof Error ? error.message : '';
  return ERRORES_SEGUROS_E2E.has(codigo) ? codigo : 'fallo_e2e_revisar_entorno_privado';
}
