import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluarLecturasSemanticasV2D013}
 from '../../src/domain/ia-central/contrato-v2-d013.ts';
import {planificarMensajeAutenticadoMvp220}
 from '../../src/domain/ia-central/planificador-piloto-v2-d013.ts';
import {armarPreparacionSombraMvp221,cantidadUnidadSqlV2D013}
 from '../../src/domain/ia-central/puente-sql-rondas-v2-d013.ts';

const original='Hola, necesito cotizar para una obra en La Plata.\n'+
 '10 bolsas de cemento de 25 kilos.\n'+
 '1 bolsón de arena fina de 1 m³.\n'+
 '3 baldes de albañil de 10 litros.\n'+
 '2 rollos de membrana aluminizada de 4 mm.';
const spans=[
 '10 bolsas de cemento de 25 kilos',
 '1 bolsón de arena fina de 1 m³',
 '3 baldes de albañil de 10 litros',
 '2 rollos de membrana aluminizada de 4 mm'
];
const descriptions=[
 'Cemento de obra 25 kg','Bolsón arena fina 1 m³',
 'Balde de albañil 10 L','Membrana aluminizada 4 mm'
];
const first={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
 articulos:spans.map((evidencia,i)=>({
  evidencia,inicio:original.indexOf(evidencia),
  fin:original.indexOf(evidencia)+evidencia.length,
  descripcion:descriptions[i],cantidad:['10','1','3','2'][i],
  unidad:['bag','bigbag','bucket','roll'][i],
  rubro:'obra_gruesa',presentacion:['25 kg','1 m3','10 L','4 mm'][i],
  citaCantidad:['10','1','3','2'][i],
  citaProducto:['cemento','arena fina','baldes de albañil',
   'membrana aluminizada'][i],
  citaPresentacion:['25 kilos','1 m³','10 litros','4 mm'][i],
  aclaracion:null
 }))};
const secondary=(i)=>({
 evidencia:['cemento de 25 kilos','arena fina de 1 m³',
  'baldes de albañil de 10 litros','membrana aluminizada de 4 mm'][i],
 cantidad:first.articulos[i].cantidad,
 unidad:['bolsas','bolson','unidades','unidades'][i],
 citaCantidad:['diez','uno','tres','dos'][i],
 rubro:'ferreteria'
});
const second={integridad:'faltan_articulos',zona_entrega:'la plata',
 articulos:[secondary(3),secondary(0),secondary(1)]};

