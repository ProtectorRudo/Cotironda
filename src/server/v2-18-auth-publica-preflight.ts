/** Cotironda V2-18: diagnóstico exclusivamente público de GoTrue PILOTO.
 * No usa service_role, no env privadas, no números ni mensajes WhatsApp.
 * Su éxito SOLO indica configuración SMS anunciada, nunca SMS entregado.
 */
import {configuracionSmsInicialV2Lista}
 from './v2-07-primer-comprador-auth.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const KEY=/^sb_publishable_[A-Za-z0-9_-]{15,256}$/u;
export type ResultadoAuthPublicaV2=Readonly<{
 state:'BLOCKED'|'SETTINGS_READY_REQUIRES_REAL_SMS';
 code:string;
 serviceAccessible:boolean;
 signupClosed:boolean;
 phoneConfigured:boolean;
 smsConfirmedByUser:false;
 writesPerformed:false;
}>;
function status(state:ResultadoAuthPublicaV2['state'],code:string,
 accessible=false,signupClosed=false,phoneConfigured=false
):ResultadoAuthPublicaV2{
 return Object.freeze({state,code,serviceAccessible:accessible,
  signupClosed,phoneConfigured,smsConfirmedByUser:false,
  writesPerformed:false});
}
export async function comprobarAuthPublicaPilotoV2(
 url:string,publishableKey:string,fetchImpl:typeof fetch=fetch
):Promise<ResultadoAuthPublicaV2>{
 if(url!==PILOT||typeof publishableKey!=='string'||
  !KEY.test(publishableKey))
  return status('BLOCKED','url_o_publicable_key_incorrecta');
 try{
  const res=await fetchImpl(PILOT+'/auth/v1/settings',{
   method:'GET',cache:'no-store',credentials:'omit',redirect:'error',
   headers:{apikey:publishableKey,accept:'application/json'},
   signal:AbortSignal.timeout(7000)
  });
  if(res.status!==200)
   return status('BLOCKED','auth_settings_http_denegado');
  if(!res.headers.get('content-type')?.toLowerCase().includes('application/json'))
   return status('BLOCKED','auth_settings_no_json');
  const body=await res.text();
  if(body.length<10||body.length>8192)
   return status('BLOCKED','auth_settings_tamano_invalido');
  let cfg:unknown;
  try{cfg=JSON.parse(body)}catch{
   return status('BLOCKED','auth_settings_json_invalido');
  }
  if(!cfg||typeof cfg!=='object'||Array.isArray(cfg))
   return status('BLOCKED','auth_settings_invalido');
  const s=cfg as Record<string,unknown>;
  const signupClosed=s.disable_signup===true;
  const phoneConfigured=configuracionSmsInicialV2Lista(cfg);
  if(!phoneConfigured)
   return status('BLOCKED','sms_o_registro_go_true_no_seguros',
    true,signupClosed,false);
  return status('SETTINGS_READY_REQUIRES_REAL_SMS',
   'configuracion_auth_publica_compatible',true,true,true);
 }catch{
  return status('BLOCKED','auth_settings_no_disponible');
 }
}
