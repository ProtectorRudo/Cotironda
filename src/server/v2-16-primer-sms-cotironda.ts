/** Cotironda V2-16: primer SMS del arquitecto previamente dado de alta
 * por operador, sin abrir signup ni confirmar el teléfono artificialmente.
 *
 * GoTrue /otp, con shouldCreateUser:false, trata el teléfono aún sin confirmar
 * como alta pendiente y deriva a /signup. Con disable_signup=true, /signup
 * rechaza con signup_disabled. /resend {type:'sms'} puede enviar el OTP de
 * confirmación de esa cuenta YA EXISTENTE, sin permitir nuevas altas.
 *
 * No registra números, errores del proveedor ni información de existencia.
 */
export type ResultadoEnvioSmsV2=Readonly<{error?:{code?:string|null}|null}>;
export type PuertoSmsV2=Readonly<{
 inicio:()=>Promise<ResultadoEnvioSmsV2>;
 confirmarAltaPendiente:()=>Promise<ResultadoEnvioSmsV2>;
}>;
export async function solicitarSmsCompradorV2(
 puertos:PuertoSmsV2
):Promise<boolean>{
 try{
  const principal=await puertos.inicio();
  if(!principal||typeof principal!=='object')return false;
  if(principal.error==null)return true;
  // Único fallback permitido: registro cerrado y usuario no confirmado.
  // No reinterpretar rate limits, errores de red, proveedor ni OTP genérico
  // como consentimiento para disparar SMS adicional.
  if(principal.error.code!=='signup_disabled')return false;
  const confirmacion=await puertos.confirmarAltaPendiente();
  return !!confirmacion&&confirmacion.error==null;
 }catch{return false}
}
