import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {cifrarDestinatarioD068,descifrarDestinatarioD068,
 crearResolverInvitacionD068} from '../../src/server/whapi-encrypted-recipient-d068.ts';

const SUPPLIER='bbbbbbbb-0016-4016-8016-000000000662';
const OTHER='bbbbbbbb-0016-4016-8016-000000000663';
const ROUND='dddddddd-0016-4016-8016-000000000661';
const CHANNEL='d065_ci';
const PHONE='5492211234567';
const k={hmacIdentity:randomBytes(32),recipientAes:randomBytes(32)};
const seal=()=>cifrarDestinatarioD068({
 channel:CHANNEL,supplierOrgId:SUPPLIER,to:PHONE,cryptoKeyId:'recip_ci'
},k);
const packet={
 roundId:ROUND,supplierOrgId:SUPPLIER,channel:CHANNEL,deliveryZone:'La Plata',
 vatRequest:'no_especificado',
 items:[{lineNo:1,productCode:'cemento_001',label:'Cemento CPC 50 kg',
  quantity:'10.000',unit:'bag'}]
};
test('D068 AES-GCM: recupera el chat EXACTO y nunca expone teléfono al SQL',()=>{
 const a=seal(),b=seal();
 assert.equal(descifrarDestinatarioD068(a,k),PHONE);
 assert.equal(a.chatKey,b.chatKey);
 assert.notEqual(a.nonceHex,b.nonceHex);
 assert.notEqual(a.cipherHex,b.cipherHex);
 assert.equal(Object.keys(a).sort().join(','),
  'channel,chatKey,cipherHex,cryptoKeyId,nonceHex,supplierOrgId,tagHex');
 assert.equal(JSON.stringify(a).includes(PHONE),false);
 assert.equal(JSON.stringify(a).includes('@s.whatsapp.net'),false);
 assert.equal(a.cipherHex.length>40,true);
});
test('D068 rechaza cambios de proveedor, canal, HMAC, nonce, tag, cifrado o clave',()=>{
 const a=seal();
 for(const changed of [
  {...a,supplierOrgId:OTHER},
  {...a,channel:'other_chan'},
  {...a,chatKey:'a'.repeat(64)},
  {...a,cryptoKeyId:'other_ci'},
  {...a,nonceHex:'0'.repeat(24)},
  {...a,tagHex:'0'.repeat(32)},
  {...a,cipherHex:'0'.repeat(a.cipherHex.length)},
  {...a,plaintext:PHONE}
 ]){
  assert.throws(()=>descifrarDestinatarioD068(changed,k),
   /d068_recipient_unavailable/);
 }
 assert.throws(()=>descifrarDestinatarioD068(a,{
  ...k,recipientAes:randomBytes(32)}),/d068_recipient_unavailable/);
 assert.throws(()=>descifrarDestinatarioD068(a,{
  ...k,hmacIdentity:randomBytes(32)}),/d068_recipient_unavailable/);
});
test('D068 no cifra IDs de grupos, texto con SQL, números cortos ni claves iguales',()=>{
 for(const to of [
  '','0','549221','+5492211234567','5492211234567@c.us',
  '5492211234567@s.whatsapp.net','5492211234567;DROP', '1234567890123456'
 ]){
  assert.throws(()=>cifrarDestinatarioD068({
   channel:CHANNEL,supplierOrgId:SUPPLIER,to,cryptoKeyId:'recip_ci'
  },k),/d068_recipient_unavailable/);
 }
 assert.throws(()=>seal()&&cifrarDestinatarioD068({
  channel:CHANNEL,supplierOrgId:SUPPLIER,to:PHONE,cryptoKeyId:'recip_ci'
 },{hmacIdentity:k.hmacIdentity,recipientAes:k.hmacIdentity}),
 /d068_recipient_unavailable/);
});
test('D068 resolver lee exclusivamente SQL privada con 4 argumentos fijos y formatea alcance',async()=>{
 const s=seal();const calls=[];
 const broker=crearResolverInvitacionD068({
  committedRpc:async(sql,args)=>{calls.push({sql,args});
   return{payload:{packet,chatKey:s.chatKey,cryptoKeyId:s.cryptoKeyId,
    nonceHex:s.nonceHex,cipherHex:s.cipherHex,tagHex:s.tagHex}};
  }
 },k);
 const r=await broker.preparar({
  roundId:ROUND,supplierOrgId:SUPPLIER,channel:CHANNEL,chatKey:s.chatKey
 });
 assert.equal(r.estado,'preparado_sin_envio');
 assert.equal(r.to,PHONE);
 assert.match(r.body,/Cemento CPC 50 kg/);
 assert.match(r.body,/Entrega: La Plata/);
 assert.doesNotMatch(r.body,/Confirmo|Pintura/);
 assert.equal(calls.length,1);
 assert.match(calls[0].sql,/whapi_read_recipient_packet_d068/);
 assert.deepEqual(calls[0].args,[ROUND,SUPPLIER,CHANNEL,s.chatKey]);
 assert.equal(JSON.stringify(calls).includes(PHONE),false);
});
test('D068 no prepara mensajes si respuesta SQL nula, ajena, adulterada o expuesta',async()=>{
 const s=seal();
 const base={packet,chatKey:s.chatKey,cryptoKeyId:s.cryptoKeyId,
  nonceHex:s.nonceHex,cipherHex:s.cipherHex,tagHex:s.tagHex};
 const broken=[
  null,{payload:null},{payload:{...base,phone:PHONE}},
  {payload:{...base,packet:{...packet,supplierOrgId:OTHER}}},
  {payload:{...base,packet:{...packet,items:[]}}},
  {payload:{...base,chatKey:'a'.repeat(64)}},
  {payload:{...base,cipherHex:'0'.repeat(s.cipherHex.length)}},
  {payload:{...base,packet:{...packet,deliveryZone:'La Plata\nDROP'}}}
 ];
 for(const out of broken){
  const worker=crearResolverInvitacionD068({
   committedRpc:async()=>out
  },k);
  await assert.rejects(worker.preparar({
   roundId:ROUND,supplierOrgId:SUPPLIER,channel:CHANNEL,chatKey:s.chatKey
  }),/d068_recipient_unavailable|d066_paquete_no_disponible/);
 }
});
test('D068 no consulta SQL con proveedor o HMAC inválido',async()=>{
 let n=0;const worker=crearResolverInvitacionD068({
  committedRpc:async()=>{n++;return null;}
 },k);
 await assert.rejects(worker.preparar({
  roundId:ROUND,supplierOrgId:'not-uuid',channel:CHANNEL,chatKey:'a'.repeat(64)
 }),/d068_recipient_unavailable/);
 await assert.rejects(worker.preparar({
  roundId:ROUND,supplierOrgId:SUPPLIER,channel:CHANNEL,chatKey:PHONE
 }),/d068_recipient_unavailable/);
 assert.equal(n,0);
});
test('D068 no es un sender: no fetch, no HTTP ni reintentos implícitos',async()=>{
 let calls=0;
 const worker=crearResolverInvitacionD068({
  committedRpc:async()=>{calls++;throw Error('backend secret')},fetcher:async()=>{
   throw Error('unreachable');
  }
 },k);
 await assert.rejects(worker.preparar({
  roundId:ROUND,supplierOrgId:SUPPLIER,channel:CHANNEL,chatKey:seal().chatKey
 }),/d068_recipient_unavailable/);
 assert.equal(calls,1);
});
