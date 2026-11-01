import test from 'node:test';
import assert from 'node:assert/strict';
import {crearListaPilotoWhatsappMvp068}
 from '../../src/server/whapi-pilot-allowlist-mvp068.ts';
import {calcularChatDestinatarioD056}
 from '../../src/server/whapi-send-authorization-d056.ts';
import {atenderWebhookWhapiPreviewD083}
 from '../../src/server/whapi-preview-http-d083.ts';

// Completely fictional numbers, never the operator's three real contacts.
const CH='test_mvp068',SECRET='test-mvp068-'.padEnd(64,'z'),NOW=1800000000;
const BUYER_PHONE='5491111111000',A_PHONE='5491111111001';
const B_PHONE='5491111111002',OUTSIDER_PHONE='5491111111003';
const BUYER_ID='aaaaaaaa-0068-4068-8068-000000000681';
const SUPPLIER_ID='bbbbbbbb-0068-4068-8068-000000000681';
const ROUND_ID='cccccccc-0068-4068-8068-000000000681';
const KEY=Buffer.from('01'.repeat(32),'hex');
const hash=number=>calcularChatDestinatarioD056(CH,number,KEY);
const roster=()=>({
 COTIRONDA_WHAPI_PILOT_BUYER_CHAT_KEY:hash(BUYER_PHONE),
 COTIRONDA_WHAPI_PILOT_SUPPLIER_CHAT_KEYS_JSON:
  JSON.stringify([hash(A_PHONE),hash(B_PHONE)])
});
const env=(patch={})=>({
 VERCEL_ENV:'preview',
 VERCEL_GIT_COMMIT_REF:'integration/mvp-piloto-20261031',
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_WHAPI_WEBHOOK_ENABLED:'true',
 COTIRONDA_WHAPI_PILOT_AUTHORIZED:'true',
 COTIRONDA_WHAPI_CHANNEL:CH,
 COTIRONDA_WHAPI_WEBHOOK_SECRET:SECRET,
 COTIRONDA_WHAPI_HMAC_ID_HEX:'01'.repeat(32),
 COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX:'02'.repeat(32),
 COTIRONDA_WHAPI_AES_CONTENT_HEX:'03'.repeat(32),
 COTIRONDA_WHAPI_AES_KEY_ID:'aes_2026_a',
 ...roster(),...patch
});
function request(from=BUYER_PHONE,id='mvp068-msg-001'){
 return new Request('https://preview.cotironda.invalid/api/integraciones/whapi',{
  method:'POST',
  headers:{'content-type':'application/json',
   'x-cotironda-webhook-key':SECRET},
  body:JSON.stringify({channel_id:CH,
   event:{type:'messages',event:'post'},
   messages:[{id,chat_id:from+'@s.whatsapp.net',from,
    from_me:false,type:'text',timestamp:NOW,
    text:{body:'20 bolsas cemento CPC 50 kg. Entrega: La Plata'}}]
  })
 });
}
function backend(){
 const sql=[],stored=new Map();
 const open=async()=>({
  query:async(query,params)=>{
   sql.push({query,params});
   // No telephone may be sent to PostgreSQL. Only HMAC keys and ciphertext.
   assert.ok(!query.includes(BUYER_PHONE));
   assert.ok(!query.includes(A_PHONE));
   assert.ok(!query.includes(B_PHONE));
   if(query.includes('whapi_resolve_active_contact_v1'))
    return {rows:[{payload:{
     supplierOrgId:SUPPLIER_ID,roundId:ROUND_ID,
     consentimientoVigente:true,invitacionVigente:true
    }}]};
   if(query.includes('whapi_resolve_buyer_d074'))
    return {rows:[{payload:{
     buyerOrgId:BUYER_ID,chatHabilitado:true,
     consentimientoContactoVigente:true
    }}]};
   if(query.includes('whapi_record_buyer_d074')||
      query.includes('whapi_inbox_record_keyed_v1')){
    const key=params[2];
    const was=stored.get(key);
    if(was&&was!==params[3])throw Error('collision');
    stored.set(key,params[3]);
    return {rows:[{payload:{estado:'entrada_persistida',repetido:!!was}}]};
   }
   throw Error('UNEXPECTED_SQL');
  },cerrar:async()=>{}
 });
 return {sql,stored,open};
}

