import test from 'node:test';
import assert from 'node:assert/strict';
import {validarEntornoE2E,cargaRpcNoPersistente,SUPABASE_COTIRONDA_DEV_URL} from '../../src/server/auth-e2e-preflight.ts';
const valid={
  COTIRONDA_E2E_SUPABASE_URL:SUPABASE_COTIRONDA_DEV_URL,
  COTIRONDA_E2E_PROJECT_REF:'qkercsoqhehbenbbncwk',
  COTIRONDA_E2E_PUBLISHABLE_KEY:'sb_publishable_test_not_a_real_key',
  COTIRONDA_E2E_ALLOW_AUTH_REQUESTS:'true',
  COTIRONDA_E2E_VERIFIED_EMAIL:'verified@cotironda-test.invalid.local',
  COTIRONDA_E2E_VERIFIED_PASSWORD:'pass1234567',
  COTIRONDA_E2E_UNVERIFIED_EMAIL:'unverified@cotironda-test.invalid.local',
  COTIRONDA_E2E_UNVERIFIED_PASSWORD:'pass1234567'
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
test('bloquea cuentas de relleno example.invalid',()=>{
 assert.throws(()=>validarEntornoE2E({...valid,COTIRONDA_E2E_VERIFIED_EMAIL:'mock@example.invalid'}),/ficticias/);
});
test('carga de prueba no puede producir registros incluso con DB abierta',()=>{
 const out=cargaRpcNoPersistente('123e4567-e89b-42d3-a456-426614174999');
 assert.equal(out.p_name.length,1);
 assert.deepEqual(Object.keys(out).sort(),['p_name','p_request_id','p_trade_name','p_type']);
 assert.equal(out.p_type,'buyer');
});
