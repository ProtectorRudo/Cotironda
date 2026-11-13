/** V2-18 -- solo lectura GoTrue PILOTO, sin usuario, SMS ni escrituras.
 * Operador: node --experimental-strip-types scripts/v2-auth-pilot-preflight.mjs
 * Recibe SOLO COTIRONDA_PILOT_SUPABASE_URL y
 * COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY del gestor seguro del operador.
 * Jamás imprimir la key, tokens, teléfono, JSON de proveedor ni errores HTTP.
 */
import {comprobarAuthPublicaPilotoV2}
 from '../../../src/server/v2-18-auth-publica-preflight.ts';

try{
 const result=await comprobarAuthPublicaPilotoV2(
  process.env.COTIRONDA_PILOT_SUPABASE_URL??'',
  process.env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY??''
 );
 process.stdout.write(JSON.stringify(result)+'\n');
 if(result.state==='BLOCKED')process.exitCode=2;
}catch{
 process.stdout.write(JSON.stringify({
  state:'BLOCKED',code:'preflight_sin_conexion',
  serviceAccessible:false,signupClosed:false,phoneConfigured:false,
  smsConfirmedByUser:false,writesPerformed:false
 })+'\n');
 process.exitCode=2;
}
