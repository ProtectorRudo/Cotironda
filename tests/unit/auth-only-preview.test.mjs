import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 COTIRONDA_DEV_REF,
 portalHabilitado,
 autenticacionPreviewSoloIngreso,
 autenticacionPortalHabilitada
} from '../../src/server/portal-entorno.ts';

const env={
 VERCEL_ENV:'preview',
 COTIRONDA_AUTH_PREVIEW_ENABLED:'true',
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_SUPABASE_PROJECT_REF:COTIRONDA_DEV_REF,
 NEXT_PUBLIC_SUPABASE_URL:'https://'+COTIRONDA_DEV_REF+'.supabase.co',
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ci_test_not_a_secret'
};
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('la Preview SSO permite login aislado con registro false, sin origin de escritura',()=>{
 assert.equal(autenticacionPreviewSoloIngreso(env),true);
 assert.equal(autenticacionPortalHabilitada(env),true);
 assert.equal(portalHabilitado(env),false);
});

test('fail-closed: falta flag, falta registro false, falta ref o Vercel no es preview',()=>{
 const patches=[
  {COTIRONDA_AUTH_PREVIEW_ENABLED:'false'},
  {COTIRONDA_AUTH_PREVIEW_ENABLED:undefined},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_REGISTRATION_ENABLED:undefined},
  {VERCEL_ENV:'production'},
  {VERCEL_ENV:'development'},
  {VERCEL_ENV:undefined},
  {COTIRONDA_SUPABASE_PROJECT_REF:'other-project'},
  {NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid'},
  {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_not_public'},
  {COTIRONDA_DATABASE_URL:'postgresql://username:pass@host/db'},
  {SUPABASE_SERVICE_ROLE_KEY:'secret-only-for-test'}
 ];
 for(const patch of patches){
  assert.equal(autenticacionPreviewSoloIngreso({...env,...patch}),false,
   'Debe negar '+Object.keys(patch).join(','));
 }
});

test('modo login-only no acepta origin HTTP no local ni URLs con credenciales',()=>{
 for(const origin of [
  'http://test.example',
  'https://user:pass@test.example',
  'https://test.example/path',
  'http://127.0.0.1:3000'
 ]){
  assert.equal(autenticacionPreviewSoloIngreso({...env,COTIRONDA_SITE_ORIGIN:origin}),false);
 }
 assert.equal(autenticacionPreviewSoloIngreso({
  ...env,COTIRONDA_SITE_ORIGIN:'https://preview.cotironda.example'
 }),true);
});

test('flag full-mode de registro conserva su contrato, pero production siempre cerrado',()=>{
 const full={...env,
  COTIRONDA_AUTH_PREVIEW_ENABLED:'false',
  COTIRONDA_REGISTRATION_ENABLED:'true',
  COTIRONDA_SITE_ORIGIN:'https://cotironda-ci.example'
 };
 assert.equal(portalHabilitado(full),true);
 assert.equal(autenticacionPortalHabilitada(full),true);
 assert.equal(autenticacionPreviewSoloIngreso(full),false);
 assert.equal(autenticacionPortalHabilitada({...full,VERCEL_ENV:'production'}),false);
});

test('formulario de login Preview es separado y no llama signup ni registra empresa',()=>{
 const content=read('../../apps/portal/app/ingresar/acceso-prueba.tsx');
 assert.match(content,/signInWithPassword\(/);
 assert.doesNotMatch(content,/signUp\(|createUser\(|register_company|Registrar empresa|Crear cuenta/);
 assert.match(content,/router\.replace\('\/alta'\)/);
 assert.match(content,/setPassword\(''\)/);
});

test('el componente de salida usa signOut global, sin API de creación',()=>{
 const content=read('../../apps/portal/app/alta/cerrar-sesion-prueba.tsx');
 assert.match(content,/signOut\(\{scope:'global'\}\)/);
 assert.doesNotMatch(content,/signUp|register_company|\/api\/organizaciones/);
 assert.match(content,/router\.replace\('\/ingresar'\)/);
});

test('página /alta en modo Auth Preview no muestra ni ejecuta FormularioEmpresa',()=>{
 const content=read('../../apps/portal/app/alta/page.tsx');
 const indexOnly=content.indexOf('if(entornoAuthSoloIngresoPreview())');
 const indexForm=content.indexOf('<FormularioEmpresa/>');
 assert.ok(indexOnly>=0&&indexForm>indexOnly);
 assert.match(content,/!user\.email_confirmed_at\|\|user\.is_anonymous/);
 assert.match(content,/Sesión de prueba activa/);
 assert.match(content,/CerrarSesionPrueba/);
});

test('la API de empresas sigue dependiendo de registro, no de la nueva bandera Auth',()=>{
 const api=read('../../apps/portal/app/api/organizaciones/route.ts');
 const proxy=read('../../apps/portal/proxy.ts');
 assert.match(api,/configurado:portalHabilitado\(process\.env\)/);
 assert.doesNotMatch(api,/autenticacionPreviewSoloIngreso|COTIRONDA_AUTH_PREVIEW_ENABLED/);
 assert.match(proxy,/request\.nextUrl\.pathname==='\/api\/organizaciones'/);
 assert.match(proxy,/\? portalHabilitado\(process\.env\)/);
 assert.match(proxy,/: autenticacionPortalHabilitada\(process\.env\)/);
});

test('Preview aislada debe usar flag SERVER-ONLY, no NEXT_PUBLIC',()=>{
 for(const file of [
  '../../src/server/portal-entorno.ts',
  '../../apps/portal/app/ingresar/page.tsx',
  '../../apps/portal/app/alta/page.tsx',
  '../../apps/portal/proxy.ts'
 ]){
  assert.doesNotMatch(read(file),/NEXT_PUBLIC_COTIRONDA_AUTH_PREVIEW/);
 }
 assert.match(read('../../src/server/portal-entorno.ts'),/COTIRONDA_AUTH_PREVIEW_ENABLED==='true'/);
});
