import test from 'node:test';
import assert from 'node:assert/strict';
import {crearAltaProveedorWhatsAppD072}
 from '../../src/server/whapi-supplier-self-enroll-d072.ts';
import {procesarWebhookWhapiAislado}
 from '../../src/server/whapi-inbound-offline.ts';
import {construirBrokerWhapiPrivado}
 from '../../src/server/whapi-crypto-broker.ts';

const CHANNEL='TEST_CHANNEL_24',BOT='5492211234567';
const SECRET='s'.repeat(48);
const ORG='bbbbbbbb-0024-4024-8024-000000000661';
const CHAT='5492211234568@s.whatsapp.net',NOW=1800000000;
const CODE='a'.repeat(32);
function instance({
 enabled=true,issue=async()=>({payload:{state:'issued',code:CODE,expiresSeconds:900}}),
 consume=async()=>({payload:{state:'registered',supplierOrgId:ORG}}),
 enroll=async()=>({estado:'registrado'})
}={}){
 const calls={issue:[],consume:[],enroll:[]};
 const alta=crearAltaProveedorWhatsAppD072({
  habilitado:enabled,channel:CHANNEL,botNumber:BOT,
  identityHmac:Buffer.alloc(32,9),
  emitir:async(q,args)=>{calls.issue.push({q,args});return issue(q,args)},
  consumir:async(q,args)=>{calls.consume.push({q,args});return consume(q,args)},
  enrolar:async(d)=>{calls.enroll.push(d);return enroll(d)}
 });
 return {alta,calls};
}
test('D072 link wa.me tiene mensaje opt-in prellenado sin enviar nada',async()=>{
 const {alta,calls}=instance();
 const r=await alta.enlaceParaProveedor(ORG);
 assert.equal(r.estado,'enlace_generado');
 const u=new URL(r.url);
 assert.equal(u.origin,'https://wa.me');
 assert.equal(u.pathname,'/'+BOT);
 assert.equal(u.searchParams.get('text'),'COTI ALTA '+CODE);
 assert.equal(r.venceEnSegundos,900);
 assert.equal(calls.issue.length,1);
 assert.deepEqual(calls.issue[0].args,[ORG,CHANNEL]);
 assert.equal(calls.consume.length,0);
 assert.equal(calls.enroll.length,0);
});
test('D072 no permite emisión deshabilitada ni IDs inyectados',async()=>{
 const {alta,calls}=instance({enabled:false});
 await assert.rejects(alta.enlaceParaProveedor(ORG),/d072_alta_no_disponible/);
 await assert.rejects(alta.enlaceParaProveedor('not-uuid'),/d072_alta_no_disponible/);
 assert.equal(calls.issue.length,0);
});
test('D072 evento inbound verificado consume token y guarda HMAC sin teléfono SQL',async()=>{
 const {alta,calls}=instance();
 const r=await alta.registrarAlta(CHANNEL,CHAT,'msg.test-0024001',
  'COTI ALTA '+CODE,NOW);
 assert.equal(r,'registrada');
 assert.equal(calls.consume.length,1);
 const args=calls.consume[0].args;
 assert.equal(args[0],CHANNEL);
 assert.equal(args[1],CODE);
 assert.match(args[2],/^[a-f0-9]{64}$/);
 assert.match(args[3],/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(args).includes('549221'));
 assert.deepEqual(calls.enroll,[{channel:CHANNEL,supplierOrgId:ORG,to:'5492211234568'}]);
});
test('D072 replay mismo evento idempotente',async()=>{
 const {alta}=instance({consume:async()=>({payload:{
  state:'already_registered',supplierOrgId:ORG}}),
 enroll:async()=>({estado:'ya_registrado'})});
 assert.equal(await alta.registrarAlta(CHANNEL,CHAT,'msg.test-0024001',
  'COTI ALTA '+CODE,NOW),'duplicada');
});
test('D072 nunca confía en respuestas de SQL incompletas, mixtas o falsas',async()=>{
 for(const payload of [null,{},{
  state:'registered',supplierOrgId:ORG,phone:'5492211234568'},
  {state:'registered',supplierOrgId:'not-a-uuid'},
  {state:'pending',supplierOrgId:ORG}]){
  const {alta,calls}=instance({consume:async()=>({payload})});
  await assert.rejects(alta.registrarAlta(CHANNEL,CHAT,'msg.test-0024001',
    'COTI ALTA '+CODE,NOW),/d072_alta_no_disponible/);
  assert.equal(calls.enroll.length,0);
 }
});
test('D072 falla cerrado si el cifrado D069 no termina',async()=>{
 const {alta}=instance({enroll:async()=>{throw Error('db-offline')}});
 await assert.rejects(alta.registrarAlta(CHANNEL,CHAT,'msg.test-0024001',
  'COTI ALTA '+CODE,NOW),/d072_alta_no_disponible/);
});
test('D072 token/canal/chat mal formado no llama a SQL',async()=>{
 const {alta,calls}=instance();
 for(const args of [
  ['otro',CHAT,'msg.test-0024001','COTI ALTA '+CODE,NOW],
  [CHANNEL,'grupo@g.us','msg.test-0024001','COTI ALTA '+CODE,NOW],
  [CHANNEL,CHAT,'mal','COTI ALTA '+CODE,NOW],
  [CHANNEL,CHAT,'msg.test-0024001','COTI ALTA '+CODE.slice(1),NOW],
  [CHANNEL,CHAT,'msg.test-0024001','BAJA',NOW]
 ]){
  await assert.rejects(alta.registrarAlta(...args),/d072_alta_no_disponible/);
 }
 assert.equal(calls.consume.length,0);
});
test('D027 webhook autenticado: alta antes de ronda, sin resolver invitación',async()=>{
 const {alta,calls}=instance();
 let resolved=0;
 const req=(secret=SECRET,body='COTI ALTA '+CODE,me=false)=>new Request(
 'https://example.test/whapi',{method:'POST',headers:{
  'content-type':'application/json','x-cotironda-webhook-key':secret},
 body:JSON.stringify({channel_id:CHANNEL,event:{type:'messages',event:'post'},
  messages:[{id:'msg.test-0024001',from_me:me,from:'5492211234568',
   chat_id:CHAT,type:'text',timestamp:NOW,text:{body}}]})});
 const dep={habilitado:true,canalId:CHANNEL,secretoWebhook:SECRET,
  ahoraUnix:()=>NOW,
  resolverProveedor:async()=>{resolved++;return null;},
  persistirEntrada:async()=>{throw Error('must not persist quote')},
  registrarAlta:alta.registrarAlta};
 assert.equal((await procesarWebhookWhapiAislado(req('wrong'),dep)).status,401);
 assert.equal((await procesarWebhookWhapiAislado(req(SECRET,undefined,true),dep)).status,204);
 assert.equal(calls.consume.length,0);
 const response=await procesarWebhookWhapiAislado(req(),dep);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.altasRegistradas,1);
 assert.equal(data.mensajesEnviados,0);
 assert.equal(data.presupuestosConfirmados,0);
 assert.equal(resolved,0);
 assert.equal(calls.consume.length,1);
});
test('D029 broker reutiliza enlace D072 solo si lo inyecta el servidor',async()=>{
 const {alta}=instance();
 const broker=construirBrokerWhapiPrivado({
  channel:CHANNEL,secretoWebhook:SECRET,habilitado:true,ahoraUnix:()=>NOW,
  claves:{identidadHmac:Buffer.alloc(32,9),huellaHmac:Buffer.alloc(32,8),
    contenidoAes:Buffer.alloc(32,7)},
  almacen:{resolverVinculo:async()=>null,registrarEntrada:async()=>{throw Error()},
   registrarBaja:async()=>{throw Error()}},
  enroladorAlta:alta
 });
 assert.equal(typeof broker.dependencias.registrarAlta,'function');
 const r=await broker.dependencias.registrarAlta(CHANNEL,CHAT,'msg.test-0024001',
  'COTI ALTA '+CODE,NOW);
 assert.equal(r,'registrada');
});
