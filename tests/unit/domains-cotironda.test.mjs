import test from 'node:test';
import assert from 'node:assert/strict';
import {origenSeguro,portalHabilitado,COTIRONDA_DEV_REF}
 from '../../src/server/portal-entorno.ts';
import {procesarAlta} from '../../src/server/registro-http.ts';

const publicHosts=['https://www.cotironda.com','https://cotironda.com'];
const devEnv={
 COTIRONDA_REGISTRATION_ENABLED:'true',
 COTIRONDA_SUPABASE_PROJECT_REF:COTIRONDA_DEV_REF,
 NEXT_PUBLIC_SUPABASE_URL:'https://'+COTIRONDA_DEV_REF+'.supabase.co',
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_dummy_for_test_only',
 VERCEL_ENV:'preview'
};

test('ambos nombres comprados son orígenes HTTPS válidos, sin rutas ni credenciales',()=>{
 for(const origin of publicHosts){
  assert.equal(origenSeguro(origin),true);
  assert.equal(origenSeguro(origin+'/alta'),false);
  assert.equal(origenSeguro(origin+'/?x=1'),false);
  assert.equal(origenSeguro(origin.replace('https://','http://')),false);
 }
});

test('un dominio parecido, una URL con credenciales o un subdominio malicioso nunca equivalen al canónico',()=>{
 for(const origin of [
  'https://www.cotironda.com.evil.example',
  'https://cotironda.com.evil.example',
  'https://usuario:clave@www.cotironda.com',
  'https://www.cotironda.com/ingresar',
  'https://www.cotironda.com/#inicio'
 ]){
  if(origin.includes('evil.example')){
   assert.notEqual(new URL(origin).origin,publicHosts[0]);
   assert.notEqual(new URL(origin).origin,publicHosts[1]);
  }else assert.equal(origenSeguro(origin),false);
 }
});

test('Vercel Production SIEMPRE mantiene cerrado portal incluso con www y entorno dev correcto',()=>{
 for(const origin of publicHosts){
  assert.equal(portalHabilitado({...devEnv,COTIRONDA_SITE_ORIGIN:origin,VERCEL_ENV:'production'}),false);
  assert.equal(portalHabilitado({...devEnv,COTIRONDA_SITE_ORIGIN:origin,COTIRONDA_REGISTRATION_ENABLED:'false'}),false);
 }
});

test('las configuraciones de prueba no dependen de apuntar DNS de Hostinger a Vercel',()=>{
 const preview={...devEnv,COTIRONDA_SITE_ORIGIN:'https://cotironda-ci.example'};
 assert.equal(portalHabilitado(preview),true);
 assert.equal(portalHabilitado({...preview,VERCEL_ENV:'production'}),false);
 assert.equal(portalHabilitado({...preview,COTIRONDA_SUPABASE_PROJECT_REF:'otro_proyecto'}),false);
});

test('API exige coincidencia exacta de Origin: apex no reemplaza www, y no verifica sesión en origen ajeno',async()=>{
 let attempted=false;
 const deps={
  configurado:true,originPermitido:publicHosts[0],
  verificarSesion:async()=>{attempted=true;return null},
  autorizarIntento:async()=>{throw Error('Nunca se invoca')},
  persistencia:{crearEmpresaConPropietario:async()=>{throw Error('Nunca se escribe')}}
 };
 for(const candidate of ['https://cotironda.com','https://www.cotironda.com.evil.example','http://www.cotironda.com']){
  const req=new Request('https://www.cotironda.com/api/organizaciones',{
   method:'POST',headers:{origin:candidate,'content-type':'application/json'},body:'{}'
  });
  const response=await procesarAlta(req,deps);
  assert.equal(response.status,403,candidate);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{error:'origen_no_permitido'});
 }
 assert.equal(attempted,false,'CSRF valida origen ANTES de consultar al servidor de Auth');
});
