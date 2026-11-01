import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleCotirondaDevAi } from '../../supabase/functions/cotironda-ia-dev/logic.ts';

const DEV='https://qkercsoqhehbenbbncwk.supabase.co';
const BASE=Object.freeze({
  supabaseUrl:DEV,
  openaiKey:'sk-SYNTHETIC_CI_ONLY_DO_NOT_USE',
  smokeEnabled:'OFF',
  qualityEnabled:'OFF'
});
const request=(payload, options={})=>new Request('https://synthetic.invalid/probe',{
  method:options.method||'POST',
  headers:{'Content-Type':options.contentType||'application/json'},
  body:(options.method==='GET'||options.method==='HEAD')?undefined:
    typeof payload==='string'?payload:JSON.stringify(payload)
});
function trap(){
  let count=0;
  const forbidden=async()=>{count++;throw Error('D044_EXTERNAL_CALL_FORBIDDEN')};
  return { forbidden, called:()=>count };
}
async function run(req, env=BASE){
  const t=trap();
  const res=await handleCotirondaDevAi(req,env,t.forbidden,t.forbidden,t.forbidden);
  return {res,external:t.called()};
}
test('D044: el wrapper acepta SOLO clave dedicada y módulo npm anclado',async()=>{
  const entry=await readFile(new URL('../../supabase/functions/cotironda-ia-dev/index.ts',import.meta.url),'utf8');
  assert.match(entry,/from 'npm:@supabase\/server@1\.9\.2'/);
  assert.match(entry,/Deno\.serve\(withSupabase\(\{auth:'secret:cotironda_quality_lab'\}/);
  assert.doesNotMatch(entry,/auth:\s*['"](?:none|user|publishable|secret)['"]/);
  assert.doesNotMatch(entry,/secret:\*/);
  assert.doesNotMatch(entry,/secret:default/);
  assert.doesNotMatch(entry,/Deno\.serve\(\s*async /);
});
test('D044: HTTPS/host DEV obligatorio antes de cualquier procesamiento',async()=>{
  for(const x of ['https://other.supabase.co','http://qkercsoqhehbenbbncwk.supabase.co',undefined]){
    const {res,external}=await run(request({mode:'smoke'}),{...BASE,supabaseUrl:x});
    assert.equal(res.status,503);assert.equal(external,0);
    assert.equal((await res.json()).code,'dev_only');
  }
});
test('D044: solicitudes GET quedan rechazadas y no invocan IA',async()=>{
  const {res,external}=await run(request(null,{method:'GET'}));
  assert.equal(res.status,405);assert.equal(external,0);
});
test('D044: Content-Type incorrecto es rechazado antes de IA',async()=>{
  const {res,external}=await run(request('ignored',{contentType:'text/plain'}));
  assert.equal(res.status,415);assert.equal(external,0);
});
test('D044: JSON inválido o payload inesperado jamás ejecuta IA',async()=>{
  for(const payload of ['{bad','[]','{"mode":"desconocido"}',
    '{"mode":"status","extra":true}','{"mode":"quality_case","case_id":37}']){
    const {res,external}=await run(request(payload));
    assert.equal(res.status,400);assert.equal(external,0);
  }
});
test('D044: cuerpo mayor a 256 caracteres se rechaza antes de IA',async()=>{
  const {res,external}=await run(request('x'.repeat(260)));
  assert.equal(res.status,413);assert.equal(external,0);
});
test('D044: smoke sin autorización explícita devuelve 403, costo cero',async()=>{
  const {res,external}=await run(request({mode:'smoke'}));
  assert.equal(res.status,403);assert.equal(external,0);
  assert.equal((await res.json()).code,'live_not_authorized');
});
test('D044: quality_case sin autorización explícita devuelve 403, costo cero',async()=>{
  const {res,external}=await run(request({mode:'quality_case',case_id:'cemento_cpc_50_a_avellaneda_25'}));
  assert.equal(res.status,403);assert.equal(external,0);
  assert.equal((await res.json()).code,'quality_lab_not_authorized');
});
test('D044: estado interno no envía IA y responde no-store',async()=>{
  const {res,external}=await run(request({mode:'status'}));
  assert.equal(res.status,200);assert.equal(external,0);
  assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  const body=await res.json();
  assert.equal(body.environment,'cotironda-dev');
  assert.equal(body.smoke_enabled,false);
});
test('D044: flags ON sin credencial OpenAI rechazan, sin red',async()=>{
  for(const x of [
    {mode:'smoke'},
    {mode:'quality_case',case_id:'cemento_cpc_50_a_avellaneda_25'}
  ]){
    const {res,external}=await run(request(x),{
      ...BASE, openaiKey:undefined, smokeEnabled:'AUTORIZADO_DEV', qualityEnabled:'AUTORIZADO_DEV'
    });
    assert.equal(res.status,503);assert.equal(external,0);
    assert.equal((await res.json()).code,'openai_secret_missing');
  }
});
test('D044: se conserva el header apikey en el despachador SQL histórico',async()=>{
  const sql=await readFile(new URL('../../supabase/recovery/dev_quality_20261030/20261030192011_dev_quality_auto_dispatch_d020.sql',import.meta.url),'utf8');
  assert.match(sql,/'apikey',\s*v_key/);
  assert.doesNotMatch(sql,/'Authorization',\s*'Bearer/);
  assert.match(sql,/cotironda-ia-dev/);
});
