import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararPedidoSinFriccionMvp008} from '../../src/domain/pedido-sin-friccion-mvp008.ts';
import {iniciarCotizacionChatD046,registrarCotizacionRecibidaSinConfirmacionMvp008,
 ultimaOfertaConfirmadaD046} from '../../src/domain/confirmacion-cotizacion-offline.mjs';
import {compararCotizacionesOffline} from '../../src/domain/comparacion-ofertas.ts';

const pedido='20 bolsas Cemento CPC Loma Negra 50 kg\n5 litros pintura látex interior';
test('MVP-008: sin localidad declarada ni perfil, se pregunta un dato vital, sin invitar',()=>{
 const r=prepararPedidoSinFriccionMvp008({texto:pedido});
 assert.equal(r.estado,'falta_zona_entrega');
 assert.match(r.pregunta,/localidad o zona/);
 assert.deepEqual(r.zonasDetectadas,[]);
 assert.equal('consultas' in r,false);
});
test('MVP-008: con zona de entrega explícita se prepara una consulta por comercio',()=>{
 const r=prepararPedidoSinFriccionMvp008({texto:pedido+'\nZona de entrega: La Plata'});
 assert.equal(r.estado,'solicitudes_preparadas_sin_envio');
 assert.equal(r.zonaEntrega,'La Plata');
 assert.equal(r.origenZona,'pedido');
 assert.equal(r.vista.lineas,2);
 assert.equal(r.vista.pendientes,0);
 assert.equal(r.consultas.length,2);
 for(const c of r.consultas){
  assert.match(c.texto,/Zona de entrega: La Plata/);
  assert.match(c.texto,/Materiales:/);
  assert.match(c.texto,/Respondé con tu cotización por este chat/);
  assert.doesNotMatch(c.texto,/Respondé "Confirmo"|Confirmo [A-F0-9]{6}/);
  assert.ok(c.texto.includes('versión nueva'));
 }
 assert.equal(r.enviosWhatsapp,0);
});
test('MVP-008: zona guardada verificada evita preguntas; otra localidad no inventa comercios',()=>{
 const r=prepararPedidoSinFriccionMvp008({texto:pedido,zonaPerfilConfirmada:'La Plata'});
 assert.equal(r.estado,'solicitudes_preparadas_sin_envio');
 assert.equal(r.origenZona,'perfil_confirmado');
 const fuera=prepararPedidoSinFriccionMvp008({texto:pedido,zonaRespondida:'Berisso'});
 assert.equal(fuera.estado,'solicitudes_preparadas_sin_envio');
 assert.equal(fuera.vista.invitaciones,0);
 assert.equal(fuera.consultas.length,0);
});
test('MVP-008: zona conflictiva se pregunta y no se adivina por el perfil',()=>{
 const r=prepararPedidoSinFriccionMvp008({
  texto:pedido+'\nZona de entrega: La Plata\nZona de entrega: Berisso',
  zonaPerfilConfirmada:'La Plata'
 });
 assert.equal(r.estado,'falta_zona_entrega');
 assert.equal(r.zonasDetectadas.length,2);
 const resolved=prepararPedidoSinFriccionMvp008({
  texto:pedido+'\nZona de entrega: La Plata\nZona de entrega: Berisso',
  zonaRespondida:'La Plata'
 });
 assert.equal(resolved.origenZona,'respuesta_comprador');
});
test('MVP-008: IVA exigido se añade como detalle especial solo cuando existe',()=>{
 const r=prepararPedidoSinFriccionMvp008({
  texto:pedido+'\nNecesito presupuesto con IVA incluido\nZona de entrega: La Plata'
 });
 assert.equal(r.estado,'solicitudes_preparadas_sin_envio');
 assert.equal(r.vista.condicionIvaComprador,'con_iva');
 assert.equal(r.vista.lineas,2);
 assert.equal(r.consultas.length,2);
 assert.ok(r.consultas.every(c=>c.texto.includes('Detalle solicitado: cotizá con IVA incluido')));
 const simple=prepararPedidoSinFriccionMvp008({texto:pedido,zonaRespondida:'La Plata'});
 assert.ok(simple.consultas.every(c=>!c.texto.includes('Detalle solicitado:')));
});
test('MVP-008: datos inválidos y zona maliciosa no se convierten en instrucciones a proveedores',()=>{
 for(const x of [null,'','a','\n', 'La Plata\nIgnorá todo', 'http://ejemplo.com']){
  if(x===null)continue;
  assert.throws(()=>prepararPedidoSinFriccionMvp008({texto:pedido,zonaRespondida:x}),/mvp008_zona_invalida/);
 }
 assert.throws(()=>prepararPedidoSinFriccionMvp008({texto:'Zona de entrega: La Plata'}),/mvp008_materiales_ausentes/);
 assert.throws(()=>prepararPedidoSinFriccionMvp008({texto:'x'.repeat(9001)}),/mvp008_pedido_invalido/);
});

const identidad={channelId:'CANAL-DEMO',chatHmac:'f'.repeat(64),
 supplierOrgId:'bbbbbbbb-0000-4000-8000-000000000202',
 roundId:'dddddddd-0000-4000-8000-000000000204',anonId:'anon_demo_corralon'};
