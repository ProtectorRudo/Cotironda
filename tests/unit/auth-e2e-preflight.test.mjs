import test from 'node:test';
import assert from 'node:assert/strict';
import {validarEntornoE2E,cargaRpcNoPersistente,validarClaimsSesionFirmada,SUPABASE_COTIRONDA_DEV_URL} from '../../src/server/auth-e2e-preflight.ts';
const valid={
  COTIRONDA_E2E_SUPABASE_URL:SUPABASE_COTIRONDA_DEV_URL,
  COTIRONDA_E2E_PROJECT_REF:'qkercsoqhehbenbbncwk',
  COTIRONDA_E2E_PUBLISHABLE_KEY:'sb_publishable_test_not_a_real_key',
  COTIRONDA_E2E_ALLOW_AUTH_REQUESTS:'true',
  COTIRONDA_E2E_VERIFIED_EMAIL:'verified@cotironda-test.invalid.local',
  COTIRONDA_E2E_VERIFIED_PASSWORD:'ci-only-verified-demo-secret-01',
  COTIRONDA_E2E_UNVERIFIED_EMAIL:'unverified@cotironda-test.invalid.local',
  COTIRONDA_E2E_UNVERIFIED_PASSWORD:'ci-only-unverified-demo-secret-02'
};
test('preflight válido devuelve entorno Cotironda y no inventa credenciales',()=>{
 const out=validarEntornoE2E(valid);
 assert.equal(out.url,SUPABASE_COTIRONDA_DEV_URL);
 assert.equal(out.verified.email,valid.COTIRONDA_E2E_VERIFIED_EMAIL);
});
test('bloquea supabase de otro negocio',()=>{
 assert.throws(()=>validarEntornoE2E({...valid,COTIRONDA_E2E_SUPABASE_URL:'https://zzzzzzzzzzzzzzzzzzzz.supabase.co'}),/proyecto_fuera/);
});
test('bloquea referencia falsificada',()=>{
 assert.throws(()=>validarEntornoE2E({...valid,COTIRONDA_E2E_PROJECT_REF:'zzzzzzzzzzzzzzzzzzzz'}),/proyecto_fuera/);
});
test('pruebas reales requieren consentimiento deliberado con bandera',()=>{
 assert.throws(()=>validarEntornoE2E({...valid,COTIRONDA_E2E_ALLOW_AUTH_REQUESTS:'false'}),/no_habilitadas/);
});
test('nunca acepta clave secreta de Supabase',()=>{
 assert.throws(()=>validarEntornoE2E({...valid,COTIRONDA_E2E_PUBLISHABLE_KEY:'sb_secret_test'}),/publicable_invalida/);
});
test('requiere dos correos distintos',()=>{
 assert.throws(()=>validarEntornoE2E({...valid,COTIRONDA_E2E_UNVERIFIED_EMAIL:valid.COTIRONDA_E2E_VERIFIED_EMAIL}),/cuentas_prueba/);
});
test('requiere contraseñas mínimas sin imprimirlas',()=>{
 assert.throws(()=>validarEntornoE2E({...valid,COTIRONDA_E2E_VERIFIED_PASSWORD:'a'}),/passwords_prueba/);
});
test('bloquea reutilización de contraseñas entre las dos cuentas de prueba',()=>{
 const mismo=valid.COTIRONDA_E2E_VERIFIED_PASSWORD;
 assert.throws(
  ()=>validarEntornoE2E({...valid,COTIRONDA_E2E_UNVERIFIED_PASSWORD:mismo}),
  e=>e.message==='passwords_prueba_reutilizados'&&!e.message.includes(mismo)
 );
});

test('rechaza contraseñas demasiado cortas de cualquiera de las cuentas',()=>{
 for(const patch of [
  {COTIRONDA_E2E_VERIFIED_PASSWORD:'demo-short'},
  {COTIRONDA_E2E_UNVERIFIED_PASSWORD:'demo-short'}
 ]){
  assert.throws(()=>validarEntornoE2E({...valid,...patch}),/passwords_prueba_invalidos/);
 }
});

test('nunca realiza preflight con secretos auténticos en GitHub Actions/CI/Vercel',()=>{
 for(const patch of [
  {GITHUB_ACTIONS:'true'},
  {CI:'true'},
  {VERCEL:'1'}
 ]){
  assert.throws(
   ()=>validarEntornoE2E({...valid,...patch}),
   e=>e.message==='auth_e2e_entorno_remoto_bloqueado'
  );
 }
});

test('errores de preflight nunca incluyen correos, passwords ni keys',()=>{
 const sensitive=[
  valid.COTIRONDA_E2E_VERIFIED_EMAIL,
  valid.COTIRONDA_E2E_UNVERIFIED_EMAIL,
  valid.COTIRONDA_E2E_VERIFIED_PASSWORD,
  valid.COTIRONDA_E2E_UNVERIFIED_PASSWORD,
  valid.COTIRONDA_E2E_PUBLISHABLE_KEY
 ];
 for(const patch of [
  {COTIRONDA_E2E_VERIFIED_PASSWORD:'demo-short'},
  {COTIRONDA_E2E_UNVERIFIED_PASSWORD:valid.COTIRONDA_E2E_VERIFIED_PASSWORD},
  {COTIRONDA_E2E_PROJECT_REF:'unknown'},
  {COTIRONDA_E2E_ALLOW_AUTH_REQUESTS:'false'}
 ]){
  try{validarEntornoE2E({...valid,...patch});assert.fail('debe fallar cerrado')}
  catch(e){for(const secret of sensitive)assert.ok(!e.message.includes(secret))}
 }
});

test('bloquea cuentas de relleno example.invalid',()=>{
 assert.throws(()=>validarEntornoE2E({...valid,COTIRONDA_E2E_VERIFIED_EMAIL:'mock@example.invalid'}),/ficticias/);
});
test('carga de prueba no puede producir registros incluso con DB abierta',()=>{
 const out=cargaRpcNoPersistente('123e4567-e89b-42d3-a456-426614174999');
 assert.equal(out.p_name.length,1);
 assert.deepEqual(Object.keys(out).sort(),['p_name','p_request_id','p_trade_name','p_type']);
 assert.equal(out.p_type,'buyer');
});

const usuarioReal='123e4567-e89b-42d3-a456-426614174000';
const claimsBien={
  sub:usuarioReal,role:'authenticated',is_anonymous:false,
  cotironda_email_verified:true,session_id:'123e4567-e89b-42d3-a456-426614174002'
};
test('exige session_id UUID y sujeto del usuario autenticado',()=>{
 assert.equal(validarClaimsSesionFirmada(claimsBien,usuarioReal),claimsBien.session_id);
 for(const claims of [
  {...claimsBien,session_id:null},{...claimsBien,session_id:'falso'},
  {...claimsBien,sub:'123e4567-e89b-42d3-a456-426614174005'},
  {...claimsBien,is_anonymous:true},
  {...claimsBien,cotironda_email_verified:false},
  {...claimsBien,role:'anon'}
 ])assert.throws(()=>validarClaimsSesionFirmada(claims,usuarioReal),/jwt_/);
});
test('no acepta claims ausentes, anónimos o enviados sin estructura',()=>{
 for(const candidate of [null,undefined,[], 'texto',{}])
  assert.throws(()=>validarClaimsSesionFirmada(candidate,usuarioReal),/jwt_/);
});
