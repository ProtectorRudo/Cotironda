import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 evaluarAuditoriaSesion,evaluarCachePrivada,evaluarCookiesProyecto,
 evaluarPaginaPrivada
} from '../../src/server/browser-cookie-cache-audit.ts';
import {autenticacionPreviewSoloIngreso,COTIRONDA_DEV_REF} from '../../src/server/portal-entorno.ts';

const ref=COTIRONDA_DEV_REF;
const cookie=(overrides={})=>({
 name:'sb-'+ref+'-auth-token.0',
 secure:true,sameSite:'lax',path:'/',...overrides
});
const http=(overrides={})=>({
 https:true,mismoOrigen:true,rutaFinal:'/alta',status:200,
 redirigio:false,cacheControl:'private, no-store',vercelCache:'MISS',...overrides
});
const leer=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('CookieStore con metadata de token propio Secure/SameSite Lax/Path devuelve PASS',()=>{
 assert.equal(evaluarCookiesProyecto([cookie()],ref),'PASS');
 assert.equal(evaluarCookiesProyecto([cookie({name:'sb-'+ref+'-auth-token'})],ref),'PASS');
 assert.equal(evaluarCookiesProyecto([cookie(),cookie({name:'sb-'+ref+'-auth-token.1'})],ref),'PASS');
 assert.equal(evaluarAuditoriaSesion([cookie()],ref,http()).general,'PASS');
});

test('faltan CookieStore o cookies: INCONCLUSO, no PASS',()=>{
 for(const values of [null,[],[cookie({name:'irrelevante'})]]){
  assert.equal(evaluarCookiesProyecto(values,ref),'INCONCLUSO');
  assert.equal(evaluarAuditoriaSesion(values,ref,http()).general,'INCONCLUSO');
 }
});

test('una cookie propia insegura provoca FAIL incluso con otra cookie correcta',()=>{
 for(const insecure of [
  {secure:false},
  {sameSite:'none'},
  {sameSite:'strict'},
  {path:'/alta'},
  {path:'/api'}
 ]){
  assert.equal(evaluarCookiesProyecto([cookie(),cookie(insecure)],ref),'FAIL');
 }
});

test('sin un atributo comprobable nunca se anuncia PASS',()=>{
 for(const missing of [
  {secure:undefined},
  {sameSite:undefined},
  {path:undefined}
 ]){
  assert.equal(evaluarCookiesProyecto([cookie(missing)],ref),'INCONCLUSO');
 }
});

test('otras cookies y prefix collisions no ocultan inseguridad ni cuentan como sesión',()=>{
 assert.equal(evaluarCookiesProyecto([
  cookie({name:'sb-'+ref+'-auth-token-extra'}),
  cookie({name:'sb-otroproyecto-auth-token.0'}),
  cookie({name:'sb-'+ref+'-auth-token.abc'})
 ],ref),'INCONCLUSO');
 assert.equal(evaluarCookiesProyecto([cookie({name:'sb-'+ref+'-auth-token.0'})],
  'proyecto-no-valido'),'FAIL');
});

test('caché privada requiere TLS, mismo origen, ruta privada 200 y no-store',()=>{
 assert.equal(evaluarCachePrivada(http()),'PASS');
 assert.equal(evaluarCachePrivada(http({vercelCache:null})),'PASS');
 for(const h of [
  http({https:false}),http({mismoOrigen:false}),
  http({vercelCache:'HIT'}),http({cacheControl:'public,max-age=60'}),
  http({cacheControl:'private,no-store,s-maxage=99'}),
  http({cacheControl:'private,max-age=3600'}),
 ]){
  assert.equal(evaluarCachePrivada(h),'FAIL');
 }
});

test('caché ausente o respuesta redirigida da INCONCLUSO, no falso aprobado',()=>{
 for(const h of [
  http({cacheControl:null}),http({cacheControl:'no-store'}),
  http({status:302}),http({status:401}),
  http({redirigio:true,rutaFinal:'/ingresar'}),
  http({rutaFinal:'/otra'})
 ]){
  assert.equal(evaluarCachePrivada(h),'INCONCLUSO');
 }
});

test('navegación autenticada exige status 200 misma ruta sin redirects',()=>{
 assert.equal(evaluarPaginaPrivada(http()),'PASS');
 assert.equal(evaluarPaginaPrivada(http({status:302})),'INCONCLUSO');
 assert.equal(evaluarPaginaPrivada(http({rutaFinal:'/ingresar'})),'INCONCLUSO');
 assert.equal(evaluarPaginaPrivada(http({mismoOrigen:false})),'FAIL');
});

test('FAIL prevalece sobre INCONCLUSO en resultado agregado',()=>{
 assert.equal(evaluarAuditoriaSesion(null,ref,http({vercelCache:'HIT'})).general,'FAIL');
 assert.equal(evaluarAuditoriaSesion([cookie({secure:false})],ref,http()).general,'FAIL');
});

test('el componente de navegador descarta valores, no consulta Set-Cookie ni envía telemetría',()=>{
 const component=leer('../../apps/portal/app/alta/auditoria-seguridad-sesion.tsx');
 assert.match(component,/all\.map\(\(\{name,secure,sameSite,path\}\)/);
 assert.match(component,/credentials:'same-origin'/);
 assert.match(component,/cache:'no-store'/);
 assert.match(component,/fetch\('\/alta'/);
 assert.doesNotMatch(component,/\.value\b|JSON\.stringify\(all\)|localStorage|sessionStorage|sendBeacon|Set-Cookie'\)|headers\.get\('cookie'/);
 assert.doesNotMatch(component,/api\/organizaciones|signUp\(|supabase\.from\(/);
});

test('la vista diagnóstica solo se monta dentro de /alta guardada por getUser',()=>{
 const page=leer('../../apps/portal/app/alta/page.tsx');
 assert.ok(page.indexOf('auth.auth.getUser()')>=0);
 assert.ok(page.indexOf('if(error||!user) redirect') <
  page.indexOf('<AuditoriaSeguridadSesion'));
 assert.ok(page.indexOf('if(entornoAuthSoloIngresoPreview())') <
  page.indexOf('<AuditoriaSeguridadSesion'));
 assert.ok(page.indexOf('<AuditoriaSeguridadSesion')<
  page.indexOf('<FormularioEmpresa/>'));
 assert.doesNotMatch(leer('../../apps/portal/app/ingresar/page.tsx'),/AuditoriaSeguridadSesion/);
});

test('segunda rama exacta autorizada: el resto, incluida main y production, cerrados',()=>{
 const env={
  VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'security/01-browser-cookie-cache-audit',
  COTIRONDA_AUTH_PREVIEW_ENABLED:'true',COTIRONDA_REGISTRATION_ENABLED:'false',
  COTIRONDA_SUPABASE_PROJECT_REF:ref,
  NEXT_PUBLIC_SUPABASE_URL:'https://'+ref+'.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ci_dummy'
 };
 assert.equal(autenticacionPreviewSoloIngreso(env),true);
 for(const change of [
  {VERCEL_GIT_COMMIT_REF:'main'},
  {VERCEL_GIT_COMMIT_REF:'security/01-browser-cookie-cache-audit-evil'},
  {VERCEL_GIT_COMMIT_REF:undefined},
  {VERCEL_ENV:'production'}, {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_AUTH_PREVIEW_ENABLED:undefined}
 ]){
  assert.equal(autenticacionPreviewSoloIngreso({...env,...change}),false);
 }
});
