
import test from 'node:test';
import assert from 'node:assert/strict';
import {numeroNaturalV2D013,probarAtributosV2D013}
 from '../../src/domain/ia-central/evidencia-atributos-v2-d013.ts';
test('V2: cantidades naturales independientes de los nombres de materiales',()=>{
 for(const [phrase,amount] of [
  ['un',1],['una',1],['dos',2],['tres',3],['diez',10],
  ['veintitrés',23],['treinta y dos',32],['ciento veinte',120],
  ['doscientos treinta y uno',231],['mil ciento veinte',1120],
  ['una docena',12],['media docena',6],['un par',2],
  ['tres pares',6],['veinticinco',25],['1,5',1.5],['1.500',1500]
 ]){
  assert.equal(numeroNaturalV2D013(phrase),amount,phrase);
 }
 for(const phrase of ['varios','como diez','doscientas docenas de más',
  '2 rollos','3 kg','25 litros','un montón','mil millones']){
  assert.equal(numeroNaturalV2D013(phrase),null,phrase);
 }
});
test('V2: cita de cantidad no puede provenir de especificación',()=>{
 const item={evidencia:'tres baldes de albañil de 10 litros',
  cantidad:'3',unidad:'unit',presentacion:'10 L',
  citaCantidad:'tres',citaProducto:'baldes de albañil',
  citaPresentacion:'10 litros'};
 assert.equal(probarAtributosV2D013(item),true);
 for(const altered of [
  {...item,citaCantidad:'10'}, {...item,cantidad:'10'},
  {...item,citaPresentacion:'tres'},
  {...item,citaProducto:'baldes inventados'},
  {...item,citaCantidad:'3'},
  {...item,citaPresentacion:'tres baldes de albañil de 10 litros'},
  {...item,presentacion:'25 L'}
 ]){
  assert.equal(probarAtributosV2D013(altered),false,JSON.stringify(altered));
 }
});
test('V2: cientos de combinaciones numéricas y medidas se separan',()=>{
 const numbers=[['una',1],['dos',2],['tres',3],['cuatro',4],
  ['cinco',5],['diez',10],['veinte',20],['treinta y dos',32]];
 const sizes=[4,10,25,50,100];
 for(const [word,quantity] of numbers)for(const size of sizes){
  const evidence=word+' elementos de construcción de '+size+' kg';
  const item={evidencia:evidence,cantidad:String(quantity),unidad:'unit',
   presentacion:size+' kg',citaCantidad:word,
   citaProducto:'elementos de construcción',
   citaPresentacion:size+' kg'};
  assert.equal(probarAtributosV2D013(item),true,evidence);
  assert.equal(probarAtributosV2D013({
   ...item,cantidad:String(size),citaCantidad:word
  }),size===quantity,'cantidad jamás toma peso como unidades');
 }
});
test('V2: no inventa origen, marca, ni especificación ajena',()=>{
 const item={evidencia:'10 bolsas de cemento CPC de 25 kilos',
  cantidad:'10',unidad:'bag',presentacion:'25 kg',
  citaCantidad:'10',citaProducto:'cemento CPC',
  citaPresentacion:'25 kilos'};
 assert.equal(probarAtributosV2D013(item),true);
 assert.equal(probarAtributosV2D013({...item,citaProducto:'Loma Negra'}),false);
 assert.equal(probarAtributosV2D013({...item,citaPresentacion:'50 kg'}),false);
 assert.equal(probarAtributosV2D013({...item,citaCantidad:'25'}),false);
});

test('V2: no confundir magnitud con cantidad cuando presentación fue omitida',()=>{
 const cited={evidencia:'tres baldes de albañil de 10 litros',
  cantidad:'10',unidad:'unit',presentacion:null,
  citaCantidad:'10',citaProducto:'baldes de albañil',citaPresentacion:null};
 assert.equal(probarAtributosV2D013(cited),false);
 const weight={evidencia:'25 kilos de clavos',cantidad:'25',
  unidad:'kg',presentacion:null,citaCantidad:'25',
  citaProducto:'clavos',citaPresentacion:null};
 assert.equal(probarAtributosV2D013(weight),true);
 const ask={evidencia:'dos rollos de membrana aluminizada 4 mm',
  cantidad:'4',unidad:'roll',presentacion:null,citaCantidad:'4',
  citaProducto:'membrana aluminizada',citaPresentacion:null};
 assert.equal(probarAtributosV2D013(ask),false);
});

test('V2: m³ y m3 son una unidad, no cantidades inventadas (WhatsApp auténtico)',()=>{
 const item={evidencia:'un bolsón de arena fina de 1 m³',
  cantidad:'1',unidad:'bag',presentacion:'1 m3',
  citaCantidad:'un',citaProducto:'bolsón de arena fina',
  citaPresentacion:'1 m³'};
 assert.equal(probarAtributosV2D013(item),true);
 assert.equal(probarAtributosV2D013({...item,presentacion:'1m3'}),true);
 for(const presentacion of ['1 m2','2 m3','10 m3','1 cm3']){
  assert.equal(probarAtributosV2D013({...item,presentacion}),false,presentacion);
 }
 assert.equal(probarAtributosV2D013({...item,cantidad:'3'}),false);
 assert.equal(probarAtributosV2D013({...item,citaCantidad:'1'}),false);
});
test('V2: normalizaciones m²/mm² no mezclan área, sección y espesor',()=>{
 const item={evidencia:'dos rollos de membrana de 2 m²',
  cantidad:'2',unidad:'roll',presentacion:'2 m2',
  citaCantidad:'dos',citaProducto:'rollos de membrana',
  citaPresentacion:'2 m²'};
 assert.equal(probarAtributosV2D013(item),true);
 assert.equal(probarAtributosV2D013({...item,presentacion:'2 m3'}),false);
 const cable={...item,evidencia:'dos tramos de cable de 2 mm²',
  presentacion:'2 mm2',citaProducto:'tramos de cable',
  citaPresentacion:'2 mm²'};
 assert.equal(probarAtributosV2D013(cable),true);
 assert.equal(probarAtributosV2D013({...cable,presentacion:'2 mm3'}),false);
});