test('MVP068: solo un comprador y dos proveedores; nunca expone números',()=>{
 const allowed=crearListaPilotoWhatsappMvp068(roster(),CH,KEY);
 for(const [phone,role] of [
  [BUYER_PHONE,'comprador'],[A_PHONE,'proveedor'],[B_PHONE,'proveedor']
 ])assert.equal(allowed.permitido(role,CH,phone+'@s.whatsapp.net'),true);
 assert.equal(allowed.permitido('proveedor',CH,BUYER_PHONE+'@s.whatsapp.net'),false);
 assert.equal(allowed.permitido('comprador',CH,A_PHONE+'@s.whatsapp.net'),false);
 assert.equal(allowed.permitido('comprador',CH,OUTSIDER_PHONE+'@s.whatsapp.net'),false);
 assert.equal(allowed.permitido('proveedor',CH,OUTSIDER_PHONE+'@s.whatsapp.net'),false);
 assert.equal(allowed.permitido('comprador','otro_canal',BUYER_PHONE+'@s.whatsapp.net'),false);
 assert.equal(allowed.permitido('comprador',CH,'123@g.us'),false);
 assert.equal(JSON.stringify(allowed).includes(BUYER_PHONE),false);
});

test('MVP068: lista incompleta, duplicada, inválida o sin clave => rechaza',()=>{
 const bad=[
  {},
  {...roster(),COTIRONDA_WHAPI_PILOT_BUYER_CHAT_KEY:undefined},
  {...roster(),COTIRONDA_WHAPI_PILOT_SUPPLIER_CHAT_KEYS_JSON:'[]'},
  {...roster(),COTIRONDA_WHAPI_PILOT_SUPPLIER_CHAT_KEYS_JSON:'not-json'},
  {...roster(),COTIRONDA_WHAPI_PILOT_SUPPLIER_CHAT_KEYS_JSON:
   JSON.stringify([hash(A_PHONE),hash(A_PHONE)])},
  {...roster(),COTIRONDA_WHAPI_PILOT_BUYER_CHAT_KEY:hash(A_PHONE)},
  {...roster(),COTIRONDA_WHAPI_PILOT_BUYER_CHAT_KEY:'0'.repeat(64)},
  {...roster(),COTIRONDA_WHAPI_PILOT_SUPPLIER_CHAT_KEYS_JSON:
   JSON.stringify([hash(A_PHONE),'wrong'])}
 ];
 for(const x of bad)assert.throws(
  ()=>crearListaPilotoWhatsappMvp068(x,CH,KEY),
  /mvp068_lista_privada_no_configurada/
 );
 assert.throws(()=>crearListaPilotoWhatsappMvp068(roster(),CH,Buffer.alloc(32)),
  /mvp068_lista_privada_no_configurada/);
});

test('MVP068: sin roster => HTTP 503 ANTES de abrir base',async()=>{
 const x=backend(),r=await atenderWebhookWhapiPreviewD083(request(),{
  env:env({COTIRONDA_WHAPI_PILOT_BUYER_CHAT_KEY:undefined}),
  abrirPuertoSql:x.open,ahoraUnix:()=>NOW
 });
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,'lista_piloto_no_configurada');
 assert.equal(x.sql.length,0);
});

test('MVP068: cuarto número no autorizado => 403 sin consultas a DB',async()=>{
 const x=backend(),r=await atenderWebhookWhapiPreviewD083(
  request(OUTSIDER_PHONE),{
   env:env(),abrirPuertoSql:x.open,ahoraUnix:()=>NOW
  });
 assert.equal(r.status,403);
 assert.equal(x.sql.length,0);
 assert.equal(x.stored.size,0);
});

test('MVP068: comprador autorizado se registra solo en inbox comprador',async()=>{
 const x=backend();
 for(let i=0;i<2;i++){
  const r=await atenderWebhookWhapiPreviewD083(request(),{
   env:env(),abrirPuertoSql:x.open,ahoraUnix:()=>NOW
  });
  assert.equal(r.status,200);
  assert.equal((await r.json()).mensajesEnviados,0);
 }
 assert.equal(x.stored.size,1);
 assert.equal(x.sql.some(x=>x.query.includes('whapi_resolve_active_contact_v1')),false);
 assert.equal(x.sql.some(x=>x.query.includes('whapi_record_buyer_d074')),true);
});

test('MVP068: proveedor autorizado y vinculado a única ronda, sin comprador',async()=>{
 const x=backend(),r=await atenderWebhookWhapiPreviewD083(request(A_PHONE),{
  env:env(),abrirPuertoSql:x.open,ahoraUnix:()=>NOW
 });
 assert.equal(r.status,200);
 assert.equal((await r.json()).mensajesEnviados,0);
 assert.equal(x.sql.some(x=>x.query.includes('whapi_resolve_buyer_d074')),false);
 assert.equal(x.sql.some(x=>x.query.includes('whapi_inbox_record_keyed_v1')),true);
 assert.equal(x.stored.size,1);
});

test('MVP068: header incorrecto no abre DB aunque exista allowlist',async()=>{
 const x=backend(),q=request();
 const h=new Headers(q.headers);h.set('x-cotironda-webhook-key','intruso');
 const r=await atenderWebhookWhapiPreviewD083(new Request(q,{headers:h}),{
  env:env(),abrirPuertoSql:x.open,ahoraUnix:()=>NOW
 });
 assert.equal(r.status,401);
 assert.equal(x.sql.length,0);
});
