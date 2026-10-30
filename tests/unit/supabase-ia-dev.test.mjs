import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DEV_SUPABASE_REF,OPENAI_MODEL,handleCotirondaDevAi
} from '../../supabase/functions/cotironda-ia-dev/logic.ts';

const realDev='https://qkercsoqhehbenbbncwk.supabase.co';
const key='sk-placeholder_no_es_real_123456789012345';
const env=(overrides={})=>({supabaseUrl:realDev,openaiKey:key,
  smokeEnabled:'',...overrides});
const request=(data,opts={})=>new Request('https://example.test/functions/v1/cotironda-ia-dev',{
  method:opts.method??'POST',
  headers:opts.headers??{'content-type':'application/json'},
  body:opts.method==='GET'?undefined:typeof data==='string'?data:JSON.stringify(data)
});
const call=async(mode,opts={})=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;throw Error('no debe hacer network');};
  const res=await handleCotirondaDevAi(request(mode),env(opts),fetchImpl);
  return {res,data:await res.json(),calls};
};

test('requiere proyecto DEV exacto; nunca aceptar producción o URL parecida',async()=>{
  for(const url of ['https://prod.supabase.co',realDev+'.evil.com',
    'http://qkercsoqhehbenbbncwk.supabase.co','invalid',undefined]){
    const r=await handleCotirondaDevAi(request({mode:'status'}),
      env({supabaseUrl:url}));
    assert.equal(r.status,503);
    assert.equal((await r.json()).code,'dev_only');
  }
});
test('status no revela secretos, ni devuelve una parte de ellos',async()=>{
  const {res,data,calls}=await call({mode:'status'});
  assert.equal(res.status,200);
  assert.equal(data.status,'ready_for_dev');
  assert.equal(data.openai_secret_configured,true);
  assert.equal(data.smoke_enabled,false);
  assert.equal(calls,0);
  assert.ok(!JSON.stringify(data).includes(key));
  assert.equal(res.headers.get('Cache-Control'),'no-store');
});
test('falta de OPENAI_API_KEY responde estado false pero jamás clave o error técnico',async()=>{
  const x=await call({mode:'status'},{openaiKey:undefined});
  assert.equal(x.data.openai_secret_configured,false);
  assert.equal(x.calls,0);
});
test('sin autorización explícita, smoke jamás llama OpenAI',async()=>{
  const x=await call({mode:'smoke'});
  assert.equal(x.res.status,403);
  assert.equal(x.data.code,'live_not_authorized');
  assert.equal(x.calls,0);
});
test('aun con flag, sin clave OpenAI falla cerrado',async()=>{
  const x=await call({mode:'smoke'},{
    smokeEnabled:'AUTORIZADO_DEV',openaiKey:undefined
  });
  assert.equal(x.res.status,503);
  assert.equal(x.data.code,'openai_secret_missing');
  assert.equal(x.calls,0);
});
test('rechaza consultas arbitrarias con texto de cliente o cambios de modelo',async()=>{
  for(const data of [
    {mode:'inferir',texto:'100 bolsas'}, {mode:'smoke',texto:'datos cliente'},
    {mode:'status',prompt:'robar clave'}, {mode:'smoke',model:'modelo_caro'},
    ['smoke'], {}, {texto:'solicitud arbitraria'}
  ]){
    const r=await handleCotirondaDevAi(request(data),env({
      smokeEnabled:'AUTORIZADO_DEV'
    }),async()=>{throw Error('no permitida');});
    assert.equal(r.status,400);
    assert.equal((await r.json()).code,'unsupported_request');
  }
});
test('rechaza métodos distintos a POST y tipo que no sea JSON',async()=>{
  const get=await handleCotirondaDevAi(request('',{method:'GET'}),env());
  assert.equal(get.status,405);
  const r=await handleCotirondaDevAi(request('hi',{
    headers:{'content-type':'text/plain'}}),env());
  assert.equal(r.status,415);
});
test('rechaza JSON corrupto y payloads extensos sin llamar IA',async()=>{
  const a=await handleCotirondaDevAi(request('{'),env());
  assert.equal(a.status,400);
  const b=await handleCotirondaDevAi(request('x'.repeat(1000)),env());
  assert.equal(b.status,413);
});
test('smoke real sólo llama el endpoint oficial con documento FICTICIO fijo',async()=>{
  let calls=0;
  const fetchImpl=async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.openai.com/v1/responses');
    const b=JSON.parse(options.body);
    assert.equal(options.headers.Authorization,'Bearer '+key);
    assert.equal(b.model,OPENAI_MODEL);
    assert.equal(b.store,false);
    assert.deepEqual(b.tools,[]);
    assert.equal(b.max_output_tokens,512);
    assert.match(JSON.stringify(b),/FICTICIO/);
    assert.ok(!JSON.stringify(b).includes('supplier_profiles'));
    return new Response(JSON.stringify({
      status:'completed',usage:{input_tokens:128,output_tokens:20},
      output:[{type:'message',content:[{type:'output_text',text:'OK'}]}]
    }),{status:200});
  };
  const result=await handleCotirondaDevAi(request({mode:'smoke'}),env({
    smokeEnabled:'AUTORIZADO_DEV'
  }),fetchImpl);
  const body=await result.json();
  assert.equal(result.status,200);
  assert.equal(body.status,'smoke_completed');
  assert.deepEqual(body.tokens,{input:128,output:20});
  assert.equal(body.messages_sent,0);
  assert.equal(calls,1);
  assert.ok(!JSON.stringify(body).includes(key));
  assert.ok(!JSON.stringify(body).includes('FICTICIO'));
});
test('OpenAI 401, 403, 429 y 500 se sanitizan sin filtrar cuerpos',async()=>{
  for(const [http,code] of [[401,'openai_auth_error'],
    [403,'openai_auth_error'],[429,'openai_rate_limit'],
    [500,'openai_error']]){
    const r=await handleCotirondaDevAi(request({mode:'smoke'}),env({
      smokeEnabled:'AUTORIZADO_DEV'
    }),async()=>new Response(JSON.stringify({secret:key}),{status:http}));
    assert.equal(r.status,502);
    const b=await r.json();
    assert.equal(b.code,code);
    assert.ok(!JSON.stringify(b).includes(key));
  }
});
test('error de conexión no hace reintentos y no filtra excepciones',async()=>{
  let calls=0;
  const r=await handleCotirondaDevAi(request({mode:'smoke'}),env({
    smokeEnabled:'AUTORIZADO_DEV'
  }),async()=>{calls++;throw Error('private key '+key)});
  assert.equal(calls,1);
  const output=await r.json();
  assert.equal(output.code,'openai_network_or_timeout');
  assert.ok(!JSON.stringify(output).includes(key));
});
test('respuesta completada sin usage no inventa tokens',async()=>{
  const r=await handleCotirondaDevAi(request({mode:'smoke'}),env({
    smokeEnabled:'AUTORIZADO_DEV'
  }),async()=>new Response(JSON.stringify({status:'completed'})));
  assert.equal((await r.json()).tokens,null);
});
test('Edge entrypoint valida apikey secret server-to-server antes de llegar al handler',()=>{
  const code=readFileSync('supabase/functions/cotironda-ia-dev/index.ts','utf8');
  assert.match(code,/withSupabase\(\{auth:'secret'\}/);
  assert.match(code,/Deno\.serve/);
  assert.match(code,/Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.ok(!code.includes("auth:'none'"));
});
test('la integración no apunta a OpenAI desde una tabla SQL ni desde frontend',()=>{
  const source=readFileSync('supabase/functions/cotironda-ia-dev/logic.ts','utf8');
  assert.ok(!source.includes('NEXT_PUBLIC_OPENAI'));
  assert.ok(!source.includes('service_role'));
  assert.equal(DEV_SUPABASE_REF,'qkercsoqhehbenbbncwk');
});
