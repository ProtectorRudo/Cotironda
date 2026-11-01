import test from 'node:test';
import assert from 'node:assert/strict';
import {extraerPlazoCotizacionMvp053 as extraer}
 from '../../src/domain/plazo-cotizacion-mvp053.ts';
const pedido='20 bolsas Cemento CPC 50 kg\nEntrega en: La Plata';
test('MVP053: sin plazo expreso son 5 días y no se toca el pedido',()=>{
 assert.deepEqual(extraer(pedido),{dias:5,textoMateriales:pedido,explicito:false});
});
test('MVP053: 3 a 7 días como instrucción separada, sin pregunta extra',()=>{
 for(const [n,directiva] of [
  [3,'Plazo de cotización: 3 días'],
  [4,'plazo para cotizar: 4 dias'],
  [5,'Plazo: 5 días'],
  [6,'Tiempo para cotizar: 6 días'],
  [7,'PLAZO DE COTIZACIÓN: 7 DÍAS']
 ]){
  const x=extraer(pedido+'\n'+directiva);
  assert.equal(x.dias,n);assert.equal(x.explicito,true);
  assert.equal(x.textoMateriales,pedido);
 }
});
test('MVP053: nunca interpreta plazo de entrega del material como plazo de ronda',()=>{
 const raw=pedido+'\nEntrega de la mercadería en 3 días';
 const x=extraer(raw);
 assert.equal(x.dias,5);assert.equal(x.textoMateriales,raw);
});
test('MVP053: rango inválido, doble plazo y texto ambiguo no inician silenciosamente ronda',()=>{
 for(const bad of [
  'Plazo: 2 días','Plazo: 8 días','Plazo: 30 días',
  'Plazo: mañana','Plazo: 3,5 días',
  'Plazo: 3 días\nPlazo: 3 días',
  'Plazo: 3 días\nPlazo: 7 días'
 ]){
  assert.throws(()=>extraer(pedido+'\n'+bad),/mvp053_plazo_invalido/);
 }
 assert.throws(()=>extraer('Plazo: 5 días'),/mvp053_plazo_invalido/);
});
