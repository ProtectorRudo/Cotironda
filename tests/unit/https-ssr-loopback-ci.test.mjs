import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const smoke=readFileSync(new URL('../../apps/portal/scripts/smoke-https-ssr.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/portal-ci.yml',import.meta.url),'utf8');

test('el HTTPS end-to-end usa TLS real loopback con CA verificada',()=>{
 assert.match(smoke,/https\.createServer\(\{cert,key\}/);
 assert.match(smoke,/https\.request\(\{/);
 assert.match(smoke,/ca:cert,rejectUnauthorized:true/);
 assert.match(smoke,/https\.get\(\{hostname:host,port:tlsPort,path:'\/',rejectUnauthorized:true/);
 assert.match(smoke,/tlsPort=4177/);
 assert.match(smoke,/host='127\.0\.0\.1'/);
 assert.doesNotMatch(smoke,/NODE_TLS_REJECT_UNAUTHORIZED|rejectUnauthorized:\s*false|curl\s+-k\b/i);
 assert.doesNotMatch(workflow,/NODE_TLS_REJECT_UNAUTHORIZED|rejectUnauthorized:\s*false/);
});

test('certificado privado efímero y credenciales sintéticas nunca salen del runner',()=>{
 assert.match(smoke,/process\.env\.GITHUB_ACTIONS!=='true'/);
 assert.match(smoke,/process\.env\.COTIRONDA_CI_TLS_LOOPBACK!=='true'/);
 assert.match(smoke,/COTIRONDA_CI_AUTH_SANDBOX:'enabled_for_tests_only'/);
 assert.match(smoke,/ci-auth-fetch-preload\.cjs/);
 assert.match(workflow,/openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1/);
 assert.match(workflow,/subjectAltName=DNS:localhost,IP:127\.0\.0\.1/);
 assert.match(workflow,/chmod 600 "\$KEY" "\$CERT"/);
 assert.match(workflow,/COTIRONDA_CI_TLS_LOOPBACK: 'true'/);
 assert.doesNotMatch(smoke,/SUPABASE_SERVICE_ROLE_KEY|COTIRONDA_E2E_VERIFIED_PASSWORD|sb_secret_/);
 assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY|COTIRONDA_E2E_VERIFIED_PASSWORD|sb_secret_/);
});

test('smoke falla si hay caché, cookie sin Secure, sin SameSite o sesión compartida',()=>{
 assert.match(smoke,/newSetCookies\.length>0/);
 assert.match(smoke,/secure\(\?:;\|\$\)/i);
 assert.match(smoke,/samesite=lax/i);
 assert.match(smoke,/path=\\\//i);
 assert.match(smoke,/cache-control/);
 assert.match(smoke,/no-store/);
 assert.match(smoke,/refreshedCookie/);
 assert.match(smoke,/anonymousAgain/);
 assert.match(smoke,/origen_no_permitido/);
 assert.match(smoke,/limite_no_disponible/);
 assert.match(smoke,/child\.kill\('SIGTERM'\)/);
});

test('workflow HTTPS corre después del build Preview y antes del smoke HTTP existente',()=>{
 const build=workflow.indexOf('Reconstruir desde cero con entorno Preview de Auth aislado');
 const tls=workflow.indexOf('Generar certificado TLS efimero para HTTPS local de CI');
 const https=workflow.indexOf('run: node scripts/smoke-https-ssr.mjs');
 const existing=workflow.indexOf('run: node scripts/smoke-preview-auth.mjs');
 assert.ok(build>=0&&tls>build&&https>tls&&existing>https);
 assert.match(workflow,/on:\s*\n\s*pull_request:/);
 assert.match(workflow,/permissions:\s*\n\s*contents: read/);
});
