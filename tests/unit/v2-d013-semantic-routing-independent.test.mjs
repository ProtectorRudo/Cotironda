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
const source=[
 quote('2 envases Ceresita líquida 1 L'),
 quote('10 bolsas cemento de obra 25 kg','10','bag')
];
const pedido={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:source};
const supplier=(key,lines)=>({
 clave:key,consentido:true,activo:true,localidades:['La Plata'],articulos:lines
});
const catalog=[
 supplier('corralon_ailin',[
  {numero:1,descripcion:'Hidrofugante para mortero 1 L',rubro:'ferreteria'},
  {numero:2,descripcion:'Cemento de obra 25 kg',rubro:'obra_gruesa'}]),
 supplier('corralon_nahuel',[
  {numero:2,descripcion:'Cemento de obra 25 kg',rubro:'obra_gruesa'}])
];
const proposal={propuestas:[
 {proveedor:'corralon_ailin',correspondencias:[
  {indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',
   explicacion:'Hidrofugante para mezcla'},
  {indicePedido:1,numeroCatalogo:2,tipo:'producto_declarado',
   explicacion:'Mismo cemento 25 kg'}]},
 {proveedor:'corralon_nahuel',correspondencias:[
  {indicePedido:1,numeroCatalogo:2,tipo:'producto_declarado',
   explicacion:'Mismo cemento 25 kg'}]}
]};
const verdict={verificaciones:[
 {proveedor:'corralon_ailin',indicePedido:0,numeroCatalogo:1,decision:'equivalente'},
 {proveedor:'corralon_ailin',indicePedido:1,numeroCatalogo:2,decision:'equivalente'},
 {proveedor:'corralon_nahuel',indicePedido:1,numeroCatalogo:2,decision:'equivalente'}
]};
const mockApi=(...payloads)=>{
 const bodies=[];
 const fetchImpl=async(_url,req)=>{
  const p=JSON.parse(req.body);
  assert.equal(p.store,false);assert.deepEqual(p.tools,[]);
  bodies.push(p);
  return new Response(JSON.stringify({
   status:'completed',output:[{type:'message',role:'assistant',content:[
    {type:'output_text',text:JSON.stringify(payloads.shift())}
   ]}]
  }),{status:200,headers:{'content-type':'application/json'}});
 };
 return {fetchImpl,bodies};
};
test('V2: el bloqueo léxico pide prueba y no autoriza envíos por sí solo',()=>{
 const r=verificarCorrespondenciaTecnicaD013(source[0],
  'Hidrofugante para mortero 1 L','producto_declarado');
 assert.equal(r.estado,'revision_interna');
 assert.equal(r.motivo,'sin_identidad_material_comprobable');
 const first=autorizarPropuestasCatalogoV2(pedido,catalog,proposal.propuestas);
 assert.deepEqual(first.propuestas.map(x=>[x.proveedor,x.correspondencias.length]),
  [['corralon_ailin',1],['corralon_nahuel',1]]);
 assert.equal(first.revisionTecnica[0].motivo,'sin_identidad_material_comprobable');
});
test('V2: IA independiente valida sinónimos y mantiene routing 2/1',async()=>{
 const {fetchImpl,bodies}=mockApi(proposal,verdict);
 const result=await proponerRuteoCatalogoConIAV2({
  pedido,proveedores:catalog,apiKey:'sk-'+'a'.repeat(24),
  model:'gpt-6-luna',fetchImpl});
 assert.equal(bodies.length,2);
 assert.equal(bodies[0].text.format.name,'cotironda_ruteo_catalogos_v2');
 assert.equal(bodies[1].text.format.name,'cotironda_corrobora_pares_v2_d013');
 assert.equal(result.estado,'ruteo_valido_para_preparacion');
 assert.deepEqual(result.propuestas.map(x=>[x.proveedor,x.correspondencias.length]),
  [['corralon_ailin',2],['corralon_nahuel',1]]);
 assert.deepEqual(result.cobertura.map(x=>x.proveedoresAutorizados),[1,2]);
 assert.equal(result.whatsappEnviado,false);
 assert.doesNotMatch(JSON.stringify(bodies),/telefonos|access_token|whapi_id/i);
});
test('V2: segundo lector inseguro, omitido o incierto NO habilita coincidencias',async()=>{
 for(const answer of [
  {verificaciones:[]},
  {verificaciones:[{...verdict.verificaciones[0],decision:'incierto'}]},
  {verificaciones:[{...verdict.verificaciones[0],numeroCatalogo:999,
   decision:'equivalente'}]},
  {verificaciones:[{...verdict.verificaciones[0]},
   {...verdict.verificaciones[0]}]}
 ]){
  const {fetchImpl}=mockApi(proposal,answer);
  const res=await proponerRuteoCatalogoConIAV2({
   pedido,proveedores:catalog,apiKey:'sk-'+'a'.repeat(24),
   model:'gpt-6-luna',fetchImpl});
  assert.deepEqual(res.propuestas,[]);
  assert.equal(res.estado,'requiere_revision');
  assert.equal(res.whatsappEnviado,false);
 }
});
test('V2: verificador parcial conserva exclusivamente los artículos comprobados',async()=>{
 const partial={verificaciones:verdict.verificaciones.slice(0,2)};
 const {fetchImpl}=mockApi(proposal,partial);
 const res=await proponerRuteoCatalogoConIAV2({
  pedido,proveedores:catalog,apiKey:'sk-'+'a'.repeat(24),
  model:'gpt-6-luna',fetchImpl});
 assert.deepEqual(res.propuestas.map(x=>[x.proveedor,
  x.correspondencias.map(m=>m.indicePedido)]),[
  ['corralon_ailin',[0,1]]
 ]);
 assert.deepEqual(res.cobertura.map(x=>x.proveedoresAutorizados),[1,1]);
 assert.equal(res.whatsappEnviado,false);
});
test('V2: conflicto de sección, presentación o marca excluyente NO puede salvarse con IA',()=>{
 const buyer=quote('3 metros cable 2.5 mm2','3','m');
 const c=verificarCorrespondenciaTecnicaD013(buyer,'Cable unipolar 4 mm2',
  'alternativa_razonable',true);
 assert.equal(c.motivo,'seccion_cable_no_equivalente');
 const a=verificarCorrespondenciaTecnicaD013(
  {...source[1],descripcion:'Cemento marca excluyente Loma Negra 25 kg',
   aclaracion:'solo marca Loma Negra'},
  'Cemento marca otra 25 kg','alternativa_razonable',true);
 assert.equal(a.motivo,'marca_excluyente_no_acreditada');
 const wrong=verificarCorrespondenciaTecnicaD013(
  {...source[1],descripcion:'Cemento Portland 25 kg'},
  'Cemento de albañilería 25 kg','alternativa_razonable',true);
 assert.equal(wrong.motivo,'tipo_o_aplicacion_tecnica_diferente');
});
test('V2: lote con cuatro artículos se distribuye 4/2 según catálogo, no rubro',async()=>{
 const articles=[
  quote('10 bolsas de cemento de 25 kg','10','bag'),
  quote('1 bolsón de arena fina','1','unit'),
  quote('3 baldes de albañil de 10 litros','3','unit'),
  quote('2 rollos de membrana aluminizada 4 mm','2','roll')
 ];
 const request={...pedido,articulos:articles};
 const shops=[
  supplier('corralon_ailin',[
   {numero:3,descripcion:'Cemento de obra 25 kg',rubro:'ferreteria'},
   {numero:20,descripcion:'Bolsón de arena fina 1 m3',rubro:'obra_gruesa'},
   {numero:50,descripcion:'Balde de albañil 10 litros',rubro:'otros'},
   {numero:45,descripcion:'Membrana asfáltica aluminizada 4 mm',rubro:'pintura'}
  ]),
  supplier('corralon_nahuel',[
   {numero:3,descripcion:'Cemento de obra 25 kg',rubro:'obra_gruesa'},
   {numero:20,descripcion:'Bolsón de arena fina 1 m3',rubro:'obra_gruesa'}
  ])
 ];
 const proposals={propuestas:shops.map((p,i)=>({
  proveedor:p.clave,correspondencias:p.articulos.map((x,j)=>({
   indicePedido:j,numeroCatalogo:x.numero,tipo:'producto_declarado',
   explicacion:'Producto declarado en catálogo'
  }))
 }))};
 const confirmed={verificaciones:proposals.propuestas.flatMap(p=>
  p.correspondencias.map(c=>({proveedor:p.proveedor,
   indicePedido:c.indicePedido,numeroCatalogo:c.numeroCatalogo,
   decision:'equivalente'})))};
 const {fetchImpl}=mockApi(proposals,confirmed);
 const res=await proponerRuteoCatalogoConIAV2({
  pedido:request,proveedores:shops,model:'gpt-6-luna',
  apiKey:'sk-'+'a'.repeat(24),fetchImpl
 });
 assert.deepEqual(res.propuestas.map(x=>[x.proveedor,
  x.correspondencias.map(c=>c.indicePedido)]),[
  ['corralon_ailin',[0,1,2,3]],['corralon_nahuel',[0,1]]
 ]);
 assert.equal(res.whatsappEnviado,false);
});
test('V2: no convierte propuestas a negocios no autorizados',async()=>{
 const proposals={propuestas:[{proveedor:'corralon_nahuel',
  correspondencias:[{indicePedido:0,numeroCatalogo:1,
   tipo:'producto_declarado',explicacion:'No declarado'}]}]};
 const {fetchImpl,bodies}=mockApi(proposals);
 const res=await proponerRuteoCatalogoConIAV2({pedido,proveedores:catalog,
  model:'gpt-6-luna',apiKey:'sk-'+'a'.repeat(24),fetchImpl});
 assert.equal(res.estado,'requiere_revision');
 assert.deepEqual(res.propuestas,[]);
 assert.equal(bodies.length,1);
});

