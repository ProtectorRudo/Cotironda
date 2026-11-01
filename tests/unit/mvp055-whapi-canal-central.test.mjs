import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {atenderWebhookWhapiPreviewD083 as receive}
 from '../../src/server/whapi-preview-http-d083.ts';

// The single CENTRAL number belongs to Cotironda, not to each supplier.
// All phones below are fictional, test-only. No Whapi or DB network.
const CH='central_cotironda',NOW=1800000000;
const SECRET='coti-m055-secret-'.padEnd(64,'x');
const identities=[
 {role:'buyer',phone:'5492211111101',org:'aaaaaaaa-0055-4055-8055-000000000551'},
 {role:'buyer',phone:'5492211111102',org:'aaaaaaaa-0055-4055-8055-000000000552'},
 {role:'supplier',phone:'5492211111103',org:'bbbbbbbb-0055-4055-8055-000000000553'},
 {role:'supplier',phone:'5492211111104',org:'bbbbbbbb-0055-4055-8055-000000000554'},
 {role:'supplier',phone:'5492211111105',org:'bbbbbbbb-0055-4055-8055-000000000555'},
 {role:'supplier',phone:'5492211111106',org:'bbbbbbbb-0055-4055-8055-000000000556'}
];
const ROUND='cccccccc-0055-4055-8055-000000000551';
function hmacChat(phone){
 return createHmac('sha256',Buffer.from('01'.repeat(32),'hex'))
  .update(JSON.stringify(['cotironda','chat',1,CH,phone+'@s.whatsapp.net']))
  .digest('hex');
}
function env(){
 return {VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'integration/mvp-piloto-20261031',
  COTIRONDA_WHAPI_WEBHOOK_ENABLED:'true',
  COTIRONDA_WHAPI_PILOT_AUTHORIZED:'true',
  COTIRONDA_REGISTRATION_ENABLED:'false',
  COTIRONDA_WHAPI_CHANNEL:CH,
  COTIRONDA_WHAPI_WEBHOOK_SECRET:SECRET,
  COTIRONDA_WHAPI_AES_KEY_ID:'aes_2026_a',
  COTIRONDA_WHAPI_HMAC_ID_HEX:'01'.repeat(32),
  COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX:'02'.repeat(32),
  COTIRONDA_WHAPI_AES_CONTENT_HEX:'03'.repeat(32)};
}
function incoming(index,{text='10 bolsas cemento CPC 50 kg',fromMe=false}={}){
 const phone=identities[index].phone;
 return {id:'cotironda-m055-msg-'+index,chat_id:phone+'@s.whatsapp.net',
  from:phone,from_me:fromMe,type:'text',timestamp:NOW,text:{body:text}};
}
function request(messages,{channel=CH,secret=SECRET}={}){
 return new Request('https://private-preview.cotironda.invalid/api/integraciones/whapi',{
  method:'POST',
  headers:{'content-type':'application/json','x-cotironda-webhook-key':secret},
  body:JSON.stringify({channel_id:channel,
   event:{type:'messages',event:'post'},messages})});
}
function backend(){
 const people=new Map(identities.slice(0,5).map(person=>[hmacChat(person.phone),person]));
 const stored=new Map();
 const queries=[];
 let closed=0;
 const db=()=>({
  query:async(sql,params)=>{
   queries.push({sql,params});
   // Plain phone, materials and PII may never enter a SQL statement.
   assert.doesNotMatch(sql,/549221|cemento|cliente|arquitecto/i);
   if(sql.includes('whapi_resolve_active_contact_v1')){
    const i=people.get(params[1]);
    return {rows:[{payload:i?.role==='supplier'?{
     supplierOrgId:i.org,roundId:ROUND,
     consentimientoVigente:true,invitacionVigente:true
    }:null}]};
   }
   if(sql.includes('whapi_resolve_buyer_d074')){
    const i=people.get(params[1]);
    return {rows:[{payload:i?.role==='buyer'?{
     buyerOrgId:i.org,consentimientoContactoVigente:true,chatHabilitado:true
    }:null}]};
   }
   if(sql.includes('whapi_record_buyer_d074')||
      sql.includes('whapi_inbox_record_keyed_v1')){
    const i=people.get(params[1]);
    assert.ok(i);
    assert.equal(params[0],CH);
    assert.match(params[1],/^[a-f0-9]{64}$/);
    assert.match(params[2],/^[a-f0-9]{64}$/);
    assert.match(params[3],/^[a-f0-9]{64}$/);
    assert.ok(Buffer.isBuffer(params[5]));
    assert.equal(params[5].includes(Buffer.from('cemento')),false);
    assert.equal(params[6].length,12);
    assert.equal(params[7].length,16);
    assert.equal(params[9],'aes_2026_a');
    const prev=stored.get(params[2]);
    const record={role:i.role,org:i.org,chatKey:params[1],
     fingerprint:params[3]};
    if(prev){
     assert.deepEqual(prev,record,'Webhook replay must not change owner/content');
    }else stored.set(params[2],record);
    return {rows:[{payload:{estado:'entrada_persistida',repetido:Boolean(prev)}}]};
   }
   throw Error('SQL_NOT_EXPECTED');
  },
  cerrar:async()=>{closed++;}
 });
 return {people,stored,queries,db,get closed(){return closed;}};
}
function cfg(h){
 return {env:env(),abrirPuertoSql:async()=>h.db(),ahoraUnix:()=>NOW};
}
test('MVP055: un Whapi central recibe 2 arquitectos + 3 proveedores, aislados y cifrados',async()=>{
 const h=backend();
 const messages=[0,1,2,3,4].map(i=>incoming(i));
 const first=await receive(request(messages),cfg(h));
 assert.equal(first.status,200);
 assert.deepEqual(await first.json(),{
  estado:'entradas_persistidas',guardadas:5,duplicadas:0,
  compradoresGuardados:2,presupuestosConfirmados:0,mensajesEnviados:0
 });
 assert.equal(h.stored.size,5);
 assert.equal(h.closed,1);
 assert.deepEqual([...h.stored.values()].map(x=>x.role),
  ['buyer','buyer','supplier','supplier','supplier']);
 assert.equal(new Set([...h.stored.values()].map(x=>x.chatKey)).size,5);
 const data=JSON.stringify([...h.stored]);
 for(const person of identities)assert.equal(data.includes(person.phone),false);
 assert.equal(data.includes('cemento'),false);
 const again=await receive(request(messages),cfg(h));
 assert.equal(again.status,200);
 const out=await again.json();
 assert.equal(out.guardadas,0);
 assert.equal(out.duplicadas,5);
 assert.equal(out.mensajesEnviados,0);
 assert.equal(h.stored.size,5);
 assert.equal(h.closed,2);
});
test('MVP055: Cotironda no impone el tope externo de cinco chats de Sandbox',async()=>{
 const h=backend();
 // This is an INTERNAL contract only. Whapi Sandbox itself may refuse chat 6.
 h.people.set(hmacChat(identities[5].phone),identities[5]);
 const reply=await receive(request([incoming(5)]),cfg(h));
 assert.equal(reply.status,200);
 assert.equal((await reply.json()).guardadas,1);
 assert.equal(h.stored.size,1);
 assert.equal([...h.stored.values()][0].org,identities[5].org);
});
test('MVP055: otro canal, remitente no inscripto y doble rol no pasan',async()=>{
 const h=backend();
 const spoof=await receive(request([incoming(0)],{channel:'otro_numero'}),cfg(h));
 assert.equal(spoof.status,403);assert.equal(h.stored.size,0);
 // Sixth contact has no enrollment yet.
 const unknown=await receive(request([incoming(5)]),cfg(h));
 assert.equal(unknown.status,403);assert.equal(h.stored.size,0);
 const key=hmacChat(identities[0].phone);
 const old=h.people.get(key);
 h.people.set(key,{role:'supplier',org:identities[0].org});
 // Emulate inconsistent SQL registries: buyer and supplier both resolve same chat.
 const contradiction=await receive(request([incoming(0)]),{
  ...cfg(h),abrirPuertoSql:async()=>({
   query:async(sql,params)=>{
    if(sql.includes('whapi_resolve_active_contact_v1'))
     return {rows:[{payload:{supplierOrgId:identities[2].org,
      roundId:ROUND,consentimientoVigente:true,invitacionVigente:true}}]};
    if(sql.includes('whapi_resolve_buyer_d074'))
     return {rows:[{payload:{buyerOrgId:identities[0].org,
      consentimientoContactoVigente:true,chatHabilitado:true}}]};
    throw Error('unexpected_write');
   }
  })
 });
 assert.equal(contradiction.status,403);
 h.people.set(key,old);
 const self=await receive(request([incoming(0,{fromMe:true})]),cfg(h));
 assert.equal(self.status,204);
 assert.equal(h.stored.size,0);
});
test('MVP055: secreto equivocado se rechaza antes de abrir conexión privada',async()=>{
 let opens=0;
 const h=backend();
 const r=await receive(request([incoming(0)],{secret:'wrong'}),{
  ...cfg(h),abrirPuertoSql:async()=>{opens++;return h.db();}
 });
 assert.equal(r.status,401);assert.equal(opens,0);
 assert.equal(h.stored.size,0);
});
