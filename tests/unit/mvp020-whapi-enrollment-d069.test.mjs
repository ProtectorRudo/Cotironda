import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {crearEnroladorDestinatarioD069}
 from '../../src/server/whapi-recipient-enrollment-d069.ts';
import {construirBrokerWhapiPrivado} from '../../src/server/whapi-crypto-broker.ts';
import {procesarWebhookWhapiAislado} from '../../src/server/whapi-inbound-offline.ts';

const CH='whapi_dev_lab',TO='5492211234567',CHAT=TO+'@s.whatsapp.net';
const ORG='bbbbbbbb-0016-4016-8016-000000000662';
const OTHER='bbbbbbbb-0016-4016-8016-000000000663';
const ROUND='dddddddd-0016-4016-8016-000000000661';
const NOW=1800000000,SECRET='w'.repeat(48);
const key={hmacIdentity:Buffer.alloc(32,17),recipientAes:Buffer.alloc(32,90)};
const contact={channel:CH,supplierOrgId:ORG,to:TO};
function fixture(overrides={}){
 const calls=[],approvals=[];
 const config={habilitado:true,channel:CH,cryptoKeyId:'recip_ci',keys:key,
  autorizarContacto:async id=>{approvals.push(id);return true;},
  committedRpc:async(sql,args)=>{calls.push({sql,args});return{payload:{state:'saved'}};},
  ...overrides};
 return {calls,approvals,registrar:crearEnroladorDestinatarioD069(config)
   .registrarContactoVerificado};
}
test('D069 registro cifrado: consulta SQL sin teléfono y pide aprobación por HMAC',async()=>{
 const x=fixture(),out=await x.registrar(contact);
 assert.deepEqual(out,{estado:'registrado'});
 assert.equal(x.approvals.length,1);
 assert.deepEqual(Object.keys(x.approvals[0]).sort(),
   ['channel','chatKey','supplierOrgId'].sort());
 assert.match(x.approvals[0].chatKey,/^[a-f0-9]{64}$/);
 assert.equal(x.calls.length,1);
 assert.match(x.calls[0].sql,/whapi_store_recipient_d068/);
 assert.equal(x.calls[0].args.length,7);
 assert.deepEqual(x.calls[0].args.slice(0,4),
  [CH,x.approvals[0].chatKey,ORG,'recip_ci']);
 assert.equal(x.calls[0].args[4].length,24);
 assert.equal(x.calls[0].args[6].length,32);
 assert.equal(JSON.stringify(x.calls).includes(TO),false);
 assert.equal(JSON.stringify(x.approvals).includes(TO),false);
 assert.equal(JSON.stringify(x.calls).includes('@s.whatsapp.net'),false);
});
test('D069 replay DB y nonce aleatoria no crean otro contacto lógico',async()=>{
 const x=fixture({committedRpc:async(_sql,args)=>({payload:{state:'already_saved'}})});
 assert.deepEqual(await x.registrar(contact),{estado:'ya_registrado'});
 const y=fixture();
 await y.registrar(contact);await y.registrar(contact);
 assert.equal(y.calls.length,2);
 assert.equal(y.calls[0].args[1],y.calls[1].args[1]);
 assert.notEqual(y.calls[0].args[4],y.calls[1].args[4]);
});
test('D069 niega flag deshabilitado, canal cruzado e identidad incompleta sin consulta',async()=>{
 let n=0;
 const x=fixture({habilitado:false,
  committedRpc:async()=>{n++;return{payload:{state:'saved'}};}});
 await assert.rejects(x.registrar(contact),/d069_enrolamiento_no_autorizado/);
 const y=fixture({committedRpc:async()=>{n++;return{payload:{state:'saved'}};}});
 for(const bad of [
  {...contact,channel:'otro_canal'}, {...contact,to:'555'},
  {...contact,to:'+'+TO}, {...contact,supplierOrgId:'intruso'},
  {...contact,extra:true},null
 ]){
  await assert.rejects(y.registrar(bad),/d069_enrolamiento_no_autorizado/);
 }
 assert.equal(n,0);
});
test('D069 no persiste sin verificación efectiva o tras error de autorización',async()=>{
 let n=0;
 for(const authorize of [async()=>false,async()=>null,
   async()=>{throw Error('source secret');}]){
  const x=fixture({autorizarContacto:authorize,
    committedRpc:async()=>{n++;return{payload:{state:'saved'}};}});
  await assert.rejects(x.registrar(contact),/d069_enrolamiento_no_autorizado/);
 }
 assert.equal(n,0);
});
test('D069 falla cerrado si SQL rechaza BAJA, identidad, colisión o responde mal',async()=>{
 for(const answer of [
  null,{payload:null},{payload:{state:'saved',phone:TO}},
  {payload:{state:'success'}},{payload:{state:true}},{payload:{state:'saved'},pii:TO}
 ]){
  const x=fixture({committedRpc:async()=>answer});
  await assert.rejects(x.registrar(contact),/d069_enrolamiento_no_autorizado/);
 }
 const x=fixture({committedRpc:async()=>{throw Error('d068_contact_not_authorized')}});
 await assert.rejects(x.registrar(contact),/d069_enrolamiento_no_autorizado/);
});
test('D069 exige claves independientes y puerto privado sin redes',()=>{
 for(const keys of [null,{}, {hmacIdentity:'a'.repeat(32),
   recipientAes:key.recipientAes}, {hmacIdentity:key.hmacIdentity,
   recipientAes:key.hmacIdentity}, {hmacIdentity:Buffer.alloc(31),
   recipientAes:key.recipientAes}]){
  assert.throws(()=>fixture({keys}),/d069_enrolamiento_no_autorizado/);
 }
 assert.throws(()=>fixture({autorizarContacto:null}),/d069_enrolamiento_no_autorizado/);
 assert.throws(()=>fixture({committedRpc:null}),/d069_enrolamiento_no_autorizado/);
});
function incoming(){
 const msg={id:'p.test-0000020',from_me:false,type:'text',from:TO,
  chat_id:CHAT,timestamp:NOW,text:{body:'cemento $8500'}};
 return new Request('https://test.invalid/whapi',{
  method:'POST',headers:{'content-type':'application/json',
   'x-cotironda-webhook-key':SECRET},
  body:JSON.stringify({event:{type:'messages',event:'post'},channel_id:CH,
   messages:[msg]})});
}
function brokerFixture(overrides={}){
 const stores=[],links=[],attempts=[];
 const link={supplierOrgId:ORG,roundId:ROUND,
  consentimientoVigente:true,invitacionVigente:true};
 const state={link:link,fail:false};
 const enrolador=fixture({
  autorizarContacto:async id=>{attempts.push(id);return true;},
  committedRpc:async(sql,args)=>{stores.push({sql,args});return{payload:{state:'saved'}};}
 }).registrar;
 const almacen={
  resolverVinculo:async(_channel,chatKey)=>{links.push(chatKey);return state.link;},
  registrarEntrada:async()=>({estado:'entrada_persistida',repetido:false}),
  registrarBaja:async()=>({estado:'baja_registrada',repetido:false})
 };
 const broker=construirBrokerWhapiPrivado({
  channel:CH,claves:{identidadHmac:key.hmacIdentity,
   huellaHmac:Buffer.alloc(32,71),contenidoAes:Buffer.alloc(32,39)},
  secretoWebhook:SECRET,habilitado:true,ahoraUnix:()=>NOW,almacen,
  enroladorContacto:{registrarContactoVerificado:enrolador},
  ...overrides
 });
 return {broker,stores,links,attempts,state};
}
test('D069 D027→D029 registra destinatario solo tras entrada y vínculo verificados',async()=>{
 // Recipient AES and inbound-message AES have independent fixture keys.
 const x=brokerFixture();
 const response=await procesarWebhookWhapiAislado(incoming(),x.broker.dependencias);
 assert.equal(response.status,200);
 assert.equal((await response.json()).mensajesEnviados,0);
 assert.equal(x.stores.length,1);
 assert.equal(x.links.length,2);
 assert.equal(x.attempts.length,1);
 assert.equal(JSON.stringify(x.stores).includes(TO),false);
});
test('D069 rechaza webhook falso, cambio de proveedor o baja tras persistencia',async()=>{
 const x=brokerFixture();
 const forged=new Request('https://test.invalid/whapi',{
  method:'POST',headers:{'content-type':'application/json',
   'x-cotironda-webhook-key':'wrong'},
  body:JSON.stringify({event:{type:'messages',event:'post'},channel_id:CH,
   messages:[{id:'p.test-0000020'}]})});
 assert.equal((await procesarWebhookWhapiAislado(
  forged,x.broker.dependencias)).status,401);
 assert.equal(x.stores.length,0);
 let resolves=0;
 const y=brokerFixture({almacen:{
  resolverVinculo:async()=>{resolves++;return resolves===1?
   {supplierOrgId:ORG,roundId:ROUND,consentimientoVigente:true,invitacionVigente:true}:
   {supplierOrgId:OTHER,roundId:ROUND,consentimientoVigente:true,invitacionVigente:true};},
  registrarEntrada:async()=>({estado:'entrada_persistida',repetido:false}),
  registrarBaja:async()=>({estado:'baja_registrada',repetido:false})
 }});
 const bad=await procesarWebhookWhapiAislado(incoming(),y.broker.dependencias);
 assert.equal(bad.status,503);
 assert.equal(y.stores.length,0);
});
test('D069 no ejecuta enrolamiento si persistencia falla',async()=>{
 const x=brokerFixture({almacen:{
  resolverVinculo:async()=>({supplierOrgId:ORG,roundId:ROUND,
   consentimientoVigente:true,invitacionVigente:true}),
  registrarEntrada:async()=>{throw Error('db down');},
  registrarBaja:async()=>({estado:'baja_registrada',repetido:false})
 }});
 assert.equal((await procesarWebhookWhapiAislado(
  incoming(),x.broker.dependencias)).status,503);
 assert.equal(x.stores.length,0);
});
