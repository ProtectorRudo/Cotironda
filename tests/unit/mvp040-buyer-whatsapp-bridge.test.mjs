import test from 'node:test';
import assert from 'node:assert/strict';
import {crearConsumidorCompradorWhatsappD073 as factory}
 from '../../src/server/buyer-whatsapp-ingress-d073.ts';

const channel='canal_piloto';
const m1='a'.repeat(64),m2='b'.repeat(64),chat='c'.repeat(64);
const org='aaaaaaaa-0000-4000-8000-000000000002';
const round='bbbbbbbb-0000-4000-8000-000000000003';
const pedido='20 bolsas de Cemento CPC Loma Negra 50 kg';
const full=pedido+'\nEntrega en: La Plata';
const input=(opts={})=>({
 channel,messageKey:m1,chatKey:chat,buyerOrgId:org,
 tipo:'text',textoVerificado:full,medioEscaneadoYExtraido:false,
 compartirContactoConsentido:true,pendienteZona:null,...opts
});
function harness(source=input(),options={}){
 const counts={load:0,pending:0,created:0,planned:0};
 const saved=new Map();
 const port={
  async cargar(_channel,key){
   counts.load++;
   assert.equal(_channel,channel);
   assert.equal(key,m1);
   return source;
  },
  async registrarFaltaZona(msg){
   counts.pending++;
   assert.equal(msg.buyerOrgId,org);
   assert.equal(msg.chatKey,chat);
   assert.equal(msg.originMessageKey,m1);
   assert.equal(msg.pregunta,'¿En qué localidad se entregan los materiales?');
   assert.equal(msg.textoOriginal,pedido);
   return counts.pending>1?'duplicada':'registrada';
  },
  async crearRonda(v){
   counts.created++;
   assert.equal(v.buyerOrgId,org);
   assert.equal(v.chatKey,chat);
   assert.equal(v.originMessageKey,m1);
   assert.equal(v.pedido.deliveryZone,'La Plata');
   assert.equal(v.pedido.plazoDias,options.expectedDays??5);
   assert.equal(v.pedido.items[0].quantity,'20');
   assert.equal(v.pedido.items[0].unit,'bag');
   assert.equal(v.pedido.items[0].source_description,'Cemento CPC Loma Negra 50 kg');
   const repeated=saved.has(v.originMessageKey);
   saved.set(v.originMessageKey,round);
   return {roundId:round,repetida:repeated};
  },
  async prepararInvitaciones(r){
   counts.planned++;
   assert.equal(r,round);
   if(options.plannerFails&&counts.planned===1)throw Error('red_mal');
   return {estado:'queued_without_sending',mensajesEnviados:0,nuevasInvitaciones:2};
  }
 };
 return {counts,port,processor:factory({habilitado:options.enabled!==false,channel,puerto:port})};
}
test('MVP040: comprador WhatsApp texto → ronda D064 → cola D071, sin envío',async()=>{
 const h=harness();
 const result=await h.processor.procesar(m1);
 assert.equal(result.estado,'ronda_registrada_consultas_en_cola');
 assert.equal(result.rondaId,round);
 assert.equal(result.mensajesWhatsappEnviados,0);
 assert.deepEqual(h.counts,{load:1,pending:0,created:1,planned:1});
});
test('MVP040: en modo apagado no se consulta DB ni se envía',async()=>{
 const h=harness(input(),{enabled:false});
 assert.equal((await h.processor.procesar(m1)).estado,'desactivado');
 assert.deepEqual(h.counts,{load:0,pending:0,created:0,planned:0});
});
test('MVP040: sin localidad se prepara una sola pregunta en outbox',async()=>{
 const h=harness(input({textoVerificado:pedido}));
 assert.equal((await h.processor.procesar(m1)).estado,'zona_solicitada_en_cola');
 assert.equal((await h.processor.procesar(m1)).estado,'zona_solicitada_en_cola');
 assert.equal(h.counts.pending,2);
 assert.equal(h.counts.created,0);
 assert.equal(h.counts.planned,0);
});
test('MVP040: responde localidad después y continúa texto original sin copiarlo',async()=>{
 const pending={origenMessageKey:m1,chatKey:chat,textoOriginal:pedido};
 const h=harness(input({
  messageKey:m2,textoVerificado:'La Plata',pendienteZona:pending
 }));
 // The verified loader must fetch the new message, same authenticated chat.
 h.port.cargar=async(_ch,key)=>{assert.equal(key,m2);return input({
  messageKey:m2,textoVerificado:'La Plata',pendienteZona:pending
 })};
 assert.equal((await h.processor.procesar(m2)).estado,'ronda_registrada_consultas_en_cola');
 assert.equal(h.counts.created,1);
 assert.equal(h.counts.pending,0);
});
test('MVP040: texto sin materiales identificados no crea ninguna ronda',async()=>{
 const h=harness(input({textoVerificado:'Necesito lo que hablamos\nEntrega en: La Plata'}));
 assert.equal((await h.processor.procesar(m1)).estado,'requiere_revision_interna');
 assert.equal(h.counts.created,0);
});
test('MVP040: texto con producto desconocido no inventa categoría ni distribuye',async()=>{
 const h=harness(input({textoVerificado:'10 bolsas de material misterioso\nEntrega en: La Plata'}));
 assert.equal((await h.processor.procesar(m1)).estado,'requiere_revision_interna');
 assert.equal(h.counts.created,0);
});
test('MVP040: foto/PDF sin descarga verificada NO es texto ni se cotiza',async()=>{
 for(const tipo of ['document','image','audio','voice']){
  const h=harness(input({tipo,textoVerificado:full,medioEscaneadoYExtraido:false}));
  assert.equal((await h.processor.procesar(m1)).estado,'esperando_extraccion_segura');
  assert.equal(h.counts.created,0);
 }
});
test('MVP040: PDF privado ya escaneado, extraído y verificado se tramita',async()=>{
 const h=harness(input({tipo:'document',medioEscaneadoYExtraido:true}));
 assert.equal((await h.processor.procesar(m1)).estado,'ronda_registrada_consultas_en_cola');
 assert.equal(h.counts.created,1);
});
test('MVP040: comprador sin consentimiento previo de contacto no participa',async()=>{
 const h=harness(input({compartirContactoConsentido:false}));
 assert.equal((await h.processor.procesar(m1)).estado,'consentimiento_contacto_pendiente');
 assert.equal(h.counts.created,0);
});
test('MVP040: vinculo de otro chat, mensaje o empresa inválida se rechaza',async()=>{
 const pending={origenMessageKey:m1,chatKey:'d'.repeat(64),textoOriginal:pedido};
 for(const patch of [
  {channel:'canal_otro'}, {messageKey:'e'.repeat(64)},
  {chatKey:'falso'}, {buyerOrgId:'user-input'},
  {pendienteZona:pending}, {extra:'telefono'},
  {medioEscaneadoYExtraido:'sí'}
 ]){
  const h=harness(input(patch));
  await assert.rejects(h.processor.procesar(m1),/d073_ingreso_no_disponible/);
  assert.equal(h.counts.created,0);
 }
});
test('MVP040: respuesta de zona sospechosa jamás se usa como localidad',async()=>{
 const h=harness(input({messageKey:m2,textoVerificado:'https://example.com',
  pendienteZona:{origenMessageKey:m1,chatKey:chat,textoOriginal:pedido}}));
 h.port.cargar=async()=>input({messageKey:m2,textoVerificado:'https://example.com',
  pendienteZona:{origenMessageKey:m1,chatKey:chat,textoOriginal:pedido}});
 assert.equal((await h.processor.procesar(m2)).estado,'requiere_revision_interna');
 assert.equal(h.counts.created,0);
});
test('MVP040: caída tras COMMIT de ronda no afirma despacho, permite repetición idempotente',async()=>{
 const h=harness(input(),{plannerFails:true});
 const first=await h.processor.procesar(m1);
 assert.equal(first.estado,'ronda_registrada_preparacion_pendiente');
 assert.equal(first.rondaId,round);
 const again=await h.processor.procesar(m1);
 assert.equal(again.estado,'ronda_registrada_consultas_en_cola');
 assert.equal(h.counts.created,2);
 assert.equal(h.counts.planned,2);
});
test('MVP040: cola sin comercio elegible no anuncia WhatsApp enviado',async()=>{
 const h=harness();
 h.port.prepararInvitaciones=async()=>{
  h.counts.planned++;
  return {estado:'no_eligible_suppliers',mensajesEnviados:0};
 };
 assert.equal((await h.processor.procesar(m1)).estado,'ronda_registrada_sin_consultas');
});
test('MVP040: receptor no retorna mensaje sin vinculo auténtico',async()=>{
 const h=harness();
 h.port.cargar=async()=>null;
 assert.equal((await h.processor.procesar(m1)).estado,'sin_entrada_verificada');
 assert.equal(h.counts.created,0);
});
test('MVP040: respuesta de broker falsa que afirma mensajes enviados no pasa',async()=>{
 const h=harness();
 h.port.prepararInvitaciones=async()=>({
  estado:'queued_without_sending',mensajesEnviados:2
 });
 assert.equal((await h.processor.procesar(m1)).estado,
  'ronda_registrada_preparacion_pendiente');
});

