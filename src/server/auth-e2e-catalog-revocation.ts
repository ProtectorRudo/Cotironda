/**
 * Verificación segura de revocación RLS con JWT REAL de Supabase Auth.
 * Exclusivamente GET del catálogo de categorías fijo de cotironda-dev.
 * No realiza RPC, INSERT, UPDATE, DELETE, signup ni guarda tokens.
 */
import {SUPABASE_COTIRONDA_DEV_URL} from './auth-e2e-preflight.ts';

export const RUTA_CATEGORIAS_E2E='/rest/v1/catalog_categories?select=code&is_active=eq.true&order=code.asc';
export const COTIRONDA_CATEGORIAS_E2E_URL=SUPABASE_COTIRONDA_DEV_URL+RUTA_CATEGORIAS_E2E;

export type ObtenerCatalogo = typeof fetch;

function validarEntrada(url:string,key:string,jwt:string):void {
  if(url!==SUPABASE_COTIRONDA_DEV_URL)throw new Error('entorno_cotironda_dev_incorrecto');
  if(!key.startsWith('sb_publishable_')||key.length<22)throw new Error('clave_publicable_invalida');
  if(typeof jwt!=='string'||jwt.length<80||jwt.split('.').length!==3) {
    throw new Error('token_jwt_ausente');
  }
}

/**
 * Permite probar seguridad sin una empresa ficticia ni escrituras:
 * catalog_categories contiene categorías públicas para authenticated, pero
 * RLS exige sesión en auth.sessions tras migración 12.
 */
export async function consultarCategoriasConJwt({
  url,key,jwt,transporte=fetch
}:{
  url:string;key:string;jwt:string;transporte?:ObtenerCatalogo;
}):Promise<unknown>{
  validarEntrada(url,key,jwt);
  let respuesta:Response;
  try{
    respuesta=await transporte(COTIRONDA_CATEGORIAS_E2E_URL,{
      method:'GET',
      headers:{
        apikey:key,
        authorization:'Bearer '+jwt,
        accept:'application/json',
        'cache-control':'no-store'
      },
      redirect:'error',
      credentials:'omit',
      cache:'no-store',
      signal:AbortSignal.timeout(7000)
    });
  }catch{
    throw new Error('catalogo_no_disponible');
  }
  // Exigir 200 evita que 401 por JWT vencido simule una revocación RLS exitosa.
  if(respuesta.status!==200)throw new Error('catalogo_http_inesperado');
  try{return await respuesta.json();}
  catch{throw new Error('catalogo_respuesta_invalida');}
}

export function comprobarCategoriasConSesionVigente(data:unknown):number {
  if(!Array.isArray(data)||data.length===0)throw new Error('catalogo_vigente_no_visible');
  const seen=new Set<string>();
  for(const row of data){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       Object.keys(row).length!==1 ||
       typeof (row as Record<string,unknown>).code!=='string') {
      throw new Error('catalogo_formato_incorrecto');
    }
    const code=(row as {code:string}).code;
    if(!/^[a-z][a-z0-9_]{1,49}$/.test(code)||seen.has(code)) {
      throw new Error('catalogo_categoria_invalida');
    }
    seen.add(code);
  }
  return seen.size;
}

export function comprobarCategoriasConSesionRevocada(data:unknown):void {
  // [] con HTTP 200 significa JWT aún reconocido, pero RLS ya no muestra filas.
  // 401/403, JSON de error, null o errores de red NO cuentan como éxito.
  if(!Array.isArray(data)||data.length!==0)throw new Error('jwt_revocado_todavia_lee_catalogo');
}

export function comprobarVigenciaTokenParaRevocacion(
  jwt:string,sessionId:string,fechaSegundos=Math.floor(Date.now()/1000)
):void {
  if(typeof jwt!=='string'||jwt.split('.').length!==3)throw new Error('jwt_no_valido_para_prueba');
  try{
    const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString('utf8'));
    if(!claims||typeof claims!=='object'||claims.session_id!==sessionId||
       claims.role!=='authenticated'||typeof claims.exp!=='number'||
       !Number.isFinite(claims.exp)||claims.exp-fechaSegundos<120){
      throw new Error('jwt_no_apto_para_comparar_revocacion');
    }
  }catch{
    throw new Error('jwt_no_apto_para_comparar_revocacion');
  }
  // La firma de este JWT ya fue verificada por getClaims() en el runner:
  // leer claims acá solo descarta confusión con expiración cercana.
}
