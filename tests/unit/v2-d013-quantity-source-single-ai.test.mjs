import test from 'node:test';
import assert from 'node:assert/strict';
import {cantidadAcreditadaLecturaUnicaD013,
 cantidadFisicaUnicaAcreditadaD013,
 cantidadUnidadesLibresAcreditadaD013,
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
  ['1 bolsón de arena','1','bag','1'],
  ['2 cajas de tornillos','2','bucket','2'],
  ['4 L de pintura','4','kg','4'],
  ['2 m³ de arena','2','litros','2'],
  ['2 rollos de cable de 25 metros','25','roll','25'],
  ['10 bolsas de cemento de 25 kg','25','kg','25'],
  ['2 rollos de cable de 25 metros','25','m','25'],
  ['1 bolsón de arena de 1 m³','1','m3','1'],
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

test('D013 lectura central: una sola IA y cita textual no es otra interpretación',()=>{
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
 // Un valor inventado en un mock NO se corrige con regex; la
 // responsabilidad semántica es de la IA Central y su instrucción.
 assert.equal(invented.estado,'listo_para_preparar',invented.motivo);
 assert.equal(invented.pedido.articulos[0].cantidad,'50');
 assert.equal(invented.pedido.articulos[0].unidad,'bag');
 assert.equal(invented.pedido.articulos[0].descripcion,evidencia);
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


test('D013: cita IA defectuosa no vuelve a bloquear cantidades interpretadas',()=>{
 const samples=[
  {e:'10 bolsas de cemento CPC de 50 kg',cantidad:'50',unidad:'kg',cita:'50',expected:'10',u:'bag'},
  {e:'1 bolsón de arena fina de 1 m³',cantidad:'1',unidad:'m3',cita:'1',expected:'1',u:'bigbag'},
  {e:'dos baldes de pintura de 4 litros',cantidad:'4',unidad:'l',cita:'4',expected:'2',u:'bucket'},
  {e:'4 cajas de tornillos 8 mm',cantidad:'8',unidad:'mm',cita:'8',expected:'4',u:'box'},
  {e:'media docena de bolsas de cal 25 kg',cantidad:'25',unidad:'kg',cita:'25',expected:'6',u:'bag'}
 ];
 for(const s of samples){
  const original='Necesito '+s.e+'. Envío a La Plata.';
  const inicio=original.indexOf(s.e);
  const parsed={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:[{
   inicio,fin:inicio+s.e.length,evidencia:s.e,descripcion:s.e,
   cantidad:s.expected,unidad:s.u,citaCantidad:'cita sin cifra normalizada',rubro:'obra_gruesa',
   presentacion:null,citaPresentacion:null,aclaracion:null
  }]};
  const result=evaluarLecturaCentralUnicaD013(original,parsed);
  assert.equal(result.estado,'listo_para_preparar',s.e+' '+result.motivo);
  assert.equal(result.pedido.articulos[0].cantidad,s.expected);
  assert.equal(result.pedido.articulos[0].unidad,s.u);
  assert.equal(result.pedido.articulos[0].descripcion,s.e);
 }
});

test('D013: si IA Central expresa una duda real, no inventar valores',()=>{
 const samples=[
  {e:'3 bolsas de cemento y 2 baldes de pintura',cantidad:'99',unidad:'bag',cita:'99'},
  {e:'cemento de 50 kg',cantidad:'2',unidad:'bag',cita:'2'},
  {e:'pintura blanca 4 litros',cantidad:'3',unidad:'bucket',cita:'3'},
  {e:'quiero cemento, algunas bolsas',cantidad:'5',unidad:'bag',cita:'5'},
  {e:'1 bolsa de cemento y un bolsón de arena',cantidad:'99',unidad:'bag',cita:'99'}
 ];
 for(const s of samples){
  const original=s.e+'. Localidad: La Plata.';
  const parsed={intencion:'cotizar',zona_entrega:'La Plata',dudas:['Cantidad no determinada por IA Central'],articulos:[{
   inicio:0,fin:s.e.length,evidencia:s.e,descripcion:s.e,
   cantidad:s.cantidad,unidad:s.unidad,citaCantidad:s.cita,rubro:'obra_gruesa',
   presentacion:null,citaPresentacion:null,aclaracion:null
  }]};
  const codes=[];
  const result=evaluarLecturaCentralUnicaD013(original,parsed,c=>codes.push(c));
  assert.equal(result.estado,'requiere_aclaracion',s.e);
  assert.equal(result.motivo,'ia_central_solicita_aclaracion');
  assert.deepEqual(codes,[]);
 }
});

test('D013: magnitud decidida por IA se conserva con cita informal',()=>{
 const samples=[
  ['2,5 m³ de arena', '2.5','m3'],
  ['4 L de pintura látex','4','l'],
  ['10 metros lineales de cable','10','m'],
  ['Tres metros lineales de cable','3','m'],
  ['1.000 litros de agua','1000','l'],
  ['15 kg de cal','15','kg'],
  ['2 m² de aislante','2','m2'],
  ['necesito 3 metros cúbicos de arena','3','m3'],
  ['- 15,5 litros de imprimación','15.5','l'],
  ['cotizar 2 toneladas de áridos','2','t']
 ];
 for(const [e,q,u] of samples){
  const parsed=cantidadFisicaUnicaAcreditadaD013(e);
  assert.deepEqual(parsed,{cantidad:q,unidad:u},e);
  const original='Hola, necesito '+e+'. Entregar en La Plata.';
  const inicio=original.indexOf(e);
  const lectura={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
   articulos:[{inicio,fin:inicio+e.length,evidencia:e,
    descripcion:e,rubro:'obra_gruesa',presentacion:null,
    citaPresentacion:null,aclaracion:null,
    cantidad:q,unidad:u,citaCantidad:'texto original no numérico'}]};
  const aprobado=evaluarLecturaCentralUnicaD013(original,lectura);
  assert.equal(aprobado.estado,'listo_para_preparar',e);
  assert.equal(aprobado.pedido.articulos[0].cantidad,q,e);
  assert.equal(aprobado.pedido.articulos[0].unidad,u,e);
  assert.equal(aprobado.pedido.articulos[0].descripcion,e,e);
 }
});
test('D013: una medida que parece PRESENTACION nunca repara cantidad inventada',()=>{
 const negativos=[
  'cemento CPC de 50 kg',
  'cable en rollo de 20 metros',
  '2 rollos de membrana de 25 m',
  '1 bolsón de arena de 1 m³',
  '4 mm de chapa calibre grueso',
  '10 cm de tubo de PVC',
  'membrana de 4 L',
  '2 m³ de arena y 5 L de pintura',
  '20 ml de pintura',
  'bolsa de arena 20 kg',
  'caño de 3 metros',
  'tres milímetros de chapa'
 ];
 for(const e of negativos){
  assert.equal(cantidadFisicaUnicaAcreditadaD013(e),null,e);
 }
});


test('D013: cantidades libres decididas por IA sin diccionario de SKU',()=>{
 const samples=[
  ['12 placas de yeso 12,5 mm','12'],
  ['cinco perfiles galvanizados','5'],
  ['3 tornillos autoperforantes','3'],
  ['25 tarugos de 6 mm','25'],
  ['- 8 varillas roscadas','8'],
  ['una chapa trapezoidal','1'],
  ['veinticinco ladrillos refractarios','25'],
  ['100 caños de PVC','100'],
  ['3 perfiles de 2 metros','3'],
  ['Necesito 4 puertas interiores','4'],
  ['10 placas de 1,20 x 2,40','10'],
  ['7 fijaciones especiales','7']
 ];
 for(const [e,cantidad] of samples){
  const v=cantidadUnidadesLibresAcreditadaD013(e);
  assert.deepEqual(v,{cantidad,unidad:'unit'},e);
  const texto='Pedido: '+e+'. Entrega en La Plata.';
  const inicio=texto.indexOf(e);
  const lectura={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
   articulos:[{inicio,fin:inicio+e.length,evidencia:e,
    descripcion:'producto original',cantidad,
    unidad:'unit',citaCantidad:'una cita incorrecta',
    rubro:'obra_gruesa',presentacion:null,citaPresentacion:null,
    aclaracion:null}]};
  const r=evaluarLecturaCentralUnicaD013(texto,lectura);
  assert.equal(r.estado,'listo_para_preparar',e+': '+r.motivo);
  assert.equal(r.pedido.articulos[0].cantidad,cantidad,e);
  assert.equal(r.pedido.articulos[0].unidad,'unit',e);
  assert.equal(r.pedido.articulos[0].descripcion,e,e);
 }
});

test('D013: numero con presentacion o dos productos no se vuelve unidad inventada',()=>{
 const samples=[
  'cemento de 50 kg',
  '25 kg de cemento',
  '2 m³ de arena',
  '4 litros de pintura',
  '20 mm chapa',
  '5 m de cable',
  '20 ml de solvente',
  '3 cm de tornillo',
  '2 cajas de tornillos de 10 mm',
  '2 bolsones de arena',
  '3 rollos de 20 m',
  '15,5 placas de yeso',
  '10x20 placas',
  '25/50 hierro',
  '4,5 L de látex',
  'tres tornillos y dos chapas',
  '3 perfiles y 2 puertas',
  '4 placas, 3 clavos',
  'cemento 4 bolsas'
 ];
 for(const e of samples)
  assert.equal(cantidadUnidadesLibresAcreditadaD013(e),null,e);
});

test('D013: IA Central expresa duda, mantiene privacidad y no envía',()=>{
 const e='Necesito cemento Portland, algunas bolsas';
 const original=e+'. Localidad: La Plata';
 const salida={intencion:'cotizar',zona_entrega:'La Plata',dudas:['Falta cantidad comercial explícita'],
  articulos:[{inicio:0,fin:e.length,evidencia:e,
   descripcion:e,cantidad:'99',unidad:'unit',citaCantidad:'99',
   rubro:'obra_gruesa',presentacion:null,citaPresentacion:null,
   aclaracion:null}]};
 const codes=[];
 const r=evaluarLecturaCentralUnicaD013(original,salida,c=>codes.push(c));
 assert.equal(r.estado,'requiere_aclaracion');
 assert.equal(r.motivo,'ia_central_solicita_aclaracion');
 assert.deepEqual(codes,[]);
});
