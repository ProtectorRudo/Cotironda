import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararCatalogo} from '../../src/domain/catalogo.ts';
const base={category_code:'corralon',product_name:'Cemento Loma Negra 50 kg',unit_code:'bag'};
test('queda pendiente confirmación y nunca como catálogo habilitado',()=>{
  const r=prepararCatalogo([base]);
  assert.equal(r.estado,'pendiente_confirmacion');
  assert.equal(r.items.length,1);
});
test('no guarda precios ni datos extra del archivo',()=>{
  const r=prepararCatalogo([{...base, precio:98765,telefono:'123',observacion:'privada'}]);
  assert.deepEqual(Object.keys(r.items[0]).sort(),['category_code','manufacturer','manufacturer_sku','product_name','unit_code']);
});
test('no mezcla cemento de 25 kg con 50 kg',()=>{
  const r=prepararCatalogo([base,{...base,product_name:'Cemento Loma Negra 25 kg'}]);
  assert.equal(r.items.length,2);
});
test('detecta duplicado sin perder la referencia a la primera fila',()=>{
  const r=prepararCatalogo([base,{...base,product_name:' cemento   LOMA negra 50 kg '}]);
  assert.equal(r.items.length,1);
  assert.deepEqual(r.duplicados,[{fila:2,primeraFila:1}]);
});
test('rubro incorrecto no se asigna automáticamente',()=>{
  const r=prepararCatalogo([{...base,category_code:'instalaciones'}]);
  assert.deepEqual(r.errores,[{fila:1,codigo:'rubro_desconocido'}]);
});
test('unidad desconocida se rechaza',()=>{
  assert.equal(prepararCatalogo([{...base,unit_code:'miles'}]).errores[0].codigo,'unidad_invalida');
});
test('fila incompleta no se guarda',()=>{
  assert.equal(prepararCatalogo([{category_code:'corralon',unit_code:'kg'}]).items.length,0);
});
test('maneja valores sin estructura',()=>{
  assert.deepEqual(prepararCatalogo([null,123,'texto',[]]).errores.map(e=>e.codigo), Array(4).fill('fila_invalida'));
});
test('marca diferente no se asume igual',()=>{
  const r=prepararCatalogo([{...base,manufacturer:'Marca A'},{...base,manufacturer:'Marca B'}]);
  assert.equal(r.items.length,2);
});
test('limita listas sobredimensionadas',()=>{
  assert.throws(()=>prepararCatalogo(Array(2001).fill(base)),/catalogo_excede_limite/);
});
test('acepta 2000 filas sin desbordar',()=>{
  const r=prepararCatalogo(Array.from({length:2000},(_,i)=>({...base,product_name:'Producto '+i})));
  assert.equal(r.items.length,2000);
});
test('rechaza valores de tipo incorrecto para la marca',()=>{
  const r=prepararCatalogo([{...base,manufacturer:123}]);
  assert.equal(r.errores[0].codigo,'marca_invalida');
});
