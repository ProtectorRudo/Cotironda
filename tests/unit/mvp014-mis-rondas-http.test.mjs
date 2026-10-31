import test from 'node:test';
import assert from 'node:assert/strict';
import {procesarMisRondasMvp014,misRondasHabilitado}
 from '../../src/server/mis-rondas-http-mvp014.ts';
const id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const actor={userId:'11111111-1111-4111-8111-111111111111',
 emailVerificado:true,anonimo:false};
const row={round_id:id,round_status:'abierta',
 begins_at:'2026-11-01T12:00:00+00:00',
 ends_at:'2026-11-03T12:00:00+00:00',item_count:2};
const base=(change={})=>({habilitado:true,verificarSesion:async()=>actor,
 leer:async()=>[row],...change});
async function request(change={},method='GET'){
 return procesarMisRondasMvp014(new Request('https://cotironda.invalid/api/rondas',
  {method}),base(change));
}
test('MVP-014 list returns only own rounds and browser cannot cache',async()=>{
 const res=await request();
 assert.equal(res.status,200);
 assert.match(res.headers.get('cache-control'),/no-store/);
 assert.match(res.headers.get('vary'),/Cookie/);
 assert.deepEqual(await res.json(),{rondas:[row]});
});
test('MVP-014 buyer with no rounds sees empty list, no fake records',async()=>{
 const res=await request({leer:async()=>[]});
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{rondas:[]});
});
test('MVP-014 invalid auth returns 401 without querying data',async()=>{
 let count=0;
 for(const user of [null,{...actor,anonimo:true},
   {...actor,emailVerificado:false},{...actor,userId:'unknown'}]){
  const res=await request({verificarSesion:async()=>user,
   leer:async()=>{count++;return[row]}});
  assert.equal(res.status,401);
 }
 assert.equal(count,0);
});
test('MVP-014 list disabled, wrong method, auth/network failure fail closed',async()=>{
 assert.equal((await request({habilitado:false})).status,503);
 assert.equal((await request({},'POST')).status,405);
 const r=await request({verificarSesion:async()=>{throw Error('secret')}});
 assert.equal(r.status,503);
 assert.equal(JSON.stringify(await r.json()).includes('secret'),false);
});
test('MVP-014 invalid SQL response, cross-tenant identity or duplicates rejected',async()=>{
 const invalid=[
  null,{rows:[row]},'anything',
  [{...row,supplier_org_id:'secret'}],
  [{...row,whatsapp:'5492211234567'}],
  [{...row,item_count:9}],
  [{...row,round_status:'borrador'}],
  [{...row,round_id:'../../admin'}],
  [{...row,begins_at:'invalid'}],
  [row,row],
  Array.from({length:41},(_,i)=>({...row,round_id:i%2===0?id:'another'}))
 ];
 for(const value of invalid){
  const res=await request({leer:async()=>value});
  assert.equal(res.status,503);
  assert.deepEqual(await res.json(),{error:'rondas_no_disponibles'});
 }
});
test('MVP-014 list is independent of quote RPC and never activates on production',()=>{
 const env={COTIRONDA_ROUNDS_READ_ENABLED:'true',
 COTIRONDA_QUOTES_READ_ENABLED:'true',
 COTIRONDA_REGISTRATION_ENABLED:'false',VERCEL_ENV:'preview',
 COTIRONDA_SUPABASE_PROJECT_REF:'qkercsoqhehbenbbncwk',
 NEXT_PUBLIC_SUPABASE_URL:'https://qkercsoqhehbenbbncwk.supabase.co',
 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_dummy'};
 assert.equal(misRondasHabilitado(env),true);
 assert.equal(misRondasHabilitado({...env,VERCEL_ENV:'production'}),false);
 assert.equal(misRondasHabilitado({...env,COTIRONDA_QUOTES_READ_ENABLED:'false'}),true);
 assert.equal(misRondasHabilitado({...env,SUPABASE_SERVICE_ROLE_KEY:'key'}),false);
});
