import test from 'node:test';
import assert from 'node:assert/strict';
import { ejecutarCicloComercialD045, resumenSeguroD045 }
  from '../../scripts/demo/ciclo-comercial-d045.mjs';
import { compararCotizacionesOffline }
  from '../../src/domain/comparacion-ofertas.ts';

const run=()=>ejecutarCicloComercialD045();
const baseLine=(itemId,unidad,neto)=>({
 itemId,unidad,cantidadDisponible:'100',equivalencia:'verificada',
 precioUnitarioNeto:neto,ivaPorcentaje:'21'
});
const oferta=(anonId,items,extra={})=>({
 anonId,version:1,confirmada:true,moneda:'ARS',
 formaPago:'transferencia',plazoEntregaDias:3,fleteFinal:'10.00',
 minimoCompraFinal:'0.00',items,...extra
});
const pedido={items:[
 {id:'cemento_001',cantidad:'20',unidad:'bag'},
 {id:'latex_001',cantidad:'5',unidad:'l'},
 {id:'placa_001',cantidad:'10',unidad:'unit'}
]};
test('D045: un solo pedido clasifica 3 rubros sin perder la línea dudosa',()=>{
 const r=run();
 assert.equal(r.estado,'ENSAYO_SIN_INTEGRACIONES');
 assert.equal(r.borrador.lineas.length,4);
 assert.equal(r.invitaciones.estado,'simulacion_taxonomia_sin_envio');
 assert.deepEqual(
   r.invitaciones.resolucion.requisitos.map(x=>x.producto_id),
   ['cemento_gris_obra','pintura_latex','placa_yeso']
 );
 assert.ok(r.invitaciones.resolucion.retenidas.some(x=>x.fila===4));
 const ids=r.invitaciones.plan.invitaciones.map(x=>x.proveedor_id).sort();
 assert.deepEqual(ids,[
   'acabados_demo','corralon_25_demo','corralon_50_demo','distribuidor_total_demo'
 ]);
});
test('D045: quien hizo opt-out, no consintió o está fuera de zona no recibe invitación',()=>{
 const r=run();
 const names=r.invitaciones.plan.invitaciones.map(x=>x.proveedor_id);
 for(const x of ['sin_consentimiento_demo','dado_de_baja_demo','otra_zona_demo']){
   assert.ok(!names.includes(x),x);
 }
 assert.ok(r.invitaciones.plan.invitaciones.every(x=>x.items.length>=1));
 assert.ok(r.invitaciones.plan.invitaciones.every(x=>
   x.clave_idempotencia==='ronda_d045_ficticia:'+x.proveedor_id));
});
test('D045: marca mencionada no es exclusividad, 50kg a 25kg es consulta, no oferta homologada',()=>{
 const r=run();
 assert.deepEqual(r.invitaciones.resolucion.marcas_no_exclusivas_corregidas,[1]);
 const p=r.invitaciones.plan.invitaciones.find(x=>x.proveedor_id==='corralon_25_demo');
 assert.ok(p);
 assert.equal(p.items.length,1);
 const item=p.items[0];
 assert.equal(item.marca_exclusiva,false);
 assert.equal(item.producto_id,'cemento_gris_obra');
 assert.equal(item.opciones[0].cantidad_envases_orientativa,'40');
 assert.equal(item.opciones[0].comparable_como_identico,false);
});
test('D045: nunca distribuye si el comprador no autorizó el pedido',()=>{
 assert.throws(()=>ejecutarCicloComercialD045({
   solicitud:{envio_autorizado_por_comprador:false}
 }),/solicitud_sin_autorizacion/);
});
test('D045: un proveedor parcial no tiene total comparable y nunca figura como canasta completa',()=>{
 const r=run(),coverage=r.comparacion.cobertura;
 assert.equal(coverage.length,3);
 assert.equal(coverage.find(x=>x.anonId==='anon_cemento').lineasCompletas,1);
 assert.equal(coverage.find(x=>x.anon_cemento).length,undefined);
});
test('D045: la compra con dos proveedores suma IVA y ambos fletes, sin revelar contactos',()=>{
 const r=run(),opts=r.comparacion.opcionesCompletas;
 const ideal=opts.find(x=>
   x.proveedoresAnonimos.join('|')==='anon_acabados|anon_cemento');
 assert.ok(ideal);
 assert.equal(ideal.materialesConIva,'3932.50');
 assert.equal(ideal.fletesFinal,'240.00');
 assert.equal(ideal.totalFinal,'4172.50');
 assert.ok(ideal.asignacion.some(x=>x.itemId==='cemento_001'&&x.anonId==='anon_cemento'));
 assert.ok(ideal.asignacion.some(x=>x.itemId==='latex_001'&&x.anonId==='anon_acabados'));
 assert.ok(ideal.asignacion.some(x=>x.itemId==='placa_001'&&x.anonId==='anon_acabados'));
 assert.equal(r.comparacion.contactoRevelado,false);
 assert.equal(r.comparacion.adjudicacionAutomatica,false);
 assert.equal(r.comparacion.optimoGlobalGarantizado,false);
});
test('D045: sin confirmación, IVA, flete o equivalencia no se inventa comparabilidad',()=>{
 const incomplete=[
  oferta('anon_no_confirmada',[
    baseLine('cemento_001','bag','1.00')
  ],{confirmada:false}),
  oferta('anon_iva_pendiente',[
    {...baseLine('cemento_001','bag','1.00'),ivaPorcentaje:null}
  ]),
  oferta('anon_flete_pendiente',[
    baseLine('cemento_001','bag','1.00')
  ],{fleteFinal:null}),
  oferta('anon_alternativa',[
    {...baseLine('cemento_001','bag','1.00'),equivalencia:'sin_verificar'}
  ])
 ];
 const r=compararCotizacionesOffline({items:[pedido.items[0]]},incomplete);
 assert.equal(r.opcionesCompletas.length,0);
 assert.ok(r.cobertura.some(x=>x.motivos.includes('oferta_no_confirmada')));
 assert.ok(r.cobertura.some(x=>x.motivos.includes('precio_o_iva_desconocido')));
 assert.ok(r.cobertura.some(x=>x.motivos.includes('flete_desconocido')));
 assert.ok(r.cobertura.some(x=>x.lineas[0].motivo==='equivalencia_no_verificada'));
});
test('D045: 2 proveedores parciales con 5 bolsas cada uno NO completan una línea de 10',()=>{
 const r=compararCotizacionesOffline({items:[{id:'cemento_001',cantidad:'10',unidad:'bag'}]},[
  oferta('anon_a',[{...baseLine('cemento_001','bag','1.00'),cantidadDisponible:'5'}]),
  oferta('anon_b',[{...baseLine('cemento_001','bag','1.00'),cantidadDisponible:'5'}])
 ]);
 assert.equal(r.opcionesCompletas.length,0);
});
test('D045: el resumen para el comprador no atribuye envíos, IA ni ofertas reales',()=>{
 const r=run(),resumen=resumenSeguroD045(r);
 assert.equal(resumen.simulacion,true);
 assert.equal(resumen.no_se_envio_whatsapp,true);
 assert.equal(resumen.no_se_conecto_base,true);
 assert.equal(resumen.no_se_llamo_ia,true);
 assert.equal(resumen.ofertas_reales,0);
 assert.equal(resumen.pedido_lineas,4);
 assert.equal(resumen.lineas_con_aclaracion,1);
 assert.equal(resumen.proveedores_a_consultar,4);
 assert.equal(resumen.opcion_mas_economica_con_mismas_condiciones.total,'4172.50');
 assert.equal(resumen.contacto_revelado,false);
 assert.equal(resumen.adjudicacion_automatica,false);
 const t=JSON.stringify(resumen);
 assert.ok(!t.includes('corralon_50_demo'));
 assert.ok(!t.includes('Loma Negra'));
});
