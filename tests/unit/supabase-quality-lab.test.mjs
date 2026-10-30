import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CASOS_LAB,evaluarCasoCalidadDev
} from '../../supabase/functions/cotironda-ia-dev/lab.ts';
import {handleCotirondaDevAi}
  from '../../supabase/functions/cotironda-ia-dev/logic.ts';
import {escenariosProducto}
  from '../fixtures/gold-invitaciones-producto-v1.mjs';

const root='supabase/functions/cotironda-ia-dev/core';
const fuentes=[
  'domain/catalogo.ts','domain/despacho-automatico.ts',
  'domain/extraccion-documental.ts','domain/identidad-producto.ts',
  'domain/invitaciones-por-producto.ts','domain/taxonomia-materiales.ts',
  'domain/evaluacion-invitaciones-producto.ts',
  'server/openai-extraccion.ts','server/flujo-calidad-ia.ts'
];

const key='sk-solo_mock_sintetico_1234567890123456';
const env=(o={})=>({
  supabaseUrl:'https://qkercsoqhehbenbbncwk.supabase.co',
  openaiKey:key,smokeEnabled:undefined,qualityEnabled:undefined,...o
});
const req=(obj)=>new Request('https://dev.invalid/',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(obj)
});
const mock=(items,code=200)=>{
  let calls=0;
  const impl=async(url,opts)=>{
    calls++;
    assert.equal(url,'https://api.openai.com/v1/responses');
    const body=JSON.parse(opts.body);
    assert.equal(body.model,'gpt-6-luna');
    assert.equal(body.store,false);
    assert.deepEqual(body.tools,[]);
    assert.equal(body.text.format.strict,true);
    assert.ok(!JSON.stringify(body).includes('corralon_001'));
    assert.ok(!JSON.stringify(body).includes('proveedores_esperados'));
    return new Response(JSON.stringify({
      status:'completed',
      output:[{type:'message',role:'assistant',content:[{
        type:'output_text',text:JSON.stringify({items})
      }]}],
      usage:{input_tokens:123,output_tokens:75}
    }),{status:code});
  };
  return{impl,getCalls:()=>calls};
};

