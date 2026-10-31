import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararPropuestaEconomicaMvp007}
 from '../../src/domain/cotizacion-evidencia-mvp007.ts';
import {iniciarCotizacionChatD046,prepararBorradorCotizacionD046,
 confirmarBorradorCotizacionD046,ultimaOfertaConfirmadaD046}
 from '../../src/domain/confirmacion-cotizacion-offline.mjs';
import {compararCotizacionesOffline} from '../../src/domain/comparacion-ofertas.ts';

const full={
 textoFuente:'Cemento CPC 50 kg, 20 bolsas: $121.00 por bolsa\nAclaraciones: Precios con IVA incluido 21%\nFlete sin cargo',
 moneda:'ARS',formaPago:'transferencia',plazoEntregaDias:3,
 minimoCompraFinal:'0.00',fleteInformado:null,evidenciaFlete:null,
 condicionIvaComprador:'con_iva',
 items:[{itemId:'cemento_001',unidad:'bag',cantidadDisponible:'20',
  precioInformado:'121.00',evidenciaPrecio:{linea:1,cita:'Cemento CPC 50 kg, 20 bolsas: $121.00 por bolsa'}}]
};
const run=(extra={})=>prepararPropuestaEconomicaMvp007({...full,...extra});
const ids={channelId:'CANAL-DEMO',chatHmac:'f'.repeat(64),
 supplierOrgId:'bbbbbbbb-0000-4000-8000-000000000202',
 roundId:'dddddddd-0000-4000-8000-000000000204',anonId:'anon_demo_corralon'};
const pedido={items:[{id:'cemento_001',cantidad:'20',unidad:'bag'}]};
const evento=key=>({
 channelId:ids.channelId,chatHmac:ids.chatHmac,
 supplierOrgId:ids.supplierOrgId,roundId:ids.roundId,
 messageKey:key.repeat(64),persistido:true,vinculoVerificado:true,
 consentimientoVigente:true,invitacionVigente:true,rondaAbierta:true,tipo:'text'
});
const sess=()=>iniciarCotizacionChatD046(ids,pedido,{cemento_001:'Cemento CPC 50 kg'});

