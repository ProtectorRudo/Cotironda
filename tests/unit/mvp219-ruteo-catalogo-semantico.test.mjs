import test from 'node:test';
import assert from 'node:assert/strict';
import {autorizarPropuestasCatalogoV2,proponerRuteoCatalogoConIAV2} from
 '../../src/domain/ia-central/ruteador-catalogos-v2.ts';

const pedido={
 intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:[
  {evidencia:'20 bolsas de cem cpc',inicio:0,fin:19,
   descripcion:'Cemento CPC 50 kg',cantidad:'20',unidad:'bag',
   rubro:'obra_gruesa',presentacion:'bolsa 50 kg',aclaracion:null},
  {evidencia:'10 litros de latex',inicio:20,fin:37,
   descripcion:'Pintura látex interior',cantidad:'10',unidad:'l',
   rubro:'pintura',presentacion:'10 litros',aclaracion:null},
  {evidencia:'50mts de cable 2.5',inicio:38,fin:56,
   descripcion:'Cable de cobre 2,5 mm²',cantidad:'50',unidad:'m',
   rubro:'electricidad',presentacion:null,aclaracion:null}
 ]};
const proveedores=[
 {clave:'corralon_ailin',consentido:true,activo:true,
  localidades:['La Plata'],articulos:[
   {numero:5,descripcion:'Cemento gris en bolsa',rubro:'obra_gruesa'},
   {numero:9,descripcion:'Arena a granel',rubro:'obra_gruesa'}]},
 {clave:'pintureria_roma',consentido:true,activo:true,
  localidades:['LA PLATA'],articulos:[
   {numero:4,descripcion:'Látex interior, baldes por litro',rubro:'pintura'}]},
 {clave:'electricidad_sur',consentido:true,activo:true,
  localidades:['La Plata','Berisso'],articulos:[
   {numero:11,descripcion:'Conductor unipolar 2,5 mm',rubro:'electricidad'}]},
 {clave:'inactivo_pinturas',consentido:true,activo:false,
  localidades:['La Plata'],articulos:[
   {numero:1,descripcion:'Pintura al látex',rubro:'pintura'}]}
];
const propuesta=[
 {proveedor:'corralon_ailin',correspondencias:[
  {indicePedido:0,numeroCatalogo:5,tipo:'producto_declarado',
   explicacion:'Cemento comercial para obra'}]},
 {proveedor:'pintureria_roma',correspondencias:[
  {indicePedido:1,numeroCatalogo:4,tipo:'alternativa_razonable',
   explicacion:'Látex interior por litro'}]},
 {proveedor:'electricidad_sur',correspondencias:[
  {indicePedido:2,numeroCatalogo:11,tipo:'producto_declarado',
   explicacion:'Conductor unipolar de sección pedida'}]}
];
test('MVP219: cotización de obra completa reparte rubros por catálogos reales',()=>{
 const r=autorizarPropuestasCatalogoV2(pedido,proveedores,propuesta);
 assert.equal(r.estado,'ruteo_valido_para_preparacion');
 assert.equal(r.propuestas.length,3);
 assert.deepEqual(r.cobertura.map(x=>x.proveedoresAutorizados),[1,1,1]);
 assert.equal(r.whatsappEnviado,false);
});
test('MVP219: cualquier identidad, zona, rubro, línea inventada bloquea ruteo completo',()=>{
 const cases=[
  [{proveedor:'falso',correspondencias:propuesta[0].correspondencias}],
  [{proveedor:'inactivo_pinturas',correspondencias:propuesta[1].correspondencias}],
  [{proveedor:'corralon_ailin',correspondencias:[
   {...propuesta[0].correspondencias[0],numeroCatalogo:999}]}],
  [{proveedor:'corralon_ailin',correspondencias:[
   {...propuesta[0].correspondencias[0],indicePedido:1}]}],
  [propuesta[0],propuesta[0]],
  [{proveedor:'corralon_ailin',correspondencias:[
   propuesta[0].correspondencias[0],propuesta[0].correspondencias[0]]}]
 ];
 for(const candidate of cases){
  const r=autorizarPropuestasCatalogoV2(pedido,proveedores,candidate);
  assert.equal(r.estado,'requiere_revision');
  assert.equal(r.propuestas.length,0);
 }
 const moved={...pedido,zona_entrega:'Bahía Blanca'};
 assert.equal(autorizarPropuestasCatalogoV2(moved,proveedores,propuesta).estado,
  'requiere_revision');
});
test('MVP219: sin línea declarada no inventa proveedor y marca material descubierto',()=>{
 const r=autorizarPropuestasCatalogoV2(pedido,proveedores,propuesta.slice(0,1));
 assert.equal(r.estado,'ruteo_valido_para_preparacion');
 assert.deepEqual(r.cobertura.map(x=>x.proveedoresAutorizados),[1,0,0]);
});
function fakeResponse(propuestas){
 const calls=[];
 const fn=async(url,req)=>{
  calls.push({url,body:JSON.parse(req.body)});
  return new Response(JSON.stringify({status:'completed',output:[{
   type:'message',role:'assistant',content:[{
    type:'output_text',text:JSON.stringify({propuestas})
   }]
  }]}),{status:200});
 };
 return {calls,fn};
}
test('MVP219: IA recibe SOLO catálogos autorizados y propone semánticamente sin enviar',async()=>{
 const {calls,fn}=fakeResponse(propuesta);
 const r=await proponerRuteoCatalogoConIAV2({pedido,proveedores,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl:fn});
 assert.equal(r.estado,'ruteo_valido_para_preparacion');
 assert.equal(calls.length,1);
 assert.equal(calls[0].body.tools.length,0);
 assert.equal(calls[0].body.store,false);
 assert.deepEqual(JSON.parse(calls[0].body.input[1].content[0].text.split('\n').at(-1))
  .proveedores.map(x=>x.clave),
 ['corralon_ailin','pintureria_roma','electricidad_sur']);
 assert.equal(JSON.stringify(calls).includes('inactivo_pinturas'),false);
});
test('MVP219: la propuesta de IA de un catálogo inexistente NO se ejecuta',async()=>{
 const bad=structuredClone(propuesta);bad[0].correspondencias[0].numeroCatalogo=777;
 const {fn}=fakeResponse(bad);
 const r=await proponerRuteoCatalogoConIAV2({pedido,proveedores,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl:fn});
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.propuestas.length,0);
 assert.equal(r.whatsappEnviado,false);
});
test('MVP219: errores de API/capacidad/consentimiento no producen destinatarios',async()=>{
 const r=await proponerRuteoCatalogoConIAV2({pedido,proveedores,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',
  fetchImpl:async()=>new Response('{}',{status:429})});
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.propuestas.length,0);
 const tooMany=Array.from({length:151},(_,i)=>({
  numero:i+1,descripcion:'Material de prueba',rubro:'obra_gruesa'
 }));
 let calls=0;
 const budget=await proponerRuteoCatalogoConIAV2({pedido,
  proveedores:[{...proveedores[0],articulos:tooMany}],
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',
  fetchImpl:async()=>{calls++;throw Error('must not call')}});
 assert.equal(budget.estado,'requiere_revision');
 assert.equal(calls,0);
});
