import test from 'node:test';
import assert from 'node:assert/strict';
import {compararCotizacionesOffline} from '../../src/domain/comparacion-ofertas.ts';

const pedido=(...items)=>({items:items.map(([id,cantidad='1',unidad='unit'])=>({id,cantidad,unidad}))});
const linea=(itemId,precioUnitarioNeto='100.00',opts={})=>({
  itemId,unidad:'unit',cantidadDisponible:'100',equivalencia:'verificada',
  precioUnitarioNeto,ivaPorcentaje:'21',...opts
});
const oferta=(anonId,items,opts={})=>({
  anonId,version:1,confirmada:true,moneda:'ARS',
  formaPago:'contado',plazoEntregaDias:2,
  fleteFinal:'0.00',minimoCompraFinal:'0.00',items,...opts
});
const run=(p,qs)=>compararCotizacionesOffline(p,qs);

test('precio final incluye IVA y flete explícito; ranking solo canasta completa equivalente',()=>{
  const p=pedido(['bolsa_001','10'],['placa_001','2']);
  const a=oferta('anon_aaa',[linea('bolsa_001','100.00'),linea('placa_001','200.00')],{fleteFinal:'5.00'});
  const b=oferta('anon_bbb',[linea('bolsa_001','80.00'),linea('placa_001','160.00')],{fleteFinal:'15.00'});
  const r=run(p,[a,b]);
  assert.equal(r.estado,'comparacion_offline_sin_adjudicacion');
  assert.equal(r.contactoRevelado,false);assert.equal(r.adjudicacionAutomatica,false);
  assert.equal(r.cobertura[0].totalComparable,'1699.00');
  assert.equal(r.cobertura[1].totalComparable,'1370.20');
  assert.equal(r.opcionesCompletas[0].totalFinal,'1370.20');
  assert.equal(r.opcionesCompletas[0].puestoDentroDeCondiciones,1);
  assert.equal(r.opcionesCompletas.at(-1).puestoDentroDeCondiciones,3);
});

test('una cotización parcial baratísima no aparece como ganadora general',()=>{
  const p=pedido(['bolsa_001','10'],['placa_001','2']);
  const total=oferta('anon_full',[linea('bolsa_001','100.00'),linea('placa_001','200.00')]);
  const parcial=oferta('anon_low',[linea('placa_001','1.00')]);
  const r=run(p,[total,parcial]);
  assert.equal(r.cobertura[1].lineasCompletas,1);
  assert.equal(r.cobertura[1].totalComparable,null);
  assert.deepEqual(r.cobertura[1].motivos,['cobertura_incompleta']);
  // La oferta parcial nunca compite SOLA; sí puede integrar una compra completa.
  assert.equal(r.opcionesCompletas.length,2);
  assert.ok(r.opcionesCompletas.some(x=>x.proveedoresAnonimos.length===2));
  assert.ok(r.opcionesCompletas.some(x=>x.proveedoresAnonimos.length===1 && x.proveedoresAnonimos[0]==='anon_full'));
  assert.ok(r.opcionesCompletas.every(x=>x.asignacion.length===2));
});

test('dos proveedores pueden cubrir ítems íntegros más barato que uno, fletes por proveedor',()=>{
  const p=pedido(['bolsa_001','10'],['placa_001','10']);
  const a=oferta('anon_aaa',[linea('bolsa_001','20.00',{ivaPorcentaje:'0'}),
    linea('placa_001','60.00',{ivaPorcentaje:'0'})],{fleteFinal:'10.00'});
  const b=oferta('anon_bbb',[linea('bolsa_001','30.00',{ivaPorcentaje:'0'}),
    linea('placa_001','20.00',{ivaPorcentaje:'0'})],{fleteFinal:'10.00'});
  const r=run(p,[a,b]);
  assert.equal(r.opcionesCompletas.length,3);
  const primero=r.opcionesCompletas[0];
  assert.deepEqual(primero.proveedoresAnonimos,['anon_aaa','anon_bbb']);
  assert.deepEqual(primero.asignacion,[{itemId:'bolsa_001',anonId:'anon_aaa'},
    {itemId:'placa_001',anonId:'anon_bbb'}]);
  assert.equal(primero.materialesConIva,'400.00');
  assert.equal(primero.fletesFinal,'20.00');
  assert.equal(primero.totalFinal,'420.00');
  assert.equal(primero.puestoDentroDeCondiciones,1);
  assert.equal(r.optimoGlobalGarantizado,false);
  assert.equal(r.limite,'solo_asignacion_de_lineas_completas_sin_fraccionar');
});

