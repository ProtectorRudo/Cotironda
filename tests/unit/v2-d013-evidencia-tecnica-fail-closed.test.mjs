import test from 'node:test';
import assert from 'node:assert/strict';
import {verificarCorrespondenciaTecnicaD013 as check}
 from '../../src/domain/ia-central/verificador-evidencia-tecnica-v2-d013.ts';
import {autorizarPropuestasCatalogoV2 as route}
 from '../../src/domain/ia-central/ruteador-catalogos-v2-d013.ts';

const base={
 evidencia:'100 bolsas cemento Portland Loma Negra 50 kg',
 inicio:0,fin:44,descripcion:'Cemento Portland Loma Negra 50 kg',
 cantidad:'100',unidad:'bag',rubro:'obra_gruesa',presentacion:'50 kg',
 aclaracion:null
};
const testCase=(update={},seller='Cemento Portland marca nacional bolsa 25 kg',
 type='alternativa_razonable')=>check({...base,...update},seller,type);

test('D013: marca flexible, 100 bolsas de 50 kg = 200 de 25 kg (SIN inferir precio)',()=>{
 const result=testCase();
 assert.equal(result.estado,'evidencia_suficiente');
 assert.deepEqual(result.conversion,{
  unidad:'kg',cantidadSolicitadaBase:'5000',
  presentacionSolicitada:'50 kg',presentacionCatalogo:'25 kg',
  envasesEquivalentes:'200'
 });
 assert.equal(Object.hasOwn(result,'precio'),false);
});
test('D013: 100 envases de 4 L equivalen en volumen a 80 de 5 L',()=>{
 const result=testCase({
  descripcion:'Pintura latex interior blanco 4 L',
  evidencia:'100 baldes pintura latex interior 4 L',
  presentacion:'4 L',unidad:'unit'
 },'Pintura latex interior blanco 5 L');
 assert.equal(result.estado,'evidencia_suficiente');
 assert.deepEqual([result.conversion?.unidad,result.conversion?.cantidadSolicitadaBase,
  result.conversion?.envasesEquivalentes],['l','400','80']);
});
test('D013: Portland != albañilería aunque ambos sean cemento',()=>{
 const r=testCase({},'Cemento albañilería bolsa 25 kg');
 assert.equal(r.estado,'revision_interna');
 assert.equal(r.motivo,'tipo_o_aplicacion_tecnica_diferente');
});
test('D013: si el comprador exige solo Loma Negra no enviar marca alternativa',()=>{
 const result=testCase({
  evidencia:'100 bolsas cemento Portland solo Loma Negra 50 kg',
  descripcion:'Cemento Portland solo Loma Negra 50 kg',
  aclaracion:'Solo Loma Negra'
 },'Cemento Portland marca otra bolsa 25 kg');
 assert.equal(result.estado,'revision_interna');
 assert.equal(result.motivo,'marca_excluyente_no_acreditada');
 const okay=testCase({
  descripcion:'Cemento Portland solo Loma Negra 50 kg',
  aclaracion:'Solo Loma Negra'
 },'Cemento Portland Loma Negra bolsa 50 kg');
 assert.equal(okay.estado,'evidencia_suficiente');
});
test('D013: Ceresita sin ficha no equivale automaticamente a cualquier hidrofugo',()=>{
 const r=testCase({
  descripcion:'Ceresita hidrofugo liquido 1 L',
  evidencia:'100 unidades Ceresita hidrofugo 1 L',unidad:'unit'
 },'Impermeabilizante asfaltico 1 L');
 assert.equal(r.estado,'revision_interna');
});
test('D013: cable 2.5 mm2 no equivale a cable 4 mm2',()=>{
 const req={
  descripcion:'Cable unipolar cobre 2.5 mm2',
  evidencia:'100 metros cable unipolar cobre 2.5 mm2',unidad:'m'
 };
 const bad=testCase(req,'Cable unipolar cobre 4 mm2');
 assert.equal(bad.estado,'revision_interna');
 assert.equal(bad.motivo,'seccion_cable_no_equivalente');
 const okay=testCase(req,'Cable unipolar cobre 2.5 mm2');
 assert.equal(okay.estado,'evidencia_suficiente');
});
test('D013: latex para interior y exterior son aplicaciones distintas',()=>{
 const req={descripcion:'Pintura latex interior blanco 4 L',
  evidencia:'100 baldes pintura latex interior blanco 4 L',unidad:'unit'};
 const r=testCase(req,'Pintura latex exterior blanco 4 L');
 assert.equal(r.estado,'revision_interna');
});
test('D013: placas yeso/OSB y espesores no son intercambiables',()=>{
 const req={descripcion:'Placa yeso 12.5 mm',
  evidencia:'100 placas yeso 12.5 mm',unidad:'unit'};
 const bad=testCase(req,'Placa OSB 12.5 mm');
 assert.equal(bad.estado,'revision_interna');
 assert.equal(bad.motivo,'tipo_o_aplicacion_tecnica_diferente');
 const wrong=testCase(req,'Placa yeso 13 mm');
 assert.equal(wrong.estado,'revision_interna');
 assert.equal(wrong.motivo,'dimension_tecnica_no_equivalente');
 const absent=testCase(req,'Placa yeso sin espesor declarado');
 assert.equal(absent.estado,'revision_interna');
 assert.equal(absent.motivo,'dimension_tecnica_no_equivalente');
});
test('D013: evitar cambio kg por litros y conversion fraccionaria de envases',()=>{
 const bad=testCase({},'Cemento Portland 25 L');
 assert.equal(bad.estado,'revision_interna');
 assert.equal(bad.motivo,'base_de_medida_incompatible');
 const fractional=testCase({},'Cemento Portland 30 kg');
 assert.equal(fractional.estado,'revision_interna');
 assert.equal(fractional.motivo,'conversion_de_envases_no_entera');
});
test('D013: AI no puede inventar producto de catalogo ni ignorar riesgo tecnico',()=>{
 const pedido={intencion:'cotizar',zona_entrega:'La Plata',
  dudas:[],articulos:[base]};
 const proveedores=[{clave:'ferre_123',activo:true,consentido:true,
  localidades:['La Plata'],articulos:[
   {numero:1,descripcion:'Cemento albañilería 25 kg',rubro:'ferreteria'}
  ]}];
 const prop=[{proveedor:'ferre_123',correspondencias:[{
  indicePedido:0,numeroCatalogo:1,tipo:'alternativa_razonable',
  explicacion:'equivalente segun la IA'
 }]}];
 const r=route(pedido,proveedores,prop);
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.whatsappEnviado,false);
 assert.deepEqual(r.propuestas,[]);
});
