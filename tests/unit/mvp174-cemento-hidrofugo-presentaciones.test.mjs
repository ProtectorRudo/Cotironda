import test from 'node:test';
import assert from 'node:assert/strict';
import {cotejarPresentacionObraMvp174 as cotejar} from '../../src/domain/cotejo-presentaciones-mvp174.ts';
const cemento=(cantidad='20.000',descripcion='cemento CPC 50 kg')=>({
 id:'item_001',descripcionLiteral:descripcion,cantidad,unidad:'bag',familia:'cemento_gris_obra'
});
const hidrofugo={id:'item_002',descripcionLiteral:'hidrófugo',
 cantidad:'5.000',unidad:'l',familia:'hidrofugo'};
const probar=(pedido,descripcion,cantidad,unit=null)=>cotejar(pedido,[{
 lineNo:1,descriptionLiteral:descripcion,quantityLiteral:cantidad,
 unitLiteral:unit,unitPriceLiteral:'$10,00',lineTotalLiteral:'$100,00'
}], [{lineNo:1,unitStatus:'not_explicit',unit:null,
 presentation:'none',page:1,row:3}]);
test('cemento 20 bolsas 50kg vs 40 bolsas 25kg: volumen comercial equivalente',()=>{
 assert.equal(probar(cemento(),'cemento avellaneda x 25 kg','40,00').estado,
  'alternativa_comercial_con_aclaracion');
});
test('cemento 20 bolsas CPC 50kg vs 20 bolsas CPC 50kg',()=>{
 assert.equal(probar(cemento(),'CEMENTO CPC 50 KG','20').estado,
  'alternativa_comercial_con_aclaracion');
});
test('cemento 25 bolsas 25kg vs 25 bolsas 25kg de otra marca',()=>{
 assert.equal(probar(cemento('25.000','cemento gris de 25 kg'),
  'cemento avellaneda x 25 kg; Dscto. 22.4%','25,00').estado,
  'alternativa_comercial_con_aclaracion');
});
test('20 bolsas 50kg no equivalen a 20 bolsas 25kg',()=>{
 assert.equal(probar(cemento(),'cemento avellaneda 25kg','20').estado,
  'cantidad_diferente');
});
test('hidrófugo 5L vs un envase de 5lts',()=>{
 assert.equal(probar(hidrofugo,'Sinteplast Hidrofugo 5lts','1,00').estado,
  'alternativa_comercial_con_aclaracion');
});
test('hidrófugo en pasta sin litro declarado no se convierte a 5L',()=>{
 assert.equal(probar(hidrofugo,'HIDROFUGO EN PASTA','5').estado,
  'presentacion_sin_acreditar');
});
test('hidrófugo de 4L no equivale a 5L',()=>{
 assert.equal(probar(hidrofugo,'hidrofugo 4 litros','1').estado,
  'cantidad_diferente');
});
test('la fuente no contiene precios finales ni contactos en el resultado',()=>{
 const r=probar(cemento(),'cemento 25kg','40');
 for(const field of ['precioUnitarioNeto','ivaPorcentaje','contactosRevelados','rankingHabilitado'])
  assert.equal(Object.hasOwn(r,field),false);
});
