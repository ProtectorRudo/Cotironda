import test from 'node:test';
import assert from 'node:assert/strict';
import {origenSeguro,credencialesCotironda,portalHabilitado} from '../../src/server/portal-entorno.ts';
const ref='abcdefghijklmnopqrst';
const valid={
 COTIRONDA_REGISTRATION_ENABLED:'true',
 COTIRONDA_SITE_ORIGIN:'https://cotironda.ejemplo.com.ar',
 COTIRONDA_SUPABASE_PROJECT_REF:ref,
 NEXT_PUBLIC_SUPABASE_URL:'https://'+ref+'.supabase.co',
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_for_tests_only'
};
test('por defecto no habilita',()=>assert.equal(portalHabilitado({}),false));
test('requiere configuración completa',()=>assert.equal(portalHabilitado(valid),true));
test('flag falso bloquea',()=>assert.equal(portalHabilitado({...valid,COTIRONDA_REGISTRATION_ENABLED:'false'}),false));
test('no acepta URL de Supabase de otro comercio',()=>assert.equal(portalHabilitado({...valid,NEXT_PUBLIC_SUPABASE_URL:'https://zzzzzzzzzzzzzzzzzzzz.supabase.co'}),false));
test('no acepta referencia de otro proyecto',()=>assert.equal(portalHabilitado({...valid,COTIRONDA_SUPABASE_PROJECT_REF:'zzzzzzzzzzzzzzzzzzzz'}),false));
test('no acepta secreto como publicable',()=>assert.equal(credencialesCotironda({...valid,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_123'}),false));
test('no permite contraseña SQL heredada',()=>assert.equal(portalHabilitado({...valid,COTIRONDA_DATABASE_URL:'postgresql://x:y@db.local/postgres'}),false));
test('no permite service role',()=>assert.equal(portalHabilitado({...valid,SUPABASE_SERVICE_ROLE_KEY:'secret'}),false));
test('exige https salvo localhost',()=>{
 assert.equal(origenSeguro('http://cotironda.com.ar'),false);
 assert.equal(origenSeguro('https://cotironda.com.ar'),true);
 assert.equal(origenSeguro('http://localhost:3000'),true);
});
test('no acepta rutas ni usuario en origen',()=>{
 assert.equal(origenSeguro('https://cotironda.com.ar/alta'),false);
 assert.equal(origenSeguro('https://foo:bar@cotironda.com.ar'),false);
});
test('sin URL/Auth no habilita',()=>assert.equal(portalHabilitado({...valid,NEXT_PUBLIC_SUPABASE_URL:''}),false));
