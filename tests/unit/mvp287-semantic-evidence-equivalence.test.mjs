import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluarLecturasSemanticasV1} from '../../src/domain/ia-central/contrato-v1.ts';

const source='Necesito cotizar 20 bolsas de cemento CPC de 50 kg y 3 bolsones de arena. Entrega en La Plata.';
const e=['20 bolsas de cemento CPC de 50 kg','3 bolsones de arena'];
const first={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
 articulos:e.map((txt,i)=>{
  const inicio=source.indexOf(txt);
  return {evidencia:txt,inicio,fin:inicio+txt.length,
   descripcion:i===0?'Cemento CPC 50 kg':'Arena en bolsones',
   cantidad:i===0?'20':'3',unidad:i===0?'bag':'unit',
   rubro:'obra_gruesa',presentacion:null,aclaracion:null};
 })};
const second={integridad:'completa',zona_entrega:'La Plata',
 articulos:[
  {evidencia:'20 bolsas de cemento CPC',cantidad:'20',unidad:'bolsas',rubro:'obra_gruesa'},
  {evidencia:'3 bolsones de arena',cantidad:'3',unidad:'bolsones',rubro:'obra_gruesa'}
 ]};
test('MVP287: acepta citas de distinto largo si coinciden material, cantidad y origen',()=>{
 const r=evaluarLecturasSemanticasV1(source,first,second);
 assert.equal(r.estado,'listo_para_preparar');
 assert.equal(r.pedido.articulos.length,2);
 assert.equal(r.pedido.articulos[0].cantidad,'20');
 assert.equal(r.pedido.articulos[1].cantidad,'3');
 assert.equal(r.pedido.zona_entrega,'La Plata');
});
test('MVP287: rechaza cantidades inventadas, citas cruzadas y falsificadas',()=>{
 for(const item of [
  {...second.articulos[0],cantidad:'50'},
  {...second.articulos[0],evidencia:'3 bolsones de arena'},
  {...second.articulos[0],evidencia:'20 bolsas de cemento CPC inventadas'}
 ]){
  const s=structuredClone(second);s.articulos[0]=item;
  assert.equal(evaluarLecturasSemanticasV1(source,first,s).estado,
   'requiere_aclaracion');
 }
});
test('MVP287: subcita sin cifra, rubro distinto y orden inverso son válidos',()=>{
 const s=structuredClone(second);
 s.articulos[0].evidencia='cemento CPC';
 s.articulos[0].rubro='pintura';
 s.articulos.reverse();
 s.zona_entrega=' la PLATA ';
 assert.equal(evaluarLecturasSemanticasV1(source,first,s).estado,
  'listo_para_preparar');
});
test('MVP287: dos artículos con la misma subcita no se mezclan',()=>{
 const original='10 bolsas cemento CPC y 20 bolsas cemento CPC. Entrega La Plata.';
 const e=['10 bolsas cemento CPC','20 bolsas cemento CPC'];
 const primaria={...first,articulos:e.map((evidencia,i)=>({
  ...first.articulos[0],evidencia,inicio:original.indexOf(evidencia),
  fin:original.indexOf(evidencia)+evidencia.length,
  cantidad:i===0?'10':'20'
 }))};
 const secundaria={...second,articulos:[
  {evidencia:'cemento CPC',cantidad:'10',unidad:'bag',rubro:'obra_gruesa'},
  {evidencia:'cemento CPC',cantidad:'20',unidad:'bag',rubro:'obra_gruesa'}
 ]};
 assert.equal(evaluarLecturasSemanticasV1(original,primaria,secundaria).estado,
  'requiere_aclaracion');
});

test('MVP287: nunca iguala bultos con metros cúbicos o kilos, ni mezcla artículos',()=>{
 for(const unidad of ['m3','kg','l','m2']){
  const s=structuredClone(second);
  s.articulos[1].unidad=unidad;
  assert.equal(evaluarLecturasSemanticasV1(source,first,s).estado,'requiere_aclaracion',unidad);
 }
 const s=structuredClone(second);
 s.articulos[0].evidencia=second.articulos[1].evidencia;
 assert.equal(evaluarLecturasSemanticasV1(source,first,s).estado,'requiere_aclaracion');
});
test('MVP287: unidades convertibles sólo en ortografía, jamás magnitud',()=>{
 const s=structuredClone(second);
 s.articulos[0].unidad='m3';
 assert.equal(evaluarLecturasSemanticasV1(source,first,s).estado,'requiere_aclaracion');
});
