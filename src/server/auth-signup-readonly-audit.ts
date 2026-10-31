import {COTIRONDA_DEV_REF} from './portal-entorno.ts';

/**
 * Solo GET a la configuración pública de Supabase GoTrue.
 * Nunca crea usuarios, envía correos, obtiene tokens ni realiza escrituras.
 * No retorna el body ni datos de Auth: solo evaluación sanitizada.
 *
 * IMPORTANTE: la configuración de signup Auth y la de empresas Cotironda
 * son independientes. El servidor SQL mantiene el registro de empresas cerrado.
 */
export type ResultadoAuthSignup =
  | {estado:'PASS';codigo:'autorregistro_auth_bloqueado'}
  | {estado:'FAIL';codigo:'autorregistro_auth_habilitado'}
  | {estado:'INCONCLUSO';codigo:'configuracion_no_verificable'};

export type EntradaConsultaAuth=Readonly<{
  projectRef:string;
  url:string;
  publishableKey:string;
}>;

const DESCONOCIDO:ResultadoAuthSignup={
  estado:'INCONCLUSO',codigo:'configuracion_no_verificable'
};

export async function comprobarRegistroAuthSoloLectura(
  entrada:EntradaConsultaAuth,
  transporte:typeof fetch=fetch
):Promise<ResultadoAuthSignup>{
  if(entrada.projectRef!==COTIRONDA_DEV_REF ||
     entrada.url!=='https://'+COTIRONDA_DEV_REF+'.supabase.co' ||
     !entrada.publishableKey.startsWith('sb_publishable_') ||
     entrada.publishableKey.length>256 ||
     entrada.publishableKey.length<18){
    return DESCONOCIDO;
  }

  try{
    const response=await transporte(entrada.url+'/auth/v1/settings',{
      method:'GET',
      credentials:'omit',
      cache:'no-store',
      redirect:'error',
      referrerPolicy:'no-referrer',
      headers:{
        apikey:entrada.publishableKey,
        accept:'application/json'
      },
      signal:AbortSignal.timeout(6500)
    });

    // HTTP 200 es requisito. Un error del gateway, HTML o redirect no demuestra
    // que el autorregistro esté bloqueado.
    if(response.status!==200 || response.redirected ||
       !response.headers.get('content-type')?.toLowerCase().includes('application/json')){
      return DESCONOCIDO;
    }
    const length=response.headers.get('content-length');
    if(length!==null && (+length>16_384 || !/^\d+$/.test(length))){
      return DESCONOCIDO;
    }
    const body=await response.text();
    if(body.length===0 || body.length>16_384)return DESCONOCIDO;
    const settings:unknown=JSON.parse(body);
    if(!settings || typeof settings!=='object' || Array.isArray(settings)){
      return DESCONOCIDO;
    }
    const blocked=(settings as Record<string,unknown>).disable_signup;
    if(blocked===true)return {estado:'PASS',codigo:'autorregistro_auth_bloqueado'};
    if(blocked===false)return {estado:'FAIL',codigo:'autorregistro_auth_habilitado'};
    return DESCONOCIDO;
  }catch{
    // Errores CORS/red, timeout o JSON inválido: nunca deducir un PASS.
    return DESCONOCIDO;
  }
}
