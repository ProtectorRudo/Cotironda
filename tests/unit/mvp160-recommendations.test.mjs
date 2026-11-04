import test from 'node:test';
import assert from 'node:assert/strict';
import {recomendarHastaDosOffline} from '../../src/domain/recomendaciones-mvp160.ts';

const pedido=(...ids)=>({items:ids.map(id=>({id,cantidad:'1',unidad:'bag'}))});
const line=(itemId,net='100.00',extra={})=>({
 itemId,unidad:'bag',cantidadDisponible:'10',equivalencia:'verificada',
 precioUnitarioNeto:net,ivaPorcentaje:'21',...extra
});
const offer=(anonId,items,extra={})=>({
 anonId,version:1,confirmada:true,moneda:'ARS',formaPago:'contado',
 plazoEntregaDias:2,fleteFinal:'0.00',minimoCompraFinal:'0.00',items,...extra
});

test('MVP160: dos proveedores completos: orden por costo verificable de canasta',()=>{
 const p=pedido('cemento_001','arena_001');
 const a=offer('anon_aaa',[line('cemento_001','120.00'),line('arena_001','100.00')]);
 const b=offer('anon_bbb',[line('cemento_001','80.00'),line('arena_001','90.00')]);
 const r=recomendarHastaDosOffline(p,[a,b]);
 assert.equal(r.estado,'alternativas_comparables');
 assert.deepEqual(r.recomendadosAnonimos,['anon_bbb','anon_aaa']);
 assert.equal(r.opcionPrincipal.totalFinal,'205.70');
 // La segunda alternativa real es COMBINAR B cemento + A arena,
 // no comprar todo a A: 80 + 100 = 180; IVA 21% = 217.80.
 assert.equal(r.segundaAlternativa.totalFinal,'217.80');
 assert.deepEqual(r.segundaAlternativa.proveedoresAnonimos,['anon_aaa','anon_bbb']);
 assert.equal(r.segundaAlternativa.asignacion.length,2);
 assert.equal(r.contactosRevelados,false);
 assert.equal(r.adjudicacion,false);
 assert.equal(r.compraObligatoria,false);
 assert.equal(r.cobertura.length,2);
});
test('MVP160: dos parciales son opcion COMPLETA juntos, nunca sus totales aislados',()=>{
 const p=pedido('cemento_001','arena_001');
 const a=offer('anon_aaa',[line('cemento_001','70.00')]);
 const b=offer('anon_bbb',[line('arena_001','40.00')]);
 const r=recomendarHastaDosOffline(p,[a,b]);
 assert.deepEqual(r.recomendadosAnonimos,['anon_aaa','anon_bbb']);
 assert.equal(r.opcionPrincipal.proveedoresAnonimos.length,2);
 assert.equal(r.opcionPrincipal.totalFinal,'133.10');
 assert.equal(r.segundaAlternativa,null);
 assert.deepEqual(r.cobertura.map(x=>x.lineasCompletas),[1,1]);
});
test('MVP160: un parcial barato no ocupa segundo puesto sin alternativa completa',()=>{
 const p=pedido('cemento_001','arena_001');
 const a=offer('anon_aaa',[line('cemento_001','50.00'),line('arena_001','60.00')]);
 const b=offer('anon_bbb',[line('cemento_001','1.00')]);
 const r=recomendarHastaDosOffline(p,[a,b]);
 // Cheapest complete pair A+B can still be a legitimate two-supplier
 // alternative; no claim that B alone covers the whole basket.
 assert.deepEqual(r.recomendadosAnonimos,['anon_aaa','anon_bbb']);
 assert.deepEqual(r.opcionPrincipal.proveedoresAnonimos,['anon_aaa','anon_bbb']);
 assert.equal(r.opcionPrincipal.asignacion.length,2);
 assert.equal(r.cobertura.find(x=>x.anonId==='anon_bbb').totalComparable,null);
});
test('MVP160: big bag sin equivalencia ni unidad no produce recomendaciones',()=>{
 const p=pedido('cemento_001');
 const a=offer('anon_aaa',[line('cemento_001','1.00',{
  unidad:'unit',equivalencia:'sin_verificar'
 })]);
 const r=recomendarHastaDosOffline(p,[a]);
 assert.equal(r.estado,'sin_opcion_completa');
 assert.deepEqual(r.recomendadosAnonimos,[]);
 assert.equal(r.cobertura[0].lineas[0].completa,false);
});
test('MVP160: IVA o flete desconocido jamás equivale a cero',()=>{
 const p=pedido('cemento_001');
 for(const variant of [
  offer('anon_aaa',[line('cemento_001','10.00',{ivaPorcentaje:null})]),
  offer('anon_aaa',[line('cemento_001')],{fleteFinal:null}),
  offer('anon_aaa',[line('cemento_001')],{formaPago:null}),
  offer('anon_aaa',[line('cemento_001')],{minimoCompraFinal:null})
 ]){
  const r=recomendarHastaDosOffline(p,[variant]);
  assert.equal(r.estado,'sin_opcion_completa');
  assert.equal(r.opcionPrincipal,null);
 }
});
test('MVP160: con diferentes monedas, pagos o plazos NO inventa orden global',()=>{
 const p=pedido('cemento_001');
 for(const variant of [
  {moneda:'USD'},
  {formaPago:'transferencia'},
  {plazoEntregaDias:4}
 ]){
  const a=offer('anon_aaa',[line('cemento_001','1.00')]);
  const b=offer('anon_bbb',[line('cemento_001','999.00')],variant);
  const r=recomendarHastaDosOffline(p,[a,b]);
  assert.equal(r.estado,'condiciones_no_comparables');
  assert.deepEqual(r.recomendadosAnonimos,[]);
  assert.equal(r.opcionesCompletas.length,2);
 }
});
test('MVP160: empate de dos proveedores, NO desempatar artificialmente',()=>{
 const p=pedido('cemento_001');
 const a=offer('anon_aaa',[line('cemento_001','10.00')]);
 const b=offer('anon_bbb',[line('cemento_001','10.00')]);
 const r=recomendarHastaDosOffline(p,[b,a]);
 assert.equal(r.empateSinOrden,true);
 assert.deepEqual(r.recomendadosAnonimos,['anon_aaa','anon_bbb']);
 assert.equal(r.opcionPrincipal.puestoDentroDeCondiciones,1);
 assert.equal(r.segundaAlternativa.puestoDentroDeCondiciones,1);
});
test('MVP160: empate de tres no fabrica dos ganadores',()=>{
 const p=pedido('cemento_001');
 const qs=['anon_aaa','anon_bbb','anon_ccc'].map(id=>
  offer(id,[line('cemento_001','10.00')]));
 const r=recomendarHastaDosOffline(p,qs);
 assert.equal(r.estado,'empate_sin_desempate_justificado');
 assert.deepEqual(r.recomendadosAnonimos,[]);
 assert.equal(r.opcionesCompletas.length,3);
});
test('MVP160: opciones de 2 proveedores no agregan tercero por precio',()=>{
 const p=pedido('cemento_001','arena_001');
 const a=offer('anon_aaa',[line('cemento_001','1.00')]);
 const b=offer('anon_bbb',[line('arena_001','1.00')]);
 const c=offer('anon_ccc',[line('arena_001','10.00')]);
 const r=recomendarHastaDosOffline(p,[a,b,c]);
 assert.deepEqual(r.recomendadosAnonimos,['anon_aaa','anon_bbb']);
 assert.equal(r.segundaAlternativa,null);
 assert.equal(r.cobertura.length,3);
});
test('MVP160: hasta 25 productos y sin números telefónicos/contactos',()=>{
 const names=Array.from({length:25},(_,i)=>'sku_'+String(i).padStart(3,'0'));
 const p=pedido(...names);
 const a=offer('anon_aaa',names.map(n=>line(n,'20.00')));
 const b=offer('anon_bbb',names.map(n=>line(n,'19.00')));
 const r=recomendarHastaDosOffline(p,[a,b]);
 assert.ok(r.recomendadosAnonimos.length<=2);
 assert.equal(r.opcionPrincipal.asignacion.length,25);
 assert.ok(!JSON.stringify(r).includes('whatsapp'));
});
test('MVP160: rechaza metadatos extra que podrían filtrar identidad del proveedor',()=>{
 const p=pedido('cemento_001');
 const source=offer('anon_aaa',[line('cemento_001')],{telefono:'221000000'});
 assert.throws(()=>recomendarHastaDosOffline(p,[source]),/comparacion_entrada_invalida/);
});
