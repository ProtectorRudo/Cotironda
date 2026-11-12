import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analizarOriginalTextoConIAV2}
 from '../../src/server/v2-04-analisis-individual.ts';

const original=[
 'COTIZACIÓN DE MATERIALES — Obra particular:',
 '100 bolsas de cemento Portland 50 kg a $9.850 cada una.',
 'Entrega indicada: zona La Plata, dentro de 72 horas.',
 'Pago: transferencia bancaria anticipada.',
 'Se incluyen 20 bolsas de adhesivo 25 kg adicionales.'
].join('\n');
const sha=createHash('sha256').update(original,'utf8').digest('hex');
const doc='a5a6f7a8-2cef-4aab-9c27-0b4de51e187f';
const source={
 documentoId:doc,sha256:sha,tipo:'whatsapp_text',
 originalAutenticado:true,proveedorAutenticado:true,
 consentimientoOriginalVerificado:true,compradorAutorizado:true,
 fuente:original
};
const key='sk-test-not-real-1234567890abcdefghijkl';
const answer={
 status:'completed',
 output:[{type:'message',role:'assistant',content:[{
  type:'output_text',
  text:JSON.stringify({puntos:[
   {categoria:'presentacion',
    evidencia:'100 bolsas de cemento Portland 50 kg',
    observacion:'Cementos en bultos de 50 kg; conviene contrastar la presentación solicitada.'},
   {categoria:'flete',
    evidencia:'Entrega indicada: zona La Plata, dentro de 72 horas.',
    observacion:'El proveedor menciona un plazo de entrega para La Plata; revisar las condiciones completas en el original.'},
   {categoria:'forma_pago',
    evidencia:'Pago: transferencia bancaria anticipada.',
    observacion:'La transferencia anticipada es una condición comercial para considerar.'}
  ]})
 }]}]
};
function fake(reply=answer){
 return async (url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(options.redirect,'error');
  assert.equal(options.credentials,'omit');
  const body=JSON.parse(options.body);
  assert.equal(body.store,false);
  assert.deepEqual(body.tools,[]);
  assert.equal(body.model,'gpt-6-luna');
  assert.ok(!options.body.includes('user_phone'));
  return new Response(JSON.stringify(reply),{
   status:200,headers:{'content-type':'application/json'}
  });
 };
}
const go=(sourceOverride={},fetchImpl=fake())=>analizarOriginalTextoConIAV2({
 fuente:{...source,...sourceOverride},apiKey:key,model:'gpt-6-luna',fetchImpl
});
test('V2-04: fuente verificada genera guía breve con cita original y sin ranking',async()=>{
 const r=await go();
 assert.equal(r.estado,'analisis_disponible');
 assert.equal(r.puntos.length,3);
 assert.equal(r.originalPermaneceDisponible,true);
 assert.equal(r.whatsappEnviado,false);
 assert.equal(r.titulo,'Lo importante de este presupuesto');
 assert.ok(r.puntos.every(p=>original.includes(p.evidencia)));
 assert.equal(r.puntos[1].categoria,'flete');
 assert.ok(!JSON.stringify(r).includes('ganador'));
});
test('V2-04: falta de consentimiento u origen auténtico no llama IA',async()=>{
 let called=0;
 for(const key of ['originalAutenticado','proveedorAutenticado',
 'consentimientoOriginalVerificado','compradorAutorizado']){
  const r=await go({[key]:false},async()=>{called++;throw Error('fake network');});
  assert.equal(r.estado,'analisis_pendiente');
  assert.equal(r.originalPermaneceDisponible,true);
 }
 assert.equal(called,0);
});
test('V2-04: modificación fuente o SHA bloquea análisis y conserva original',async()=>{
 const r=await go({fuente:original+' \nTOTAL INVENTADO'},
  async()=>{throw Error('unexpected')});
 assert.equal(r.estado,'analisis_pendiente');
 assert.equal(r.codigo,'huella_textual_incorrecta');
});
test('V2-04: IA que inventa una cita no puede publicarla',async()=>{
 const corrupted=structuredClone(answer);
 const payload=JSON.parse(corrupted.output[0].content[0].text);
 payload.puntos[1].evidencia='Flete gratis e IVA incluido';
 corrupted.output[0].content[0].text=JSON.stringify(payload);
 const r=await go({},fake(corrupted));
 assert.equal(r.estado,'analisis_pendiente');
 assert.equal(r.codigo,'evidencias_ia_no_comprobadas');
 assert.deepEqual(r.puntos,[]);
});
test('V2-04: datos privados en observación no se muestran',async()=>{
 for(const bad of ['Comunicate a 221 555 2222 para pagar.',
  'Escribí a contacto@obras.com',
  'Ver https://proveedor.com para descuentos']){
  const corrupted=structuredClone(answer);
  const payload=JSON.parse(corrupted.output[0].content[0].text);
  payload.puntos[0].observacion=bad;
  corrupted.output[0].content[0].text=JSON.stringify(payload);
  const r=await go({},fake(corrupted));
  assert.equal(r.estado,'analisis_pendiente');
 }
});
test('V2-04: cifras o IVA/flete inventados en una observación no pasan',async()=>{
 for(const wrong of [
  'El precio acordado es $65.000 y corresponde abonarlo ahora.',
  'El IVA incluido se detalla explícitamente en esta oferta.',
  'Flete gratis en todas las compras, sin excepción.',
  'IVA no informado por este proveedor.'
 ]){
  const altered=structuredClone(answer);
  const doc=JSON.parse(altered.output[0].content[0].text);
  doc.puntos[0].observacion=wrong;
  altered.output[0].content[0].text=JSON.stringify(doc);
  const r=await go({},fake(altered));
  assert.equal(r.estado,'analisis_pendiente',wrong);
 }
});
test('V2-04: no acepta rankings o ganadores engañosos',async()=>{
 const corrupted=structuredClone(answer);
 const payload=JSON.parse(corrupted.output[0].content[0].text);
 payload.puntos[0].observacion='Es la mejor oferta del mercado, recomendamos adjudicar.';
 corrupted.output[0].content[0].text=JSON.stringify(payload);
 const r=await go({},fake(corrupted));
 assert.equal(r.estado,'analisis_pendiente');
});
test('V2-04: error HTTP, timeout o formato invalido NO bloquean original',async()=>{
 const unreachable=async()=>new Response('Not available',{status:503});
 const a=await go({},unreachable);
 assert.equal(a.estado,'analisis_pendiente');
 assert.equal(a.originalPermaneceDisponible,true);
 const b=await go({},async()=>{throw Error('network')});
 assert.equal(b.estado,'analisis_pendiente');
 const c=await go({},fake({status:'incomplete',output:[]}));
 assert.equal(c.estado,'analisis_pendiente');
});
test('V2-04: no llama IA si texto no existe o es ilegible',async()=>{
 let called=0;
 const a=await go({fuente:'PDF binario sin texto'},
  async()=>{called++;return new Response('{}')});
 assert.equal(a.estado,'analisis_pendiente');
 assert.equal(called,0);
});