test('V2: falta un artículo en lectura secundaria, conserva 4 y retiene solo 1',()=>{
 const r=evaluarLecturasSemanticasV2D013(original,first,second);
 assert.equal(r.estado,'listo_para_preparar',r.motivo);
 assert.equal(r.motivo,'articulos_en_revision_sin_bloquear_ronda');
 assert.deepEqual(r.pedido.articulosEnRevision,[2]);
 assert.deepEqual(r.pedido.articulos.map(x=>x.evidencia),spans);
 assert.equal(r.pedido.articulos[2].cantidad,'3');
});
test('V2: alteración de cantidad solo retiene ese material; demás avanzan',()=>{
 const changed=structuredClone(second);
 changed.integridad='completa';
 changed.articulos.push({...secondary(2),cantidad:'10',citaCantidad:'diez'});
 const r=evaluarLecturasSemanticasV2D013(original,first,changed);
 assert.equal(r.estado,'listo_para_preparar',r.motivo);
 assert.deepEqual(r.pedido.articulosEnRevision,[2]);
 assert.equal(r.pedido.articulos.length,4);
});
test('V2: un producto extra SIN anclaje real no desaparece silenciosamente',()=>{
 const changed=structuredClone(second);
 changed.articulos.push({...secondary(2),evidencia:'tornillos de madera'});
 const r=evaluarLecturasSemanticasV2D013(original,first,changed);
 assert.equal(r.estado,'requiere_aclaracion');
 assert.equal(r.pedido,null);
});
test('V2: si no queda ningún artículo confiable no se envía nada',()=>{
 const r=evaluarLecturasSemanticasV2D013(original,first,{
  integridad:'dudosa',zona_entrega:'La Plata',articulos:[]
 });
 assert.equal(r.estado,'requiere_aclaracion');
 assert.equal(r.pedido,null);
});
test('V2: zona discordante sigue bloqueando comercialización completa',()=>{
 const changed={...second,zona_entrega:'Rosario'};
 const r=evaluarLecturasSemanticasV2D013(original,first,changed);
 assert.equal(r.estado,'requiere_aclaracion');
});
const snapshot={
 state:'catalogue_snapshot',localidad:'La Plata',proveedores:[
  {clave:'corralon_ailin',localidad:'La Plata',catalogoConfirmado:true,
   articulos:[
    {numero:1,descripcion:'Cemento de obra 25 kg',
     familiaAnterior:'cemento_gris_obra',revisionAnterior:'curated_family'},
    {numero:2,descripcion:'Bolsón arena fina 1 m3',
     familiaAnterior:'arena_fina',revisionAnterior:'curated_family'},
    {numero:3,descripcion:'Membrana aluminizada 4 mm',
     familiaAnterior:'cemento_gris_obra',revisionAnterior:'curated_family'}
   ]}
 ],proveedoresSinConfirmar:0
};
const proposed={propuestas:[{proveedor:'corralon_ailin',correspondencias:[
 {indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',
  explicacion:'Cemento declarado'},
 {indicePedido:1,numeroCatalogo:2,tipo:'producto_declarado',
  explicacion:'Arena fina declarada'},
 {indicePedido:2,numeroCatalogo:3,tipo:'producto_declarado',
  explicacion:'Membrana declarada'}
]}]};
const verdict={verificaciones:proposed.propuestas[0].correspondencias.map(x=>({
 proveedor:'corralon_ailin',indicePedido:x.indicePedido,
 numeroCatalogo:x.numeroCatalogo,decision:'equivalente'
}))};
function response(value){
 return new Response(JSON.stringify({status:'completed',output:[{
  type:'message',role:'assistant',content:[{
   type:'output_text',text:JSON.stringify(value)
  }]
 }]}),{status:200,headers:{'content-type':'application/json'}});
}
test('V2 E2E sintético: pedido 4, ruteo 3, SQL conserva los 4 y los índices reales',async()=>{
 const calls=[],rpcCalls=[];
 const answers=[first,second,proposed,verdict];
 const fetchImpl=async(_url,req)=>{
  const body=JSON.parse(req.body);
  assert.equal(body.store,false);
  assert.deepEqual(body.tools,[]);
  calls.push(body.text.format.name);
  if(body.text.format.name==='cotironda_ruteo_catalogos_v2'){
   const payload=JSON.parse(body.input[1].content[0].text.split('\n').slice(1).join('\n'));
   assert.deepEqual(payload.pedido.articulos.map(x=>x.descripcion),
    [descriptions[0],descriptions[1],descriptions[3]]);
   assert.deepEqual(payload.pedido.articulos.map(x=>x.indicePedido),[0,1,2]);
  }
  return response(answers.shift());
 };
 const plan=await planificarMensajeAutenticadoMvp220({
  chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
  autenticadoPorWebhook:true,textoOriginal:original,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',
  fetchImpl,rpc:async(name)=>{
   rpcCalls.push(name);return {data:snapshot,error:null};
  }
 });
 assert.equal(plan.estado,'plan_validado_sin_envio',plan.motivo);
 assert.equal(plan.motivo,'ruteo_parcial_con_articulos_visibles_sin_destino');
 assert.equal(plan.pedido.articulos.length,4);
 assert.deepEqual(plan.pedido.articulosEnRevision,[2]);
 assert.deepEqual(plan.ruteo.cobertura.map(x=>x.proveedoresAutorizados),[1,1,0,1]);
 assert.deepEqual(plan.ruteo.propuestas[0].correspondencias.map(x=>x.indicePedido),
  [0,1,3]);
 assert.equal(plan.whatsappEnviado,false);
 assert.equal(plan.baseModificada,false);
 assert.deepEqual(rpcCalls,['cotironda_piloto_ia_catalogo_mvp220']);
 assert.deepEqual(calls,[
  'cotironda_ai_central_lector_v2_d013',
  'cotironda_ai_central_revision_v2_d013',
  'cotironda_ruteo_catalogos_v2',
  'cotironda_corrobora_pares_v2_d013'
 ]);
 const bridge=armarPreparacionSombraMvp221({
  chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
  textoOriginal:original,autenticadoPorWebhook:true,plan
 });
 assert.equal(bridge.estado,'plan_sql_listo',bridge.motivo);
 assert.equal(bridge.params.p_items.length,4);
 assert.equal(bridge.params.p_original_text,original);
 assert.equal(bridge.params.p_items[2].evidencia,spans[2]);
 assert.equal(bridge.params.p_items[1].unidad,'bag');
 assert.equal(bridge.params.p_items[2].unidad,'unit');
 assert.equal(bridge.params.p_items[1].cantidad,'1');
 assert.equal(bridge.params.p_items[2].cantidad,'3');
 assert.deepEqual(bridge.params.p_destinos[0].correspondencias.map(x=>x.indicePedido),
  [0,1,3]);
 assert.ok(!bridge.params.p_destinos[0].correspondencias.some(x=>x.indicePedido===2));
});

test('V2: adaptador SQL preserva unidades comerciales y convierte escalas exactas',()=>{
 const examples=[
  ['1','bigbag','1','bag'],
  ['3','bucket','3','unit'],
  ['10','bolsas','10','bag'],
  ['2','rollos','2','roll'],
  ['100','cm','1','m'],
  ['1000','mm','1','m'],
  ['4','mm','0.004','m'],
  ['100','cm2','0.01','m2'],
  ['100000','cm3','0.1','m3'],
  ['1','tn','1000','kg'],
  ['1000','mg','0.001','kg']
 ];
 for(const [qty,unit,wantQty,wantUnit] of examples){
  const result=cantidadUnidadSqlV2D013(qty,unit);
  assert.deepEqual(result,{cantidad:wantQty,unidad:wantUnit},qty+' '+unit);
 }
 for(const [qty,unit] of [
  ['0.5','mm'],['1','cm2'],['1','cm3'],['-1','kg'],
  ['1','desconocido'],['1000000','tn']
 ])assert.equal(cantidadUnidadSqlV2D013(qty,unit),null,qty+' '+unit);
});
