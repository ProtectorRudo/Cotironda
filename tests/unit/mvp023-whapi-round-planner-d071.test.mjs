import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPlanificadorRondaD071}
 from '../../src/server/whapi-round-planner-d071.ts';

const round='dddddddd-0016-4016-8016-000000000661';
const channel='d065_ci';
const base={state:'queued_without_sending',matchedSuppliers:2,prepared:2,
 alreadyPrepared:0,pendingContact:0,pendingScope:0,messagesSent:0};
function fixture({enabled=true,rpc=async()=>({payload:base})}={}){
 const calls=[];
 const planner=crearPlanificadorRondaD071({habilitado:enabled,channel,
  committedRpc:async(sql,args)=>{calls.push({sql,args});return rpc(sql,args);}});
 return{planner,calls};
}
test('D071 arma dos consultas de rubros distintos sin enviar WhatsApp',async()=>{
 const f=fixture();
 assert.deepEqual(await f.planner.planificar({roundId:round}),{
  estado:'queued_without_sending',
  proveedoresSeleccionados:2,nuevasInvitaciones:2,
  invitacionesExistentes:0,proveedoresPendientesContacto:0,
  proveedoresPendientesAlcance:0,mensajesEnviados:0});
 assert.equal(f.calls.length,1);
 assert.deepEqual(f.calls[0].args,[round,channel]);
 assert.match(f.calls[0].sql,/whapi_prepare_commercial_round_d071/);
 assert.doesNotMatch(JSON.stringify(f.calls),/whapi.cloud|messages\/text/);
});
test('D071 apagado no toca PostgreSQL',async()=>{
 const f=fixture({enabled:false});
 assert.deepEqual(await f.planner.planificar({roundId:round}),
  {estado:'desactivado',mensajesEnviados:0});
 assert.equal(f.calls.length,0);
});
test('D071 informa contacto pendiente sin bloquear a otro proveedor',async()=>{
 const f=fixture({rpc:async()=>({payload:{...base,
  prepared:1,pendingContact:1}})});
 assert.deepEqual(await f.planner.planificar({roundId:round}),{
  estado:'queued_without_sending',proveedoresSeleccionados:2,
  nuevasInvitaciones:1,invitacionesExistentes:0,
  proveedoresPendientesContacto:1,proveedoresPendientesAlcance:0,
  mensajesEnviados:0});
});
test('D071 reintento idempotente distingue preparadas y existentes',async()=>{
 let n=0;
 const f=fixture({rpc:async()=>({payload:n++===0?base:{
  ...base,prepared:0,alreadyPrepared:2}})});
 const a=await f.planner.planificar({roundId:round});
 const b=await f.planner.planificar({roundId:round});
 assert.equal(a.nuevasInvitaciones,2);
 assert.equal(b.nuevasInvitaciones,0);
 assert.equal(b.invitacionesExistentes,2);
});
test('D071 ubicación sin verificar no inventa proveedores',async()=>{
 const f=fixture({rpc:async()=>({payload:{...base,
  state:'needs_verified_location',matchedSuppliers:0,prepared:0}})});
 const r=await f.planner.planificar({roundId:round});
 assert.equal(r.estado,'needs_verified_location');
 assert.equal(r.proveedoresSeleccionados,0);
});
test('D071 no filtra datos del proveedor cuando backend devuelve identidad inesperada',async()=>{
 const f=fixture({rpc:async()=>({payload:{...base,phone:'549221111111'}})});
 await assert.rejects(f.planner.planificar({roundId:round}),/d071_plan_unavailable/);
});
test('D071 rechaza conteos falsos, pedidos cruzados, estados inválidos',async()=>{
 const bad=[{...base,messagesSent:1},{...base,matchedSuppliers:3},
  {...base,prepared:-1},{...base,pendingScope:NaN},
  {...base,state:'accepted_by_transport'},
  {...base,state:'needs_catalog_mapping'},
  {...base,prepared:1.5},{...base,matchedSuppliers:11},
  {...base,chatKey:'a'.repeat(64)}];
 for(const p of bad){
  const f=fixture({rpc:async()=>({payload:p})});
  await assert.rejects(f.planner.planificar({roundId:round}),
   /d071_plan_unavailable/);
 }
});
test('D071 falla cerrado con RPC caído y UUID inválido sin llamar servidor',async()=>{
 const f=fixture({rpc:async()=>{throw Error('timeout')}});
 await assert.rejects(f.planner.planificar({roundId:round}),/d071_plan_unavailable/);
 assert.equal(f.calls.length,1);
 await assert.rejects(f.planner.planificar({roundId:'not-a-round'}),/d071_plan_unavailable/);
 assert.equal(f.calls.length,1);
});
test('D071 configuración solo servidor y puerto explícito',()=>{
 for(const patch of [{habilitado:'sí'},{channel:'otro canal'},
  {committedRpc:null}]){
  assert.throws(()=>crearPlanificadorRondaD071({
   habilitado:false,channel,committedRpc:async()=>({payload:null}),...patch}),
   /d071_plan_unavailable/);
 }
});
