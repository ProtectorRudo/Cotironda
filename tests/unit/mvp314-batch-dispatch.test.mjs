import test from 'node:test';
import assert from 'node:assert/strict';
import {continuarDespachoMvp314} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-batch-mvp314.ts';
const A='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const B='469cb459-5f00-49c2-b0b9-bc8b11e5c901';
const fake=(count,opts={})=>{
 const remaining=Array.from({length:count},(_,i)=>i%2===0?A:B);
 const state={calls:0,sent:[],quota:opts.quota??999,uncertainAt:opts.uncertainAt??-1};
 return {state,
  rpc:async(name,params)=>{
   assert.equal(name,'cotironda_piloto_ia_next_batch_mvp314');
   assert.deepEqual(params,{});state.calls++;
   if(state.sent.length>=state.quota)
    return {data:{state:'budget_exhausted'},error:null};
   return {data:remaining.length?{state:'ready',request_id:remaining[0]}:
    {state:'empty'},error:null};
  },
  dispatch:async requestId=>{
   assert.equal(requestId,remaining[0]);remaining.shift();
   const i=state.sent.length;state.sent.push(requestId);
   return {estado:'terminado',reclamados:1,
    apiAceptados:i===state.uncertainAt?0:1,
    inciertos:i===state.uncertainAt?1:0};
  }
 };
};
test('MVP314: OFF means zero database calls and zero outgoing',async()=>{
 const f=fake(20);
 assert.deepEqual(await continuarDespachoMvp314({enabled:false,...f}),
  {estado:'inactivo',reclamados:0,apiAceptados:0,inciertos:0});
 assert.equal(f.state.calls,0);assert.equal(f.state.sent.length,0);
});
for(const size of [1,2,5,20]){
 test('MVP314: '+size+' providers drain across separate, <=2-job ticks',async()=>{
  const f=fake(size);const runs=[];
  for(let i=0;i<15;i++){
   const res=await continuarDespachoMvp314({enabled:true,...f});
   runs.push(res);assert.ok(res.reclamados<=2);
   if(res.estado==='sin_trabajos')break;
   assert.equal(res.estado,'procesado');
  }
  assert.equal(f.state.sent.length,size);
  assert.equal(runs.reduce((n,r)=>n+r.apiAceptados,0),size);
  assert.equal(runs.at(-1).estado,'sin_trabajos');
  assert.equal(runs.length,Math.ceil(size/2)+1);
 });
}
test('MVP314: the durable daily cap stops the next claim',async()=>{
 const f=fake(20,{quota:3});
 const first=await continuarDespachoMvp314({enabled:true,...f});
 const second=await continuarDespachoMvp314({enabled:true,...f});
 const third=await continuarDespachoMvp314({enabled:true,...f});
 assert.equal(first.reclamados,2);
 assert.equal(second.estado,'limite_diario');
 assert.equal(second.reclamados,1);
 assert.equal(third.reclamados,0);
 assert.equal(f.state.sent.length,3);
});
test('MVP314: timeout/unknown is terminal; not selected again',async()=>{
 const f=fake(5,{uncertainAt:1});let unknown=0;
 for(let i=0;i<4;i++){
  const r=await continuarDespachoMvp314({enabled:true,...f});
  unknown+=r.inciertos;
 }
 assert.equal(unknown,1);assert.equal(f.state.sent.length,5);
});
test('MVP314: invalid selector or unexpected RPC response fails closed',async()=>{
 const f=fake(2);
 assert.equal((await continuarDespachoMvp314({...f,enabled:true,
  rpc:async()=>({data:{state:'ready',request_id:'not-a-uuid'},error:null})
 })).estado,'requiere_conciliacion');
 assert.equal(f.state.sent.length,0);
});
test('MVP314: first transport reconciliation error stops the batch',async()=>{
 const f=fake(20);let calls=0;
 const r=await continuarDespachoMvp314({enabled:true,rpc:f.rpc,
  dispatch:async()=>{calls++;return {
   estado:'requiere_conciliacion',reclamados:1,apiAceptados:0,inciertos:1
  }}});
 assert.equal(r.estado,'requiere_conciliacion');
 assert.equal(calls,1);
});
test('MVP314: incorrect claimed counts never trigger a second dispatch',async()=>{
 const f=fake(20);let calls=0;
 const r=await continuarDespachoMvp314({enabled:true,rpc:f.rpc,
  dispatch:async()=>{calls++;return {
   estado:'terminado',reclamados:2,apiAceptados:2,inciertos:0
  }}});
 assert.equal(r.estado,'requiere_conciliacion');
 assert.equal(calls,1);
});
