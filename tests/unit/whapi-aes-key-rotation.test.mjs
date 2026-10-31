import test from 'node:test';
import assert from 'node:assert/strict';
import {construirBrokerWhapiPrivado} from '../../src/server/whapi-crypto-broker.ts';
import {procesarWebhookWhapiAislado} from '../../src/server/whapi-inbound-offline.ts';
import {crearPuertoPostgresWhapiD030} from '../../src/server/whapi-postgres-gateway.ts';

const CHANNEL='whapi_rotation_ci',CHAT='5492211234567@s.whatsapp.net',NOW=1800000000;
const ORG='bbbbbbbb-0000-4000-8000-000000000302';
const ROUND='dddddddd-0000-4000-8000-000000000304';
const HMAC_A=Buffer.alloc(32,18),HMAC_B=Buffer.alloc(32,39);
const AES_A=Buffer.alloc(32,54),AES_B=Buffer.alloc(32,76);
const SECRET='w'.repeat(48);
const msg=id=>({id,chat_id:CHAT,from:'5492211234567',from_me:false,
 timestamp:NOW,type:'text',text:{body:'Cemento 50 bolsas $8000'}});
function message(id){
 return new Request('https://ci.invalid/whapi',{method:'POST',
 headers:{'content-type':'application/json','x-cotironda-webhook-key':SECRET},
 body:JSON.stringify({channel_id:CHANNEL,event:{type:'messages',event:'post'},
   messages:[msg(id)]})});
}
function harness(){
 const rows=new Map(),calls=[],base={
   resolverVinculo:async()=>({supplierOrgId:ORG,roundId:ROUND,
     consentimientoVigente:true,invitacionVigente:true}),
   registrarEntrada:async entry=>{
     calls.push(entry);
     const existing=rows.get(entry.messageKey);
     if(existing){
       if(existing.fingerprint!==entry.fingerprint||
           existing.chatKey!==entry.chatKey||
           existing.kind!==entry.kind||
           existing.sourceUnix!==entry.sourceUnix)throw Error('collision');
       return {estado:'entrada_persistida',repetido:true};
     }
     rows.set(entry.messageKey,entry);
     return {estado:'entrada_persistida',repetido:false};
   },
   registrarBaja:async()=>({estado:'baja_registrada',repetido:false})
 };
 function make(keyId,aes,old={}){
   return construirBrokerWhapiPrivado({
    channel:CHANNEL,secretoWebhook:SECRET,habilitado:true,ahoraUnix:()=>NOW,
    claves:{identidadHmac:HMAC_A,huellaHmac:HMAC_B,contenidoAes:aes},
    contenidoKeyId:keyId,clavesLectura:old,almacen:base
   });
 }
 return {rows,calls,make};
}
test('rotar solo AES permite leer ambas generaciones, sin modificar HMAC del chat',async()=>{
 const {rows,calls,make}=harness();
 const first=make('aes_2026_a',AES_A);
 const r1=await procesarWebhookWhapiAislado(message('msg.key-0000001'),first.dependencias);
 assert.equal(r1.status,200);
 const second=make('aes_2026_b',AES_B,{aes_2026_a:AES_A});
 const r2=await procesarWebhookWhapiAislado(message('msg.key-0000002'),second.dependencias);
 assert.equal(r2.status,200);
 assert.equal(rows.size,2);
 assert.equal(calls[0].cryptoKeyId,'aes_2026_a');
 assert.equal(calls[1].cryptoKeyId,'aes_2026_b');
 for(const row of rows.values()){
   assert.equal(second.verificarContenido(row).texto,'Cemento 50 bolsas $8000');
 }
 assert.throws(()=>first.verificarContenido(calls[1]));
 const aKey=calls[0].messageKey,bKey=calls[1].messageKey;
 assert.notEqual(aKey,bKey);
 // La huella HMAC de un evento permanece estable luego de rotar solo AES.
 const retry=await procesarWebhookWhapiAislado(message('msg.key-0000001'),first.dependencias);
 assert.equal((await retry.json()).duplicadas,1);
 assert.equal(rows.size,2);
 // Reenvío idéntico después de rotar AES: debe ser reconocido como replay.
 const original=rows.get(aKey);
 const postRotation=await procesarWebhookWhapiAislado(
   message('msg.key-0000001'),second.dependencias);
 assert.equal(postRotation.status,200);
 assert.equal((await postRotation.json()).duplicadas,1);
 assert.equal(rows.size,2);
 assert.equal(rows.get(aKey),original);
 assert.equal(rows.get(aKey).cryptoKeyId,'aes_2026_a');
});
test('si cambia key-id en el registro, AAD rechaza descifrado aunque clave exista',async()=>{
 const {rows,make}=harness();
 const enc=make('aes_2026_a',AES_A);
 await procesarWebhookWhapiAislado(message('msg.key-0000003'),enc.dependencias);
 const row=[...rows.values()][0];
 const reader=make('aes_2026_b',AES_B,{aes_2026_a:AES_A});
 assert.throws(()=>reader.verificarContenido({...row,cryptoKeyId:'aes_2026_b'}));
 assert.throws(()=>reader.verificarContenido({...row,cryptoKeyId:'aes_missing'}));
 assert.throws(()=>reader.verificarContenido({...row,cryptoKeyId:'../secret'}));
});
test('rechaza ID activo inválido, reutilización de clave y duplicación histórica',()=>{
 const {make}=harness();
 assert.throws(()=>make('x',AES_A));
 assert.throws(()=>make('aes-escape',AES_A));
 assert.throws(()=>make('aes_2026_b',AES_A,{aes_2026_a:AES_A}));
 assert.throws(()=>make('aes_2026_b',AES_B,{aes_2026_a:AES_A,backup:AES_A}));
});
test('copiar claves antiguas: modificación posterior no borra capacidad de lectura',async()=>{
 const {make,rows}=harness();
 await procesarWebhookWhapiAislado(message('msg.key-0000004'),
   make('aes_2026_a',AES_A).dependencias);
 const historic=Buffer.from(AES_A);
 const b=make('aes_2026_b',AES_B,{aes_2026_a:historic});
 historic.fill(0);
 assert.equal(b.verificarContenido([...rows.values()][0]).texto,'Cemento 50 bolsas $8000');
});
test('gateway versionado pasa key-id como parámetro $10, sin interpolación',async()=>{
 let sql='',params=[];
 const gw=crearPuertoPostgresWhapiD030({query:async(s,p)=>{
   sql=s;params=[...p];return {rows:[{payload:{estado:'entrada_persistida',repetido:false}}]};
 }});
 const data={channel:CHANNEL,chatKey:'a'.repeat(64),messageKey:'b'.repeat(64),
   fingerprint:'c'.repeat(64),kind:'text',ciphertext:Buffer.from('x'),
   nonce:Buffer.alloc(12),tag:Buffer.alloc(16),sourceUnix:NOW,
   cryptoKeyId:'aes_2026_b'};
 assert.equal((await gw.registrarEntrada(data)).repetido,false);
 assert.match(sql,/whapi_inbox_record_keyed_v1/);
 assert.match(sql,/\$10::text/);
 assert.equal(params.length,10);assert.equal(params[9],'aes_2026_b');
 assert.equal(sql.includes('aes_2026_b'),false);
 await assert.rejects(()=>gw.registrarEntrada({...data,cryptoKeyId:'unsafe;drop'}),
   /whapi_gateway_no_disponible/);
 assert.equal(params.length,10);
});

test('mismo ID con precio distinto tras rotación falla sin modificar cotización',async()=>{
 const {rows,make}=harness();
 const first=make('aes_2026_a',AES_A);
 await procesarWebhookWhapiAislado(message('msg.key-0000008'),first.dependencias);
 const old=[...rows.values()][0];
 const second=make('aes_2026_b',AES_B,{aes_2026_a:AES_A});
 const altered=new Request('https://ci.invalid/whapi',{method:'POST',
  headers:{'content-type':'application/json','x-cotironda-webhook-key':SECRET},
  body:JSON.stringify({
    channel_id:CHANNEL,event:{type:'messages',event:'post'},
    messages:[{...msg('msg.key-0000008'),
      text:{body:'Cemento 50 bolsas $10000'}}]
  })});
 const reply=await procesarWebhookWhapiAislado(altered,second.dependencias);
 assert.equal(reply.status,503);
 assert.equal(rows.size,1);
 assert.equal([...rows.values()][0],old);
 assert.equal(second.verificarContenido(old).texto,'Cemento 50 bolsas $8000');
});
