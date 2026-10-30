import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPuertoPostgresWhapiD030} from '../../src/server/whapi-postgres-gateway.ts';
import {construirBrokerWhapiPrivado} from '../../src/server/whapi-crypto-broker.ts';
import {procesarWebhookWhapiAislado} from '../../src/server/whapi-inbound-offline.ts';

const CHANNEL='whapi_dev',CHAT='5492211234567@s.whatsapp.net';
const NUM='5492211234567',SECRET='q'.repeat(48),NOW=1800000000;
const ORG='bbbbbbbb-0000-4000-8000-000000000402';
const ROUND='dddddddd-0000-4000-8000-000000000404';
const IDKEY='1'.repeat(64);
const keys={identidadHmac:Buffer.alloc(32,16),
 huellaHmac:Buffer.alloc(32,72),contenidoAes:Buffer.alloc(32,44)};
const msg={id:'p.test-0000001',type:'text',from_me:false,
 from:NUM,chat_id:CHAT,timestamp:NOW,text:{body:'100 bolsas cemento 8500'}};
const payload=(m=msg)=>({event:{type:'messages',event:'post'},channel_id:CHANNEL,messages:[m]});
const request=(m=msg)=>new Request('https://test.invalid/inbound',{method:'POST',
 headers:{'content-type':'application/json','x-cotironda-webhook-key':SECRET},
 body:JSON.stringify(payload(m))});
const bound={supplierOrgId:ORG,roundId:ROUND,
 consentimientoVigente:true,invitacionVigente:true};