test('V2: compartir vocabulario no habilita tornillo técnicamente distinto',async()=>{
 const pedidoTornillos={...pedido,articulos:[quote(
  '10 tornillos para madera 5 mm','10','unit')]};
 const negocio=[supplier('ferreteria_123',[
  {numero:1,descripcion:'Tornillos para chapa 5 mm',rubro:'ferreteria'}
 ])];
 const proposed={propuestas:[{proveedor:'ferreteria_123',correspondencias:[{
  indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',
  explicacion:'Ambos tornillos, pero para usos distintos'
 }]}]};
 const first=autorizarPropuestasCatalogoV2(pedidoTornillos,negocio,
  proposed.propuestas);
 assert.equal(first.propuestas.length,1,
  'sin verificación independiente el token compartido daba falso positivo');
 const {fetchImpl,bodies}=mockApi(proposed,{verificaciones:[{
  proveedor:'ferreteria_123',indicePedido:0,
  numeroCatalogo:1,decision:'incompatible'
 }]});
 const res=await proponerRuteoCatalogoConIAV2({
  pedido:pedidoTornillos,proveedores:negocio,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl});
 assert.equal(bodies.length,2);
 assert.equal(res.estado,'requiere_revision');
 assert.deepEqual(res.propuestas,[]);
 assert.equal(res.whatsappEnviado,false);
});
test('V2: sin respuesta del segundo lector no hay asignación comercial',async()=>{
 const {fetchImpl,bodies}=mockApi(proposal);
 const res=await proponerRuteoCatalogoConIAV2({
  pedido,proveedores:catalog,apiKey:'sk-'+'a'.repeat(24),
  model:'gpt-6-luna',fetchImpl});
 assert.equal(bodies.length,2);
 assert.deepEqual(res.propuestas,[]);
 assert.equal(res.estado,'requiere_revision');
});

