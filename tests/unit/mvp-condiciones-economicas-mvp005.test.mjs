import test from 'node:test';
import assert from 'node:assert/strict';
import {OFERTAS_DEMO,PEDIDO_DEMO_OFERTAS,generarComparacionDemo} from '../../src/domain/mvp-comparacion-demo.ts';
import {detalleEconomicoExplicito} from '../../src/domain/detalle-economico-explicito-mvp005.ts';
import {compararCotizacionesOffline} from '../../src/domain/comparacion-ofertas.ts';

const demo=id=>OFERTAS_DEMO.find(o=>o.anonId===id);

test('MVP-005 IVA/flete se presentan por proveedor, solo los datos explícitos de ejemplo',()=>{
  const d=detalleEconomicoExplicito(demo('anon_a'));
  assert.equal(d.tienePendientes,false);
  assert.equal(d.flete.estado,'informado');
  assert.match(d.flete.texto,/24000.00 ARS/);
  assert.equal(d.ivaPorLinea.length,3);
  assert.ok(d.ivaPorLinea.every(x=>x.iva.estado==='informado'));
  assert.ok(d.ivaPorLinea.every(x=>/base más 21%/.test(x.iva.texto)));
});
test('MVP-005 IVA/flete no mencionados permanecen pendientes, no se infieren incluido o gratis',()=>{
  const d=detalleEconomicoExplicito(demo('anon_d'));
  assert.equal(d.tienePendientes,true);
  assert.equal(d.flete.estado,'pendiente');
  assert.match(d.flete.texto,/sin aclarar/);
  assert.match(d.flete.texto,/no se supone incluido ni gratuito/);
  assert.ok(d.ivaPorLinea.every(x=>x.iva.estado==='pendiente'));
  assert.ok(d.ivaPorLinea.every(x=>/sin aclarar/.test(x.iva.texto)));
  assert.equal(generarComparacionDemo().comparacion.cobertura.find(o=>o.anonId==='anon_d')?.totalComparable,null);
});
test('MVP-005 un flete expresamente cero se distingue de flete desconocido',()=>{
 const d=detalleEconomicoExplicito({...demo('anon_a'),fleteFinal:'0.00'});
 assert.equal(d.flete.estado,'informado');
 assert.match(d.flete.texto,/0.00 ARS/);
 const d2=detalleEconomicoExplicito({...demo('anon_a'),fleteFinal:null});
 assert.equal(d2.flete.estado,'pendiente');
 assert.doesNotMatch(d2.flete.texto,/0.00 ARS/);
});
test('MVP-005 una tasa IVA expresamente 0% no equivale a IVA sin aclarar',()=>{
 const offer=demo('anon_a');
 const specified={...offer,items:offer.items.map(x=>({...x,ivaPorcentaje:'0'}))};
 const unknown={...offer,items:offer.items.map(x=>({...x,ivaPorcentaje:null}))};
 const e=detalleEconomicoExplicito(specified);
 const u=detalleEconomicoExplicito(unknown);
 assert.equal(e.tienePendientes,false);
 assert.ok(e.ivaPorLinea.every(x=>x.iva.texto.includes('0%')));
 assert.equal(u.tienePendientes,true);
 assert.ok(u.ivaPorLinea.every(x=>x.iva.estado==='pendiente'));
});
test('MVP-005 IVA desconocido excluye una oferta completa del ranking y total',()=>{
 const changed=OFERTAS_DEMO.map(o=>o.anonId==='anon_a'?{
   ...o,items:o.items.map(item=>({...item,ivaPorcentaje:null}))
 }:o);
 const x=compararCotizacionesOffline(PEDIDO_DEMO_OFERTAS,changed);
 const offer=x.cobertura.find(o=>o.anonId==='anon_a');
 assert.equal(offer?.lineasCompletas,3);
 assert.equal(offer?.totalComparable,null);
 assert.ok(offer?.motivos.includes('precio_o_iva_desconocido'));
 assert.ok(x.opcionesCompletas.every(o=>!o.proveedoresAnonimos.includes('anon_a')));
});
test('MVP-005 flete no aclarado excluye oferta; cero expresamente informado sí puede compararse',()=>{
 const unknown=OFERTAS_DEMO.map(o=>o.anonId==='anon_a'?{...o,fleteFinal:null}:o);
 const missing=compararCotizacionesOffline(PEDIDO_DEMO_OFERTAS,unknown);
 assert.equal(missing.cobertura.find(o=>o.anonId==='anon_a')?.totalComparable,null);
 assert.ok(missing.cobertura.find(o=>o.anonId==='anon_a')?.motivos.includes('flete_desconocido'));
 const zero=OFERTAS_DEMO.map(o=>o.anonId==='anon_a'?{...o,fleteFinal:'0.00'}:o);
 const explicit=compararCotizacionesOffline(PEDIDO_DEMO_OFERTAS,zero);
 assert.ok(explicit.cobertura.find(o=>o.anonId==='anon_a')?.totalComparable);
});
test('MVP-005 borrar información de precio base mantiene estado pendiente',()=>{
 const offer=demo('anon_b');
 const missing={...offer,items:offer.items.map(x=>({...x,precioUnitarioNeto:null}))};
 const details=detalleEconomicoExplicito(missing);
 assert.equal(details.tienePendientes,true);
 assert.equal(details.ivaPorLinea[0].precioBase.estado,'pendiente');
});