test('los 9 módulos del motor Edge son copias byte-exactas del motor oficial',()=>{
  for(const file of fuentes){
    const fuente=readFileSync('src/'+file,'utf8');
    const packed=readFileSync(root+'/'+file,'utf8');
    assert.equal(packed,fuente,'Módulo Edge desactualizado: '+file);
  }
  assert.equal(readFileSync(root+'/fixtures/gold-invitaciones-producto-v1.mjs','utf8'),
    readFileSync('tests/fixtures/gold-invitaciones-producto-v1.mjs','utf8'));
});
test('quality case no acepta textos arbitrarios ni catálogo cliente',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;throw Error('no autorizado');};
  const e=env({qualityEnabled:'AUTORIZADO_DEV'});
  for(const b of [
    {mode:'quality_case',case_id:'otra-cosa'},
    {mode:'quality_case',case_id:'otro_material',texto:'100 kg'},
    {mode:'quality_case',case_id:CASOS_LAB[0],texto:'100 bolsas'},
    {mode:'quality_case',case_id:CASOS_LAB[0],proveedores:['x']},
    {mode:'quality_case',case_id:0},
    {mode:'quality_case'}
  ]){
    const r=await handleCotirondaDevAi(req(b),e,fetcher);
    assert.equal(r.status,400,'Rechazar '+JSON.stringify(b));
  }
  assert.equal(calls,0);
});
test('flag de quality ausente BLOQUEA antes de cualquier llamada',async()=>{
  let calls=0;
  const response=await handleCotirondaDevAi(req({
    mode:'quality_case',case_id:CASOS_LAB[0]
  }),env(),async()=>{calls++;throw Error('fail');});
  assert.equal(response.status,403);
  assert.equal((await response.json()).code,'quality_lab_not_authorized');
  assert.equal(calls,0);
});
test('habilitar smoke NO habilita laboratorio quality',async()=>{
  const resp=await handleCotirondaDevAi(req({mode:'quality_case',case_id:CASOS_LAB[0]}),
    env({smokeEnabled:'AUTORIZADO_DEV'}));
  assert.equal(resp.status,403);
});
test('habilitar quality NO habilita smoke anterior',async()=>{
  const resp=await handleCotirondaDevAi(req({mode:'smoke'}),
    env({qualityEnabled:'AUTORIZADO_DEV'}));
  assert.equal(resp.status,403);
  assert.equal((await resp.json()).code,'live_not_authorized');
});
test('quality bloqueado sin key válida y sin llamada',async()=>{
  let calls=0;
  const resp=await handleCotirondaDevAi(req({mode:'quality_case',case_id:CASOS_LAB[0]}),
    env({openaiKey:undefined,qualityEnabled:'AUTORIZADO_DEV'}),
    async()=>{calls++;throw Error('fallo')});
  assert.equal(resp.status,503);
  assert.equal((await resp.json()).code,'openai_secret_missing');
  assert.equal(calls,0);
});
test('sólo se pueden probar 6 pedidos ficticios y no se envían datos gold a IA',()=>{
  assert.equal(CASOS_LAB.length,6);
  for(const id of CASOS_LAB){
    const caso=escenariosProducto.find(x=>x.id===id);
    assert.ok(caso);
    assert.ok(caso.texto.length<200);
    assert.ok(!caso.texto.includes('@'));
  }
});
test('caso cemento flexible utiliza motor real D016 y gold independiente',async()=>{
  const caso=escenariosProducto.find(x=>x.id===CASOS_LAB[0]);
  const f=mock(caso.items);
  const r=await evaluarCasoCalidadDev(caso.id,key,f.impl);
  assert.equal(f.getCalls(),1);
  assert.equal(r.status,'quality_case_completed');
  assert.equal(r.seguridad,'PASS');
  assert.equal(r.cobertura,'PASS');
  assert.equal(r.extraccion.exactos,1);
  assert.equal(r.invitaciones.correctas,1);
  assert.deepEqual(r.tokens,{entrada:123,salida:75});
  assert.equal(r.envio_habilitado,false);
  assert.equal(r.proveedores_reales,0);
  assert.equal(r.mensajes_whatsapp,0);
  assert.ok(!JSON.stringify(r).includes(key));
  assert.ok(!JSON.stringify(r).includes('Loma Negra'));
});
test('caso multimaterial 2 productos correctos preparados sin envío',async()=>{
  const caso=escenariosProducto.find(x=>x.id==='dos_productos_misma_linea');
  const f=mock(caso.items);
  const r=await evaluarCasoCalidadDev(caso.id,key,f.impl);
  assert.equal(r.extraccion.esperados,2);
  assert.equal(r.extraccion.exactos,2);
  assert.equal(r.invitaciones.esperadas,2);
  assert.equal(r.invitaciones.correctas,2);
  assert.equal(r.cobertura,'PASS');
  assert.equal(f.getCalls(),1);
});
test('si IA omite pintura del mismo texto, devuelve FAIL cobertura y no falsa precisión',async()=>{
  const caso=escenariosProducto.find(x=>x.id==='dos_productos_misma_linea');
  const f=mock(caso.items.slice(0,1));
  const r=await evaluarCasoCalidadDev(caso.id,key,f.impl);
  assert.equal(r.seguridad,'PASS');
  assert.equal(r.cobertura,'FAIL');
  assert.equal(r.extraccion.omitidos,1);
  assert.equal(r.invitaciones.omitidas,1);
  assert.equal(f.getCalls(),1);
});
test('si IA inventa cantidad se marca seguridad FAIL sin invitar a nadie',async()=>{
  const caso=escenariosProducto.find(x=>x.id==='cemento_cpc_50_a_avellaneda_25');
  const f=mock([{...caso.items[0],cantidad:'200'}]);
  const r=await evaluarCasoCalidadDev(caso.id,key,f.impl);
  assert.equal(r.seguridad,'FAIL');
  assert.equal(r.cobertura,'FAIL');
  assert.equal(r.invitaciones.correctas,0);
  assert.equal(f.getCalls(),1);
});
test('quality autorizado ejecuta solo una llamada y retorna informe reducido',async()=>{
  const caso=escenariosProducto.find(x=>x.id===CASOS_LAB[0]);
  const f=mock(caso.items);
  const r=await handleCotirondaDevAi(req({
    mode:'quality_case',case_id:caso.id
  }),env({qualityEnabled:'AUTORIZADO_DEV'}),f.impl,async()=>true);
  const data=await r.json();
  assert.equal(r.status,200);
  assert.equal(data.status,'quality_case_completed');
  assert.equal(data.envio_habilitado,false);
  assert.equal(f.getCalls(),1);
  assert.ok(!JSON.stringify(data).includes(key));
  assert.ok(!JSON.stringify(data).includes('cotizar a'));
});
test('fallo 429 OpenAI no reintenta ni filtra secreto',async()=>{
  const caso=escenariosProducto.find(x=>x.id===CASOS_LAB[0]);
  const f=mock(caso.items,429);
  const r=await handleCotirondaDevAi(req({
    mode:'quality_case',case_id:caso.id
  }),env({qualityEnabled:'AUTORIZADO_DEV'}),f.impl,async()=>true);
  const data=await r.json();
  assert.equal(r.status,502);
  assert.equal(data.code,'ia_cuota_o_rate_limit');
  assert.equal(f.getCalls(),1);
  assert.ok(!JSON.stringify(data).includes(key));
});
test('error de IA no autorizado jamás se informa con datos internos',async()=>{
  const resp=await handleCotirondaDevAi(
    req({mode:'quality_case',case_id:CASOS_LAB[0]}),
    env({qualityEnabled:'AUTORIZADO_DEV'}),
    async()=>{throw Error('CLAVE PRIVADA: '+key)},async()=>true);
  assert.equal(resp.status,502);
  const data=await resp.json();
  assert.equal(data.code,'ia_transporte_no_disponible');
  assert.ok(!JSON.stringify(data).includes(key));
});
test('status no muestra la clave ni habilita quality en respuesta de cliente',async()=>{
  const resp=await handleCotirondaDevAi(req({mode:'status'}),
    env({qualityEnabled:'AUTORIZADO_DEV'}));
  const body=await resp.json();
  assert.equal(body.status,'ready_for_dev');
  assert.ok(!JSON.stringify(body).includes(key));
  assert.ok(!Object.hasOwn(body,'qualityEnabled'));
});

