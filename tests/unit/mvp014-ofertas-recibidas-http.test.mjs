import test from 'node:test';
import assert from 'node:assert/strict';
import {procesarLecturaOfertasMvp014,ofertasLecturaHabilitada}
 from '../../src/server/cotizaciones-recibidas-http-mvp014.ts';
import {puertoPreciosDeclaradosMvp014}
 from '../../apps/portal/lib/cotizaciones-recibidas-rpc-mvp014.ts';

const ID='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER='11111111-1111-4111-8111-111111111111';
const ROOT='https://cotironda.invalid/api/rondas/'+ID+'/cotizaciones';
const ACTOR={userId:USER,emailVerificado:true,anonimo:false};
const ROUND={round_id:ID,round_status:'abierta',
 begins_at:'2026-11-01T12:00:00+00:00',ends_at:'2026-11-03T12:00:00+00:00',
 items:[{line_no:1,product_code:'cemento_001',quantity:'10.000',unit:'bag'},
  {line_no:2,product_code:'pintura_002',quantity:'5.000',unit:'l'}]};
const QUOTE={supplier_alias:'anon_comercio_01',offer_version:2,line_no:1,
 quoted_unit_price:'121.00',vat_basis:'no_informado',currency:'ARS',
 quoted_unit:'bag',available_qty:'10',freight_gross:null,
 payment_method:null,lead_days:null};
const deps=(override={})=>({habilitado:true,verificarSesion:async()=>ACTOR,
 leerPropia:async()=>ROUND,leerOfertas:async()=>[QUOTE],...override});
