import test from 'node:test';
import assert from 'node:assert/strict';
import {cantidadAcreditadaLecturaUnicaD013,
 evaluarLecturaCentralUnicaD013} from
 '../../src/domain/ia-central/contrato-v2-d013.ts';

test('D013 IA única: cantidades acreditables con grafías reales y unidades comerciales',()=>{
 const casos=[
  ['10 bolsas de cemento CPC de 50 kg','10','bag','10'],
  ['DIEZ bolsas de cemento CPC de 50 kg','10','bag','diez'],
  ['Diez bolsas de cemento CPC de 50 kg','10','bag','10'],
  ['10bolsas de cemento 50kg','10','bag','10'],
  ['una bolsa de cemento 50 kg','1','bag','1'],
  ['Un bolsón de arena de 1 m³','1','bigbag','1'],
  ['1 bolsón de arena de 1 m³','1','bigbag','1'],
  ['2m³ de arena','2','m3','2'],
  ['2 m³ de arena','2','metros cúbicos','2'],
  ['3 mts. lineales de cable','3','m.l.','3'],
  ['3 metros lineales de cable','3','m.l.','3'],
  ['12,5 litros de pintura','12.5','litros','12,5'],
  ['4L de pintura','4','litros','4'],
  ['2 rollos de membrana de 25 m','2','rollos','2'],
  ['dos rollos de cable','2','rollos','2'],
  ['2u de tirafondos','2','unit','2'],
  ['2 paquetes de tornillos','2','unit','dos'],
  ['tres bolsas de arena','3','bag','TRES']
 ];
 for(const [origen,cantidad,unidad,cita] of casos)
  assert.equal(cantidadAcreditadaLecturaUnicaD013(
   origen,cantidad,unidad,cita),true,
   'Debe acreditar: '+origen+' | '+cantidad+' '+unidad+' | '+cita);
});

test('D013 IA única: no usar peso, volumen, dimensiones ni SKU como conteo',()=>{
 const negativos=[
  ['10 bolsas de cemento de 25 kg','25','bag','25'],
  ['10 bolsas de cemento de 50 kg','50','bag','50'],
  ['10 bolsas de cemento 50 kg','12','bag','12'],
  ['2 bolsones de arena de 1 m³','1','bigbag','1'],
  ['1 m³ de arena fina','1','bigbag','1'],
  ['4 L de pintura','4','kg','4'],
  ['2 m³ de arena','2','litros','2'],
  ['2 rollos de cable de 25 metros','25','roll','25'],
  ['dos bolsas de cemento','3','bag','tres'],
  ['3 rollos de membrana','30','roll','30'],
  ['15,5 L de pintura','15','l','15'],
  ['20 ml de pintura','20','mL','20']
 ];
 for(const [origen,cantidad,unidad,cita] of negativos)
  assert.equal(cantidadAcreditadaLecturaUnicaD013(
   origen,cantidad,unidad,cita),false,
   'No validar: '+origen+' | '+cantidad+' '+unidad);
});

test('D013 lectura central: usa la cantidad original y no necesita segundo modelo',()=>{
 const evidencia='Diez bolsas de cemento CPC de 50 kg';
 const original='Hola. Necesito '+evidencia+'. Entrega: La Plata, Buenos Aires.';
 const inicio=original.indexOf(evidencia);
 const primera={intencion:'cotizar',zona_entrega:'La Plata',
  dudas:[],articulos:[{
   inicio,fin:inicio+evidencia.length,evidencia,
   descripcion:'cemento CPC de 50 kg',cantidad:'10',unidad:'bag',
   rubro:'obra_gruesa',aclaracion:null,presentacion:'50 kg',
   citaCantidad:'10',citaPresentacion:'50 kg'
  }]};
 const ok=evaluarLecturaCentralUnicaD013(original,primera);
 assert.equal(ok.estado,'listo_para_preparar',ok.motivo);
 assert.equal(ok.pedido.articulos.length,1);
 assert.equal(ok.pedido.articulos[0].cantidad,'10');
 assert.equal(ok.pedido.articulos[0].descripcion,evidencia);
 assert.equal(ok.pedido.articulos[0].presentacion,'50 kg');
 const invented=evaluarLecturaCentralUnicaD013(original,{
  ...primera,articulos:[{...primera.articulos[0],cantidad:'50',unidad:'bag',
   citaCantidad:'50'}]});
 assert.equal(invented.estado,'rechazado');
 assert.equal(invented.motivo,'cantidad_sin_respaldo_en_fuente');
 assert.equal(invented.pedido,null);
});

test('D013 IA única: un cambio de localidad o tramo sigue sin poder inventarse',()=>{
 const original='Necesito diez bolsas de cemento. Entrega en La Plata';
 const evidencia='diez bolsas de cemento';
 const inicio=original.indexOf(evidencia);
 const item={inicio,fin:inicio+evidencia.length,evidencia,
  descripcion:'cemento',cantidad:'10',unidad:'bag',citaCantidad:'diez',
  rubro:'obra_gruesa',aclaracion:null,presentacion:null,
  citaPresentacion:null};
 const base={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
  articulos:[item]};
 assert.equal(evaluarLecturaCentralUnicaD013(original,base).estado,
  'listo_para_preparar');
 assert.equal(evaluarLecturaCentralUnicaD013(original,
  {...base,zona_entrega:'Rosario'}).estado,'requiere_aclaracion');
 assert.equal(evaluarLecturaCentralUnicaD013(original,
  {...base,articulos:[{...item,inicio:inicio+1}]}).estado,'rechazado');
});
