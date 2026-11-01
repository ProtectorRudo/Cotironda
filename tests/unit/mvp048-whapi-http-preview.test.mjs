import test from 'node:test';
import assert from 'node:assert/strict';
import {POST,GET,PUT} from '../../apps/portal/app/api/integraciones/whapi/route.ts';
import {atenderWebhookWhapiPreviewD083,whapiPreviewEnabledD083}
 from '../../src/server/whapi-preview-http-d083.ts';

const CH='whapi_d083',SECRET='secret.d083.'.padEnd(64,'a'),NOW=1800000000;
const CHAT='5492211234567@s.whatsapp.net',PHONE='5492211234567';
const BUYER='aaaaaaaa-0083-4083-8083-000000000831';
const ID='whapi-incoming-d083-001';
function env(patch={}){
 return {VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'integration/mvp-piloto-20261031',
 COTIRONDA_WHAPI_WEBHOOK_ENABLED:'true',
 COTIRONDA_WHAPI_PILOT_AUTHORIZED:'true',
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_WHAPI_CHANNEL:CH,
 COTIRONDA_WHAPI_WEBHOOK_SECRET:SECRET,
 COTIRONDA_WHAPI_AES_KEY_ID:'aes_2026_a',
 COTIRONDA_WHAPI_HMAC_ID_HEX:'01'.repeat(32),
 COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX:'02'.repeat(32),
 COTIRONDA_WHAPI_AES_CONTENT_HEX:'03'.repeat(32),...patch};
}
function req({text='20 bolsas Cemento CPC 50 kg Entrega: La Plata',
 channel=CH,auth=SECRET,kind='text',method='POST'}={}){
 const msg={id:ID,chat_id:CHAT,from:PHONE,from_me:false,
  type:kind,timestamp:NOW,
  ...(kind==='text'?{text:{body:text}}:{document:{link:'https://bad.example/secret'}})};
 return new Request('https://preview.cotironda.invalid/api/integraciones/whapi',{
  method,headers:{'content-type':'application/json',
   ...(auth!==null?{'x-cotironda-webhook-key':auth}:{})},
  ...(method==='POST'?{body:JSON.stringify({channel_id:channel,
   event:{type:'messages',event:'post'},messages:[msg]})}:{})
 });
}
function port(){
 const queries=[],storage=new Map();
 const open=async()=>({query:async(sql,params)=>{
  queries.push({sql,params});
  assert.doesNotMatch(sql,/5492211234567|Cemento|secret.d083/);
  if(sql.includes('whapi_resolve_active_contact_v1'))
   return {rows:[{payload:null}]};
  if(sql.includes('whapi_resolve_buyer_d074'))
   return {rows:[{payload:{buyerOrgId:BUYER,
    consentimientoContactoVigente:true,chatHabilitado:true}}]};
  if(sql.includes('whapi_record_buyer_d074')){
   assert.equal(params[0],CH);
   assert.match(params[1],/^[a-f0-9]{64}$/u);
   assert.match(params[2],/^[a-f0-9]{64}$/u);
   assert.ok(params[4]==='text'||params[4]==='document');
   assert.ok(Buffer.isBuffer(params[5]));
   assert.equal(params[6].length,12);assert.equal(params[7].length,16);
   assert.equal(params[8],NOW);assert.equal(params[9],'aes_2026_a');
   assert.equal(params[5].includes(Buffer.from('Cemento')),false);
   const was=storage.get(params[2]);
   if(was&&was!==params[3])throw Error('collision_private');
   storage.set(params[2],params[3]);
   return {rows:[{payload:{estado:'entrada_persistida',repetido:!!was}}]};
  }
  if(sql.includes('whapi_buyer_optout_d074'))
   return {rows:[{payload:{estado:'baja_registrada',repetido:false}}]};
  throw Error('unexpected_private_query');
 }});
 return {queries,storage,open};
}
test('MVP048: ruta HTTP Next existe, POST está OFF y GET/PUT son 405',async()=>{
 assert.equal((await POST(req())).status,503);
 assert.equal((await GET(req({method:'GET'}))).status,405);
 assert.equal((await PUT(req({method:'PUT'}))).status,405);
});
test('MVP048: entorno producción/branch equivocada/flags off no abre SQL',async()=>{
 for(const p of [
  {COTIRONDA_WHAPI_WEBHOOK_ENABLED:'false'},
  {COTIRONDA_WHAPI_PILOT_AUTHORIZED:'false'},
  {VERCEL_ENV:'production'}, {VERCEL_GIT_COMMIT_REF:'main'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'}
 ]){
  assert.equal(whapiPreviewEnabledD083(env(p)),false);
  const r=await atenderWebhookWhapiPreviewD083(req(),{
   env:env(p),abrirPuertoSql:async()=>{throw Error('NOT_CALLED')}});
  assert.equal(r.status,503);
 }
});
test('MVP048: secret incorrecto o faltante => 401 antes de abrir base',async()=>{
 for(const auth of [null,'wrong',SECRET+'extra','']){
  const r=await atenderWebhookWhapiPreviewD083(req({auth}),{
   env:env(),abrirPuertoSql:async()=>{throw Error('NOT_CALLED')}});
  assert.equal(r.status,401);
 }
});
test('MVP048: sin puerto privado retorna 503 con header correcto',async()=>{
 const r=await atenderWebhookWhapiPreviewD083(req(),{env:env()});
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,'almacenamiento_privado_no_configurado');
});
test('MVP048: Whapi HTTP comprador → HMAC+AES → SQL buyer sin plaintext',async()=>{
 const s=port(),config={env:env(),abrirPuertoSql:s.open,ahoraUnix:()=>NOW};
 const first=await atenderWebhookWhapiPreviewD083(req(),config);
 assert.equal(first.status,200);
 assert.equal(s.storage.size,1);
 const second=await atenderWebhookWhapiPreviewD083(req(),config);
 assert.equal(second.status,200);assert.equal(s.storage.size,1);
 assert.ok(!JSON.stringify([...s.storage]).includes(PHONE));
 assert.ok(!JSON.stringify([...s.storage]).includes('Cemento'));
});
test('MVP048: BAJA usa optout privado y nunca ingresa como pedido',async()=>{
 const s=port();
 const r=await atenderWebhookWhapiPreviewD083(req({text:'BAJA'}),{
  env:env(),abrirPuertoSql:s.open,ahoraUnix:()=>NOW});
 assert.equal(r.status,200);assert.equal(s.storage.size,0);
 assert.equal(s.queries.filter(q=>q.sql.includes('whapi_buyer_optout_d074')).length,1);
});
test('MVP048: adjunto no descarga URL, canal falso es rechazado',async()=>{
 const s=port(),cfg={env:env(),abrirPuertoSql:s.open,ahoraUnix:()=>NOW};
 const r=await atenderWebhookWhapiPreviewD083(req({kind:'document'}),cfg);
 assert.equal(r.status,200);
 assert.equal(s.queries.filter(q=>q.sql.includes('http')).length,0);
 const spoof=await atenderWebhookWhapiPreviewD083(req({channel:'otro_canal'}),cfg);
 assert.equal(spoof.status,403);
});
test('MVP048: claves inválidas, duplicadas o SQL caído quedan bloqueados',async()=>{
 for(const p of [
  {COTIRONDA_WHAPI_HMAC_ID_HEX:'bad'},
  {COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX:'01'.repeat(32)},
  {COTIRONDA_WHAPI_AES_CONTENT_HEX:'00'.repeat(32)},
  {COTIRONDA_WHAPI_AES_KEY_ID:'legacy_d029'}
 ]){
  const r=await atenderWebhookWhapiPreviewD083(req(),{
   env:env(p),abrirPuertoSql:async()=>{throw Error('DATABASE_SECRET')}});
  assert.equal(r.status,503);
  assert.doesNotMatch(await r.text(),/DATABASE_SECRET/);
 }
 const r=await atenderWebhookWhapiPreviewD083(req(),{
  env:env(),abrirPuertoSql:async()=>{throw Error('DATABASE_SECRET')}});
 assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/DATABASE_SECRET/);
});
test('MVP048: SQL privado roto nunca filtra mensajes o credenciales',async()=>{
 const r=await atenderWebhookWhapiPreviewD083(req(),{
  env:env(),abrirPuertoSql:async()=>({query:async()=>{throw Error('DB_CREDENTIAL')}}),
  ahoraUnix:()=>NOW});
 assert.equal(r.status,503);
 assert.doesNotMatch(await r.text(),/DB_CREDENTIAL|Cemento|549221/);
});
