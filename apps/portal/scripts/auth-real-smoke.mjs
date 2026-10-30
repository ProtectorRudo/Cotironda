/**
 * E2E MANUAL: no crea usuarios ni empresas; nunca guarda tokens o contraseñas.
 * Requiere dos cuentas DEDICADAS de prueba, una confirmada y otra pendiente.
 * El hook debe estar habilitado antes de iniciar la prueba. NO usar cuentas personales:
 * el cierre global revoca todas las sesiones de las cuentas de ensayo.
 * Ejecutar en apps/portal: node scripts/auth-real-smoke.mjs
 */
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {verificarFirmaContraPostgrest} from '../../../src/server/auth-e2e-adversarial.ts';
import {validarEntornoE2E,cargaRpcNoPersistente,validarClaimsSesionFirmada} from '../../../src/server/auth-e2e-preflight.ts';
import {consultarCategoriasConJwt,comprobarCategoriasConSesionVigente,comprobarCategoriasConSesionRevocada,comprobarVigenciaTokenParaRevocacion} from '../../../src/server/auth-e2e-catalog-revocation.ts';

const args=validarEntornoE2E(process.env);
const events=[];
function record(name,status){events.push({name,status});}
function assert(cond,label){if(!cond)throw new Error(label);}
function makeClient(){
 return createClient(args.url,args.key,{
   auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}
 });
}
function safeRpcParams(){return cargaRpcNoPersistente(randomUUID());}

async function cerrarSesionComprobada(client,label,evidencia=null){
 // scope global revoca TODAS las sesiones de la cuenta dedicada de ensayo:
 // no utilizar esta herramienta con usuarios personales o comerciales.
 const {error:logoutError}=await client.auth.signOut({scope:'global'});
 assert(!logoutError,'Auth no pudo cerrar globalmente la sesión de '+label);
 const {data:{session},error:sessionError}=await client.auth.getSession();
 assert(!sessionError && session===null,'El cliente conserva la sesión después del cierre global');
 record('Auth recibió signOut global y SDK borró sesión local de '+label,'PASS');

 // La misma llamada GET con el MISMO access token ORIGINAL, sin refresh:
 // la respuesta 200 [] exige que el JWT firmado todavía se acepte por
 // PostgREST pero la guardia RLS de auth.sessions rechace su sesión.
 if(evidencia){
   comprobarVigenciaTokenParaRevocacion(evidencia.token,evidencia.sessionId);
   const despues=await consultarCategoriasConJwt({
     url:args.url,key:args.key,jwt:evidencia.token
   });
   comprobarCategoriasConSesionRevocada(despues);
   record('JWT real aún vigente pierde catálogo por RLS después del logout global','PASS');
 }
}

async function invalidSession(){
 const client=makeClient();
 const {data,error}=await client.rpc('register_company_for_current_user',safeRpcParams());
 assert(error && !data,'RPC anonima debe ser rechazada');
 record('RPC anonima bloqueada','PASS');
}
async function verifiedAccount(){
 const client=makeClient();
 let inicioValido=false;
 let evidenciaRls=null;
 try{
   const {data:loginData,error:loginError}=await client.auth.signInWithPassword(args.verified);
   assert(!loginError,'No se pudo iniciar sesión con la cuenta confirmada');
   inicioValido=true;
   const {data:userData,error:userError}=await client.auth.getUser();
   assert(!userError && userData.user && userData.user.email_confirmed_at &&
          !userData.user.is_anonymous,'Usuario verificado incorrecto');
   const {data:jwtData,error:claimError}=await client.auth.getClaims();
   assert(!claimError && jwtData.claims,'No se pudo validar el JWT');
   assert(jwtData.claims.sub===userData.user.id,'Sujeto JWT no coincide con Auth');
   const sessionId=validarClaimsSesionFirmada(jwtData.claims,userData.user.id);
   assert(jwtData.claims.cotironda_email_verified===true,
          'El hook no agregó un claim confirmado y firmado');
   record('JWT de usuario confirmado con claim firmado','PASS');

   // Prueba positiva y negativa NO enmascarada por el flag de registro.
   // La tabla catalog_categories tiene 5 rubros seed activos; sin empresas.
   // Solo hacemos GET por PostgREST; cero INSERT/UPDATE/DELETE/alta.
   const tokenOriginal=loginData.session?.access_token;
   comprobarVigenciaTokenParaRevocacion(tokenOriginal,sessionId);
   const antes=await consultarCategoriasConJwt({
     url:args.url,key:args.key,jwt:tokenOriginal
   });
   const cantidad=comprobarCategoriasConSesionVigente(antes);
   assert(cantidad>=1,'La prueba necesita al menos una categoría real');
   evidenciaRls={token:tokenOriginal,sessionId};
   record('JWT real de sesión vigente lee categorías por PostgREST y RLS','PASS');

   const {data,error}=await client.rpc('register_company_for_current_user',safeRpcParams());
   // Mientras flag SQL=false, incluso una sesión firmada no registra nada.
   assert(!data && error?.code==='42501' && /registro_no_habilitado/.test(error.message||''),
          'Se esperaba denegación de la cerradura SQL');
   record('RPC autenticada bloqueada por BD','PASS');
   assert(typeof loginData.session?.access_token==='string', 'Falta token autenticado para comprobar firma');
   await verificarFirmaContraPostgrest({url:args.url,key:args.key,
     token:loginData.session.access_token,requestId:randomUUID()}, fetch);
   record('JWT manipulado rechazado por Supabase antes de SQL','PASS');
 }finally{if(inicioValido)await cerrarSesionComprobada(client,'usuario confirmado',evidenciaRls);}
}
async function unverifiedAccount(){
 const client=makeClient();
 let inicioValido=false;
 try{
   const {error:loginError}=await client.auth.signInWithPassword(args.unverified);
   inicioValido=!loginError;
   if(loginError){
     assert(loginError.code==='email_not_confirmed' || /email not confirmed/i.test(loginError.message||''),
       'Error distinto al bloqueo esperado del correo sin confirmar');
     record('Login de correo sin confirmar bloqueado por Auth','PASS');
     return;
   }
   const {data:userData,error:userError}=await client.auth.getUser();
   assert(!userError && userData.user && !userData.user.email_confirmed_at,
     'La cuenta negativa se encuentra confirmada por error');
   const {data:jwtData,error:claimError}=await client.auth.getClaims();
   assert(!claimError && jwtData.claims?.cotironda_email_verified===false,
     'El hook debió emitir claim falso para correo sin confirmar');
   record('JWT de correo sin confirmar con claim falso','PASS');
   const {data,error}=await client.rpc('register_company_for_current_user',safeRpcParams());
   assert(!data && error,'RPC de correo sin confirmar no fue rechazada');
   record('RPC de correo sin confirmar bloqueada','PASS');
 }finally{if(inicioValido)await cerrarSesionComprobada(client,'usuario sin confirmar');}
}
try{
 await invalidSession();
 await verifiedAccount();
 await unverifiedAccount();
 console.log('E2E REAL COTIRONDA DEV: PASS');
 console.log(JSON.stringify({checks:events}));
}catch(e){
 console.error('E2E REAL COTIRONDA DEV: FAIL');
 console.error(e instanceof Error ? e.message : 'Error no reconocido');
 process.exitCode=1;
}
