import test from 'node:test';
import assert from 'node:assert/strict';
import { origenSeguro, credencialesCotironda, portalHabilitado } from '../../src/server/portal-entorno.ts';
const ref='abcdefghijklmnopqrst';
const valid={
 COTIRONDA_REGISTRATION_ENABLED:'true',
 COTIRONDA_SITE_ORIGIN:'https://cotironda.ejemplo.com.ar',
 COTIRONDA_SUPABASE_PROJECT_REF:ref,
 NEXT_PUBLIC_SUPABASE_URL:'https://'+ref+'.supabase.co',
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_example',
 COTIRONDA_DATABASE_URL:'postgresql://postgres:password@db.'+ref+'.supabase.co:5432/postgres',
};
test('deshabilitado por defecto con variables vacías',()=>assert.equal(portalHabilitado({}),false));
test('solo configuración completa habilita',()=>assert.equal(portalHabilitado(valid),true));
test('flag apagado siempre cierra acceso',()=>assert.equal(portalHabilitado({...valid,COTIRONDA_REGISTRATION_ENABLED:'false'}),false));
test('no admite credenciales de otra empresa aunque sean Supabase',()=>assert.equal(portalHabilitado({...valid,NEXT_PUBLIC_SUPABASE_URL:'https://viralio.supabase.co'}),false));
test('no conecta base de otro proyecto',()=>assert.equal(portalHabilitado({...valid,COTIRONDA_DATABASE_URL:'postgresql://postgres:password@db.zzzzzzzzzzzzzzzzzzzz.supabase.co:5432/postgres'}),false));
test('no conecta pooler con usuario ajeno',()=>assert.equal(portalHabilitado({...valid,COTIRONDA_DATABASE_URL:'postgresql://postgres.otro:password@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'}),false));
test('admite pooler con proyecto correcto',()=>{
 const x={...valid,COTIRONDA_DATABASE_URL:'postgresql://postgres.'+ref+':password@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'};
 assert.equal(portalHabilitado(x),true);
});
test('ref invalida bloquea activación',()=>assert.equal(portalHabilitado({...valid,COTIRONDA_SUPABASE_PROJECT_REF:'ref-invalida'}),false));
test('claves secretas no son publishable',()=>assert.equal(credencialesCotironda({...valid,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_password'}),false));
test('exige HTTPS fuera de localhost',()=>{
 assert.equal(origenSeguro('http://cotironda.com.ar'),false);
 assert.equal(origenSeguro('https://cotironda.com.ar'),true);
 assert.equal(origenSeguro('http://localhost:3000'),true);
});
test('no permite origen con rutas o contraseñas',()=>{
 assert.equal(origenSeguro('https://cotironda.com.ar/alta'),false);
 assert.equal(origenSeguro('https://usuario:clave@cotironda.com.ar'),false);
});
test('no acepta DB sin contraseña',()=>assert.equal(portalHabilitado({...valid,COTIRONDA_DATABASE_URL:'postgresql://postgres@db.'+ref+'.supabase.co:5432/postgres'}),false));
test('no acepta host impostor',()=>assert.equal(portalHabilitado({...valid,COTIRONDA_DATABASE_URL:'postgresql://postgres:password@db.'+ref+'.supabase.co.evil.test/postgres'}),false));