test('sin registro de cuota persistente jamás se hace consulta paga',async()=>{
  const caso=escenariosProducto.find(x=>x.id===CASOS_LAB[0]);
  const f=mock(caso.items);
  const resp=await handleCotirondaDevAi(
    req({mode:'quality_case',case_id:caso.id}),
    env({qualityEnabled:'AUTORIZADO_DEV'}),f.impl
  );
  assert.equal(resp.status,503);
  assert.equal((await resp.json()).code,'quality_gate_unavailable');
  assert.equal(f.getCalls(),0);
});
test('fallo de base de datos antes de reservar impide gastar',async()=>{
  const caso=escenariosProducto.find(x=>x.id===CASOS_LAB[0]);
  const f=mock(caso.items);
  const resp=await handleCotirondaDevAi(
    req({mode:'quality_case',case_id:caso.id}),
    env({qualityEnabled:'AUTORIZADO_DEV'}),f.impl,
    async()=>{throw Error('No disponible')}
  );
  assert.equal(resp.status,503);
  assert.equal(f.getCalls(),0);
});
test('reserva rechazada por unicidad impide gastar sin revelar causa interna',async()=>{
  const caso=escenariosProducto.find(x=>x.id===CASOS_LAB[0]);
  const f=mock(caso.items);
  const resp=await handleCotirondaDevAi(
    req({mode:'quality_case',case_id:caso.id}),
    env({qualityEnabled:'AUTORIZADO_DEV'}),f.impl,async()=>false
  );
  assert.equal(resp.status,409);
  assert.equal((await resp.json()).code,'quality_case_reserved_or_unavailable');
  assert.equal(f.getCalls(),0);
});
test('dos solicitudes simultáneas para mismo caso gastan una sola vez',async()=>{
  const caso=escenariosProducto.find(x=>x.id===CASOS_LAB[0]);
  const f=mock(caso.items);
  const casos=new Set();
  let claims=0;
  const claim=async(id)=>{
    claims++;
    if(casos.has(id))return false;
    casos.add(id);
    return true;
  };
  const responses=await Promise.all(Array.from({length:2},()=>handleCotirondaDevAi(
    req({mode:'quality_case',case_id:caso.id}),
    env({qualityEnabled:'AUTORIZADO_DEV'}),f.impl,claim
  )));
  assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);
  assert.equal(claims,2);
  assert.equal(f.getCalls(),1);
});
test('dos casos distintos consumen su propia reserva, nunca comparten cupo',async()=>{
  const vistos=new Set();
  const claim=async(id)=>!vistos.has(id)&&(vistos.add(id),true);
  const resultados=[];
  for(const caso of [escenariosProducto[0],escenariosProducto[1]]){
    const f=mock(caso.items);
    const response=await handleCotirondaDevAi(
      req({mode:'quality_case',case_id:caso.id}),
      env({qualityEnabled:'AUTORIZADO_DEV'}),f.impl,claim
    );
    resultados.push(response.status);
    assert.equal(f.getCalls(),1);
  }
  assert.deepEqual(resultados,[200,200]);
  assert.equal(vistos.size,2);
});
test('después de error OpenAI 429 la reserva NO se devuelve para reintento',async()=>{
  const caso=escenariosProducto.find(x=>x.id===CASOS_LAB[0]);
  const vistos=new Set();
  const claim=async(id)=>!vistos.has(id)&&(vistos.add(id),true);
  const f=mock(caso.items,429);
  const uno=await handleCotirondaDevAi(req({
    mode:'quality_case',case_id:caso.id
  }),env({qualityEnabled:'AUTORIZADO_DEV'}),f.impl,claim);
  const dos=await handleCotirondaDevAi(req({
    mode:'quality_case',case_id:caso.id
  }),env({qualityEnabled:'AUTORIZADO_DEV'}),f.impl,claim);
  assert.equal(uno.status,502);
  assert.equal(dos.status,409);
  assert.equal(f.getCalls(),1);
});
test('source de Edge usa admin sólo para INSERT del caso permitido',()=>{
  const src=readFileSync('supabase/functions/cotironda-ia-dev/index.ts','utf8');
  assert.match(src,/ctx\.supabaseAdmin/);
  assert.match(src,/\.from\('dev_ia_quality_claims'\)/);
  assert.match(src,/\.insert\(\{case_id:caseId\}\)/);
  assert.ok(!src.includes('NEXT_PUBLIC_OPENAI'));
});
test('DDL de cuota: RLS, case_id único, privilegios solamente del backend',()=>{
  const sql=readFileSync('supabase/sql/dev_quality_once_only.sql','utf8');
  assert.match(sql,/case_id text PRIMARY KEY/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON TABLE public\.dev_ia_quality_claims FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/GRANT SELECT, INSERT ON TABLE public\.dev_ia_quality_claims TO service_role/);
  for(const id of CASOS_LAB)assert.ok(sql.includes(id));
  assert.ok(!sql.includes('SECURITY DEFINER'));
});
