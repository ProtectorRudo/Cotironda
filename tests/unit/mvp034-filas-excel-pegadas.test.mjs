import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararPedidoTextoMvp028} from '../../src/domain/pedido-piloto-mvp028.ts';
import {encabezadoTablaMvp034,filaTablaMvp034}
 from '../../src/domain/filas-copiadas-mvp034.ts';

const zona='Entrega en: La Plata';
test('MVP034: copiar Excel cantidad-unidad-material sin perder CPC, RH ni IVA',()=>{
 const r=prepararPedidoTextoMvp028([
  'Cantidad\tUnidad\tMaterial',
  '20\tbolsas\tCemento CPC Loma Negra 50 kg',
  '15\tplacas\tPlaca de yeso RH 12,5 mm',
  '5\tlitros\tPintura látex interior',
  'Necesito presupuesto con IVA incluido',
  zona
 ].join('\n'));
 assert.equal(r.estado,'listo_para_registrar');
 assert.equal(r.items.length,3);
 assert.deepEqual(r.items.map(x=>x.quantity),['20','15','5']);
 assert.deepEqual(r.items.map(x=>x.unit),['bag','unit','l']);
 assert.equal(r.items[0].source_description,'Cemento CPC Loma Negra 50 kg');
 assert.equal(r.items[1].source_description,'Placa de yeso RH 12,5 mm');
 assert.equal(r.vatRequest,'con_iva');
 assert.equal(r.pendientes.length,0);
});
test('MVP034: encabezado material-cantidad-unidad y decimal argentino',()=>{
 const r=prepararPedidoTextoMvp028([
  'Material\tCantidad\tUnidad',
  'Pintura látex interior\t2,5\tlitros',zona
 ].join('\n'));
 assert.equal(r.estado,'listo_para_registrar');
 assert.equal(r.items[0].quantity,'2.5');
 assert.equal(r.items[0].source_description,'Pintura látex interior');
});
test('MVP034: tres columnas sin encabezado y mezcla con renglón corriente',()=>{
 const r=prepararPedidoTextoMvp028([
  '10\tbolsas\tCemento CPC 50 kg',
  '15 placas de yeso RH 12,5 mm',zona
 ].join('\n'));
 assert.equal(r.estado,'listo_para_registrar');
 assert.equal(r.items.length,2);
 const rev=prepararPedidoTextoMvp028([
  'Cemento CPC 50 kg\t10\tbolsas',zona
 ].join('\n'));
 assert.equal(rev.estado,'listo_para_registrar');
});
test('MVP034: ocho filas más encabezado permitido; nueve se retienen',()=>{
 const products=['Cemento CPC 50 kg','Pintura látex interior',
  'Placa de yeso RH 12,5 mm','Hidrófugo para mezcla',
  'Cable unipolar 2,5 mm²','Caño PVC 110 mm'];
 // D064 only permits one line per canonical family: build a longer sheet with
 // duplicates; this verifies the header is not counted as an extra material.
 const eight=[
  'Cantidad\tUnidad\tMaterial',
  ...Array.from({length:8},(_,i)=>
   '10\tbolsas\tCemento CPC 50 kg '+i),zona
 ].join('\n');
 const a=prepararPedidoTextoMvp028(eight);
 assert.ok(!a.pendientes.some(x=>x.motivo.includes('ocho')));
 const nine=prepararPedidoTextoMvp028(eight.replace(zona,
  '10\tbolsas\tCemento CPC 50 kg extra\n'+zona));
 assert.ok(nine.pendientes.some(x=>x.motivo.includes('ocho')));
 assert.equal(products.length,6);
});
test('MVP034: incompletas, columnas extras, encabezado ajeno y fórmulas retenidas',()=>{
 for(const invalid of [
  '20\tbolsas\t', '20\tbolsas\tCemento CPC 50 kg\tIGNORAR',
  '20\t\tCemento CPC 50 kg',
  'Cantidad\tMaterial\tUnidad',
  '20\tbolsas\t=HYPERLINK("http://ejemplo.com")',
  '20\tbolsas\tCemento CPC https://example.com',
  '1.000\tbolsas\tCemento CPC 50 kg'
 ]){
  const r=prepararPedidoTextoMvp028(invalid+'\n'+zona);
  assert.equal(r.estado,'requiere_aclaracion',invalid);
  assert.equal(r.items.length,0,invalid);
  assert.ok(r.pendientes.some(x=>x.linea===1),invalid);
 }
});
test('MVP034: fila ambigua y material no reconocido NO se omiten',()=>{
 const r=prepararPedidoTextoMvp028([
  'Cantidad\tUnidad\tMaterial',
  '10\tbolsas\tCemento CPC 50 kg',
  '22\tbolsas\tMaterial misterioso',
  zona
 ].join('\n'));
 assert.equal(r.estado,'requiere_aclaracion');
 assert.equal(r.items.length,1);
 assert.ok(r.pendientes.some(x=>x.linea===3));
});
test('MVP034: duplicados canónicos siguen bloqueados sin pisar fuente',()=>{
 const r=prepararPedidoTextoMvp028([
  'Cemento CPC 50 kg\t10\tbolsas',
  'Cemento CPN 25 kg\t3\tbolsas',
  zona
 ].join('\n'));
 assert.equal(r.estado,'requiere_aclaracion');
 assert.equal(r.items.length,1);
 assert.equal(r.items[0].source_description,'Cemento CPC 50 kg');
 assert.ok(r.pendientes.some(x=>x.linea===2));
});
test('MVP034: solo encabezados exactos, no se inventa orden con filas dudosas',()=>{
 assert.equal(encabezadoTablaMvp034('Cantidad\tUnidad\tMaterial'),'cantidad_primero');
 assert.equal(encabezadoTablaMvp034('Descripción\tCantidad\tUnidad'),'material_primero');
 assert.equal(encabezadoTablaMvp034('Precio\tUnidad\tMaterial'),null);
 assert.equal(filaTablaMvp034('12\t20\tCemento CPC 50 kg',null),null);
 assert.equal(filaTablaMvp034('10\tbolsas\tCemento CPC 50 kg\tgratis',null),null);
});
