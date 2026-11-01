import test from 'node:test';
import assert from 'node:assert/strict';
import {separarListaWhatsappNaturalMvp058 as normalizar}
 from '../../src/domain/lista-whatsapp-natural-mvp058.ts';
import {prepararPedidoTextoMvp028} from '../../src/domain/pedido-piloto-mvp028.ts';
import {crearConsumidorCompradorWhatsappD073}
 from '../../src/server/buyer-whatsapp-ingress-d073.ts';

const CH='pilot058_channel',MSG='a'.repeat(64),CHAT='b'.repeat(64);
const ORG='aaaaaaaa-0058-4058-8058-000000000581';
const ROUND='cccccccc-0058-4058-8058-000000000581';
const SIMPLE='20 bolsas de cemento CPC 50 kg, 10 litros de hidrófugo y 5 litros de pintura látex. Entrega: La Plata.';
function simulate(source,{expectedDays=5}={}){
 const state={created:0,queued:0,zone:0,seen:null};
 const handler=crearConsumidorCompradorWhatsappD073({
  habilitado:true,channel:CH,
  puerto:{
   cargar:async()=>({
    channel:CH,messageKey:MSG,chatKey:CHAT,buyerOrgId:ORG,
    tipo:'text',textoVerificado:source,medioEscaneadoYExtraido:false,
    compartirContactoConsentido:true,pendienteZona:null
   }),
   registrarFaltaZona:async()=>{
    state.zone++;return 'registrada';
   },
   crearRonda:async input=>{
    state.created++;state.seen=input;
    assert.equal(input.pedido.plazoDias,expectedDays);
    return {roundId:ROUND,repetida:state.created>1};
   },
   prepararInvitaciones:async()=>{
    state.queued++;
    return {estado:'queued_without_sending',mensajesEnviados:0,nuevasInvitaciones:3};
   }
  }
 });
 return {handler,state};
}
test('MVP058: pedido REALISTA un solo WhatsApp -> cemento, hidrófugo y látex',async()=>{
 const h=simulate(SIMPLE);
 const r=await h.handler.procesar(MSG);
 assert.equal(r.estado,'ronda_registrada_consultas_en_cola');
 assert.equal(r.mensajesWhatsappEnviados,0);
 assert.deepEqual(h.state.seen.pedido.items.map(x=>[x.product_code,x.quantity,x.unit]),[
  ['cemento_gris_obra','20','bag'],['hidrofugo','10','l'],
  ['pintura_latex','5','l']
 ]);
 assert.equal(h.state.seen.pedido.deliveryZone,'La Plata');
 assert.deepEqual([h.state.created,h.state.queued,h.state.zone],[1,1,0]);
});
test('MVP058: punto y coma, y, plazo 3 días y condición IVA separada',async()=>{
 const text='20 bolsas de cemento CPC 50 kg; 10 litros de hidrófugo y 5 litros de pintura látex. Entrega: La Plata. Plazo de cotización: 3 días\nNecesito presupuesto con IVA incluido';
 const h=simulate(text,{expectedDays:3});
 assert.equal((await h.handler.procesar(MSG)).estado,'ronda_registrada_consultas_en_cola');
 assert.equal(h.state.seen.pedido.items.length,3);
 assert.equal(h.state.seen.pedido.vatRequest,'con_iva');
});
test('MVP058: preserva decimales, especificaciones y líneas ya separadas',()=>{
 const s='2,5 litros de pintura látex, 20 bolsas de cemento CPC 50 kg. Entrega: La Plata.';
 const formatted=normalizar(s);
 assert.ok(formatted.includes('2,5 litros'));
 assert.ok(formatted.includes('CPC 50 kg'));
 const r=prepararPedidoTextoMvp028(formatted);
 assert.equal(r.estado,'listo_para_registrar');
 assert.deepEqual(r.items.map(i=>i.quantity),['2.5','20']);
 assert.equal(normalizar('10 bolsas de cemento CPC 50 kg\nEntrega en: La Plata'),
   '10 bolsas de cemento CPC 50 kg\nEntrega en: La Plata');
});
test('MVP058: si falta zona solo la pregunta vital (sin crear ronda)',async()=>{
 const h=simulate('20 bolsas de cemento CPC 50 kg y 5 litros de pintura látex');
 assert.equal((await h.handler.procesar(MSG)).estado,'zona_solicitada_en_cola');
 assert.equal(h.state.zone,1);
 assert.equal(h.state.created,0);
});
test('MVP058: material desconocido no se descarta silenciosamente',async()=>{
 const h=simulate('20 bolsas de cemento CPC 50 kg, 10 litros de brebaje misterioso. Entrega: La Plata.');
 assert.equal((await h.handler.procesar(MSG)).estado,'requiere_revision_interna');
 assert.equal(h.state.created,0);
 assert.equal(h.state.queued,0);
});
test('MVP058: dos cementos de distinta presentación deben conservarse separados',async()=>{
 const h=simulate('20 bolsas de cemento CPC 50 kg, 10 bolsas de cemento CPN 25 kg. Entrega: La Plata.');
 assert.equal((await h.handler.procesar(MSG)).estado,'requiere_revision_interna');
 assert.equal(h.state.created,0);
});
test('MVP058: cantidades ambiguas, URL, plazo fuera de rango son bloqueo',async()=>{
 for(const s of [
  '1.000 bolsas de cemento CPC 50 kg, 2 litros de látex. Entrega: La Plata.',
  '20 bolsas de cemento CPC 50 kg, 5 litros de pintura látex https://evil.invalid. Entrega: La Plata.',
  SIMPLE+' Plazo: 8 días',
  '20 bolsas de cemento CPC 50 kg y 5 litros de pintura látex. Entrega: La Plata. Plazo: 2 días'
 ]){
  const h=simulate(s);
  assert.equal((await h.handler.procesar(MSG)).estado,'requiere_revision_interna',s);
  assert.equal(h.state.created,0);
 }
});
test('MVP058: no reinterpreta conectores de marca ni números de producto',()=>{
 const s='20 bolsas de cemento CPC 50 kg y Loma Negra\nEntrega en: La Plata';
 assert.equal(normalizar(s),s);
 const r=prepararPedidoTextoMvp028(normalizar(s));
 assert.equal(r.items[0].source_description,'cemento CPC 50 kg y Loma Negra');
});
test('MVP058: entradas vacías, gigantes y de control quedan bloqueadas',()=>{
 for(const v of ['', 'a'.repeat(4001),'texto\u0000inseguro'])
  assert.throws(()=>normalizar(v),/mvp058_pedido_invalido/);
});
