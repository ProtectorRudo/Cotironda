import test from 'node:test';
import assert from 'node:assert/strict';
import { puertoRegistroRpc } from '../../apps/portal/lib/registro-rpc.ts';
const input={userId:'usurpado',idempotencyKey:'11111111-1111-4111-8111-111111111111',
nombre:'Empresa A',tipo:'buyer',nombreComercial:null,rolInicial:'owner',cotizacionesHabilitadas:false};
test('RPC nunca envía user_id, rol ni empresa elegida por cliente',async()=>{
 let params;
 const port=puertoRegistroRpc({rpc:async(name,p)=>{assert.equal(name,'register_company_for_current_user');params=p;return {data:[{organization_id:'org-1',replay:false}],error:null};}});
 const result=await port.crearEmpresaConPropietario(input);
 assert.deepEqual(result,{organizationId:'org-1',replay:false});
 assert.deepEqual(Object.keys(params).sort(),['p_name','p_request_id','p_trade_name','p_type']);
});
test('replay respeta la respuesta del servidor',async()=>{
 const p=puertoRegistroRpc({rpc:async()=>({data:[{organization_id:'org-1',replay:true}],error:null})});
 assert.equal((await p.crearEmpresaConPropietario(input)).replay,true);
});
test('conflicto se transforma en error acotado',async()=>{
 const p=puertoRegistroRpc({rpc:async()=>({data:null,error:{code:'23505'}})});
 await assert.rejects(p.crearEmpresaConPropietario(input),/request_id_conflictivo/);
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