async function get(override={},id=ID,method='GET'){
 return procesarLecturaOfertasMvp014(new Request(ROOT,{method}),id,deps(override));
}
test('MVP014 GET comprador real: última versión, precio original, IVA desconocido y no-store',async()=>{
 const r=await get();
 assert.equal(r.status,200);
 assert.match(r.headers.get('cache-control'),/no-store/);
 assert.match(r.headers.get('vary'),/Cookie/);
 assert.deepEqual(await r.json(),{ronda:ROUND,ofertas:[QUOTE]});
});
test('MVP014 no inventa oferta cuando proveedor aun no respondió',async()=>{
 const r=await get({leerOfertas:async()=>[]});
 assert.equal(r.status,200);
 assert.deepEqual((await r.json()).ofertas,[]);
});
test('MVP014 multi-proveedor, parcial y corrección explícita',async()=>{
 const other={...QUOTE,supplier_alias:'anon_comercio_02',
  offer_version:1,line_no:2,quoted_unit_price:'2500.00',
  vat_basis:'incluido',currency:'ARS',quoted_unit:'l',available_qty:'5',
  freight_gross:'0.00',payment_method:'transferencia',lead_days:3};
 const r=await get({leerOfertas:async()=>[QUOTE,other]});
 assert.equal(r.status,200);
 const {ofertas}=await r.json();
 assert.equal(ofertas[0].vat_basis,'no_informado');
 assert.equal(ofertas[1].freight_gross,'0.00');
 assert.equal(JSON.stringify(ofertas).includes('supplier_org_id'),false);
});
test('MVP014 flag apagada incluso con auth configurada y no requiere credenciales privilegiadas',()=>{
 const env={COTIRONDA_ROUNDS_READ_ENABLED:'true',
  COTIRONDA_QUOTES_READ_ENABLED:'true',
  COTIRONDA_REGISTRATION_ENABLED:'false',VERCEL_ENV:'preview',
  COTIRONDA_SUPABASE_PROJECT_REF:'qkercsoqhehbenbbncwk',
  NEXT_PUBLIC_SUPABASE_URL:'https://qkercsoqhehbenbbncwk.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
 assert.equal(ofertasLecturaHabilitada(env),true);
 for(const changes of [{VERCEL_ENV:'production'},
  {COTIRONDA_QUOTES_READ_ENABLED:'false'},
  {COTIRONDA_ROUNDS_READ_ENABLED:'false'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_DATABASE_URL:'secret'},
  {SUPABASE_SERVICE_ROLE_KEY:'secret'},
  {COTIRONDA_SUPABASE_PROJECT_REF:'another'}])
  assert.equal(ofertasLecturaHabilitada({...env,...changes}),false);
 assert.equal(ofertasLecturaHabilitada({}),false);
});
test('MVP014 sin sesion o miembro: 401/404 sin consultar precios',async()=>{
 let count=0;
 for(const override of [
  {verificarSesion:async()=>null},
  {verificarSesion:async()=>({...ACTOR,emailVerificado:false})},
  {leerPropia:async()=>null}
 ]){
  const r=await get({...override,leerOfertas:async()=>{count++;return [QUOTE]}});
  assert.equal(r.status,override.leerPropia?404:401);
 }
 assert.equal(count,0);
});
test('MVP014 error de Postgres, permiso RLS o inexistencia RPC: 503 opaco',async()=>{
 const r=await get({leerOfertas:async()=>{throw Error('supplier_private_secret')}});
 assert.equal(r.status,503);
 const text=JSON.stringify(await r.json());
 assert.equal(text.includes('private'),false);
 assert.equal(text.includes('supplier'),false);
});
test('MVP014 campo extraño, identidad, teléfono o precio alterado: respuesta rechazada',async()=>{
 const bad=[
  {...QUOTE,supplier_org_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
  {...QUOTE,phone:'5492211234567'},
  {...QUOTE,source_sha256:'e'.repeat(64)},
  {...QUOTE,currency:'BRL'},
  {...QUOTE,vat_basis:'iva21_supuesto'},
  {...QUOTE,quoted_unit_price:'121,00'},
  {...QUOTE,quoted_unit_price:'-100.00'},
  {...QUOTE,freight_gross:'gratis'},
  {...QUOTE,available_qty:'NaN'},
  {...QUOTE,quoted_unit:'miles'},
  {...QUOTE,payment_method:'credito_inventado'},
  {...QUOTE,line_no:3},
  {...QUOTE,offer_version:0},
  {...QUOTE,lead_days:400},
  {...QUOTE,supplier_alias:'nombre real y telefono'},
 ];
 for(const item of bad){
  const r=await get({leerOfertas:async()=>[item]});
  assert.equal(r.status,503,JSON.stringify(item));
  assert.deepEqual(await r.json(),{error:'ofertas_no_disponibles'});
 }
});
test('MVP014 no mezcla dos versiones de proveedor ni repite mismo articulo',async()=>{
 for(const rows of [
  [QUOTE,{...QUOTE,offer_version:3,line_no:2}],
  [QUOTE,QUOTE],
  [QUOTE,{...QUOTE,line_no:2,quoted_unit_price:'200.00',currency:'USD'}],
 ]){
  // All rows of the same offer version must agree about currency/terms.
  const r=await get({leerOfertas:async()=>rows});
  assert.equal(r.status,503);
 }
});
test('MVP014 UUID inválido/POST/feature OFF falla antes de los RPC',async()=>{
 let count=0;
 const q={leerOfertas:async()=>{count++;return [QUOTE]}};
 assert.equal((await get(q,'not-uuid')).status,400);
 assert.equal((await get(q,ID,'POST')).status,405);
 assert.equal((await get({...q,habilitado:false})).status,503);
 assert.equal(count,0);
});
test('MVP014 puerto hace una sola RPC para ronda propia, sin user_id ni identidades',async()=>{
 const calls=[];
 const client={rpc:async(name,args)=>{calls.push({name,args});
  return{data:[QUOTE],error:null}}};
 const out=await puertoPreciosDeclaradosMvp014(client).leerOfertas(ID);
 assert.deepEqual(out,[QUOTE]);
 assert.deepEqual(calls,[{name:'buyer_quoted_prices_d060',args:{p_round:ID}}]);
 assert.equal(JSON.stringify(calls).includes('user_id'),false);
});
test('MVP014 puerto falla cerrado si PostgREST responde error, no-array o null',async()=>{
 for(const ret of [
  {data:null,error:null},
  {data:{prices:[QUOTE]},error:null},
  {data:[QUOTE],error:{code:'42501',message:'secret-sql'}},
  {data:'raw',error:null}
 ]){
  const client={rpc:async()=>ret};
  await assert.rejects(puertoPreciosDeclaradosMvp014(client).leerOfertas(ID),
    /mvp014_rpc_no_disponible/);
 }
});