function harness(options={}){
 const calls=[], inbox=new Map(),bajas=new Map();
 let enabled=true, roundOpen=true;
 const db={async query(sql,params){
   calls.push({sql,params});
   if(options.throwDb)throw Error('pg private credential '+NUM);
   if(options.badOutput)return options.badOutput;
   if(sql.includes('whapi_resolve_active_contact_v1')){
     if(!enabled||!roundOpen)return {rows:[{payload:null}]};
     return {rows:[{payload:bound}]};
   }
   if(sql.includes('whapi_inbox_record_v1')){
     const [channel,chatKey,messageKey,fingerprint,kind,cipher,nonce,tag,timestamp]=params;
     if(!enabled||!roundOpen)throw Error('optout or round not active');
     const key=channel+'|'+messageKey;
     const old=inbox.get(key);
     if(old){
       if(old.fingerprint!==fingerprint||old.chatKey!==chatKey)throw Error('id_collision');
       return {rows:[{payload:{estado:'entrada_persistida',repetido:true}}]};
     }
     inbox.set(key,{channel,chatKey,messageKey,fingerprint,kind,
       ciphertext:cipher,nonce,tag,sourceUnix:timestamp});
     return {rows:[{payload:{estado:'entrada_persistida',repetido:false}}]};
   }
   if(sql.includes('whapi_record_optout_v1')){
     const [channel,chatKey,messageKey,fingerprint,timestamp]=params;
     const key=channel+'|'+messageKey;
     const old=bajas.get(key);
     if(old){
       if(old.fingerprint!==fingerprint)throw Error('optout collision');
       return {rows:[{payload:{estado:'baja_registrada',repetido:true}}]};
     }
     bajas.set(key,{channel,chatKey,messageKey,fingerprint,sourceUnix:timestamp});
     enabled=false;
     return {rows:[{payload:{estado:'baja_registrada',repetido:false}}]};
   }
   throw Error('unknown sql');
 }};
 const gateway=crearPuertoPostgresWhapiD030(db);
 const broker=construirBrokerWhapiPrivado({channel:CHANNEL,claves:keys,
  secretoWebhook:SECRET,habilitado:true,almacen:gateway,ahoraUnix:()=>NOW});
 return {calls,inbox,bajas,broker,gateway,
  setEnabled(v){enabled=v},setRoundOpen(v){roundOpen=v}};
}
test('D027→D029→D030: consulta vínculo, cifra y ejecuta SQL privado parametrizado',async()=>{
 const h=harness();const response=await procesarWebhookWhapiAislado(request(),h.broker.dependencias);
 assert.equal(response.status,200);
 assert.equal((await response.json()).guardadas,1);
 assert.equal(h.calls.length,2);
 const [lookup,save]=h.calls;
 assert.match(lookup.sql,/^select cotironda_private\.whapi_resolve_active_contact_v1\(\$1::text,\$2::text\)/);
 assert.deepEqual(lookup.params[0],CHANNEL);
 assert.match(lookup.params[1],/^[0-9a-f]{64}$/);
 assert.equal(lookup.sql.includes(NUM),false);
 assert.match(save.sql,/whapi_inbox_record_v1\(\$1::text,\$2::text,\$3::text/);
 assert.equal(save.params.length,9);
 assert.equal(Buffer.isBuffer(save.params[5]),true);
 assert.equal(Buffer.isBuffer(save.params[6]),true);
 assert.equal(Buffer.isBuffer(save.params[7]),true);
 assert.equal(save.params[6].length,12);
 assert.equal(save.params[7].length,16);
 assert.equal(JSON.stringify(save.params.slice(0,5)).includes(NUM),false);
 assert.equal(save.sql.includes('8500'),false);
 assert.deepEqual(h.broker.verificarContenido([...h.inbox.values()][0]),
  {tipo:'text',texto:msg.text.body,marcaTiempoUnix:NOW});
});
test('reintentos usan la misma ID y huella, aun con nonce nuevo',async()=>{
 const h=harness();await procesarWebhookWhapiAislado(request(),h.broker.dependencias);
 const r=await procesarWebhookWhapiAislado(request(),h.broker.dependencias);
 assert.equal((await r.json()).duplicadas,1);assert.equal(h.inbox.size,1);
 const writes=h.calls.filter(c=>c.sql.includes('inbox_record_v1'));
 assert.equal(writes.length,2);
 assert.equal(writes[0].params[2],writes[1].params[2]);
 assert.equal(writes[0].params[3],writes[1].params[3]);
 assert.notDeepEqual(writes[0].params[6],writes[1].params[6]);
});
test('mismo ID con precios diferentes no sobrescribe cotización ni recibe ACK',async()=>{
 const h=harness();await procesarWebhookWhapiAislado(request(),h.broker.dependencias);
 const r=await procesarWebhookWhapiAislado(request({...msg,
  text:{body:'cemento $1'}}),h.broker.dependencias);
 assert.equal(r.status,503);assert.equal(h.inbox.size,1);
});
test('BAJA independiente de ronda activa: SQL privado y sin texto ni teléfono',async()=>{
 const h=harness();h.setRoundOpen(false);
 const r=await procesarWebhookWhapiAislado(request({...msg,
  text:{body:' BAJA '}}),h.broker.dependencias);
 assert.equal(r.status,200);assert.equal((await r.json()).bajasRegistradas,1);
 assert.equal(h.calls.length,1);assert.match(h.calls[0].sql,/whapi_record_optout_v1/);
 assert.equal(h.calls[0].params.length,5);
 assert.equal(JSON.stringify(h.calls[0].params).includes(NUM),false);
 assert.equal(h.bajas.size,1);assert.equal(h.inbox.size,0);
 const r2=await procesarWebhookWhapiAislado(request({...msg,
  text:{body:' BAJA '}}),h.broker.dependencias);
 assert.equal((await r2.json()).duplicadas,1);
 assert.equal(h.bajas.size,1);
 const r3=await procesarWebhookWhapiAislado(request({...msg,
  id:'p.test-0000002'}),h.broker.dependencias);
 assert.equal(r3.status,403);
});
test('dos rondas o sin consentimiento: resolver null y no escribir',async()=>{
 const h=harness();h.setRoundOpen(false);
 assert.equal((await procesarWebhookWhapiAislado(request(),
  h.broker.dependencias)).status,403);
 assert.equal(h.calls.length,1);
 assert.equal(h.inbox.size,0);
});
test('fallas de PostgreSQL NO filtran mensajes SQL, chat ni credenciales',async()=>{
 const h=harness({throwDb:true});
 const r=await procesarWebhookWhapiAislado(request(),h.broker.dependencias);
 assert.equal(r.status,503);
 const body=await r.text();
 assert.equal(body.includes(NUM),false);
 assert.equal(body.includes('credential'),false);
 assert.equal(body.includes('postgres'),false);
 assert.equal(h.inbox.size,0);
});
test('respuestas anómalas de la BD se rechazan: nunca crear recibo falso',async()=>{
 for(const badOutput of [{rows:[]},{rows:[{payload:bound},{payload:bound}]},
   {rows:[{payload:{...bound,phone:NUM}}]}, {rows:[{payload:{...bound,invitacionVigente:false}}]}]){
   const h=harness({badOutput});
   const r=await procesarWebhookWhapiAislado(request(),h.broker.dependencias);
   assert.equal(r.status,503);
 }
});
test('puerto rechaza bytea truncado o inválido antes de ejecutar SQL',async()=>{
 let calls=0;
 const gateway=crearPuertoPostgresWhapiD030({query:async()=>{
   calls++;return {rows:[{payload:{estado:'entrada_persistida',repetido:false}}]}};
 }});
 const data={channel:CHANNEL,chatKey:IDKEY,messageKey:IDKEY,
 fingerprint:IDKEY,kind:'text',ciphertext:Buffer.from('x'),
 nonce:Buffer.alloc(12),tag:Buffer.alloc(16),sourceUnix:NOW};
 for(const bad of [{...data,nonce:Buffer.alloc(11)},
   {...data,tag:Buffer.alloc(15)},
   {...data,ciphertext:Buffer.alloc(8193)},
   {...data,channel:'bad;drop table users;'},
   {...data,chatKey:'too short'},
   {...data,sourceUnix:NaN}]){
   await assert.rejects(()=>gateway.registrarEntrada(bad),/whapi_gateway_no_disponible/);
 }
 assert.equal(calls,0);
});
test('no acepta respuestas que afirmen success sin los campos exactos',async()=>{
 for(const response of [
  {estado:'entrada_persistida',repetido:'false'},
  {estado:'entrada_persistida',repetido:false,phone:NUM},
  {estado:'cotizacion_confirmada',repetido:false},
  null
 ]){
   const gw=crearPuertoPostgresWhapiD030({query:async()=>({rows:[{payload:response}]})});
   await assert.rejects(()=>gw.registrarEntrada({
    channel:CHANNEL,chatKey:IDKEY,messageKey:IDKEY,fingerprint:IDKEY,
    kind:'text',ciphertext:Buffer.from('x'),nonce:Buffer.alloc(12),
    tag:Buffer.alloc(16),sourceUnix:NOW
   }),/whapi_gateway_no_disponible/);
 }
});
test('sin driver SQL valido nunca expone un gateway operativo',()=>{
 assert.throws(()=>crearPuertoPostgresWhapiD030(null),/whapi_gateway_no_disponible/);
 assert.throws(()=>crearPuertoPostgresWhapiD030({query:7}),/whapi_gateway_no_disponible/);
});
