import test from 'node:test';
import assert from 'node:assert/strict';
import {proponerRuteoCatalogoConIAV2,autorizarPropuestasCatalogoV2}
 from '../../src/domain/ia-central/ruteador-catalogos-v2-d013.ts';
import {verificarCorrespondenciaTecnicaD013}
 from '../../src/domain/ia-central/verificador-evidencia-tecnica-v2-d013.ts';

const quote=(text,n='2',unit='unit')=>({
 evidencia:text,inicio:0,fin:text.length,descripcion:text,
 cantidad:n,unidad:unit,rubro:'obra_gruesa',presentacion:null,aclaracion:null
});
const request={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
 articulos:[quote('2 envases Ceresita líquida 1 L'),
  quote('10 bolsas cemento de obra 25 kg','10','bag')]};
const supplier=(key,lines)=>({
 clave:key,consentido:true,activo:true,localidades:['La Plata'],articulos:lines
});
const catalog=[
 supplier('corralon_ailin',[
  {numero:1,descripcion:'Hidrofugante para mortero 1 L',rubro:'ferreteria'},
  {numero:2,descripcion:'Cemento de obra 25 kg',rubro:'obra_gruesa'}
 ]),
 supplier('corralon_nahuel',[
  {numero:2,descripcion:'Cemento de obra 25 kg',rubro:'obra_gruesa'}
 ])
];
const proposal={propuestas:[
 {proveedor:'corralon_ailin',correspondencias:[
  {indicePedido:0,numeroCatalogo:1,tipo:'alternativa_razonable',
   explicacion:'Hidrofugante potencialmente relacionado con Ceresita'},
  {indicePedido:1,numeroCatalogo:2,tipo:'producto_declarado',
   explicacion:'Cemento de obra 25 kg declarado'}
 ]},
 {proveedor:'corralon_nahuel',correspondencias:[
  {indicePedido:1,numeroCatalogo:2,tipo:'producto_declarado',
   explicacion:'Mismo cemento 25 kg'}
 ]}
]};
const apiKey='sk-'+'a'.repeat(24);
function mockAPI(data){
 const calls=[];
 return {calls,fetchImpl:async(_url,req)=>{
  const request=JSON.parse(req.body);
  calls.push(request);
  assert.equal(request.store,false);assert.deepEqual(request.tools,[]);
  assert.equal(request.reasoning.effort,'high');
  assert.equal(request.text.format.name,'cotironda_ruteo_catalogos_v2');
  return new Response(JSON.stringify({status:'completed',output:[
   {type:'message',role:'assistant',content:[
    {type:'output_text',text:JSON.stringify(data)}
   ]}
  ]}),{status:200});
 }};
}
test('V2: una IA Central decide coincidencias, catálogo por producto y zona',async()=>{
 const mock=mockAPI(proposal);
 const result=await proponerRuteoCatalogoConIAV2({
  pedido:request,proveedores:catalog,apiKey,model:'gpt-6-luna',
  fetchImpl:mock.fetchImpl
 });
 assert.equal(mock.calls.length,1,'no usar corroborador independiente');
 assert.equal(result.estado,'ruteo_valido_para_preparacion',result.motivo);
 assert.deepEqual(result.propuestas.map(x=>[
  x.proveedor,x.correspondencias.length
 ]),[['corralon_ailin',2],['corralon_nahuel',1]]);
 assert.deepEqual(result.cobertura.map(x=>x.proveedoresAutorizados),[1,2]);
 assert.equal(result.whatsappEnviado,false);
 assert.ok(!JSON.stringify(mock.calls).includes('whatsapp_id'));
});
test('V2: alternativa semánticamente plausible es CONSULTA, jamás equivalencia confirmada',async()=>{
 const mock=mockAPI(proposal);
 const res=await proponerRuteoCatalogoConIAV2({
  pedido:request,proveedores:catalog,apiKey,model:'gpt-6-luna',
  fetchImpl:mock.fetchImpl
 });
 const inquiry=res.propuestas[0].correspondencias.find(x=>x.indicePedido===0);
 assert.ok(inquiry);
 assert.equal(inquiry.tipo,'alternativa_razonable');
 assert.match(inquiry.explicacion,/^CONSULTA SIN EQUIVALENCIA CONFIRMADA\./u);
 assert.equal(request.articulos[0].evidencia,'2 envases Ceresita líquida 1 L');
});
test('V2: producto no declarado o proveedor fuera de la zona nunca recibe envío',()=>{
 const wrong={propuestas:[{proveedor:'corralon_nahuel',correspondencias:[
  {indicePedido:0,numeroCatalogo:999,tipo:'alternativa_razonable',
   explicacion:'No está en el catálogo'}
 ]}]};
 assert.equal(autorizarPropuestasCatalogoV2(request,catalog,wrong.propuestas)
  .estado,'requiere_revision');
 const elsewhere=[{...catalog[0],localidades:['Rosario']}];
 const result=autorizarPropuestasCatalogoV2(request,elsewhere,
  proposal.propuestas.slice(0,1));
 assert.equal(result.estado,'requiere_revision');
 assert.deepEqual(result.propuestas,[]);
});
test('V2: rubro distinto NO excluye mismo artículo catalogado',async()=>{
 const mismatch=[{...catalog[1],articulos:[
  {...catalog[1].articulos[0],rubro:'ferreteria'}
 ]}];
 const mock=mockAPI({propuestas:proposal.propuestas.slice(1)});
 const result=await proponerRuteoCatalogoConIAV2({
  pedido:request,proveedores:mismatch,apiKey,model:'gpt-6-luna',
  fetchImpl:mock.fetchImpl
 });
 assert.deepEqual(result.propuestas.map(x=>x.proveedor),['corralon_nahuel']);
 assert.equal(mock.calls.length,1);
});
test('V2: incompatibilidad cable 2.5 mm² frente a 4 mm² NO es consulta aceptable',async()=>{
 const buyer={...request,articulos:[quote('3 metros cable 2.5 mm2','3','m')]};
 const providers=[supplier('ferreteria_123',[
  {numero:1,descripcion:'Cable unipolar 4 mm2',rubro:'electricidad'}
 ])];
 const candidate={propuestas:[{proveedor:'ferreteria_123',correspondencias:[
  {indicePedido:0,numeroCatalogo:1,tipo:'alternativa_razonable',
   explicacion:'Cable posible para consulta'}
 ]}]};
 const mock=mockAPI(candidate);
 const result=await proponerRuteoCatalogoConIAV2({
  pedido:buyer,proveedores:providers,apiKey,model:'gpt-6-luna',
  fetchImpl:mock.fetchImpl
 });
 assert.equal(mock.calls.length,1);
 assert.equal(result.estado,'requiere_revision');
 assert.deepEqual(result.propuestas,[]);
 assert.equal(result.revisionTecnica[0].motivo,'seccion_cable_no_equivalente');
});
test('V2: marca excluyente, uso incompatible y presentación diferente siguen bloqueados',()=>{
 const p=quote('10 bolsas cemento obra 25 kg','10','bag');
 const results=[
  verificarCorrespondenciaTecnicaD013({
   ...p,descripcion:'Cemento marca excluyente Loma Negra 25 kg',
   aclaracion:'solo marca Loma Negra'
  },'Cemento marca otra 25 kg','alternativa_razonable',true).motivo,
  verificarCorrespondenciaTecnicaD013({
   ...p,descripcion:'Cemento Portland 25 kg'
  },'Cemento de albañilería 25 kg','alternativa_razonable',true).motivo
 ];
 assert.deepEqual(results,[
  'marca_excluyente_no_acreditada','tipo_o_aplicacion_tecnica_diferente'
 ]);
});
test('V2: la propuesta malformada, duplicada o con clave inventada no habilita contacto',()=>{
 const bad=[
  [{proveedor:'inventado',correspondencias:proposal.propuestas[0].correspondencias}],
  [{...proposal.propuestas[0],correspondencias:[
   proposal.propuestas[0].correspondencias[0],
   proposal.propuestas[0].correspondencias[0]
  ]}],
  [{proveedor:'corralon_ailin',correspondencias:[
   {...proposal.propuestas[0].correspondencias[0],numeroCatalogo:500}
  ]}]
 ];
 for(const rows of bad){
  const out=autorizarPropuestasCatalogoV2(request,catalog,rows);
  assert.equal(out.estado,'requiere_revision');
  assert.deepEqual(out.propuestas,[]);
 }
});
test('V2: falla externa de IA no genera propuesta ni envía a ningún comercio',async()=>{
 const r=await proponerRuteoCatalogoConIAV2({
  pedido:request,proveedores:catalog,apiKey,model:'gpt-6-luna',
  fetchImpl:async()=>new Response('rate limited',{status:429})
 });
 assert.equal(r.estado,'requiere_revision');
 assert.deepEqual(r.propuestas,[]);
 assert.equal(r.whatsappEnviado,false);
});