test('cantidades parciales de dos proveedores NO se suman automáticamente como si cubrieran ítem',()=>{
  const p=pedido(['bolsa_001','10']);
  const a=oferta('anon_aaa',[linea('bolsa_001','1.00',{cantidadDisponible:'5'})]);
  const b=oferta('anon_bbb',[linea('bolsa_001','1.00',{cantidadDisponible:'5'})]);
  const r=run(p,[a,b]);
  assert.deepEqual(r.cobertura.map(x=>x.lineas[0].cotizable),['5','5']);
  assert.equal(r.opcionesCompletas.length,0);
});

test('nunca confunde bolsas, unidades o alternativa NO verificada con conformidad',()=>{
  const p=pedido(['bolsa_001','10','bag']);
  const wrong=oferta('anon_unit',[linea('bolsa_001','1.00',{unidad:'unit'})]);
  const alt=oferta('anon_alt',[linea('bolsa_001','1.00',{unidad:'bag',equivalencia:'sin_verificar'})]);
  const r=run(p,[wrong,alt]);
  assert.equal(r.opcionesCompletas.length,0);
  assert.equal(r.cobertura[0].lineas[0].motivo,'unidad_diferente');
  assert.equal(r.cobertura[1].lineas[0].motivo,'equivalencia_no_verificada');
});

test('redondeo exacto: decimal 1.5, neto 10.01, IVA 21 => 18.17',()=>{
  const p=pedido(['bolsa_001','1.5']);
  const r=run(p,[oferta('anon_aaa',[linea('bolsa_001','10.01')])]);
  assert.equal(r.cobertura[0].totalComparable,'18.17');
  assert.equal(r.opcionesCompletas[0].totalFinal,'18.17');
  assert.equal(r.cobertura[0].lineas[0].solicitada,'1.5');
});

test('sin IVA o sin precio, cobertura técnica no se transforma en costo verificable',()=>{
  const p=pedido(['bolsa_001','2']);
  const r=run(p,[
    oferta('anon_aaa',[linea('bolsa_001','100.00',{ivaPorcentaje:null})]),
    oferta('anon_bbb',[linea('bolsa_001',null)])
  ]);
  assert.equal(r.opcionesCompletas.length,0);
  assert.equal(r.cobertura[0].lineasCompletas,1);
  assert.equal(r.cobertura[1].lineasCompletas,1);
  assert.ok(r.cobertura.every(x=>x.motivos.includes('precio_o_iva_desconocido')));
});

test('flete y mínimo son obligatorios: jamás se asume gratis ni cero',()=>{
  const p=pedido(['bolsa_001','2']);
  const r=run(p,[
    oferta('anon_aaa',[linea('bolsa_001')],{fleteFinal:null}),
    oferta('anon_bbb',[linea('bolsa_001')],{minimoCompraFinal:null})
  ]);
  assert.equal(r.opcionesCompletas.length,0);
  assert.ok(r.cobertura[0].motivos.includes('flete_desconocido'));
  assert.ok(r.cobertura[1].motivos.includes('minimo_desconocido'));
});

test('mínimo final de compra del proveedor se verifica con subtotal IVA incluido',()=>{
  const p=pedido(['bolsa_001','1']);
  const r=run(p,[oferta('anon_aaa',[linea('bolsa_001','100.00')],
    {minimoCompraFinal:'150.00'})]);
  assert.equal(r.cobertura[0].totalComparable,null);
  assert.ok(r.cobertura[0].motivos.includes('minimo_no_alcanzado'));
  assert.equal(r.opcionesCompletas.length,0);
});

test('mínimos en par de proveedores se comprueban por separado',()=>{
  const p=pedido(['bolsa_001','10'],['placa_001','10']);
  const a=oferta('anon_aaa',[linea('bolsa_001','20.00',{ivaPorcentaje:'0'}),linea('placa_001','60.00',{ivaPorcentaje:'0'})],{minimoCompraFinal:'300.00'});
  const b=oferta('anon_bbb',[linea('bolsa_001','30.00',{ivaPorcentaje:'0'}),linea('placa_001','20.00',{ivaPorcentaje:'0'})],{minimoCompraFinal:'700.00'});
  const r=run(p,[a,b]);
  assert.equal(r.opcionesCompletas.length,1);
  assert.deepEqual(r.opcionesCompletas[0].proveedoresAnonimos,['anon_aaa']);
});

test('ofertas con diferentes formas de pago o plazo jamás comparten ranking',()=>{
  const p=pedido(['bolsa_001','1']);
  const r=run(p,[
    oferta('anon_aaa',[linea('bolsa_001')],{formaPago:'contado'}),
    oferta('anon_bbb',[linea('bolsa_001','90.00')],{formaPago:'cuenta_corriente_30_dias'}),
    oferta('anon_ccc',[linea('bolsa_001','90.00')],{plazoEntregaDias:4})
  ]);
  assert.equal(r.gruposComparables,3);
  assert.equal(r.opcionesCompletas.length,3);
  assert.ok(r.opcionesCompletas.every(x=>x.puestoDentroDeCondiciones===null));
});