test('V2: categoría genérica no contradice marca o subtipo; la segunda IA decide',()=>{
 const generic={...source[1],descripcion:'Cemento de obra 25 kg',
  evidencia:'10 bolsas de cemento 25 kg',presentacion:'25 kg'};
 const normal=verificarCorrespondenciaTecnicaD013(
  generic,'Cemento Portland 25 kg','producto_declarado');
 assert.equal(normal.estado,'revision_interna');
 assert.equal(normal.motivo,'prestacion_tecnica_sin_acreditar');
 const confirmed=verificarCorrespondenciaTecnicaD013(
  generic,'Cemento Portland 25 kg','producto_declarado',true);
 assert.equal(confirmed.estado,'evidencia_suficiente');
 const explicit=verificarCorrespondenciaTecnicaD013(
  {...generic,descripcion:'Cemento Portland 25 kg'},
  'Cemento albañilería 25 kg','producto_declarado',true);
 assert.equal(explicit.estado,'revision_interna');
 assert.equal(explicit.motivo,'tipo_o_aplicacion_tecnica_diferente');
});


test('V2: proveedor recibe consulta por producto plausible sin afirmar equivalencia',async()=>{
 const plausible={verificaciones:verdict.verificaciones.map((v,i)=>({
  ...v,decision:i===0?'consulta_relacionada':'equivalente'
 }))};
 const {fetchImpl}=mockApi(proposal,plausible);
 const result=await proponerRuteoCatalogoConIAV2({
  pedido,proveedores:catalog,apiKey:'sk-'+'a'.repeat(24),
  model:'gpt-6-luna',fetchImpl
 });
 assert.equal(result.estado,'ruteo_valido_para_preparacion',result.motivo);
 assert.deepEqual(result.propuestas.map(x=>[x.proveedor,x.correspondencias.length]),
  [['corralon_ailin',2],['corralon_nahuel',1]]);
 const inquiry=result.propuestas[0].correspondencias.find(c=>c.indicePedido===0);
 assert.equal(inquiry.numeroCatalogo,1);
 assert.equal(inquiry.tipo,'alternativa_razonable');
 assert.match(inquiry.explicacion,/^CONSULTA SIN EQUIVALENCIA CONFIRMADA\./u);
 assert.equal(pedido.articulos[0].evidencia,'2 envases Ceresita líquida 1 L');
 assert.equal(result.whatsappEnviado,false);
});

