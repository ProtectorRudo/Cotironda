import test from 'node:test';
import assert from 'node:assert/strict';
import {procesarLecturaRonda,rondasLecturaHabilitada} from '../../src/server/rondas-lectura-http.ts';
import {puertoRondasSoloLectura} from '../../apps/portal/lib/rondas-read-rpc.ts';

const ID='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER='11111111-1111-4111-8111-111111111111';
const URL='https://portal.example.com/api/rondas/'+ID;
const ACTOR={userId:USER,emailVerificado:true,anonimo:false};
const ROW={round_id:ID,round_status:'abierta',
  begins_at:'2026-11-01T12:00:00+00:00',ends_at:'2026-11-02T12:00:00+00:00',
  items:[{line_no:1,product_code:'cemento_001',quantity:'10.000',unit:'bag'}]};
const deps=(options={})=>({habilitado:true,verificarSesion:async()=>ACTOR,
  leerPropia:async()=>ROW,...options});
const get=(options)=>procesarLecturaRonda(new Request(URL,{method:'GET'}),ID,deps(options));
async function body(r){return r.json()}

test('GET autenticado muestra solo renglones propios y nunca almacena caché',async()=>{
  const res=await get();
  assert.equal(res.status,200);
  assert.equal(res.headers.get('cache-control')?.includes('no-store'),true);
  assert.equal(res.headers.get('vary')?.includes('Cookie'),true);
  assert.deepEqual(await body(res),{ronda:ROW});
  assert.equal(JSON.stringify(await get().then(body)).includes('supplier_org_id'),false);
});
test('flag se apaga por defecto incluso si hay Supabase configurado',async()=>{
  assert.equal((await get({habilitado:false})).status,503);
  const env={COTIRONDA_ROUNDS_READ_ENABLED:'true',
    COTIRONDA_REGISTRATION_ENABLED:'false',VERCEL_ENV:'preview',
    COTIRONDA_SUPABASE_PROJECT_REF:'qkercsoqhehbenbbncwk',
    NEXT_PUBLIC_SUPABASE_URL:'https://qkercsoqhehbenbbncwk.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
  assert.equal(rondasLecturaHabilitada(env),true);
  assert.equal(rondasLecturaHabilitada({...env,VERCEL_ENV:'production'}),false);
  assert.equal(rondasLecturaHabilitada({...env,COTIRONDA_REGISTRATION_ENABLED:'true'}),false);
  assert.equal(rondasLecturaHabilitada({...env,COTIRONDA_SUPABASE_PROJECT_REF:'another'}),false);
  assert.equal(rondasLecturaHabilitada({...env,SUPABASE_SERVICE_ROLE_KEY:'unsafe'}),false);
  assert.equal(rondasLecturaHabilitada({...env,COTIRONDA_DATABASE_URL:'unsafe'}),false);
  assert.equal(rondasLecturaHabilitada({}),false);
});
test('falta de usuario, sesión anónima, correo no verificado: 401',async()=>{
  for(const actor of [null,{...ACTOR,emailVerificado:false},
    {...ACTOR,anonimo:true},{...ACTOR,userId:'notuuid'}]){
    const r=await get({verificarSesion:async()=>actor});assert.equal(r.status,401);
    assert.deepEqual(await body(r),{error:'sesion_no_valida'});
  }
});
test('auth inaccesible no se interpreta como usuario válido',async()=>{
  const r=await get({verificarSesion:async()=>{throw Error('network')}});
  assert.equal(r.status,503);assert.deepEqual(await body(r),{error:'autenticacion_no_disponible'});
});
test('lector inaccesible (DB, RPC, permiso) falla 503 sin filtrar errores SQL',async()=>{
  const r=await get({leerPropia:async()=>{throw Error('secret sql error')}});
  assert.equal(r.status,503);
  assert.equal(JSON.stringify(await body(r)).includes('secret'),false);
});
test('round inexistente o de otra empresa retorna 404 indistinguible',async()=>{
  const r=await get({leerPropia:async()=>null});
  assert.equal(r.status,404);
  assert.deepEqual(await body(r),{error:'ronda_no_encontrada'});
});
test('UUID inválido se rechaza antes de llamar a red/DB',async()=>{
  let reads=0;
  const d=deps({leerPropia:async()=>{reads++;return ROW}});
  for(const bad of ['hola','../users','00000000-0000-0000-0000-000000000000',
    'not-a-uuid']){
    const r=await procesarLecturaRonda(new Request(URL),bad,d);
    assert.equal(r.status,400);
  }
  assert.equal(reads,0);
});
test('en method no GET retorna 405',async()=>{
  const r=await procesarLecturaRonda(new Request(URL,{method:'POST'}),ID,deps());
  assert.equal(r.status,405);
});
test('identidad de ronda diferente, PII o propiedades extra abortan response',async()=>{
  const invalid=[
    {...ROW,round_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},
    {...ROW,supplier_org_id:'filtrado'},
    {...ROW,items:[{...ROW.items[0],whatsapp:'2212345678'}]},
    {...ROW,items:[{...ROW.items[0],unit:'producto'}]},
    {...ROW,items:[{...ROW.items[0],quantity:'NaN'}]},
    {...ROW,items:[ROW.items[0],ROW.items[0]]},
    {...ROW,items:[]},
    {...ROW,items:[{...ROW.items[0],product_code:'Cemento 50'}]},
    {...ROW,round_status:'borrador'}
  ];
  for(const item of invalid){
    const r=await get({leerPropia:async()=>item});
    assert.equal(r.status,503);
    assert.deepEqual(await body(r),{error:'lectura_no_disponible'});
  }
});
test('puerto RPC solo llama función autorizada, nunca acepta user_id como entrada',async()=>{
  let called=null;
  const client={rpc:async(name,args)=>{called={name,args};return {data:[ROW],error:null}}};
  const out=await puertoRondasSoloLectura(client).leerPropia(ID);
  assert.deepEqual(out,ROW);
  assert.deepEqual(called,{name:'buyer_round_overview_v1',args:{p_round_id:ID}});
  assert.equal(JSON.stringify(called).includes('user_id'),false);
});
test('respuestas múltiples/anómalas o error de RPC nunca se propagan',async()=>{
  for(const response of [{data:[ROW,ROW],error:null},
    {data:{...ROW},error:null},
    {data:null,error:{code:'42501',message:'private details'}}]){
    const client={rpc:async()=>response};
    await assert.rejects(()=>puertoRondasSoloLectura(client).leerPropia(ID),
      /ronda_rpc_/);
  }
});
test('resultados vacíos de RPC no revelan existencia ni identidad',async()=>{
  const out=await puertoRondasSoloLectura({rpc:async()=>({data:[],error:null})}).leerPropia(ID);
  assert.equal(out,null);
});
