import test from 'node:test';
import assert from 'node:assert/strict';
import { puertoRegistroRpc } from '../../apps/portal/lib/registro-rpc.ts';
const input={userId:'usurpado',idempotencyKey:'11111111-1111-4111-8111-111111111111',
nombre:'Empresa A',tipo:'buyer',nombreComercial:null,rolInicial:'owner',cotizacionesHabilitadas:false};
test('RPC nunca envía user_id, rol ni empresa elegida por cliente',async()=>{
 let params;
 const port=puertoRegistroRpc({rpc:async(name,p)=>{assert.equal(name,'register_company_for_current_user');params=p;return {data:[{organization_id:'org-1',replay:false,registration_status:'ok'}],error:null};}});
 const result=await port.crearEmpresaConPropietario(input);
 assert.deepEqual(result,{organizationId:'org-1',replay:false});
 assert.deepEqual(Object.keys(params).sort(),['p_name','p_request_id','p_trade_name','p_type']);
});
test('replay respeta la respuesta del servidor',async()=>{
 const p=puertoRegistroRpc({rpc:async()=>({data:[{organization_id:'org-1',replay:true,registration_status:'ok'}],error:null})});
 assert.equal((await p.crearEmpresaConPropietario(input)).replay,true);
});
test('conflicto SQL en error se transforma en fallo cerrado',async()=>{
 const p=puertoRegistroRpc({rpc:async()=>({data:null,error:{code:'400',message:'idempotency_conflict'}})});
 await assert.rejects(p.crearEmpresaConPropietario(input),/registro_rpc_no_disponible/);
});
test('errores no filtran detalles de Supabase',async()=>{
 const p=puertoRegistroRpc({rpc:async()=>({data:null,error:{message:'contraseña-supersecreta'}})});
 await assert.rejects(p.crearEmpresaConPropietario(input),e=>e.message==='registro_rpc_no_disponible');
});
test('no acepta datos RPC malformados',async()=>{
 for(const data of [null,[],[{}],[{organization_id:'a',replay:'true'}], [{organization_id:'x',replay:false},{organization_id:'y',replay:false}]]){
  const p=puertoRegistroRpc({rpc:async()=>({data,error:null})});
  await assert.rejects(p.crearEmpresaConPropietario(input),/respuesta_rpc_invalida/);
 }
});

test('cuota usa HTTP 429 del PostgrestResponse, aunque PostgrestError no tenga status',async()=>{
 for(const result of [
  {status:200,data:[{organization_id:null,replay:null,registration_status:'rate_limited'}],error:null},
  {status:429,data:null,error:{code:'PGRST_TEST',message:'Too Many Requests'}},
  {status:429,data:null,error:{message:'Sin código explícito de cuota'}},
  {status:429,data:null,error:null}
 ]){
  const p=puertoRegistroRpc({rpc:async()=>result});
  await assert.rejects(p.crearEmpresaConPropietario(input),e=>e.message==='limite_intentos');
 }
});
test('no confunde mensajes arbitrarios con HTTP 429',async()=>{
 const p=puertoRegistroRpc({rpc:async()=>({
  status:503,data:null,error:{message:'rate_limited (texto no confiable)',code:'PGRST500'}
 })});
 await assert.rejects(p.crearEmpresaConPropietario(input),e=>e.message==='registro_rpc_no_disponible');
});
test('respuestas estructuradas de rechazo del SQL sin datos internos',async()=>{
 const map=[
  ['organization_quota','limite_registros'],
  ['idempotency_conflict','request_id_conflictivo'],
  ['invalid_request','solicitud_invalida'],
  ['session_invalid','registro_rpc_no_disponible'],
  ['internal_error','registro_rpc_no_disponible']
 ];
 for(const [status,expected] of map){
  const p=puertoRegistroRpc({rpc:async()=>({data:[{organization_id:null,replay:null,registration_status:status}],error:null})});
  await assert.rejects(p.crearEmpresaConPropietario(input),e=>e.message===expected);
 }
});
test('RPC ok exige estado exacto y campos de éxito válidos',async()=>{
 for(const data of [
  [{organization_id:'a',replay:false}],
  [{organization_id:'a',replay:false,registration_status:'desconocido'}],
  [{organization_id:null,replay:false,registration_status:'ok'}],
  [{organization_id:'a',replay:'false',registration_status:'ok'}]
 ]){
  const p=puertoRegistroRpc({rpc:async()=>({data,error:null})});
  await assert.rejects(p.crearEmpresaConPropietario(input));
 }
});
