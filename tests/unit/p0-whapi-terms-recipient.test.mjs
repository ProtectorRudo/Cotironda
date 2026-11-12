import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash,createHmac} from 'node:crypto';
import {crearResolverContactoProveedorP0}
 from '../../src/server/whapi-terms-recipient-p0.ts';

const CHANNEL='pilot_whapi_ci',TO='5492211234567';
const HMAC=Buffer.alloc(32,61),AES=Buffer.alloc(32,33);
const UUID='eeeeeeee-0000-4000-8000-000000000551';
const LEASE='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PHONE_CHAT=TO+'@s.whatsapp.net';
const chatHmac=createHmac('sha256',HMAC)
 .update('cotironda|pilot|chat|'+CHANNEL+'|'+PHONE_CHAT).digest('hex');
const contactSha=createHash('sha256').update(PHONE_CHAT).digest('hex');
const claim={state:'leased',jobId:UUID,leaseToken:LEASE,
 supplierKey:'corralon_ailin',channel:CHANNEL,chatHmac,
 termsVersion:'cotironda-originales-alta-v1',
 termsSha256:'a'.repeat(64),body:'texto de condiciones'};
const nonce=Buffer.from('0102030405060708090a0b0c','hex');
function packet(text=PHONE_CHAT,changes={}){
 const cipher=createCipheriv('aes-256-gcm',AES,nonce);
 cipher.setAAD(Buffer.from(chatHmac+'|cotironda-contact-v1','utf8'));
 const encrypted=Buffer.concat([cipher.update(text,'utf8'),cipher.final(),
  cipher.getAuthTag()]);
 return {
  state:'ready',jobId:UUID,leaseToken:LEASE,
  supplierKey:'corralon_ailin',channel:CHANNEL,chatHmac,
  contactSha256:contactSha,
  nonceB64:nonce.toString('base64'),
  ciphertextB64:encrypted.toString('base64'),...changes
 };
}
const env=(payload=packet(),keys={pilotHmacKey:HMAC,contactAesKey:AES,channel:CHANNEL})=>{
 const calls=[];
 const resolver=crearResolverContactoProveedorP0({
  committedRpc:async(sql,args)=>{calls.push({sql,args});return {payload}}
 },keys);
 return {calls,resolver};
};
test('P0: recupera solo número desde paquete AES-GCM real del webhook piloto',async()=>{
 const x=env();
 assert.equal(await x.resolver(claim),TO);
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].sql,
  'select cotironda_piloto_privado.terms_recipient_packet_p0($1::uuid,$2::uuid) as payload');
 assert.deepEqual(x.calls[0].args,[UUID,LEASE]);
});
test('P0: no usa D068 ni HMAC por JSON-array distinto del webhook',async()=>{
 const d029=createHmac('sha256',HMAC)
  .update(JSON.stringify(['cotironda','chat',1,CHANNEL,PHONE_CHAT]))
  .digest('hex');
 const x=env(packet(undefined,{chatHmac:d029}));
 await assert.rejects(x.resolver(claim),/p0_contacto_cifrado_no_disponible/u);
});
test('P0: no obtiene número de otra empresa, lease ni chat',async()=>{
 for(const bad of [
  {supplierKey:'corralon_nahuel'}, {leaseToken:UUID},
  {jobId:LEASE},{channel:'another_channel'},
  {chatHmac:'f'.repeat(64)}, {contactSha256:'b'.repeat(64)},
  {state:'not_ready'}, {nonceB64:'not/base64'}, 
  {ciphertextB64:packet().ciphertextB64.slice(0,-4)+'AAAA'},
  {extra:'unexpected'}, {}
 ]){
  const x=env(Object.keys(bad).length===0?null:packet(undefined,bad));
  await assert.rejects(x.resolver(claim),/p0_contacto_cifrado_no_disponible/u,
   JSON.stringify(bad));
 }
});
test('P0: plaintext falsificado, tag alterado o AAD erróneo bloquean',async()=>{
 const p=packet();
 const cases=[
  packet('5492219999999@s.whatsapp.net'),
  packet('5492211234567@evil.net'),
  {...p,ciphertextB64:'AA'+p.ciphertextB64.slice(2)},
  {...p,nonceB64:Buffer.alloc(12,0).toString('base64')}
 ];
 for(const bad of cases){
  await assert.rejects(env(bad).resolver(claim),
   /p0_contacto_cifrado_no_disponible/u);
 }
});
test('P0: falla de SQL o uso de otra clave de piloto nunca filtra contacto',async()=>{
 const errors=crearResolverContactoProveedorP0({
  committedRpc:async()=>{throw Error('secret DB URL');}
 },{pilotHmacKey:HMAC,contactAesKey:AES,channel:CHANNEL});
 await assert.rejects(errors(claim),
  e=>e.message==='p0_contacto_cifrado_no_disponible');
 const badKey=env(packet(),{
  pilotHmacKey:Buffer.alloc(32,7),contactAesKey:AES,channel:CHANNEL
 });
 await assert.rejects(badKey.resolver(claim),
  /p0_contacto_cifrado_no_disponible/u);
 for(const config of [
  {pilotHmacKey:HMAC,contactAesKey:HMAC,channel:CHANNEL},
  {pilotHmacKey:HMAC,contactAesKey:Buffer.alloc(3),channel:CHANNEL}
 ]) assert.throws(()=>crearResolverContactoProveedorP0({
  committedRpc:async()=>({payload:packet()})
 },config),/p0_contacto_cifrado_no_disponible/u);
});
test('P0: caller no puede pedir otro empleo o revivir lease con claim adulterado',async()=>{
 const x=env();
 for(const alteration of [
  {jobId:LEASE},{leaseToken:'wrong'}, {chatHmac:'f'.repeat(64)},
  {channel:'external'}, {unexpected:'x'}
 ]){
  await assert.rejects(x.resolver({...claim,...alteration}),
   /p0_contacto_cifrado_no_disponible/u);
 }
 assert.equal(x.calls.length,0);
});