test('diferente moneda no permite comparación de importes sin tipo de cambio verificado',()=>{
  const p=pedido(['bolsa_001','1']);
  const r=run(p,[oferta('anon_aaa',[linea('bolsa_001')]),
    oferta('anon_bbb',[linea('bolsa_001','1.00')],{moneda:'USD'})]);
  assert.equal(r.gruposComparables,2);
  assert.equal(r.opcionesCompletas.length,2);
  assert.ok(r.opcionesCompletas.every(x=>x.puestoDentroDeCondiciones===null));
});

test('empates reales reciben igual posición dentro del mismo grupo',()=>{
  const p=pedido(['bolsa_001','1']);
  const r=run(p,[oferta('anon_aaa',[linea('bolsa_001')]),
    oferta('anon_bbb',[linea('bolsa_001')])]);
  assert.equal(r.opcionesCompletas.length,2);
  assert.deepEqual(r.opcionesCompletas.map(x=>x.puestoDentroDeCondiciones),[1,1]);
});

test('oferta sin confirmar se excluye incluso con precios tentadores',()=>{
  const p=pedido(['bolsa_001','1']);
  const r=run(p,[oferta('anon_aaa',[linea('bolsa_001','1.00')],{confirmada:false})]);
  assert.equal(r.cobertura[0].lineasCompletas,0);
  assert.equal(r.opcionesCompletas.length,0);
  assert.ok(r.cobertura[0].motivos.includes('oferta_no_confirmada'));
});

test('faltantes, contacto o metadatos no permitidos se rechazan sin filtrarlos al resultado',()=>{
  const p=pedido(['bolsa_001','2']);
  const base=oferta('anon_aaa',[linea('bolsa_001')]);
  const invalid=[
    {...base,telefono:'221111111'},
    {...base,items:[{...base.items[0],proveedorId:'identidad_real'}]},
    {...base,anonId:'ferreteria_nombre_real'},
    {...base,items:[base.items[0],base.items[0]]},
    {...base,items:[{...base.items[0],itemId:'ajeno'}]},
    {...base,items:[{...base.items[0],precioUnitarioNeto:'1e10'}]},
    {...base,items:[{...base.items[0],precioUnitarioNeto:'-1.00'}]},
    {...base,items:[{...base.items[0],ivaPorcentaje:'19'}]},
    {...base,items:[{...base.items[0],cantidadDisponible:'1,500'}]}
  ];
  for(const x of invalid)assert.throws(()=>run(p,[x]),/comparacion_entrada_invalida/);
});

test('ids repetidos, request corrupto y límite de complejidad se rechazan',()=>{
  const p=pedido(['bolsa_001','1']);
  const a=oferta('anon_aaa',[linea('bolsa_001')]);
  assert.throws(()=>run(p,[a,a]),/comparacion_entrada_invalida/);
  assert.throws(()=>run({items:[]},[a]),/comparacion_entrada_invalida/);
  assert.throws(()=>run(pedido(['bolsa_001','0']),[a]),/comparacion_entrada_invalida/);
  assert.throws(()=>run(pedido(['bolsa_001','1'],['bolsa_001','2']),[a]),/comparacion_entrada_invalida/);
  assert.throws(()=>run(pedido(...Array.from({length:9},(_,i)=>['sku_'+i,'1'])),[]),/comparacion_entrada_invalida/);
});

test('un par con líneas no cubiertas nunca se considera compra completa',()=>{
  const p=pedido(['bolsa_001','3'],['placa_001','3'],['cable_001','3']);
  const a=oferta('anon_aaa',[linea('bolsa_001')]);
  const b=oferta('anon_bbb',[linea('placa_001')]);
  const r=run(p,[a,b]);
  assert.equal(r.opcionesCompletas.length,0);
  assert.equal(r.cobertura[0].lineasCompletas,1);
  assert.equal(r.cobertura[1].lineasCompletas,1);
});

test('puntuación estable en entrada reordenada, sin inferencia ni red',()=>{
  const p=pedido(['bolsa_001','2']);
  const a=oferta('anon_aaa',[linea('bolsa_001','1.00')]);
  const b=oferta('anon_bbb',[linea('bolsa_001','2.00')]);
  const r=run(p,[b,a]),r2=run(p,[a,b]);
  assert.deepEqual(r.opcionesCompletas,r2.opcionesCompletas);
  assert.equal(JSON.stringify(r).includes('whatsapp'),false);
});