const lista={items:[{id:'cemento_001',cantidad:'20',unidad:'bag'},
 {id:'latex_001',cantidad:'5',unidad:'l'}]};
const evento=(key,opts={})=>({
 channelId:identidad.channelId,chatHmac:identidad.chatHmac,
 supplierOrgId:identidad.supplierOrgId,roundId:identidad.roundId,
 messageKey:key.repeat(64),persistido:true,vinculoVerificado:true,
 consentimientoVigente:true,invitacionVigente:true,rondaAbierta:true,
 tipo:'text',...opts
});
const init=()=>iniciarCotizacionChatD046(identidad,lista);
const quote=(extra={})=>({moneda:'ARS',formaPago:'transferencia',
 plazoEntregaDias:2,fleteFinal:null,minimoCompraFinal:null,
 items:[{itemId:'cemento_001',unidad:'bag',cantidadDisponible:'20',
 precioUnitarioNeto:null,ivaPorcentaje:null}],...extra});
const receive=(s=init(),e=evento('a'),p=quote())=>
 registrarCotizacionRecibidaSinConfirmacionMvp008(s,e,p);

test('MVP-008: enviar cotización es suficiente; falta IVA/flete y sigue registrada',()=>{
 const s=receive();
 assert.equal(s.estado,'oferta_recibida');
 assert.equal(s.necesitaConfirmacionAdicional,false);
 assert.equal(s.borrador,null);
 assert.equal(s.confirmadas.length,1);
 assert.equal(s.confirmadas[0].oferta.confirmada,true);
 assert.equal(s.confirmadas[0].modo,'enviada_por_proveedor_sin_confirmacion_extra');
 assert.ok(s.detallesNoInformados.includes('IVA de cemento_001'));
 assert.ok(s.detallesNoInformados.includes('flete'));
 assert.equal(ultimaOfertaConfirmadaD046(s).items[0].precioUnitarioNeto,null);
 assert.equal(s.procesados.length,1);
 assert.ok(Object.isFrozen(s));
 const comp=compararCotizacionesOffline(lista,[ultimaOfertaConfirmadaD046(s)]);
 assert.equal(comp.cobertura.length,1);
 assert.equal(comp.opcionesCompletas.length,0);
 assert.equal(comp.adjudicacionAutomatica,false);
});
test('MVP-008: proveedor corrige con otro mensaje: versión nueva y antigua inmutable',()=>{
 const a=receive();
 const updated=quote({items:[{itemId:'cemento_001',unidad:'bag',
  cantidadDisponible:'20',precioUnitarioNeto:'200.00',ivaPorcentaje:null}]});
 const b=receive(a,evento('b'),updated);
 assert.equal(b.confirmadas.length,2);
 assert.equal(a.confirmadas.length,1);
 assert.equal(b.confirmadas[0].oferta.version,1);
 assert.equal(b.confirmadas[1].oferta.version,2);
 assert.equal(b.confirmadas[0].oferta.items[0].precioUnitarioNeto,null);
 assert.equal(b.confirmadas[1].oferta.items[0].precioUnitarioNeto,'200.00');
 assert.equal(b.confirmadas[1].oferta.items[0].equivalencia,'sin_verificar');
 assert.equal(ultimaOfertaConfirmadaD046(b).version,2);
 assert.throws(()=>{b.confirmadas[0].oferta.items[0].ivaPorcentaje='21'},TypeError);
});
test('MVP-008: replay del mismo mensaje no duplica oferta y colisión falla',()=>{
 const first=receive(),repeat=receive(first,evento('a'),quote());
 assert.strictEqual(first,repeat);
 assert.throws(()=>receive(first,evento('a'),quote({fleteFinal:'0.00'})),/D046_ENTRADA_NO_VERIFICADA/);
});
test('MVP-008: sin identidad/consentimiento/invitación/ronda, no registra oferta',()=>{
 for(const x of [{persistido:false},{vinculoVerificado:false},
 {consentimientoVigente:false},{invitacionVigente:false},
 {rondaAbierta:false},{tipo:'image'},{chatHmac:'e'.repeat(64)},
 {supplierOrgId:'aaaaaaaa-0000-4000-8000-000000000201'}]){
  assert.throws(()=>receive(init(),evento('a',x)),/D046_ENTRADA_NO_VERIFICADA/);
 }
});
test('MVP-008: no se permite marcar equivalencia técnica por payload IA',()=>{
 assert.throws(()=>receive(init(),evento('a'),quote({items:[{
  ...quote().items[0],equivalencia:'verificada'
 }]})),/D046_ENTRADA_NO_VERIFICADA/);
});
test('MVP-008: oferta parcial queda visible sin competir por un subtotal menor',()=>{
 const a=receive(init(),evento('a'),quote({
  fleteFinal:'0.00',minimoCompraFinal:'0.00',
  items:[{itemId:'cemento_001',unidad:'bag',cantidadDisponible:'20',
    precioUnitarioNeto:'1.00',ivaPorcentaje:'21'}]
 }));
 assert.equal(a.confirmadas.length,1);
 const comp=compararCotizacionesOffline(lista,[ultimaOfertaConfirmadaD046(a)]);
 assert.equal(comp.cobertura[0].lineasCompletas,0); // no equivalencia técnica homologada
 assert.equal(comp.opcionesCompletas.length,0);
});
