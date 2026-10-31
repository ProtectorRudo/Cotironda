import test from 'node:test';
import assert from 'node:assert/strict';
import {crearTransporteWhapiCloudD055}
 from '../../src/server/whapi-cloud-transport-d055.ts';
import {crearTrabajadorSalidaD054}
 from '../../src/server/whapi-send-worker-d054.ts';
import {calcularAcuseSalidaD050}
 from '../../src/server/whapi-quoted-confirmation-d050.ts';

const TO='5492211234567',TOKEN='CI_TOKEN_SYNTHETIC_ONLY_abcdefghijklmnopqrstuvwxyz';
const JOB='eeeeeeee-0000-4000-8000-000000000551';
const MESSAGE_ID='p.outgoing-0000000551';
const BODY='Cotización ficticia 10 bolsas de cemento. Respondé al resumen.';
const KEY=Buffer.alloc(32,55),CHANNEL='whapi_d055_ci';
const input={to:TO,body:BODY,jobId:JOB};
const response=(obj,status=200,headers={'content-type':'application/json'})=>
 new Response(JSON.stringify(obj),{status,headers});
const success={
 sent:true,
 message:{id:MESSAGE_ID,status:'pending',chat_id:TO+'@s.whatsapp.net',
  from_me:true,type:'text'}
};
const create=(overrides={})=>{
 const state={fetchCalls:[],authorizations:0,limit:1};
 const opts={
  habilitado:true,pilotoAutorizado:true,token:TOKEN,
  destinatariosPermitidos:[TO],
  autorizarIntento:async()=>{state.authorizations++;return state.authorizations<=state.limit},
  fetcher:async()=>response(success),
  ...overrides
 };
 // Capture EVERY injected transport, including adversarial replacements.
 if(typeof opts.fetcher==='function'){
   const originalFetcher=opts.fetcher;
   opts.fetcher=async(url,options)=>{
     state.fetchCalls.push({url,options});
     return originalFetcher(url,options);
   };
 }
 return {state,port:crearTransporteWhapiCloudD055(opts),opts};
};
const rejects=async(p)=>assert.rejects(p,e=>e.message==='d055_transporte_no_disponible');
test('D055: factory apagada por defecto nunca invoca ni un fetch inyectado',async()=>{
 let called=0;
 const off=crearTransporteWhapiCloudD055({
  fetcher:async()=>{called++;return response(success);}
 });
 await rejects(off.sendText(input));
 assert.equal(called,0);
});
test('D055: falta la autorización explícita, aunque token válido, no envía',async()=>{
 const x=create({pilotoAutorizado:false});
 await rejects(x.port.sendText(input));
 assert.equal(x.state.fetchCalls.length,0);
});
test('D055: no hay fetch global ni fallback implícito',async()=>{
 const x=create({fetcher:undefined});
 await rejects(x.port.sendText(input));
 assert.equal(x.state.fetchCalls.length,0);
});
test('D055: 200 con sent:true y pending -> accepted únicamente, nunca delivered',async()=>{
 const x=create();
 assert.deepEqual(await x.port.sendText(input),{
  state:'accepted',messageId:MESSAGE_ID
 });
 assert.equal(x.state.fetchCalls.length,1);
 const {url,options}=x.state.fetchCalls[0];
 assert.equal(url,'https://gate.whapi.cloud/messages/text');
 assert.equal(options.method,'POST');
 assert.equal(options.redirect,'error');
 assert.equal(options.credentials,'omit');
 assert.equal(options.cache,'no-store');
 assert.deepEqual(JSON.parse(options.body),{
  to:TO,body:BODY,no_link_preview:true,typing_time:0
 });
 assert.equal(options.headers.authorization,'Bearer '+TOKEN);
 assert.ok(options.signal instanceof AbortSignal);
});
test('D055: estado sent/delivered/read NO se infiere como confirmación comercial',async()=>{
 for(const status of ['sent','delivered','read']){
  const x=create({fetcher:async()=>response({...success,message:{...success.message,status}})});
  assert.deepEqual(await x.port.sendText(input),{
   state:'accepted',messageId:MESSAGE_ID});
 }
});
test('D055: cupo agotado o autorización fallida bloquean antes de HTTP',async()=>{
 const x=create();
 await x.port.sendText(input);
 await rejects(x.port.sendText(input));
 assert.equal(x.state.fetchCalls.length,1);
 const y=create({autorizarIntento:async()=>{throw Error('DB_CREDS_SECRET')}});
 await rejects(y.port.sendText(input));
 assert.equal(y.state.fetchCalls.length,0);
});
test('D055: número fuera de allowlist, formato inválido o payload alterado bloqueados',async()=>{
 const cases=[
  {...input,to:'5492219999999'},
  {...input,to:'+5492211234567'},
  {...input,to:'5492211234567@evil.org'},
  {...input,body:'No'},
  {...input,body:BODY+'\u0000'},
  {...input,body:'X'.repeat(1601)},
  {...input,jobId:'evil'},
  {...input,secret:'X'},
 ];
 for(const payload of cases){
  const x=create();await rejects(x.port.sendText(payload));
  assert.equal(x.state.fetchCalls.length,0);
 }
});
test('D055: token incorrecto o timeout inválido no llegan a fetch',async()=>{
 for(const delta of [{token:'bad'},{token:'bad\r\nInjected:true'},
  {timeoutMs:100},{timeoutMs:6000}]){
  const x=create(delta);await rejects(x.port.sendText(input));
  assert.equal(x.state.fetchCalls.length,0);
 }
});
test('D055: respuestas malformadas y IDs cruzados son incertidumbre, no accepted',async()=>{
 const samples=[
  {},{sent:false,message:success.message},
  {sent:true},
  {sent:true,message:{...success.message,id:'a'}},
  {sent:true,message:{...success.message,status:'failed'}},
  {sent:true,message:{...success.message,from_me:false}},
  {sent:true,message:{...success.message,chat_id:'5492218887777@s.whatsapp.net'}},
  {sent:true,message:{...success.message,type:'image'}},
  {sent:true,message:{...success.message,id:'a/'.repeat(40)}},
  {sent:'true',message:success.message},
 ];
 for(const sample of samples){
  const x=create({fetcher:async()=>response(sample)});
  await rejects(x.port.sendText(input));
  assert.equal(x.state.fetchCalls.length,1);
 }
});
test('D055: HTTP 401/402/403/429/500, payload inválido y redirect no generan reintentos',async()=>{
 for(const status of [400,401,402,403,413,429,500,503]){
  const x=create({fetcher:async()=>response({error:'UNSAFE_TOKEN_SECRET'},status)});
  await rejects(x.port.sendText(input));
  assert.equal(x.state.fetchCalls.length,1);
 }
 const redirect=create({fetcher:async()=>new Response('',{status:302,headers:{
  location:'https://evil.invalid'
 }})});
 await rejects(redirect.port.sendText(input));
 assert.equal(redirect.state.fetchCalls.length,1);
});
test('D055: responde 200 no JSON, vacío, demasiado grande, con content-length malformado',async()=>{
 const samples=[
  new Response('texto',{headers:{'content-type':'text/plain'}}),
  new Response('',{headers:{'content-type':'application/json'}}),
  new Response('{',{headers:{'content-type':'application/json'}}),
  new Response('X'.repeat(17000),{headers:{'content-type':'application/json'}}),
  new Response(JSON.stringify(success),{headers:{
   'content-type':'application/json','content-length':'9999999'}}),
  new Response(JSON.stringify(success),{headers:{
   'content-type':'application/json','content-length':'not_number'}}),
 ];
 for(const sample of samples){
  const x=create({fetcher:async()=>sample});
  await rejects(x.port.sendText(input));
  assert.equal(x.state.fetchCalls.length,1);
 }
});
test('D055: red caída y timeout lanzan error neutro, nunca token/phone en error',async()=>{
 for(const msg of ['Bearer '+TOKEN,'HTTP timeout with to '+TO]){
  const x=create({fetcher:async()=>{throw Error(msg)}});
  await assert.rejects(x.port.sendText(input),e=>
   e.message==='d055_transporte_no_disponible'&&
    !e.message.includes(TOKEN)&&!e.message.includes(TO));
  assert.equal(x.state.fetchCalls.length,1);
 }
});
test('D055: un solo fetch aun con rechazo del proveedor',async()=>{
 const x=create({fetcher:async()=>{throw Error('temporary server error')}});
 await rejects(x.port.sendText(input));
 assert.equal(x.state.fetchCalls.length,1);
});
test('D055 + D054: pending Whapi se registra en DB solo como accepted_by_transport HMAC',async()=>{
 const x=create();
 const claim={state:'leased',jobId:JOB,leaseToken:'eeeeeeee-0000-4000-8000-000000000552',
  roundId:'dddddddd-0000-4000-8000-000000000553',
  supplierOrgId:'bbbbbbbb-0000-4000-8000-000000000554',
  revision:1,channelId:CHANNEL,chatKey:'a'.repeat(64)};
 const pg=[];
 const ports={
  committedRpc:async(sql,params)=>{
   pg.push({sql,params});
   const payload=sql.includes('lease_reply')?claim:
    sql.includes('begin_send')?{state:'in_flight',jobId:JOB}:
    {state:'accepted_by_transport',repeated:false};
   return {payload};
  },
  resolverMensaje:async()=>({
   channelId:CHANNEL,chatKey:claim.chatKey,roundId:claim.roundId,
   supplierOrgId:claim.supplierOrgId,revision:1,to:TO,body:BODY
  }),
  transport:x.port
 };
 const worker=crearTrabajadorSalidaD054(ports,KEY);
 assert.deepEqual(await worker.procesarUno(),{estado:'aceptado_por_transporte'});
 assert.equal(x.state.fetchCalls.length,1);
 assert.equal(pg.length,3);
 assert.ok(pg[1].sql.includes('begin_send'));
 const outcome=pg[2].params;
 assert.equal(outcome[2],'accepted_by_transport');
 assert.equal(outcome[3],calcularAcuseSalidaD050(KEY,CHANNEL,MESSAGE_ID));
 assert.ok(!JSON.stringify(pg).includes(TO));
 assert.ok(!JSON.stringify(pg).includes(MESSAGE_ID));
});
test('D055 + D054: Whapi 200 ambiguo queda uncertain en DB sin segundo intento',async()=>{
 const x=create({fetcher:async()=>response({sent:true,message:{...success.message,id:''}})});
 const claim={state:'leased',jobId:JOB,leaseToken:'eeeeeeee-0000-4000-8000-000000000552',
  roundId:'dddddddd-0000-4000-8000-000000000553',
  supplierOrgId:'bbbbbbbb-0000-4000-8000-000000000554',
  revision:1,channelId:CHANNEL,chatKey:'a'.repeat(64)};
 let recorded=null;
 const worker=crearTrabajadorSalidaD054({
  committedRpc:async(sql,params)=>({payload:sql.includes('lease_reply')?claim:
   sql.includes('begin_send')?{state:'in_flight',jobId:JOB}:
   (recorded=params,{state:'uncertain',repeated:false})}),
  resolverMensaje:async()=>({
   channelId:CHANNEL,chatKey:claim.chatKey,roundId:claim.roundId,
   supplierOrgId:claim.supplierOrgId,revision:1,to:TO,body:BODY
  }),
  transport:x.port
 },KEY);
 assert.deepEqual(await worker.procesarUno(),{estado:'incierto_sin_reenvio'});
 assert.equal(x.state.fetchCalls.length,1);
 assert.equal(recorded[2],'uncertain');
 assert.equal(recorded[3],null);
});
