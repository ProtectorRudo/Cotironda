import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consultarCategoriasConJwt,comprobarCategoriasConSesionVigente,
  comprobarCategoriasConSesionRevocada,comprobarVigenciaTokenParaRevocacion,
  COTIRONDA_CATEGORIAS_E2E_URL,RUTA_CATEGORIAS_E2E
} from '../../src/server/auth-e2e-catalog-revocation.ts';
import {readFileSync} from 'node:fs';

const url='https://qkercsoqhehbenbbncwk.supabase.co';
const key='sb_publishable_ci_sintetica_no_secreto_cotironda';
const sid='11111111-1111-4111-8111-111111111111';
const now=Math.floor(Date.now()/1000);
const jwt=(changes={})=>{
 const payload={session_id:sid,role:'authenticated',exp:now+3600,
   sub:'22222222-2222-4222-8222-222222222222',...changes};
 return Buffer.from(JSON.stringify({typ:'JWT',alg:'HS256'})).toString('base64url')+'.'+
  Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+
  'fake_signature_for_offline_tests_only_1234567890';
};
const token=jwt();
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});

test('el E2E consulta solo SELECT de categorías en el proyecto exacto',async()=>{
 assert.equal(RUTA_CATEGORIAS_E2E,'/rest/v1/catalog_categories?select=code&is_active=eq.true&order=code.asc');
 assert.equal(COTIRONDA_CATEGORIAS_E2E_URL,url+RUTA_CATEGORIAS_E2E);
 let calls=0;
 const data=await consultarCategoriasConJwt({url,key,jwt:token,transporte:async(input,options)=>{
   calls++;
   assert.equal(input,url+RUTA_CATEGORIAS_E2E);
   assert.equal(options.method,'GET');
   assert.equal(options.headers.apikey,key);
   assert.equal(options.headers.authorization,'Bearer '+token);
   assert.equal(options.headers['cache-control'],'no-store');
   assert.equal(options.credentials,'omit');
   assert.equal(options.cache,'no-store');
   assert.equal(options.redirect,'error');
   return response([{code:'corralon'},{code:'sanitarios'}]);
 }});
 assert.equal(calls,1);
 assert.equal(comprobarCategoriasConSesionVigente(data),2);
});

test('login válido debe leer al menos un rubro autorizado; no confundir [] con una prueba positiva',()=>{
 assert.throws(()=>comprobarCategoriasConSesionVigente([]),/catalogo_vigente_no_visible/);
 assert.throws(()=>comprobarCategoriasConSesionVigente(null),/catalogo_vigente_no_visible/);
 assert.throws(()=>comprobarCategoriasConSesionVigente({code:'corralon'}),/catalogo_vigente_no_visible/);
 assert.equal(comprobarCategoriasConSesionVigente([{code:'corralon'}]),1);
 assert.throws(()=>comprobarCategoriasConSesionVigente([{code:'corralon'},{code:'corralon'}]),/catalogo_categoria_invalida/);
 assert.throws(()=>comprobarCategoriasConSesionVigente([{code:'corralon',whatsapp:'no'}]),/catalogo_formato_incorrecto/);
});

test('después de logout solo HTTP 200 + [] prueba negación RLS con JWT anterior',async()=>{
 assert.doesNotThrow(()=>comprobarCategoriasConSesionRevocada([]));
 for(const result of [[{code:'corralon'}],{code:'test'},null,'',true]){
  assert.throws(()=>comprobarCategoriasConSesionRevocada(result),/jwt_revocado_todavia_lee_catalogo/);
 }
 for(const code of [401,403,404,500]){
  await assert.rejects(
   consultarCategoriasConJwt({url,key,jwt:token,transporte:async()=>response({message:'auth_failed'},code)}),
   /catalogo_http_inesperado/
  );
 }
});

test('no acepta otro Supabase, apikey privada, token ausente ni respuestas corruptas',async()=>{
 let called=false;
 const spy=async()=>{called=true;return response([])};
 for(const config of [
  {url:'https://otro-proyecto.supabase.co',key,jwt:token},
  {url,key:'sb_secret_no',jwt:token},
  {url,key,jwt:'bad'},
 ]){
  await assert.rejects(consultarCategoriasConJwt({...config,transporte:spy}));
 }
 assert.equal(called,false,'Los preflight inválidos no deben originar requests');
 await assert.rejects(
  consultarCategoriasConJwt({url,key,jwt:token,transporte:async()=>new Response('not-json',{status:200})}),
  /catalogo_respuesta_invalida/
 );
 await assert.rejects(
  consultarCategoriasConJwt({url,key,jwt:token,transporte:async()=>{throw new Error('SENSITIVE_INTERNAL_TOKEN')}}),
  /catalogo_no_disponible/
 );
});

test('token antiguo debe mantener al menos dos minutos de exp incluso tras logout',()=>{
 assert.doesNotThrow(()=>comprobarVigenciaTokenParaRevocacion(token,sid,now));
 for(const invalid of [
  jwt({exp:now+119}),
  jwt({exp:now-10}),
  jwt({exp:'mañana'}),
  jwt({session_id:'33333333-3333-4333-8333-333333333333'}),
  jwt({role:'anon'}),
  'invalido',
 ])assert.throws(()=>comprobarVigenciaTokenParaRevocacion(invalid,sid,now),/jwt_no_apto_para_comparar_revocacion|jwt_no_valido_para_prueba/);
});

test('runner real exige autenticación comprobada antes del GET y compara MISMO JWT después del signout global',()=>{
 const script=readFileSync(new URL('../../apps/portal/scripts/auth-real-smoke.mjs',import.meta.url),'utf8');
 const indexLogin=script.indexOf('signInWithPassword(args.verified)');
 const indexClaim=script.indexOf('validarClaimsSesionFirmada(jwtData.claims');
 const indexRead=script.indexOf('comprobarCategoriasConSesionVigente(antes)');
 const indexLogout=script.indexOf("signOut({scope:'global'})");
 const indexRevoked=script.indexOf('comprobarCategoriasConSesionRevocada(despues)');
 assert.ok(indexLogin>=0&&indexClaim>indexLogin&&indexRead>indexClaim);
 assert.ok(indexLogout>=0&&indexRevoked>indexLogout);
 assert.match(script,/jwt:evidencia.token/);
 assert.match(script,/evidenciaRls=\{token:tokenOriginal,sessionId\}/);
 assert.match(script,/finally\{if\(inicioValido\)await cerrarSesionComprobada/);
 assert.doesNotMatch(script,/console\.log\((?:loginData|tokenOriginal|args\.verified|sessionId)/);
});
