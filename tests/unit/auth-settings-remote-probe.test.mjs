import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {entornoDeLecturaAutorizado,verificarAuthRemoto} from '../../scripts/ci/auth-settings-remote-probe.mjs';
import {COTIRONDA_DEV_REF} from '../../src/server/portal-entorno.ts';

const env={
 GITHUB_ACTIONS:'true',
 GITHUB_EVENT_NAME:'pull_request',
 GITHUB_REPOSITORY:'ProtectorRudo/Cotironda',
 GITHUB_HEAD_REF:'security/01-auth-settings-remote-probe',
 COTIRONDA_CI_AUTH_REMOTE:'true',
 COTIRONDA_DEV_PUBLISHABLE_KEY:'sb_publishable_ci_public_key_not_real'
};
function http(value,status=200){
 return new Response(JSON.stringify({disable_signup:value}),{
  status,headers:{'Content-Type':'application/json'}
 });
}
test('consulta read-only remota acepta flag Auth cerrado; log reducido a resultado',async()=>{
 let calls=0;
 const result=await verificarAuthRemoto(env,async(url,opts)=>{
  calls++;
  assert.equal(url,'https://'+COTIRONDA_DEV_REF+'.supabase.co/auth/v1/settings');
  assert.equal(opts.method,'GET');
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.redirect,'error');
  assert.deepEqual(Object.keys(opts.headers).sort(),['accept','apikey']);
  return http(true);
 });
 assert.equal(calls,1);
 assert.deepEqual(result,{estado:'PASS',codigo:'autorregistro_auth_bloqueado',exitCode:0});
 assert.ok(!JSON.stringify(result).includes(env.COTIRONDA_DEV_PUBLISHABLE_KEY));
});

test('Auth público abierto es FAIL y exitCode 1, no falso PASS',async()=>{
 const result=await verificarAuthRemoto(env,async()=>http(false));
 assert.deepEqual(result,{estado:'FAIL',codigo:'autorregistro_auth_habilitado',exitCode:1});
});

test('Auth sin respuesta comprobable es INCONCLUSO y bloquea aceptación',async()=>{
 for(const response of [
  async()=>http(null),
  async()=>http(false,503),
  async()=>new Response('<html>error</html>',{
   status:200,headers:{'content-type':'text/html'}
  }),
  async()=>{throw new Error('network-timeout email=private@secret.invalid')}
 ]){
  const result=await verificarAuthRemoto(env,response);
  assert.deepEqual(result,{estado:'INCONCLUSO',codigo:'configuracion_no_verificable',exitCode:2});
 }
});

test('entorno no CI o PR de fork/otra rama nunca efectúa ninguna petición',async()=>{
 for(const patch of [
  {GITHUB_ACTIONS:'false'},
  {GITHUB_EVENT_NAME:'push'},
  {GITHUB_EVENT_NAME:'workflow_dispatch'},
  {GITHUB_REPOSITORY:'otra/empresa'},
  {GITHUB_HEAD_REF:'main'},
  {GITHUB_HEAD_REF:'security/01-auth-settings-remote-probe-evil'},
  {COTIRONDA_CI_AUTH_REMOTE:undefined},
  {COTIRONDA_CI_AUTH_REMOTE:'false'}
 ]){
  const other={...env,...patch};
  assert.equal(entornoDeLecturaAutorizado(other),false);
  const result=await verificarAuthRemoto(other,async()=>{
   throw new Error('No debe ejecutarse esta red');
  });
  assert.deepEqual(result,{estado:'INCONCLUSO',codigo:'ejecucion_no_autorizada',exitCode:3});
 }
});

test('no se aceptan claves privadas, ausentes o malformadas',async()=>{
 for(const key of ['',undefined,'sb_secret_1234567890123456789',
  'service_role.jwt', 'sb_publishable_x',
  'sb_publishable_'+('x'.repeat(300))]){
  const target={...env,COTIRONDA_DEV_PUBLISHABLE_KEY:key};
  assert.equal(entornoDeLecturaAutorizado(target),false);
  assert.equal((await verificarAuthRemoto(target,async()=>http(true))).exitCode,3);
 }
});

test('script exporta funciones sin red al importar, nunca imprime JSON remoto',()=>{
 const script=readFileSync(new URL('../../scripts/ci/auth-settings-remote-probe.mjs',import.meta.url),'utf8');
 assert.match(script,/import\.meta\.url===pathToFileURL\(process\.argv\[1\]\)\.href/);
 assert.match(script,/GITHUB_HEAD_REF===rama/);
 assert.match(script,/GITHUB_ACTIONS==='true'/);
 assert.match(script,/COTIRONDA_AUTH_SIGNUP=/);
 assert.doesNotMatch(script,/\.email|password|Authorization|console\.log\(response|JSON\.stringify\(resultado\)|POST|signUp\(/);
});

test('el workflow ejecuta probe una sola vez en rama y origen autorizados',()=>{
 const wf=readFileSync(new URL('../../.github/workflows/unit-tests.yml',import.meta.url),'utf8');
 assert.match(wf,/security\/01-auth-settings-remote-probe/);
 assert.match(wf,/github\.event\.pull_request\.head\.repo\.full_name/);
 assert.match(wf,/COTIRONDA_CI_AUTH_REMOTE: 'true'/);
 assert.match(wf,/scripts\/ci\/auth-settings-remote-probe\.mjs/);
 assert.doesNotMatch(wf,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|upload-artifact/);
});
