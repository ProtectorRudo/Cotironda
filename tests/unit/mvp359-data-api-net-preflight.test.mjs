import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {
 esClavePublica,clasificarRespuesta,verificarExposicionNet,PILOT_HOST,PROBE_TABLE
} from '../../scripts/piloto/verificar-exposicion-net-mvp359.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const sql=readFileSync(resolve(root,'supabase/tests/preflight/mvp359-piloto-solo-lectura.sql'),'utf8');
const key='sb_publishable_'+ 'A'.repeat(28);
const host='https://'+PILOT_HOST+'/';
function fakeFetch(publicStatus,publicCode,netStatus,netCode) {
 const calls=[];
 const fetchFn=async(url,options)=>{
  calls.push({url,options});
  const isNet=options.headers['Accept-Profile']==='net';
  const status=isNet?netStatus:publicStatus;
  const code=isNet?netCode:publicCode;
  return new Response(JSON.stringify({code}),{
   status,headers:{'Content-Type':'application/json'}
  });
 };
 return {calls,fetchFn};
}
test('MVP359: HTTP solo lectura distingue net NO expuesto de net expuesto',async()=>{
 const safe=fakeFetch(404,'PGRST205',406,'PGRST106');
 assert.deepEqual(await verificarExposicionNet({url:host,clave:key,fetchFn:safe.fetchFn}),
   {estado:'VERIFIED_SAFE',motivo:'PGRST106'});
 assert.equal(safe.calls.length,2);
 for(const call of safe.calls){
  assert.equal(call.options.method,'GET');
  assert.equal(call.options.redirect,'error');
  assert.equal(call.options.headers.apikey,key);
  assert(!('Authorization' in call.options.headers));
  assert(call.url.includes(PROBE_TABLE));
  assert(!call.url.includes(key));
  assert(!call.url.includes('http_request_queue'));
 }
 const risk=fakeFetch(404,'PGRST205',404,'PGRST205');
 assert.deepEqual(await verificarExposicionNet({url:host,clave:key,fetchFn:risk.fetchFn}),
   {estado:'UNSAFE',motivo:'net_exposed_via_rest'});
});
test('MVP359: ausencia de baseline API, error 401 y 503 no aprueban',async()=>{
 for(const testCase of [
  [401,'X',406,'PGRST106','public_baseline_not_verified'],
  [404,'PGRST205',401,'X','unexpected_net_response'],
  [404,'PGRST205',503,'X','unexpected_net_response'],
  [404,'PGRST205',406,'PGRST205','unexpected_net_response']
 ]){
  const r=fakeFetch(...testCase.slice(0,4));
  const result=await verificarExposicionNet({url:host,clave:key,fetchFn:r.fetchFn});
  assert.equal(result.estado,'INCONCLUSIVE');
  assert.equal(result.motivo,testCase[4]);
 }
 assert.equal(clasificarRespuesta(406,'PGRST106','net'),'NET_NOT_EXPOSED');
 assert.equal(clasificarRespuesta(404,'PGRST205','net'),'NET_EXPOSED');
});
test('MVP359: rechazar URL ajena, HTTPS inseguro o clave admin',async()=>{
 let called=false;
 const fetchFn=async()=>{called=true;throw Error('MUST_NOT_FETCH')};
 for(const url of [
  'https://malicioso.example/','http://'+PILOT_HOST+'/',
  'https://'+PILOT_HOST+'.otro.example/',
  'https://usuario:clave@'+PILOT_HOST+'/',
  'https://'+PILOT_HOST+'/other'
 ]){
  const result=await verificarExposicionNet({url,clave:key,fetchFn});
  assert.equal(result.estado,'INCONCLUSIVE');
 }
 for(const bad of ['', 'sb_secret_'+ 'A'.repeat(32),'not-a-key']){
  assert(!esClavePublica(bad));
  const r=await verificarExposicionNet({url:host,clave:bad,fetchFn});
  assert.equal(r.estado,'INCONCLUSIVE');
 }
 assert.equal(called,false);
});
test('MVP359: fallo DNS hace FAIL CLOSED sin filtrar credenciales',async()=>{
 const result=await verificarExposicionNet({
  url:host,clave:key,fetchFn:async()=>{throw Error('Secret '+key+' DNS failed')}
 });
 assert.deepEqual(result,{estado:'INCONCLUSIVE',motivo:'network_or_timeout'});
 assert(!JSON.stringify(result).includes(key));
});
test('MVP359: SQL de preflight es SOLO SELECT, detecta SQL drift y P0',()=>{
 const stripped=sql.replace(/^--.*$/gmu,'');
 assert(stripped.trim().startsWith('WITH expected('));
 assert.doesNotMatch(stripped,/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|CALL|GRANT|REVOKE)\b/iu);
 assert.match(sql,/encode\(sha256\(convert_to\(pg_get_functiondef\(p\.oid\),'UTF8'\)\),'hex'\)/u);
 assert.match(sql,/sha_coincidentes/u);
 assert.match(sql,/NO_CREAR_OTRA/u);
 assert.match(sql,/usuarios_auth/u);
 assert.match(sql,/NO_VERIFICADO_POR_SQL/u);
 const baselines=[...sql.matchAll(/'[a-f0-9]{64}'/gu)];
 assert.equal(baselines.length,4);
});
