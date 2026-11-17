import test from 'node:test';
import assert from 'node:assert/strict';
import {mismaPresentacionFisicaV2D013,leerMagnitudesV2D013,
 unidadDimensionadaV2D013,unidadCompradaCanonicaV2D013}
 from '../../src/domain/ia-central/magnitudes-universales-v2-d013.ts';
import {probarAtributosV2D013}
 from '../../src/domain/ia-central/evidencia-atributos-v2-d013.ts';
import {verificarCorrespondenciaTecnicaD013}
 from '../../src/domain/ia-central/verificador-evidencia-tecnica-v2-d013.ts';

test('D013: conversiones físicas exactas, sin vocabulario de materiales',()=>{
 for(const [a,b] of [
  ['10 metros lineales','10 m'],['10 m.l.','10 mts'],
  ['10 mts lin.','10 metros'],['100 cm','1 m'],['1000 mm','1 m'],
  ['500 mL','0,5 litros'],['500 mililitros','0.5 L'],
  ['25 kg','25000 g'],['1.000 g','1 kilo'],
  ['500 mg','0,5 gramos'],['1 tonelada','1000 kg'],
  ['1 m³','1 m3'],['1 metro cúbico','1 m³'],
  ['1 m²','1 m2'],['10000 cm²','1 m²'],
  ['2 mm²','0,02 cm2'],['4 mm','0,4 cm'],
  ['0,75 litros','750 mL'],['1,5 kg','1500 g']
 ]){
  assert.equal(mismaPresentacionFisicaV2D013(a,b),true,
   'debe admitir equivalencia: '+a+' = '+b);
  assert.equal(mismaPresentacionFisicaV2D013(b,a),true,
   'simetría: '+b+' = '+a);
 }
});
test('D013: jamás iguala dimensiones incompatibles ni distinta cantidad',()=>{
 for(const [a,b] of [
  ['10 kg','10 L'],['500 g','500 mL'],
  ['1 m³','1 m²'],['1 m','1 m2'],['2 mm2','2 mm'],
  ['1 m³','1000 L'],['10 metros','10 litros'],
  ['1 cm³','1 mm³'],['4 mm','5 mm'],
  ['1 m2','1 cm2'],['1 kg','1 g'],
  ['2 bolsas de 25 kg','1 bolsa de 25 kg'],
  ['5 L x 2','5 L'],['5 L','5 L x 2'],
  ['10 L','10 mL'],['500 ml','0,5 L']
 ]){
  assert.equal(mismaPresentacionFisicaV2D013(a,b),false,
   'no aceptar: '+a+' != '+b);
 }
});
test('D013: ml ambiguo, mL inequívoco, big bag distinto de bolsa',()=>{
 assert.equal(unidadDimensionadaV2D013('ml'),null);
 assert.equal(unidadDimensionadaV2D013('mL').canonica,'ml');
 assert.equal(unidadCompradaCanonicaV2D013('m²'),'m2');
 assert.equal(unidadCompradaCanonicaV2D013('mts lineales'),'m');
 assert.equal(unidadCompradaCanonicaV2D013('bolsón'),'bigbag');
 assert.equal(unidadCompradaCanonicaV2D013('bolsa'),'bag');
 assert.equal(leerMagnitudesV2D013('500 ml'),null);
 assert.equal(leerMagnitudesV2D013('500 mL')[0].unidad,'ml');
});
test('D013: la cita del comprador no transforma espesores en envases',()=>{
 const item={evidencia:'tres baldes de albañil de 10 litros',
  cantidad:'3',unidad:'unit',presentacion:'10 L',citaCantidad:'tres',
  citaProducto:'baldes de albañil',citaPresentacion:'10 litros'};
 assert.equal(probarAtributosV2D013(item),true);
 assert.equal(probarAtributosV2D013({...item,cantidad:'10',
  citaCantidad:'10'}),false);
 const buyer={evidencia:'un bolsón de arena fina de 1 m³',
  cantidad:'1',unidad:'bag',presentacion:'1 m3',citaCantidad:'un',
  citaProducto:'bolsón de arena fina',citaPresentacion:'1 m³'};
 assert.equal(probarAtributosV2D013(buyer),true);
 assert.equal(probarAtributosV2D013({...buyer,presentacion:'1 m2'}),false);
 const lengths={evidencia:'10 metros lineales de cable',
  cantidad:'10',unidad:'m',presentacion:null,citaCantidad:'10',
  citaProducto:'cable',citaPresentacion:null};
 assert.equal(probarAtributosV2D013(lengths),true);
 assert.equal(probarAtributosV2D013({...lengths,unidad:'l'}),false);
 assert.equal(probarAtributosV2D013({...lengths,unidad:'unit'}),false);
 const liquid={evidencia:'500 mililitros de pintura',
  cantidad:'500',unidad:'ml',presentacion:null,citaCantidad:'500',
  citaProducto:'pintura',citaPresentacion:null};
 assert.equal(probarAtributosV2D013(liquid),true);
 assert.equal(probarAtributosV2D013({...liquid,unidad:'m'}),false);
 assert.equal(probarAtributosV2D013({...liquid,
  evidencia:'500 ml de pintura'}),false);
});
const item=(descripcion,cantidad='10')=>({
 descripcion,evidencia:descripcion,inicio:0,fin:descripcion.length,
 unidad:'bag',cantidad,rubro:'obra_gruesa',presentacion:null,aclaracion:null
});
test('D013: conversión de envases en catálogo con gramos/kilos y mL/L',()=>{
 const m=verificarCorrespondenciaTecnicaD013(
  item('10 bolsas de sellador de 500 g'),
  'Bolsas de sellador 0,5 kg','alternativa_razonable',true);
 assert.equal(m.estado,'evidencia_suficiente',m.motivo);
 assert.equal(m.conversion?.envasesEquivalentes,'10');
 const v=verificarCorrespondenciaTecnicaD013(
  item('10 envases de impermeabilizante de 500 mL'),
  'Impermeabilizante 1 litro','alternativa_razonable',true);
 assert.equal(v.estado,'evidencia_suficiente',v.motivo);
 assert.equal(v.conversion?.envasesEquivalentes,'5');
 const wrong=verificarCorrespondenciaTecnicaD013(
  item('10 envases de impermeabilizante de 500 mL'),
  'Impermeabilizante 500 g','alternativa_razonable',true);
 assert.equal(wrong.motivo,'base_de_medida_incompatible');
});

test('D013: volumen de áridos es base propia, conversión entera sin stock inferido',()=>{
 const a=verificarCorrespondenciaTecnicaD013(
  item('2 bolsones de arena fina de 1 m³','2'),
  'Bolsón de arena fina de 0,5 m3','alternativa_razonable',true);
 assert.equal(a.estado,'evidencia_suficiente',a.motivo);
 assert.equal(a.conversion?.unidad,'m3');
 assert.equal(a.conversion?.envasesEquivalentes,'4');
 const b=verificarCorrespondenciaTecnicaD013(
  item('1 bolsón de arena fina de 1 m³','1'),
  'Bolsón de arena fina 0,75 m3','alternativa_razonable',true);
 assert.equal(b.estado,'revision_interna');
 assert.equal(b.motivo,'conversion_de_envases_no_entera');
 const incompatible=verificarCorrespondenciaTecnicaD013(
  item('1 bolsón de arena fina de 1 m³','1'),
  'Bolsón de arena fina 1000 L','alternativa_razonable',true);
 assert.equal(incompatible.motivo,'base_de_medida_incompatible');
});