test('MVP053: WhatsApp guarda 7 días sin preguntar y zona ya incluida',async()=>{
 const h=harness(input({textoVerificado:full+'\nPlazo de cotización: 7 días'}),
  {expectedDays:7});
 assert.equal((await h.processor.procesar(m1)).estado,'ronda_registrada_consultas_en_cola');
 assert.equal(h.counts.pending,0);
 assert.equal(h.counts.created,1);
});
test('MVP053: recuerda 3 días cuando pregunta localidad y recibe respuesta',async()=>{
 const original=pedido+'\nPlazo para cotizar: 3 días';
 const h=harness(input({textoVerificado:original}),{expectedDays:3});
 h.port.registrarFaltaZona=async data=>{
  assert.equal(data.textoOriginal,original);
  h.counts.pending++;return 'registrada';
 };
 assert.equal((await h.processor.procesar(m1)).estado,'zona_solicitada_en_cola');
 const pending={origenMessageKey:m1,chatKey:chat,textoOriginal:original};
 h.port.cargar=async(_ch,key)=>input({
  messageKey:key,textoVerificado:'La Plata',pendienteZona:pending
 });
 assert.equal((await h.processor.procesar(m2)).estado,'ronda_registrada_consultas_en_cola');
 assert.equal(h.counts.created,1);
 assert.equal(h.counts.pending,1);
});
test('MVP053: plazo inválido no crea ronda ni genera invitaciones',async()=>{
 for(const term of ['Plazo: 8 días','Plazo: 2 días',
   'Plazo: 3 días\nPlazo: 7 días','Plazo: mañana']){
  const h=harness(input({textoVerificado:full+'\n'+term}));
  assert.equal((await h.processor.procesar(m1)).estado,'requiere_revision_interna');
  assert.equal(h.counts.created,0);assert.equal(h.counts.planned,0);
 }
});
