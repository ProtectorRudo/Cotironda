import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const config=readFileSync(new URL('../../apps/portal/next.config.ts',import.meta.url),'utf8');
const tls=readFileSync(new URL('../../apps/portal/scripts/smoke-https-ssr.mjs',import.meta.url),'utf8');
const proxy=readFileSync(new URL('../../apps/portal/proxy.ts',import.meta.url),'utf8');

test('Next publica las cabeceras de seguridad desde headers() y todas las rutas',()=>{
 assert.match(config,/async headers\(\)/);
 assert.match(config,/source:'\/:path\*'/);
 for(const name of [
  'X-Frame-Options','X-Content-Type-Options','Referrer-Policy',
  'Permissions-Policy','Content-Security-Policy','X-Robots-Tag'
 ]) assert.match(config,new RegExp('key:\\x27'+name+'\\x27'));
});

test('evita clickjacking en navegadores antiguos y modernos',()=>{
 assert.match(config,/key:'X-Frame-Options',value:'DENY'/);
 assert.match(config,/frame-ancestors 'none'/);
 assert.doesNotMatch(config,/frame-ancestors 'self'/);
});

test('CSP parcial bloquea base URL ajena, object y formularios externos',()=>{
 for(const directive of ["base-uri 'self'","object-src 'none'","form-action 'self'"]){
  assert.ok(config.includes(directive),directive);
 }
});

test('la CSP no debe bloquear hidratación Next con script-src improvisado',()=>{
 const match=config.match(/value:"(frame-ancestors[^"]+)"/);
 assert.ok(match,'No se encontró el valor de la CSP');
 assert.doesNotMatch(match[1],/script-src|style-src|default-src|unsafe-eval|unsafe-inline|upgrade-insecure-requests/);
});

test('la política de Referer y MIME es estricta',()=>{
 assert.match(config,/key:'Referrer-Policy',value:'no-referrer'/);
 assert.match(config,/key:'X-Content-Type-Options',value:'nosniff'/);
 assert.match(config,/poweredByHeader:false/);
});

test('permisos de sensores y pagos no se habilitan en el portal de identidad',()=>{
 const flags=['camera=()','microphone=()','geolocation=()','payment=()'];
 for(const flag of flags)assert.ok(config.includes(flag));
 assert.doesNotMatch(config,/geolocation=\(self\)|camera=\(self\)|microphone=\(self\)/);
});

test('el portal privado no permite indexado, pero no altera el demo público',()=>{
 assert.match(config,/key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'/);
 assert.match(config,/outputFileTracingRoot:/);
});

test('ni HSTS de subdominios ni Cache-Control global rompen futuros escenarios',()=>{
 assert.doesNotMatch(config,/includeSubDomains|preload|Strict-Transport-Security/);
 assert.doesNotMatch(config,/key:'Cache-Control'/);
 assert.match(proxy,/Cache-Control','private, no-store'/);
});

test('no permite CORS irrestricto, cookies o secretos desde next config',()=>{
 assert.doesNotMatch(config,/Access-Control-Allow-Origin|\*\.cotironda|Set-Cookie|sb_secret_|service_role|process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});

test('la prueba TLS exige headers en todas las respuestas y conserva cookies SSR',()=>{
 assert.match(tls,/assertSecureHeaders\(home\)/);
 for(const name of [
 'login','anon','refreshed','anonymousAgain','nextRequest','wrongOrigin','validOrigin'
 ])assert.ok(tls.includes('assertSecureHeaders('+name+')'));
 assert.match(tls,/PASS HTTPS: DENY iframe, CSP documental/);
 assert.match(tls,/El refresh HTTPS requiere cookie Secure/);
 assert.match(tls,/Respuesta potencialmente cacheable/);
});