test('V2: incertidumbre sin vínculo declarado NO habilita consulta ni proveedor',async()=>{
 for(const decision of ['incierto','incompatible']){
  const opinion={verificaciones:verdict.verificaciones.map(v=>({
   ...v,decision:v.indicePedido===0?decision:'equivalente'
  }))};
  const {fetchImpl}=mockApi(proposal,opinion);
  const result=await proponerRuteoCatalogoConIAV2({
   pedido,proveedores:catalog,apiKey:'sk-'+'a'.repeat(24),
   model:'gpt-6-luna',fetchImpl
  });
  const items=result.propuestas.flatMap(x=>
   x.correspondencias.map(c=>c.indicePedido));
  assert.deepEqual(items,[1,1],decision+' no permite Ceresita sin relación');
  assert.equal(result.cobertura[0].proveedoresAutorizados,0);
  assert.equal(result.whatsappEnviado,false);
 }
});

test('V2: consulta no permite incompatibilidad comprobada de cable',async()=>{
 const b={...pedido,articulos:[quote('3 metros cable 2.5 mm2','3','m')]};
 const f=[supplier('ferreteria_123',[
  {numero:1,descripcion:'Cable unipolar 4 mm2',rubro:'electricidad'}
 ])];
 const proposed={propuestas:[{proveedor:'ferreteria_123',correspondencias:[{
  indicePedido:0,numeroCatalogo:1,tipo:'alternativa_razonable',
  explicacion:'Posible consulta de cable'
 }]}]};
 const {fetchImpl,bodies}=mockApi(proposed,{verificaciones:[{
  proveedor:'ferreteria_123',indicePedido:0,numeroCatalogo:1,
  decision:'consulta_relacionada'
 }]});
 const result=await proponerRuteoCatalogoConIAV2({
  pedido:b,proveedores:f,apiKey:'sk-'+'a'.repeat(24),
  model:'gpt-6-luna',fetchImpl
 });
 assert.equal(result.estado,'requiere_revision');
 assert.deepEqual(result.propuestas,[]);
 assert.equal(result.revisionTecnica[0].motivo,'seccion_cable_no_equivalente');
 assert.equal(bodies.length,1,'conflicto duro no consume ni acepta segundo juicio');
});

test('V2: la consulta siempre requiere segundo lector y SKU concreto',()=>{
 const single=proposal.propuestas.slice(0,1);
 const id='corralon_ailin:0:1';
 const denied=autorizarPropuestasCatalogoV2(pedido,catalog,single,
  new Set(),true);
 assert.deepEqual(denied.propuestas[0]?.correspondencias.map(x=>x.indicePedido),
  []);
 const consult=autorizarPropuestasCatalogoV2(pedido,catalog,single,
  new Set(),true,new Set([id]));
 assert.deepEqual(consult.propuestas[0].correspondencias.map(x=>x.indicePedido),[0]);
 const falseSku=structuredClone(single);
 falseSku[0].correspondencias[0].numeroCatalogo=999;
 const blocked=autorizarPropuestasCatalogoV2(pedido,catalog,falseSku,
  new Set(),true,new Set(['corralon_ailin:0:999']));
 assert.deepEqual(blocked.propuestas,[]);
 assert.equal(blocked.motivo,'producto_no_declarado_en_catalogo');
});
