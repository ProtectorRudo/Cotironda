import test from 'node:test';
import assert from 'node:assert/strict';
import {procesarCreacionRondaD064,habilitarCreacionRondaD064}
 from '../../src/server/buyer-round-create-http-d064.ts';
const ID='cccccccc-0015-4015-8015-000000000657';
const ROUND='dddddddd-0015-4015-8015-000000000658';
const ACTOR={userId:'11111111-0015-4015-8015-000000000651',
 emailVerificado:true,anonimo:false};
const BODY={requestId:ID,deliveryZone:'La Plata',vatRequest:'con_iva',
 items:[{line_no:1,product_code:'cemento_gris_obra',quantity:'10',unit:'bag',source_description:'Cemento CPC 50 kg'}]};
const make=(input=BODY,opts={})=>{
 const calls=[];
 const deps={habilitado:true,originPermitido:'https://cotironda.invalid',
  verificarSesion:async()=>ACTOR,
  crear:async body=>{calls.push(body);return{
   roundId:ROUND,status:'programada',repeated:false}},...opts};
 const req=new Request('https://cotironda.invalid/api/rondas',{
  method:'POST',headers:{'origin':'https://cotironda.invalid',
   'content-type':'application/json','sec-fetch-site':'same-origin'},
  body:JSON.stringify(input)});
 return{req,deps,calls};
};
test('D064: una solicitud con IVA explícito y zona devuelve ronda real, cero envíos',async()=>{
 const t=make();
 const r=await procesarCreacionRondaD064(t.req,t.deps);
 assert.equal(r.status,201);
 assert.deepEqual(await r.json(),{roundId:ROUND,status:'programada',
  repeated:false,invitationsSent:0});
 assert.equal(t.calls.length,1);
 assert.deepEqual(t.calls[0],BODY);
 assert.match(r.headers.get('cache-control'),/no-store/);
});
test('D064: repetición retorna misma ronda y HTTP 200 sin segundo envío',async()=>{
 const t=make(BODY,{crear:async()=>({
  roundId:ROUND,status:'programada',repeated:true})});
 const r=await procesarCreacionRondaD064(t.req,t.deps);
 assert.equal(r.status,200);
 assert.equal((await r.json()).repeated,true);
});
test('D064: falta zona, unidad, cantidad o material explícito: 400 sin RPC',async()=>{
 const cases=[
  {...BODY,deliveryZone:''},
  {...BODY,deliveryZone:'http://evil.invalid'},
  {...BODY,items:[{...BODY.items[0],quantity:'0'}]},
  {...BODY,items:[{...BODY.items[0],quantity:'NaN'}]},
  {...BODY,items:[{...BODY.items[0],product_code:'CEMENTO'}]},
  {...BODY,items:[{...BODY.items[0],source_description:'https://ejemplo.invalid'}]},
  {...BODY,items:[{...BODY.items[0],source_description:'Cemento\\ninyectar'}]},
  {...BODY,items:[{...BODY.items[0],source_description:''}]},
  {...BODY,items:[{...BODY.items[0],source_description:'Pintura látex interior'}]},
  {...BODY,items:[{...BODY.items[0],source_description:'Cemento cola flexible'}]},
  {...BODY,items:[{...BODY.items[0],source_description:'Cemento blanco 25 kg'}]},
  {...BODY,items:[{...BODY.items[0],source_description:'Cemento y pintura latex'}]},
  {...BODY,items:[{...BODY.items[0],product_code:'pintura_latex'}]},
  {...BODY,items:[{line_no:1,product_code:'cemento_gris_obra',quantity:'10',unit:'bag'}]},
  {...BODY,items:[{...BODY.items[0],source_description:'Cemento CPC 5492211234567'}]},
  {...BODY,items:[{...BODY.items[0],source_description:'Cemento',otro:'intruso'}]},
  {...BODY,items:[{...BODY.items[0],unit:'tonelada'}]},
  {...BODY,items:[{...BODY.items[0],line_no:2}]},
  {...BODY,items:[BODY.items[0],BODY.items[0]]},
  {...BODY,items:[]},
  {...BODY,vatRequest:'iva_supuesto'},
  {...BODY,supplier_org_id:'fake_supplier'},
  {...BODY,requestId:'not-a-uuid'},
  {...BODY,companyId:'other-tenant'},
  {...BODY,items:[{...BODY.items[0],supplierId:'inventado'}]}
 ];
 for(const payload of cases){
  const t=make(payload);
  const res=await procesarCreacionRondaD064(t.req,t.deps);
  assert.equal(res.status,400,JSON.stringify(payload));
  assert.equal(t.calls.length,0);
 }
});
test('D064: no acepta cross-site, origen ausente, método incorrecto ni body gigante',async()=>{
 const t=make();
 for(const heads of [
  {'content-type':'application/json','origin':'https://evil.invalid'},
  {'content-type':'application/json'},
  {'content-type':'text/plain','origin':'https://cotironda.invalid'},
  {'content-type':'application/json','origin':'https://cotironda.invalid',
   'sec-fetch-site':'cross-site'}
 ]){
  const req=new Request('https://cotironda.invalid/api/rondas',{
   method:'POST',headers:heads,body:JSON.stringify(BODY)});
  const r=await procesarCreacionRondaD064(req,t.deps);
  assert.ok([403,415].includes(r.status));
 }
 const big=make({...BODY,items:[...BODY.items],
  deliveryZone:'A'.repeat(5000)});
 assert.equal((await procesarCreacionRondaD064(big.req,big.deps)).status,413);
 assert.equal(t.calls.length,0);
});
test('D064: una sesión inválida o revocada en RPC no crea ronda',async()=>{
 for(const invalid of [null,{...ACTOR,emailVerificado:false},
  {...ACTOR,anonimo:true},{...ACTOR,userId:'invalid'}]){
  const t=make(BODY,{verificarSesion:async()=>invalid});
  const r=await procesarCreacionRondaD064(t.req,t.deps);
  assert.equal(r.status,401);
  assert.equal(t.calls.length,0);
 }
});
test('D064: SQL deniega empresa ajena, devuelve 503 opaco al cliente',async()=>{
 const t=make(BODY,{crear:async()=>{throw Error('supplier_private_id')}});
 const r=await procesarCreacionRondaD064(t.req,t.deps);
 assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{error:'solicitud_no_disponible'});
});
test('D064: respuesta SQL adulterada no provoca falso éxito',async()=>{
 for(const value of [{roundId:ROUND,status:'abierta',repeated:false},
  {roundId:ROUND,status:'programada',repeated:false,identity:'secret'},
  {roundId:'bad',status:'programada',repeated:false},
  {roundId:ROUND,status:'programada',repeated:'yes'}]){
  const t=make(BODY,{crear:async()=>value});
  assert.equal((await procesarCreacionRondaD064(t.req,t.deps)).status,503);
 }
});
test('D064: flags de Preview restringen alta y dejan producción cerrada',()=>{
 const env={COTIRONDA_ROUNDS_READ_ENABLED:'true',
  COTIRONDA_ROUNDS_CREATE_ENABLED:'true',
  COTIRONDA_REGISTRATION_ENABLED:'false',
  VERCEL_ENV:'preview',
  COTIRONDA_SUPABASE_PROJECT_REF:'qkercsoqhehbenbbncwk',
  NEXT_PUBLIC_SUPABASE_URL:'https://qkercsoqhehbenbbncwk.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
 assert.equal(habilitarCreacionRondaD064(env),true);
 for(const change of [{VERCEL_ENV:'production'},
  {COTIRONDA_ROUNDS_CREATE_ENABLED:'false'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_ROUNDS_READ_ENABLED:'false'},
  {COTIRONDA_DATABASE_URL:'private'}])
  assert.equal(habilitarCreacionRondaD064({...env,...change}),false);
});
test('D064: Origin canónico server-only bloquea host reescrito y destino falso',async()=>{
 const src=make(BODY,{originPermitido:'https://other.example'});
 assert.equal((await procesarCreacionRondaD064(src.req,src.deps)).status,403);
 const missing=make(BODY,{originPermitido:''});
 assert.equal((await procesarCreacionRondaD064(missing.req,missing.deps)).status,403);
 assert.equal(src.calls.length,0);
 assert.equal(missing.calls.length,0);
});

test('MVP029: seis familias curadas pasan el filtro HTTP sin depender de la UI',async()=>{
 const items=[
  ['cemento_gris_obra','Cemento CPC Loma Negra 50 kg','bag'],
  ['hidrofugo','Hidrófugo Ceresita 10 kg','unit'],
  ['pintura_latex','Pintura látex interior blanco','l'],
  ['placa_yeso','Placas de yeso RH 12,5 mm','unit'],
  ['cable_unipolar','Cable unipolar 2,5 mm²','m'],
  ['cano_pvc','Caño PVC 110 mm','m']
 ];
 for(const [product_code,source_description,unit] of items){
  const t=make({...BODY,items:[{line_no:1,product_code,source_description,quantity:'10',unit}]});
  const r=await procesarCreacionRondaD064(t.req,t.deps);
  assert.equal(r.status,201,product_code+' '+source_description);
  assert.equal(t.calls.length,1);
 }
});
test('MVP029: llamadas directas maliciosas 400 sin tocar SQL',async()=>{
 const bad=[
  ['pintura_latex','Cemento CPC 50 kg'],
  ['placa_yeso','Cemento CPC 50 kg'],
  ['cemento_gris_obra','Pintura látex interior'],
  ['cemento_gris_obra','Cemento de contacto 1 litro'],
  ['pintura_latex','Guantes de látex descartables'],
  ['cable_unipolar','Cable de red UTP'],
  ['cano_pvc','Caño PVC eléctrico'],
  ['no_curado_123','Cemento CPC 50 kg'],
  ['cemento_gris_obra','Cemento látex'],
 ];
 for(const [product_code,source_description] of bad){
  const t=make({...BODY,items:[{...BODY.items[0],product_code,source_description}]});
  const r=await procesarCreacionRondaD064(t.req,t.deps);
  assert.equal(r.status,400,product_code+' '+source_description);
  assert.equal(t.calls.length,0);
 }
});
