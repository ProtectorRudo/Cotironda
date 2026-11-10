import test from 'node:test';
import assert from 'node:assert/strict';
import {armarPreparacionSombraMvp221,guardarRondaSombraMvp221} from
 '../../src/domain/ia-central/puente-sql-rondas-mvp221.ts';

const original='Obra: 20 bols cem cpc, 5 lts latex y 50 mts cable 2.5. Entrega en La Plata.';
const details=[
 ['20 bols cem cpc','Cemento CPC 50kg','20','bag','obra_gruesa'],
 ['5 lts latex','Pintura látex interior','5','l','pintura'],
 ['50 mts cable 2.5','Cable unipolar 2,5mm²','50','m','electricidad']
];
const items=details.map(([evidencia,descripcion,cantidad,unidad,rubro])=>({
 evidencia,descripcion,cantidad,unidad,rubro,presentacion:null,
 aclaracion:null,inicio:original.indexOf(evidencia),
 fin:original.indexOf(evidencia)+evidencia.length
}));
const suppliers=[
 ['corralon_alfa','Cemento CPC bolsa 50 kilos','obra_gruesa'],
 ['pintureria_beta','Látex para interior 5L','pintura'],
 ['electricidad_gamma','Cable unipolar 2,5 mm','electricidad']
].map(([clave,descripcion,rubro])=>({
 clave,consentido:true,activo:true,localidades:['La Plata'],
 articulos:[{numero:1,descripcion,rubro}]
}));
const matches=suppliers.map((s,i)=>({
 proveedor:s.clave,correspondencias:[{
  indicePedido:i,numeroCatalogo:1,tipo:'producto_declarado',
  explicacion:'Coincidencia comercial razonable'
 }]
}));
function plan(){
 return {estado:'plan_validado_sin_envio',
  motivo:'ruteo_semantico_valido',
  whatsappEnviado:false,baseModificada:false,
  pedido:{intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:items},
  ruteo:{estado:'ruteo_valido_para_preparacion',
   motivo:'catalogo',propuestas:matches,
   cobertura:[0,1,2].map(indicePedido=>({
    indicePedido,proveedoresAutorizados:1})),
   whatsappEnviado:false
  },catalogos:suppliers
 };
}
const args=()=>({
 chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
 textoOriginal:original,autenticadoPorWebhook:true,plan:plan()
});
test('MVP221 construye correspondencias completas sin mezclar rubros ni destinatarios',()=>{
 const result=armarPreparacionSombraMvp221(args());
 assert.equal(result.estado,'plan_sql_listo');
 assert.equal(result.params.p_items.length,3);
 assert.deepEqual(result.params.p_items.map(x=>x.rubro),
  ['obra_gruesa','pintura','electricidad']);
 assert.deepEqual(result.params.p_destinos.map(x=>
  x.correspondencias[0].descripcionCatalogo),
  ['Cemento CPC bolsa 50 kilos','Látex para interior 5L',
   'Cable unipolar 2,5 mm']);
 assert.equal(result.params.p_destinos[2].correspondencias[0].indicePedido,2);
});
test('MVP221 rechaza desvíos de origen, proveedor inactivo, índices duplicados',()=>{
 const changes=[
  a=>a.autenticadoPorWebhook=false,
  a=>a.chatHmac='mal',
  a=>a.plan.catalogos[0].activo=false,
  a=>a.plan.ruteo.propuestas[0].correspondencias[0].numeroCatalogo=700,
  a=>a.plan.ruteo.propuestas[0].correspondencias[0].indicePedido=1,
  a=>a.plan.ruteo.propuestas.push(a.plan.ruteo.propuestas[0]),
  a=>a.plan.whatsappEnviado=true,
  a=>a.plan.estado='requiere_aclaracion'
 ];
 for(const change of changes){
  const a=structuredClone(args());change(a);
  assert.equal(armarPreparacionSombraMvp221(a).estado,'plan_no_verificable');
 }
});
test('MVP221 una única RPC privada, ninguna llamada de red ni outbox',async()=>{
 const p=armarPreparacionSombraMvp221(args());
 let count=0;
 const result=await guardarRondaSombraMvp221(p,async(name,body)=>{
  count++;assert.equal(name,'cotironda_piloto_ia_shadow_prepare_mvp221');
  assert.equal(body.p_destinos.length,3);
  return {data:{
   state:'shadow_staged',request_id:'id_ignored',
   items_staged:3,matches_staged:3,
   invitations_sent:0,outbox_sent:0
  },error:null};
 });
 assert.equal(count,1);
 assert.deepEqual(result,{estado:'guardado',motivo:'ronda_sombra_verificada',
  articulos:3,matches:3});
});
test('MVP221 rechaza SQL que afirma envíos o cantidades distintas',async()=>{
 const p=armarPreparacionSombraMvp221(args());
 for(const body of [
  {state:'shadow_staged',items_staged:2,matches_staged:3,
   invitations_sent:0,outbox_sent:0},
  {state:'shadow_staged',items_staged:3,matches_staged:3,
   invitations_sent:1,outbox_sent:1},
  {state:'unknown'},
  null
 ]){
  const r=await guardarRondaSombraMvp221(p,async()=>({data:body,error:null}));
  assert.equal(r.estado,'rechazado');
 }
 const twice=await guardarRondaSombraMvp221(p,async()=>({
  data:{state:'already_staged'},error:null
 }));
 assert.equal(twice.estado,'ya_existia');
});
