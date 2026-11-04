import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretarBolsonAridosMvp164 as check} from '../../src/domain/aridos-bolson-mvp164.ts';

const sample=(offer,request='arena fina',count='1,00',q='1,00',p='big_bag')=>({
 pedidoDescripcion:request,pedidoCantidad:q,pedidoUnidad:'m3',
 ofertaDescripcion:offer,ofertaCantidad:count,presentacionFuente:p,
 fuenteVerificada:true,presentacionComprobada:true
});
test('MVP164: cotización real Ailín, BIG BAG arena 1 / piedra 2 => 1 y 2 m3 nominales',()=>{
 const a=check(sample('BIG BAG de Arena; Dscto. 22.4%'));
 const b=check(sample('BIG BAG de Piedra; Dscto. 22.4%','piedra partida','2,00','2,00'));
 assert.equal(a.volumenM3PorUnidad,'1.000');
 assert.equal(a.volumenM3Cotizado,'1.000');
 assert.equal(b.volumenM3Cotizado,'2.000');
 assert.equal(a.origen,'convencion_nominal');
 assert.equal(a.estado,'variedad_no_informada');
 assert.equal(b.estado,'variedad_no_informada');
 assert.equal(a.permiteRanking,false);
});
test('MVP164: cotización real Nahuel descuento 0,0 no altera la equivalencia de volumen',()=>{
 const a=check(sample('BIG BAG de Arena; Dscto.: 0.0%'));
 const p=check(sample('BIG BAG de Piedra; Dscto.: 0.0%','piedra partida','2,00','2,00'));
 assert.equal(a.cantidadNominalCoincide,true);
 assert.equal(p.cantidadNominalCoincide,true);
 assert.equal(p.permiteRanking,false);
});
test('MVP164: alias argentinos bolsón, bolsones, bigbag, big bag y errata big biag',()=>{
 const variants=[
  ['Bolsón de arena fina','bolson'],
  ['bolsones de arena fina','bolson'],
  ['Bigbag de arena fina','big_bag'],
  ['big bag de arena fina','big_bag'],
  ['big biag de arena fina','big_bag']
 ];
 for(const [s,p] of variants){
  const r=check(sample(s,'arena fina','2','2',p));
  assert.equal(r.estado,'compatible_comercialmente',s);
  assert.equal(r.volumenM3Cotizado,'2.000',s);
 }
});
test('MVP164: declaración explícita 0,75 m3 reemplaza convención, no permite contar 1 m3',()=>{
 const r=check(sample('Bolsón de arena fina 0,75 m³','arena fina','2,00','2,00','bolson'));
 assert.equal(r.origen,'capacidad_expresa');
 assert.equal(r.volumenM3PorUnidad,'0.750');
 assert.equal(r.volumenM3Cotizado,'1.500');
 assert.equal(r.estado,'volumen_distinto');
 assert.equal(r.cantidadNominalCoincide,false);
});
test('MVP164: bolsón de 0,75 m3 ×2 sí cubre pedido de 1,5 m3 nominal',()=>{
 const r=check(sample('Bolsón de arena fina 0,75 m3','arena fina','2','1,5','bolson'));
 assert.equal(r.estado,'compatible_comercialmente');
 assert.equal(r.volumenM3Cotizado,'1.500');
 assert.equal(r.origen,'capacidad_expresa');
});
test('MVP164: si proveedor dice 2 m3 por bolsón, prevalece la declaración',()=>{
 const r=check(sample('BIG BAG de arena fina 2 m3','arena fina','1','2'));
 assert.equal(r.estado,'compatible_comercialmente');
 assert.equal(r.volumenM3Cotizado,'2.000');
});
test('MVP164: arena gruesa no pasa por arena fina',()=>{
 const r=check(sample('Bolsón de arena gruesa','arena fina','1','1','bolson'));
 assert.equal(r.estado,'variedad_distinta');
 assert.equal(r.cantidadNominalCoincide,true);
});
test('MVP164: piedra rodada no pasa por partida; piedra genérica informa variante ausente',()=>{
 const a=check(sample('BIG BAG piedra rodada','piedra partida','2','2'));
 const b=check(sample('BIG BAG piedra','piedra partida','2','2'));
 assert.equal(a.estado,'variedad_distinta');
 assert.equal(b.estado,'variedad_no_informada');
});
test('MVP164: arena fina y piedra partida expresas compatibles',()=>{
 const a=check(sample('BIG BAG arena fina','arena fina'));
 const b=check(sample('Bolsón piedra partida','piedra partida','2','2','bolson'));
 assert.equal(a.estado,'compatible_comercialmente');
 assert.equal(b.estado,'compatible_comercialmente');
 assert.equal(a.permiteRanking,false);
});
test('MVP164: no extrapola la regla a bolsas pequeñas de cemento ni arena',()=>{
 for(const s of ['bolsa cemento de 25kg','bolsa de arena fina 25 kg','big bag cemento 25kg']){
  const r=check(sample(s,'arena fina','1','1','big_bag'));
  assert.equal(r.estado,'no_aplica',s);
 }
});
test('MVP164: granza, ripio, cascote son áridos pero no sustituyen otra familia',()=>{
 const a=check(sample('Bolsón de cascote','cascote','1','1','bolson'));
 const b=check(sample('BIG BAG de cascote','piedra partida'));
 const c=check(sample('BIG BAG de ripio','arena fina'));
 assert.equal(a.estado,'compatible_comercialmente');
 assert.equal(b.estado,'familia_distinta');
 assert.equal(c.estado,'familia_distinta');
});
test('MVP164: bolsas con pesos o capacidades especiales no presumen 1m3',()=>{
 for(const s of ['BIG BAG arena fina 500 kg','BIG BAG medio de arena fina',
   'BIG BAG mini arena fina','Bolsón 1/2 m3 de arena fina',
   'Bolsón arena fina 1 m3 y 0,75 m3']){
  const r=check(sample(s,'arena fina','1','1',s.includes('Bolsón')?'bolson':'big_bag'));
  assert.equal(r.estado,'capacidad_ambigua',s);
  assert.equal(r.volumenM3Cotizado,null);
 }
});
test('MVP164: fuente no corroborada o presentación inventada por IA queda sin acreditación',()=>{
 for(const patch of [
  {fuenteVerificada:false},{presentacionComprobada:false},
  {presentacionFuente:'bolson'}
 ]){
  assert.equal(check({...sample('BIG BAG de arena fina'),...patch}).estado,
   'fuente_no_acreditada');
 }
});
test('MVP164: múltiples envases no implican stock ni precio comparable',()=>{
 const r=check(sample('Bolson piedra partida','piedra partida','3','2','bolson'));
 assert.equal(r.estado,'volumen_distinto');
 assert.equal(r.permiteRanking,false);
 assert.ok(!JSON.stringify(r).includes('whatsapp'));
 assert.ok(!JSON.stringify(r).includes('precioUnitario'));
});
test('MVP164: cantidad ambigua o falsa evita normalización',()=>{
 for(const x of ['1.0000','texto','0','-1','1/2']){
  assert.equal(check(sample('Bolson arena fina','arena fina',x,'1','bolson')).estado,
   'capacidad_ambigua');
 }
});

test('MVP164: mini o jumbo con volumen explícito prevalece sobre el nombre comercial',()=>{
 const a=check(sample('BIG BAG mini de arena fina 0,5 m3','arena fina','2','1'));
 assert.equal(a.estado,'compatible_comercialmente');
 assert.equal(a.volumenM3PorUnidad,'0.500');
 assert.equal(a.origen,'capacidad_expresa');
});