test('MVP-007: bruto con IVA expresamente 21% da neto exacto una sola vez',()=>{
 const r=run();
 assert.equal(r.estado,'propuesta_para_borrador_d046_sin_confirmar');
 assert.equal(r.condiciones.iva,'incluido');
 assert.equal(r.condiciones.flete,'sin_cargo');
 assert.deepEqual(r.fuentes.lineasPrecioVerificadas,[1]);
 assert.deepEqual(r.fuentes.lineasIva,[2]);
 assert.deepEqual(r.fuentes.lineasFlete,[3]);
 assert.deepEqual(r.propuesta.items[0],{
  itemId:'cemento_001',unidad:'bag',cantidadDisponible:'20',
  precioUnitarioNeto:'100.00',ivaPorcentaje:'21'
 });
 assert.equal(r.propuesta.fleteFinal,'0.00');
 assert.deepEqual(r.pendientes,[]);
 assert.equal(r.proveedorConfirmo,false);
 assert.equal(r.comparableSinConfirmacion,false);
 assert.equal(r.mensajesWhatsapp,0);
});
test('MVP-007: borrador D046 exige confirmación; lo confirmado no crea equivalencia técnica',()=>{
 const adaptado=run();
 const draft=prepararBorradorCotizacionD046(sess(),evento('a'),adaptado.propuesta);
 assert.equal(draft.estado,'pendiente_confirmacion');
 assert.equal(draft.borrador.oferta.confirmada,false);
 assert.ok(draft.borrador.textoProveedor.includes('Confirmo'));
 assert.equal(draft.borrador.faltantes.length,0);
 const confirmed=confirmarBorradorCotizacionD046(draft,evento('b'),{
  texto:'Confirmo',replyToDraftId:draft.borrador.draftId
 });
 assert.equal(confirmed.confirmadas.length,1);
 assert.equal(confirmed.confirmadas[0].oferta.items[0].equivalencia,'sin_verificar');
 assert.equal(confirmed.confirmadas[0].oferta.items[0].precioUnitarioNeto,'100.00');
 const comp=compararCotizacionesOffline(pedido,[ultimaOfertaConfirmadaD046(confirmed)]);
 assert.equal(comp.opcionesCompletas.length,0);
 assert.equal(comp.adjudicacionAutomatica,false);
});
test('MVP-007: presupuesto sin aclaración IVA/flete no se asume neto ni envío gratis',()=>{
 const a=run({textoFuente:'Cemento CPC 50 kg, 20 bolsas: $121.00 por bolsa'});
 assert.equal(a.condiciones.iva,'no_informado');
 assert.equal(a.condiciones.flete,'no_informado');
 assert.equal(a.propuesta.items[0].precioUnitarioNeto,null);
 assert.equal(a.propuesta.items[0].ivaPorcentaje,null);
 assert.equal(a.propuesta.fleteFinal,null);
 const d=prepararBorradorCotizacionD046(sess(),evento('a'),a.propuesta);
 assert.ok(d.borrador.faltantes.includes('flete'));
 assert.ok(d.borrador.faltantes.includes('precio de cemento_001'));
 assert.ok(d.borrador.faltantes.includes('IVA de cemento_001'));
 assert.throws(()=>confirmarBorradorCotizacionD046(d,evento('b'),{
  texto:'Confirmo',replyToDraftId:d.borrador.draftId
 }),/D046_ENTRADA_NO_VERIFICADA/);
});
test('MVP-007: IVA incluido SIN alícuota no autoriza deducir neto ni tasa',()=>{
 const source=full.textoFuente.replace(' 21%','');
 const r=run({textoFuente:source});
 assert.equal(r.condiciones.iva,'incluido');
 assert.equal(r.propuesta.items[0].precioUnitarioNeto,null);
 assert.equal(r.propuesta.items[0].ivaPorcentaje,null);
 assert.ok(r.pendientes.some(x=>x.startsWith('precio_base_o_iva')));
});
test('MVP-007: más IVA 21% conserva precio base sin sumarlo en la propuesta D046',()=>{
 const source='Cemento CPC 50 kg: $100.00 por bolsa\nImportes más IVA 21%\nFlete incluido';
 const r=run({textoFuente:source,condicionIvaComprador:'no_especificado',
  items:[{...full.items[0],precioInformado:'100.00',
   evidenciaPrecio:{linea:1,cita:'Cemento CPC 50 kg: $100.00 por bolsa'}}]});
 assert.equal(r.condiciones.iva,'no_incluido');
 assert.equal(r.condiciones.flete,'incluido');
 assert.equal(r.propuesta.items[0].precioUnitarioNeto,'100.00');
 assert.equal(r.propuesta.items[0].ivaPorcentaje,'21');
 assert.equal(r.propuesta.fleteFinal,'0.00');
});
test('MVP-007: si comprador exigió CON IVA, no aceptar como cumplida una oferta más IVA',()=>{
 const source='Cemento CPC 50 kg: $100.00 por bolsa\nImportes más IVA 21%\nFlete sin cargo';
 const r=run({textoFuente:source,items:[{...full.items[0],precioInformado:'100.00',
   evidenciaPrecio:{linea:1,cita:'Cemento CPC 50 kg: $100.00 por bolsa'}}]});
 assert.equal(r.condiciones.iva,'no_incluido');
 assert.ok(r.pendientes.includes('condicion_iva_comprador_sin_cumplir_o_ambigua'));
 assert.equal(r.propuesta.items[0].precioUnitarioNeto,null);
});
test('MVP-007: flete adicional expresamente con monto y cita exacta se suma solo una vez',()=>{
 const source='Cemento CPC 50 kg: $121.00\nIVA incluido 21%\nFlete adicional $35.00';
 const r=run({textoFuente:source,fleteInformado:'35.00',
  evidenciaFlete:{linea:3,cita:'Flete adicional $35.00'},
  items:[{...full.items[0],evidenciaPrecio:{linea:1,cita:'Cemento CPC 50 kg: $121.00'}}]});
 assert.equal(r.condiciones.flete,'adicional');
 assert.equal(r.propuesta.fleteFinal,'35.00');
 assert.equal(r.propuesta.items[0].precioUnitarioNeto,'100.00');
 const draft=prepararBorradorCotizacionD046(sess(),evento('a'),r.propuesta);
 assert.equal(draft.borrador.oferta.fleteFinal,'35.00');
});
test('MVP-007: flete aparte sin monto preciso queda pendiente',()=>{
 const r=run({textoFuente:'Cemento CPC 50 kg: $121.00\nIVA incluido 21%\nFlete aparte',
  items:[{...full.items[0],evidenciaPrecio:{linea:1,cita:'Cemento CPC 50 kg: $121.00'}}]});
 assert.equal(r.condiciones.flete,'adicional');
 assert.equal(r.propuesta.fleteFinal,null);
 assert.ok(r.pendientes.includes('flete_no_aclarado_o_sin_monto'));
});
test('MVP-007: referencia de precio falsificada o numeración equivocada retiene precio',()=>{
 for(const ev of [{linea:2,cita:full.items[0].evidenciaPrecio.cita},
   {linea:1,cita:'Cemento $999.00'},
   {linea:1,cita:'Cemento CPC 50 kg, 20 bolsas: $121.00 por bolsa'}]){
  const source=ev.cita.includes('999')?full.textoFuente:
   full.textoFuente.replace('$121.00','$122.00');
  const r=run({textoFuente:source,items:[{...full.items[0],evidenciaPrecio:ev}]});
  assert.equal(r.propuesta.items[0].precioUnitarioNeto,null);
 }
});
test('MVP-007: centavos que no recomponen precio bruto exacto quedan pendientes',()=>{
 const source='Cemento CPC 50 kg: $100.00\nIVA incluido 21%\nFlete incluido';
 const r=run({textoFuente:source,items:[{...full.items[0],precioInformado:'100.00',
  evidenciaPrecio:{linea:1,cita:'Cemento CPC 50 kg: $100.00'}}]});
 assert.equal(r.propuesta.items[0].precioUnitarioNeto,null);
 assert.ok(r.pendientes.includes('recomposicion_de_iva_no_exacta_cemento_001'));
});
test('MVP-007: formato AR $12.100,00 conserva importe de origen',()=>{
 const source='Cemento CPC 50 kg: $12.100,00\nIVA incluido 21%\nFlete sin cargo';
 const r=run({textoFuente:source,items:[{...full.items[0],precioInformado:'12100.00',
  evidenciaPrecio:{linea:1,cita:'Cemento CPC 50 kg: $12.100,00'}}]});
 assert.equal(r.propuesta.items[0].precioUnitarioNeto,'10000.00');
});
test('MVP-007: IVA contradictorio nunca se convierte silenciosamente',()=>{
 const source='Cemento: $121.00\nIVA incluido 21%\nIVA no incluido\nFlete sin cargo';
 const r=run({textoFuente:source,items:[{...full.items[0],
  evidenciaPrecio:{linea:1,cita:'Cemento: $121.00'}}]});
 assert.equal(r.condiciones.iva,'contradictorio');
 assert.equal(r.propuesta.items[0].precioUnitarioNeto,null);
});
test('MVP-007: evento repetido en D046 no duplica versión',()=>{
 const proposal=run().propuesta;
 const a=prepararBorradorCotizacionD046(sess(),evento('a'),proposal);
 const b=prepararBorradorCotizacionD046(a,evento('a'),proposal);
 assert.strictEqual(a,b);
});
test('MVP-007: entrada inyectada, precio numérico ambiguo y duplicados se rechazan',()=>{
 assert.throws(()=>run({items:[{...full.items[0],equivalencia:'verificada'}]}),/mvp007_entrada_invalida/);
 assert.throws(()=>run({items:[full.items[0],full.items[0]]}),/mvp007_entrada_invalida/);
 assert.throws(()=>run({items:[{...full.items[0],precioInformado:'1,000'}]}),/mvp007_entrada_invalida/);
 assert.throws(()=>run({textoFuente:'IVA incluido\u0000'}));
});
