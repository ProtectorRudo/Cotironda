/**
 * E2E MANUAL: no crea usuarios ni empresas; nunca guarda tokens o contraseñas.
 * Requiere dos cuentas preparadas por separado, una con correo confirmado y
 * otra pendiente. El hook debe estar habilitado antes de iniciar la prueba.
 * Ejecutar en apps/portal: node scripts/auth-real-smoke.mjs
 */
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {validarEntornoE2E,cargaRpcNoPersistente} from '../../../src/server/auth-e2e-preflight.ts';

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

async function invalidSession(){
 const client=makeClient();
 const {data,error}=await client.rpc('register_company_for_current_user',safeRpcParams());
 assert(error && !data,'RPC anonima debe ser rechazada');
 record('RPC anonima bloqueada','PASS');
}
async function verifiedAccount(){
 const client=makeClient();
 try{
   const {error:loginError}=await client.auth.signInWithPassword(args.verified);
   assert(!loginError,'No se pudo iniciar sesión con la cuenta confirmada');
   const {data:userData,error:userError}=await client.auth.getUser();
   assert(!userError && userData.user && userData.user.email_confirmed_at &&
          !userData.user.is_anonymous,'Usuario verificado incorrecto');
   const {data:jwtData,error:claimError}=await client.auth.getClaims();
   assert(!claimError && jwtData.claims,'No se pudo validar el JWT');
   assert(jwtData.claims.sub===userData.user.id,'Sujeto JWT no coincide con Auth');
   assert(jwtData.claims.cotironda_email_verified===true,
          'El hook no agregó un claim confirmado y firmado');
   record('JWT de usuario confirmado con claim firmado','PASS');

   const {data,error}=await client.rpc('register_company_for_current_user',safeRpcParams());
   // Mientras flag SQL=false, incluso una sesión firmada no registra nada.
   assert(!data && error?.code==='42501' && /registro_no_habilitado/.test(error.message||''),
          'Se esperaba denegación de la cerradura SQL');
   record('RPC autenticada bloqueada por BD','PASS');
 }finally{await client.auth.signOut({scope:'local'}).catch(()=>undefined);}
}
async function unverifiedAccount(){
 const client=makeClient();
 try{
   const {error:loginError}=await client.auth.signInWithPassword(args.unverified);
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
 }finally{await client.auth.signOut({scope:'local'}).catch(()=>undefined);}
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
