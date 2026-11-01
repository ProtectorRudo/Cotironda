import test from 'node:test';
import assert from 'node:assert/strict';
import {auditarCanalWhapiMvp041,proponerWebhookWhapiMvp041}
 from '../../src/server/whapi-channel-preflight-mvp041.ts';

const token='t'.repeat(32),secret='a'.repeat(64);
const url='https://piloto.cotironda.example/api/integraciones/whapi';
const settings=()=>({
 callback_persist:true,
 webhooks:[{url,mode:'body',
  headers:{'X-Cotironda-Webhook-Key':secret},
  events:[{type:'messages',method:'post'}]}]
});
const yes=(body)=>new Response(JSON.stringify(body),{
 status:200,headers:{'content-type':'application/json'}
});
function config(override={},responses={}){
 const calls=[];
 const fetcher=async (endpoint,init)=>{
  calls.push({endpoint,init});
  const path=String(endpoint).split('gate.whapi.cloud')[1];
  const v=responses[path];
  if(v instanceof Error)throw v;
  if(v instanceof Response)return v;
  switch(path){
   case '/health?wakeup=false':return yes(v??{status:'AUTH'});
   case '/users/profile':return yes(v??{id:'fake-profile',name:'DO_NOT_ECHO'});
   case '/settings':return yes(v??settings());
   default:throw Error('unexpected endpoint');
  }
 };
 return {calls,config:{habilitado:true,pilotoAutorizado:true,
  channel:'cotironda_piloto',token,webhookSecretHex:secret,
  webhookUrl:url,fetcher,...override}};
}
test('MVP041: propuesta de webhook EXACTA para Body + messages.post y secret',()=>{
 const r=proponerWebhookWhapiMvp041(url,secret);
 assert.equal(r.callback_persist,true);
 assert.equal(r.webhooks.length,1);
 assert.equal(r.webhooks[0].headers['X-Cotironda-Webhook-Key'],secret);
 assert.deepEqual(r.webhooks[0].events,[{type:'messages',method:'post'}]);
 assert.equal(r.webhooks[0].mode,'body');
});
test('MVP041: Whapi AUTH+perfil+webhook privado válido sin POST ni mensajes',async()=>{
 const v=config();
 const r=await auditarCanalWhapiMvp041(v.config);
 assert.deepEqual(r,{
  estado:'configuracion_whapi_verificada_sin_envio',
  canalConectado:true,perfilConsultable:true,webhookValido:true,
  requestsGet:3,mensajesEnviados:0,ajustesModificados:false
 });
 assert.deepEqual(v.calls.map(c=>c.endpoint),[
  'https://gate.whapi.cloud/health?wakeup=false',
  'https://gate.whapi.cloud/users/profile',
  'https://gate.whapi.cloud/settings'
 ]);
 for(const c of v.calls){
  assert.equal(c.init.method,'GET');
  assert.equal(c.init.redirect,'error');
  assert.equal(c.init.credentials,'omit');
  assert.equal(c.init.cache,'no-store');
  assert.equal(c.init.headers.authorization,'Bearer '+token);
  assert.equal(c.init.body,undefined);
  assert.ok(c.init.signal);
 }
 assert.equal(JSON.stringify(r).includes(token),false);
 assert.equal(JSON.stringify(r).includes(secret),false);
 assert.equal(JSON.stringify(r).includes('DO_NOT_ECHO'),false);
});
test('MVP041: sin autorización no consulta la nube',async()=>{
 const x=config({pilotoAutorizado:false});
 assert.equal((await auditarCanalWhapiMvp041(x.config)).estado,'configuracion_incompleta');
 assert.equal(x.calls.length,0);
});
test('MVP041: con integración apagada no consulta nada',async()=>{
 const x=config({habilitado:false});
 assert.equal((await auditarCanalWhapiMvp041(x.config)).estado,'desactivado');
 assert.equal(x.calls.length,0);
});
test('MVP041: faltan token, secret, fetcher o URL segura: cero GET',async()=>{
 for(const patch of [
  {token:undefined},{token:'invalid'},{webhookSecretHex:''},
  {webhookSecretHex:'0'.repeat(8)},{fetcher:undefined},
  {webhookUrl:'http://ejemplo.com/api/integraciones/whapi'},
  {webhookUrl:'https://ejemplo.com/cualquier-cosa'},
  {webhookUrl:'https://ejemplo.com/api/integraciones/whapi?secret=abc'},
  {channel:'a'}
 ]){
  const x=config(patch);
  assert.equal((await auditarCanalWhapiMvp041(x.config)).estado,
   'configuracion_incompleta',JSON.stringify(Object.keys(patch)));
  assert.equal(x.calls.length,0);
 }
});
test('MVP041: 200 HTTP health sin estado AUTH no acredita conexión QR',async()=>{
 for(const h of [{status:'QR'},{status:'INIT'},{ok:true},{status:'connected'},{}]){
  const x=config({}, {'/health?wakeup=false':h});
  const r=await auditarCanalWhapiMvp041(x.config);
  assert.equal(r.estado,'canal_sin_verificar');
  assert.equal(r.requestsGet,1);
  assert.equal(x.calls.length,1);
 }
});
test('MVP041: canal AUTH pero error perfil no declara listo',async()=>{
 const x=config({}, {'/users/profile':new Response('',{status:401})});
 const r=await auditarCanalWhapiMvp041(x.config);
 assert.equal(r.estado,'canal_sin_verificar');
 assert.equal(r.webhookValido,false);
 assert.equal(x.calls.length,2);
});
test('MVP041: webhook equivocado no autoriza conexión',async()=>{
 const x=config({}, {'/settings':{...settings(),webhooks:[
  {...settings().webhooks[0],url:'https://otro.com/api/integraciones/whapi'}
 ]}});
 const r=await auditarCanalWhapiMvp041(x.config);
 assert.equal(r.estado,'webhook_incorrecto');
 assert.equal(r.canalConectado,true);
 assert.equal(r.webhookValido,false);
});
test('MVP041: ningún mensaje.post o modo path se admite',async()=>{
 for(const patch of [
  {events:[{type:'statuses',method:'post'}]},
  {events:[{type:'messages',method:'put'}]},
  {mode:'path'},
  {mode:'method'}
 ]){
  const x=config({}, {'/settings':{...settings(),webhooks:[
   {...settings().webhooks[0],...patch}
  ]}});
  assert.equal((await auditarCanalWhapiMvp041(x.config)).estado,'webhook_incorrecto');
 }
});
test('MVP041: secreto de header incorrecto/omitido/duplicado no pasa',async()=>{
 for(const headers of [
  {}, {'X-Cotironda-Webhook-Key':'b'.repeat(64)},
  {'X-Cotironda-Webhook-Key':secret,'x-cotironda-webhook-key':secret}
 ]){
  const x=config({}, {'/settings':{...settings(),webhooks:[
   {...settings().webhooks[0],headers}
  ]}});
  assert.equal((await auditarCanalWhapiMvp041(x.config)).estado,'webhook_incorrecto');
 }
});
test('MVP041: callback_persist falso o ausente no acredita durabilidad',async()=>{
 for(const callback_persist of [false,undefined]){
  const x=config({}, {'/settings':{...settings(),callback_persist}});
  assert.equal((await auditarCanalWhapiMvp041(x.config)).estado,'webhook_incorrecto');
 }
});
test('MVP041: HTTP 429/500, redirect, HTML y JSON corrupto fallan cerrados',async()=>{
 for(const response of [
  new Response('limit',{status:429}),
  new Response('error',{status:500}),
  new Response('<html></html>',{status:200,headers:{'content-type':'text/html'}}),
  new Response('{broken',{status:200,headers:{'content-type':'application/json'}}),
  (()=>{const r=yes({status:'AUTH'});Object.defineProperty(r,'redirected',{value:true});return r})()
 ]){
  const x=config({}, {'/health?wakeup=false':response});
  assert.equal((await auditarCanalWhapiMvp041(x.config)).estado,'canal_sin_verificar');
 }
});
test('MVP041: respuesta >32 KiB no se descarga indefinidamente',async()=>{
 const x=config({}, {'/health?wakeup=false':new Response(JSON.stringify({
  status:'AUTH',text:'x'.repeat(33000)
 }),{status:200,headers:{'content-type':'application/json'}})});
 assert.equal((await auditarCanalWhapiMvp041(x.config)).estado,'canal_sin_verificar');
});
test('MVP041: timeout de red no filtra token ni endpoint privado',async()=>{
 const x=config({}, {'/health?wakeup=false':new Error('TOKEN-PRIVATE-ERROR')});
 const r=await auditarCanalWhapiMvp041(x.config);
 assert.equal(r.estado,'canal_sin_verificar');
 assert.equal(JSON.stringify(r).includes('TOKEN-PRIVATE-ERROR'),false);
});
test('MVP067: ruta antigua /api/whapi/webhook queda prohibida explícitamente',()=>{
 assert.throws(()=>proponerWebhookWhapiMvp041(
  'https://piloto.cotironda.example/api/whapi/webhook',secret),
  /mvp041_auditoria_no_disponible/);
 const x=config({webhookUrl:'https://piloto.cotironda.example/api/whapi/webhook'});
 return auditarCanalWhapiMvp041(x.config).then(result=>{
  assert.equal(result.estado,'configuracion_incompleta');
  assert.equal(x.calls.length,0);
 });
});
test('MVP041: URL con usuario o query y endpoint ajeno rechazado',()=>{
 for(const target of [
  'http://sitio.test/api/integraciones/whapi',
  'https://sitio.test:443/api/integraciones/whapi?token=secret',
  'https://user:pass@sitio.test/api/integraciones/whapi',
  'https://gate.whapi.cloud/api/integraciones/whapi'
 ]){
  assert.throws(()=>proponerWebhookWhapiMvp041(target,secret),
   /mvp041_auditoria_no_disponible|Invalid URL/);
 }
});
