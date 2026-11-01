import test from 'node:test';
import assert from 'node:assert/strict';
import {generarComparacionDemo, OFERTAS_DEMO, PEDIDO_DEMO_OFERTAS} from '../../src/domain/mvp-comparacion-demo.ts';
import {compararCotizacionesOffline} from '../../src/domain/comparacion-ofertas.ts';

test('MVP-004: cuatro ofertas de prueba con coberturas honestas',()=>{
 const x=generarComparacionDemo();
 assert.equal(x.estado,'solo_demostracion_sin_compra');
 assert.equal(x.comparacion.cobertura.length,4);
 assert.equal(x.comparacion.cobertura.find(o=>o.anonId==='anon_a')?.lineasCompletas,3);
 assert.equal(x.comparacion.cobertura.find(o=>o.anonId==='anon_b')?.lineasCompletas,1);
 assert.equal(x.comparacion.cobertura.find(o=>o.anonId==='anon_c')?.lineasCompletas,2);
 assert.equal(x.comparacion.cobertura.find(o=>o.anonId==='anon_b')?.totalComparable,null);
 assert.equal(x.comparacion.cobertura.find(o=>o.anonId==='anon_c')?.totalComparable,null);
});
test('MVP-004: opción de dos proveedores vence en el ejemplo sin comparar subtotales parciales',()=>{
 const x=generarComparacionDemo();
 const one=x.comparacion.opcionesCompletas.find(o=>
   o.proveedoresAnonimos.length===1&&o.proveedoresAnonimos[0]==='anon_a');
 const pair=x.comparacion.opcionesCompletas.find(o=>
   o.proveedoresAnonimos.length===2&&o.proveedoresAnonimos.includes('anon_b')&&o.proveedoresAnonimos.includes('anon_c'));
 assert.ok(one); assert.ok(pair);
 assert.equal(one.totalFinal,'475330.00');
 assert.equal(pair.totalFinal,'444240.00');
 assert.ok(BigInt(pair.totalFinal.replace('.',''))<BigInt(one.totalFinal.replace('.','')));
 assert.equal(pair.asignacion.length,3);
 assert.equal(pair.materialesConIva,'416240.00');
 assert.equal(pair.fletesFinal,'28000.00');
 assert.equal(pair.formaPago,one.formaPago);
 assert.equal(pair.plazoEntregaDias,one.plazoEntregaDias);
});
test('MVP-004: oferta ficticia extremadamente barata sin confirmar jamás aparece como opción elegible',()=>{
 const x=generarComparacionDemo();
 const unconfirmed=x.comparacion.cobertura.find(o=>o.anonId==='anon_d');
 assert.equal(unconfirmed?.confirmada,false);
 assert.equal(unconfirmed?.totalComparable,null);
 assert.ok(x.comparacion.opcionesCompletas.every(o=>!o.proveedoresAnonimos.includes('anon_d')));
});
test('MVP-004: IVA y flete desconocidos descalifican una oferta sin inventar importes',()=>{
 const changed=OFERTAS_DEMO.map(o=>o.anonId==='anon_a'?{...o,fleteFinal:null}:o);
 const x=compararCotizacionesOffline(PEDIDO_DEMO_OFERTAS,changed);
 assert.equal(x.cobertura.find(o=>o.anonId==='anon_a')?.totalComparable,null);
 assert.ok(x.opcionesCompletas.every(o=>!o.proveedoresAnonimos.includes('anon_a')));
});
test('MVP-004: identidad, red, datos reales y adjudicación desactivados',()=>{
 const x=generarComparacionDemo();
 assert.equal(x.ofertasReales,0);
 assert.equal(x.enviosWhatsapp,0);
 assert.equal(x.compraRealizada,false);
 assert.equal(x.informacionPersistida,false);
 assert.equal(x.comparacion.contactoRevelado,false);
 assert.equal(x.comparacion.adjudicacionAutomatica,false);
 assert.equal(x.comparacion.optimoGlobalGarantizado,false);
 assert.ok(x.comparacion.opcionesCompletas.every(o=>o.proveedoresAnonimos.length<=2));
});
test('MVP-004: modificación de precio de oferta no confirmada no influye sobre totales',()=>{
 const baseline=generarComparacionDemo().comparacion.opcionesCompletas;
 const modified=OFERTAS_DEMO.map(o=>o.anonId==='anon_d'?{
   ...o,items:o.items.map(item=>({...item,precioUnitarioNeto:'0.01'}))
 }:o);
 const other=compararCotizacionesOffline(PEDIDO_DEMO_OFERTAS,modified).opcionesCompletas;
 assert.deepEqual(other,baseline);
});
