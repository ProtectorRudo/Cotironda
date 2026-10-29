import { Buffer } from 'node:buffer';
import { SUPABASE_COTIRONDA_DEV_URL } from './auth-e2e-preflight.ts';

/** Ataque de prueba: modifica el sujeto de un JWT sin resignarlo.
 * Un PostgREST que comprueba la firma DEBE rechazar esta petición.
 * Nunca se registra ni se devuelve el token original o el modificado. */
export function jwtConSujetoManipulado(token: string): string {
  const partes=token.split('.');
  if(partes.length!==3 || partes.some(p=>p.length===0)) throw new Error('jwt_formato_invalido');
  let payload:Record<string,unknown>;
  try {
    const parsed:unknown=JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))throw new Error('formato');
    payload=parsed as Record<string,unknown>;
  }catch{throw new Error('jwt_payload_invalido');}
  if(typeof payload.sub!=='string'||!payload.sub)throw new Error('jwt_sin_sujeto');
  const nuevo=payload.sub==='00000000-0000-4000-8000-000000000001'
    ? '00000000-0000-4000-8000-000000000002'
    : '00000000-0000-4000-8000-000000000001';
  const alterado=Buffer.from(JSON.stringify({...payload,sub:nuevo})).toString('base64url');
  return partes[0]+'.'+alterado+'.'+partes[2];
}

type ResultadoHttp = {status:number;json():Promise<unknown>};
type Transporte = (url:string,init:RequestInit)=>Promise<ResultadoHttp>;

/** Devuelve éxito únicamente si la API rechaza el JWT por problemas de
 * autenticación, NO por una validación de campos o por el flag SQL apagado.
 * El body es inválido por diseño: jamás puede crear una empresa. */
export async function verificarFirmaContraPostgrest(
  params:{url:string;key:string;token:string;requestId:string},
  transport:Transporte
):Promise<void>{
  if(params.url!==SUPABASE_COTIRONDA_DEV_URL){
    throw new Error('endpoint_no_es_supabase');
  }
  if(!params.key.startsWith('sb_publishable_'))throw new Error('clave_invalida');
  const jwt=jwtConSujetoManipulado(params.token);
  const response=await transport(params.url+'/rest/v1/rpc/register_company_for_current_user',{
    method:'POST',
    headers:{
      apikey:params.key,
      authorization:'Bearer '+jwt,
      'content-type':'application/json'
    },
    body:JSON.stringify({p_request_id:params.requestId,p_name:'X',p_type:'buyer',p_trade_name:null}),
    cache:'no-store'
  });
  let data:unknown=null;
  try{data=await response.json();}catch{}
  const detail=typeof data==='object' && data!==null && !Array.isArray(data)
    ? data as Record<string,unknown> : {};
  const message=[detail.message,detail.msg,detail.error,detail.code].filter(x=>typeof x==='string').join(' ');
  // La autorización no debe llegar siquiera al validador del registro.
  if(![401,403].includes(response.status) ||
     !/(jwt|token|signature|pgrst301|pgrst302|invalid.*auth)/i.test(message)){
    throw new Error('jwt_manipulado_no_rechazado_por_auth');
  }
}
