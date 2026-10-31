/**
 * MVP-002 / Issue #219. Acceptance bridge across EXISTING modules.
 * An E2E FUNCTIONAL PILOT still requires real DB/WhatsApp/companies.
 * This test only checks the synthetic buyer->selection->comparison contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EJEMPLO_PEDIDO_MVP,generarVistaCompradorMvp
} from '../../src/domain/mvp-vista-comprador-d057.ts';
import {
  ejecutarCicloComercialD045,resumenSeguroD045
} from '../../scripts/demo/ciclo-comercial-d045.mjs';
import {compararCotizacionesOffline}
 from '../../src/domain/comparacion-ofertas.ts';

test('MVP-002: una lista tiene 3 rubros presentables y un renglón dudoso, sin inventar envíos',()=>{
  const buyer=generarVistaCompradorMvp(EJEMPLO_PEDIDO_MVP);
  const backend=ejecutarCicloComercialD045();
  const report=resumenSeguroD045(backend);
  assert.equal(buyer.estado,'demo_local_sin_envio');
  assert.equal(buyer.aprovechadas,3);
  assert.equal(buyer.pendientes,1);
  assert.deepEqual(new Set(buyer.proveedores.map(p=>p.rubro)),
    new Set(['Corralón','Pinturería','Construcción en seco']));
  assert.equal(backend.resolucion,undefined);
  assert.equal(backend.borrador.lineas.length,4);
  assert.equal(backend.invitaciones.resolucion.requisitos.length,3);
  assert.equal(report.lineas_con_aclaracion,1);
  assert.equal(report.no_se_envio_whatsapp,true);
  assert.equal(report.no_se_conecto_base,true);
  assert.equal(report.no_se_llamo_ia,true);
  assert.equal(report.ofertas_reales,0);
  assert.equal(buyer.mensajesEnviados,0);
  assert.equal(buyer.llamadasIA,0);
  assert.equal(buyer.preciosReales,0);
  // Different fixture catalogs may produce different supplier counts.
  // Both must filter by catalog + zone + consent, never claim they are real.
  assert.ok(buyer.proveedores.length>0);
  assert.ok(backend.invitaciones.plan.invitaciones.length>=buyer.proveedores.length);
});

test('MVP-002: el módulo comprador NUNCA muestra ofertas ficticias del comparador',()=>{
 const buyer=generarVistaCompradorMvp(EJEMPLO_PEDIDO_MVP);
 const backend=ejecutarCicloComercialD045();
 const full=backend.comparacion.opcionesCompletas;
 assert.ok(full.length>=2);
 assert.equal(backend.comparacion.contactoRevelado,false);
 assert.equal(backend.comparacion.adjudicacionAutomatica,false);
 assert.equal(backend.comparacion.optimoGlobalGarantizado,false);
 assert.ok(full.some(x=>x.proveedoresAnonimos.length===2));
 assert.ok(full.some(x=>x.proveedoresAnonimos.length===1));
 assert.ok(backend.comparacion.cobertura.some(x=>x.totalComparable===null));
 const shown=JSON.stringify(buyer);
 for(const opt of full){
   assert.ok(!shown.includes(opt.totalFinal));
   assert.ok(!shown.includes(opt.proveedoresAnonimos.join('/')));
 }
});

test('MVP-002: ningún precio parcial se recomienda como precio total completo',()=>{
  const b=ejecutarCicloComercialD045();
  const partial=b.comparacion.cobertura.find(x=>x.anonId==='anon_cemento');
  assert.ok(partial);
  assert.equal(partial.lineasCompletas,1);
  assert.equal(partial.totalComparable,null);
  assert.ok(b.comparacion.opcionesCompletas.every(x=>
    x.asignacion.length===3));
  const none=compararCotizacionesOffline({items:[
    {id:'cemento_001',cantidad:'10',unidad:'bag'}
  ]},[{
    anonId:'anon_parcial_001',version:1,confirmada:true,moneda:'ARS',
    formaPago:'transferencia',plazoEntregaDias:3,
    fleteFinal:'100.00',minimoCompraFinal:'0.00',
    items:[{
      itemId:'cemento_001',unidad:'bag',cantidadDisponible:'5',
      equivalencia:'verificada',precioUnitarioNeto:'1.00',
      ivaPorcentaje:'21'
    }]
  }]);
  assert.equal(none.opcionesCompletas.length,0);
  assert.ok(none.cobertura[0].totalComparable===null);
});

test('MVP-002: no autorizar distribución ni reactivar proveedores no consentidos',()=>{
 assert.throws(()=>ejecutarCicloComercialD045({
   solicitud:{envio_autorizado_por_comprador:false}
 }),/solicitud_sin_autorizacion/);
 const allowed=ejecutarCicloComercialD045();
 const ids=new Set(allowed.invitaciones.plan.invitaciones.map(x=>x.proveedor_id));
 assert.ok(!ids.has('sin_consentimiento_demo'));
 assert.ok(!ids.has('dado_de_baja_demo'));
 assert.ok(!ids.has('otra_zona_demo'));
});
