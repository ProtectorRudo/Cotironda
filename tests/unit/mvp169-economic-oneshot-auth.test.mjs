import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runEconomicOneShotMvp169} from
 '../../supabase/functions/cotironda-piloto-economic-staging/logic.ts';

const TOKEN='a'.repeat(96);
const uri='https://example.invalid/functions/v1/cotironda-piloto-economic-staging';
function request(token=TOKEN,method='POST',body='{}'){
 return new Request(uri,{method,headers:{'x-cotironda-recovery-token':token},body:method==='POST'?body:undefined});
}
function setup(result='economic_facts_recorded'){
 const calls={authorize:0,audit:0};
 return {
  calls,
  opts:{
   enabled:true,
   authorize:async token=>{calls.authorize++;return token===TOKEN},
   auditOne:async()=>{calls.audit++;return result}
  }
 };
}
async function state(response){return (await response.json()).state}
test('MVP169: token del Vault válido autoriza una sola lectura económica privada',async()=>{
 const t=setup(),r=await runEconomicOneShotMvp169(request(),t.opts);
 assert.equal(r.status,200);assert.equal(await state(r),'economic_facts_recorded');
 assert.deepEqual(t.calls,{authorize:1,audit:1});
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('MVP169: token ausente o de formato incorrecto no llega a RPC',async()=>{
 for(const token of ['',TOKEN.slice(1),'b'.repeat(48),'test']){
  const t=setup(),r=await runEconomicOneShotMvp169(request(token),t.opts);
  assert.equal(r.status,401);assert.equal(await state(r),'unauthorized');
  assert.deepEqual(t.calls,{authorize:0,audit:0});
 }
});
test('MVP169: token con formato correcto pero no coincidente no ejecuta auditoría',async()=>{
 const t=setup(),r=await runEconomicOneShotMvp169(request('c'.repeat(96)),t.opts);
 assert.equal(r.status,401);assert.equal(await state(r),'unauthorized');
 assert.deepEqual(t.calls,{authorize:1,audit:0});
});
test('MVP169: GET con token válido no consulta DB ni procesa documentos',async()=>{
 const t=setup(),r=await runEconomicOneShotMvp169(request(TOKEN,'GET'),t.opts);
 assert.equal(r.status,405);assert.equal(await state(r),'method_not_allowed');
 assert.deepEqual(t.calls,{authorize:0,audit:0});
});
test('MVP169: flag apagado prohíbe lectura pese a token',async()=>{
 const t=setup();t.opts.enabled=false;
 const r=await runEconomicOneShotMvp169(request(),t.opts);
 assert.equal(r.status,503);assert.equal(await state(r),'worker_off');
 assert.deepEqual(t.calls,{authorize:0,audit:0});
});
test('MVP169: sin documentos elegibles queda registrado solo estado seguro',async()=>{
 const t=setup('none'),r=await runEconomicOneShotMvp169(request(),t.opts);
 assert.equal(r.status,200);assert.equal(await state(r),'none');
 assert.deepEqual(t.calls,{authorize:1,audit:1});
});
test('MVP169: RPC/archivo rechazado retorna error sin datos privados',async()=>{
 const t=setup('failed'),r=await runEconomicOneShotMvp169(request(),t.opts);
 assert.equal(r.status,503);
 const body=await r.text();
 assert.equal(JSON.parse(body).state,'economic_facts_unavailable');
 assert.ok(!body.includes('hash'));
});
test('MVP169: error inesperado también devuelve código neutro',async()=>{
 const t=setup();t.opts.auditOne=async()=>{throw Error('private supplier quote')};
 const r=await runEconomicOneShotMvp169(request(),t.opts);
 assert.equal(r.status,503);assert.equal(await state(r),'temporarily_unavailable');
});
test('MVP169: cabecera muy grande rechazada sin auditar',async()=>{
 const t=setup(),r=await runEconomicOneShotMvp169(
  new Request(uri,{method:'POST',headers:{
   'x-cotironda-recovery-token':TOKEN,'content-length':'999'
  },body:'{}'}),t.opts);
 assert.equal(r.status,413);assert.equal(await state(r),'body_too_large');
 assert.equal(t.calls.audit,0);
});
test('MVP169: la Edge STAGING no importa WhatsApp, IA, finalistas, cron o ranking',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-economic-staging/index.ts',import.meta.url),'utf8');
 assert.match(edge,/guard|runEconomicOneShotMvp169/);
 assert.match(edge,/cotironda_piloto_recovery_token_allowed_mvp132/);
 assert.match(edge,/cotironda_piloto_next_economic_facts_mvp168/);
 assert.match(edge,/cotironda_piloto_record_economic_facts_mvp168/);
 assert.match(edge,/cotironda-piloto-originals/);
 const executable=edge.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu,'');
 assert.doesNotMatch(executable,/whapi-dispatch|dispatchPending|sendMessage|outbox|finalist|proposeDocumentAI|cron\.schedule|publishOriginal|revealContacts/i);
});
test('MVP169: ningún dato del proveedor o token se devuelve como respuesta',async()=>{
 const t=setup(),r=await runEconomicOneShotMvp169(request(),t.opts);
 const body=await r.text();
 assert.deepEqual(JSON.parse(body),{state:'economic_facts_recorded'});
 assert.ok(!body.includes(TOKEN));
 assert.ok(!body.includes('sourceSha256'));
 assert.ok(!body.includes('message_hmac'));
});
