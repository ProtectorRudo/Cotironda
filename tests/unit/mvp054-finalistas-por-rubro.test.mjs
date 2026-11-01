import test from 'node:test';
import assert from 'node:assert/strict';
import {planificarFinalistasPorRubroMvp054 as plan}
 from '../../src/domain/finalistas-por-rubro-mvp054.ts';

const CLOSE='2026-11-07T12:00:00.000Z',NOW='2026-11-08T12:00:00.000Z';
const p=(anonId,on=true)=>({anonId,contactoConsentido:on,
 identidadVerificada:true,contactoVigente:true,activo:true});
const line=(itemId,unidad,cantidad,precio)=>({
 itemId,unidad,cantidadDisponible:cantidad,equivalencia:'verificada',
 precioUnitarioNeto:precio,ivaPorcentaje:'21'
});
const q=(anonId,id,unidad,cantidad,precio,extra={})=>({
 anonId,version:1,confirmada:true,moneda:'ARS',
 formaPago:'transferencia',plazoEntregaDias:3,
 fleteFinal:'100.00',minimoCompraFinal:'0.00',
 items:[line(id,unidad,cantidad,precio)],...extra
});
const rubro=(codigo,id,unidad,cantidad,prices)=>({
 codigo,pedido:{items:[{id,cantidad,unidad}]},
 proveedores:prices.map(([who])=>p(who)),
 ofertas:prices.map(([who,price])=>q(who,id,unidad,cantidad,price))
});
function base(){return {
 estadoRonda:'cerrada',cierreEn:CLOSE,ahoraServidor:NOW,
 compradorAceptoCompartirContacto:true,
 rubros:[
  rubro('corralon','cemento_obra','bag','10',
   [['anon_aaa','100.00'],['anon_bbb','130.00'],['anon_ccc','150.00']]),
  rubro('pintureria','latex_blanco','l','5',
   [['anon_ddd','90.00'],['anon_eee','140.00']])
 ]
}}
test('MVP054: dos finalistas por rubro sin mezclar totales, ni revelar contactos',()=>{
 const result=plan(base());
 assert.equal(result.estado,'evaluado_sin_revelar');
 assert.deepEqual(result.resultados,[
  {rubro:'corralon',estado:'finalistas_identificados',
   finalistasAnonimos:['anon_aaa','anon_bbb']},
  {rubro:'pintureria',estado:'finalistas_identificados',
   finalistasAnonimos:['anon_ddd','anon_eee']}
 ]);
 assert.equal(result.maximoPorRubro,2);
 assert.equal(result.contactosRevelados,false);
 assert.equal(result.envioWhatsapp,false);
 assert.equal(result.compraAdjudicada,false);
 assert.equal(JSON.stringify(result).includes('telefono'),false);
 assert.equal(Object.isFrozen(result.resultados),true);
});
test('MVP054: antes de vencimiento, incluso cerrada aparente no divulga',()=>{
 const b=base();
 for(const change of [
  {estadoRonda:'abierta'},
  {estadoRonda:'programada'},
  {ahoraServidor:'2026-11-07T11:59:59.999Z'}
 ]){
  const x=plan({...b,...change});
  assert.equal(x.estado,'pendiente_cierre');
  assert.equal(x.resultados.every(y=>y.finalistasAnonimos.length===0),true);
 }
});
test('MVP054: se bloquea si no hay consentimiento o ronda cancelada',()=>{
 for(const change of [
  {compradorAceptoCompartirContacto:false},
  {estadoRonda:'cancelada'}
 ]){
  const x=plan({...base(),...change});
  assert.equal(x.resultados.every(y=>y.finalistasAnonimos.length===0),true);
 }
});
test('MVP054: proveedor dado de baja y parcial barato no acceden a finales',()=>{
 const b=base();
 const r=b.rubros[0];
 const c=plan({...b,rubros:[
  {...r,proveedores:r.proveedores.map(v=>v.anonId==='anon_aaa'?{...v,activo:false}:v),
   ofertas:r.ofertas.map(v=>v.anonId==='anon_ccc'?{...v,items:[]}:v)},
  b.rubros[1]
 ]});
 assert.deepEqual(c.resultados[0].finalistasAnonimos,['anon_bbb']);
 assert.deepEqual(c.resultados[1].finalistasAnonimos,['anon_ddd','anon_eee']);
});
test('MVP054: empate en corte de segundo puesto bloquea solo su rubro',()=>{
 const b=base();
 const c=plan({...b,rubros:[{
  ...b.rubros[0],ofertas:b.rubros[0].ofertas.map(v=>
   v.anonId==='anon_ccc'?{...v,items:[{...v.items[0],precioUnitarioNeto:'130.00'}]}:v)
 },b.rubros[1]]});
 assert.equal(c.resultados[0].estado,'empate_en_corte');
 assert.deepEqual(c.resultados[0].finalistasAnonimos,[]);
 assert.deepEqual(c.resultados[1].finalistasAnonimos,['anon_ddd','anon_eee']);
});
test('MVP054: distintas monedas/pagos no producen ranking engañoso',()=>{
 const b=base();
 const c=plan({...b,rubros:[{
  ...b.rubros[0],ofertas:b.rubros[0].ofertas.map(v=>
    v.anonId==='anon_aaa'?{...v,formaPago:'contado'}:v)
 },b.rubros[1]]});
 assert.equal(c.resultados[0].estado,'condiciones_no_comparables');
 assert.equal(c.resultados[0].finalistasAnonimos.length,0);
});
test('MVP054: rubros repetidos, items cruzados o metadata de contactos fallan cerrados',()=>{
 const b=base();
 for(const rubros of [
  [b.rubros[0],b.rubros[0]],
  [b.rubros[0],{...b.rubros[1],codigo:'corralon'}],
  [b.rubros[0],{...b.rubros[1],pedido:b.rubros[0].pedido}],
  [{...b.rubros[0],contacto:'549221555555'},b.rubros[1]]
 ]){
  assert.throws(()=>plan({...b,rubros}),/mvp054_cierre_no_confiable/);
 }
});
test('MVP054: ofertas de proveedor ajeno al rubro son inválidas',()=>{
 const b=base();
 assert.throws(()=>plan({...b,rubros:[{
  ...b.rubros[0],ofertas:[q('anon_zxy','cemento_obra','bag','10','10.00')]
 },b.rubros[1]]}),/mvp039_entrada_no_confiable/);
});
