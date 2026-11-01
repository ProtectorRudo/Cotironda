import test from 'node:test';
import assert from 'node:assert/strict';
import {identificarFinalistasMvp039 as elegir}
 from '../../src/domain/finalistas-automaticos-mvp039.ts';

const ITEM={id:'cemento_obra',cantidad:'10',unidad:'bag'};
const L=(price='100.00',opts={})=>({
 itemId:ITEM.id,unidad:'bag',cantidadDisponible:'10',
 equivalencia:'verificada',precioUnitarioNeto:price,ivaPorcentaje:'21',...opts
});
const q=(anonId,price,opts={})=>({
 anonId,version:1,confirmada:true,moneda:'ARS',
 formaPago:'transferencia',plazoEntregaDias:3,
 fleteFinal:'100.00',minimoCompraFinal:'0.00',items:[L(price)],...opts
});
const p=(anonId,opts={})=>({
 anonId,contactoConsentido:true,identidadVerificada:true,
 contactoVigente:true,activo:true,...opts
});
const OPEN='2026-11-08T19:00:00.000Z';
const CLOSE='2026-11-09T19:00:00.000Z';
const base=()=>({
 estadoRonda:'cerrada',cierreEn:OPEN,ahoraServidor:CLOSE,
 compradorAceptoCompartirContacto:true,
 proveedores:[p('anon_aaa'),p('anon_bbb'),p('anon_ccc')],
 pedido:{items:[ITEM]},
 ofertas:[q('anon_aaa','150.00'),q('anon_bbb','100.00'),q('anon_ccc','200.00')]
});
test('MVP039: dos finalistas de cotización completa en mismo grupo, sin adjudicar',()=>{
 const v=elegir(base());
 assert.equal(v.estado,'finalistas_identificados');
 assert.deepEqual(v.finalistasAnonimos,['anon_bbb','anon_aaa']);
 assert.equal(v.contactosRevelados,false);
 assert.equal(v.compraAdjudicada,false);
 assert.equal(v.envioWhatsapp,false);
 assert.equal(v.maximo,2);
 assert.equal(JSON.stringify(v).includes('telefono'),false);
});
test('MVP039: nunca revela finalistas antes de vencimiento ni por cierre aparente',()=>{
 const x=base();
 for(const i of [
  {...x,estadoRonda:'abierta'},
  {...x,estadoRonda:'programada'},
  {...x,ahoraServidor:'2026-11-08T18:59:59.999Z'}
 ])assert.deepEqual(elegir(i).finalistasAnonimos,[]);
});
test('MVP039: ronda cancelada bloquea todos los finalistas',()=>{
 const x=base();
 assert.equal(elegir({...x,estadoRonda:'cancelada'}).estado,'ronda_cancelada');
});
test('MVP039: sin consentimiento del comprador no se divulga identidad',()=>{
 const x=base();
 assert.equal(elegir({...x,compradorAceptoCompartirContacto:false}).estado,
  'comprador_sin_consentimiento');
});
test('MVP039: identidad, consentimiento, contacto caducado o BAJA excluyen proveedor',()=>{
 const x=base();
 for(const key of ['contactoConsentido','identidadVerificada','contactoVigente','activo']){
  const c=elegir({...x,proveedores:x.proveedores.map(y=>
   y.anonId==='anon_bbb'?{...y,[key]:false}:y)});
  assert.equal(c.estado,'finalistas_identificados');
  assert.deepEqual(c.finalistasAnonimos,['anon_aaa','anon_ccc']);
 }
});
test('MVP039: parcial barato no ocupa lugar de cotización completa',()=>{
 const x=base();
 const without={...x.ofertas[1],items:[]};
 const r=elegir({...x,ofertas:[x.ofertas[0],without,x.ofertas[2]]});
 assert.deepEqual(r.finalistasAnonimos,['anon_aaa','anon_ccc']);
});
test('MVP039: IVA o flete sin declarar impide total y puesto',()=>{
 const x=base();
 const noIva=q('anon_bbb','100.00',{items:[L('100.00',{ivaPorcentaje:null})]});
 const noFreight=q('anon_aaa','150.00',{fleteFinal:null});
 const r=elegir({...x,ofertas:[noFreight,noIva,x.ofertas[2]]});
 assert.deepEqual(r.finalistasAnonimos,['anon_ccc']);
});
test('MVP039: dos monedas o condiciones distintas requieren criterio, no ranking falso',()=>{
 const x=base();
 for(const variant of [
  {moneda:'USD'}, {formaPago:'contado'}, {plazoEntregaDias:7}
 ]){
  const r=elegir({...x,ofertas:[
   x.ofertas[0],{...x.ofertas[1],...variant},x.ofertas[2]]});
  assert.equal(r.estado,'condiciones_no_comparables');
  assert.deepEqual(r.finalistasAnonimos,[]);
 }
});
test('MVP039: empate en segundo puesto con tercer proveedor no desempata por ID',()=>{
 const x=base();
 const r=elegir({...x,ofertas:[
  q('anon_aaa','200.00'),q('anon_bbb','100.00'),q('anon_ccc','200.00')
 ]});
 assert.equal(r.estado,'empate_en_corte');
 assert.deepEqual(r.finalistasAnonimos,[]);
});
test('MVP039: empate exacto de DOS candidatos permite ambos, sin ganador único',()=>{
 const x=base();
 const r=elegir({...x,ofertas:[
  q('anon_aaa','100.00'),q('anon_bbb','100.00')
 ]});
 assert.equal(r.estado,'finalistas_identificados');
 assert.deepEqual(new Set(r.finalistasAnonimos),new Set(['anon_aaa','anon_bbb']));
});
test('MVP039: sin oferta completa individual nunca inventa ganadores por parciales',()=>{
 const x=base();
 const r=elegir({...x,ofertas:x.ofertas.map(q=>({...q,items:[]}))});
 assert.equal(r.estado,'sin_ofertas_completas_comparables');
 assert.deepEqual(r.finalistasAnonimos,[]);
});
test('MVP039: una sola cotización apta produce un solo finalista',()=>{
 const x=base();
 const r=elegir({...x,ofertas:[x.ofertas[0]]});
 assert.deepEqual(r.finalistasAnonimos,['anon_aaa']);
});
test('MVP039: IDs de proveedores no vinculados, duplicados y metadata privada son inválidos',()=>{
 const x=base();
 assert.throws(()=>elegir({...x,ofertas:[q('anon_zzz','2.00')]}),
  /mvp039_entrada_no_confiable/);
 assert.throws(()=>elegir({...x,proveedores:[p('anon_aaa'),p('anon_aaa')]}),
  /mvp039_entrada_no_confiable/);
 assert.throws(()=>elegir({...x,proveedores:[
  {...p('anon_aaa'),telefono:'2210000000'},p('anon_bbb'),p('anon_ccc')
 ]}),/mvp039_entrada_no_confiable/);
});
test('MVP039: tiempos inválidos y consentimientos ambiguos fallan cerrados',()=>{
 const x=base();
 assert.throws(()=>elegir({...x,ahoraServidor:'mañana'}),/mvp039_entrada_no_confiable/);
 assert.throws(()=>elegir({...x,compradorAceptoCompartirContacto:'sí'}),
  /mvp039_entrada_no_confiable/);
});
