import test from 'node:test';
import assert from 'node:assert/strict';
import {inspeccionarSandboxWhapiMvp331} from
 '../../scripts/piloto/mvp331-whapi-sandbox-preflight.mjs';

const token='whapi_secret_DO_NOT_USE_0123456789';
const channelId='MANTIS-TEST';
const url='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-whapi';
function mock({
 health={health:{status:{text:'AUTH'}},channel_id:channelId},
 settings={webhooks:[{url,mode:'body',
  events:[{type:'messages',method:'post'}],
  headers:{'x-cotironda-webhook-key':'never-print-this'}}]},
 limits={chats:['private-chat-id-12345','private-chat-id-98765'],
  messages:25,requests:33,checks:2},
 statuses={}
}={}){
 const history=[];
 const fetchImpl=async(target,opts)=>{
  history.push({target,opts});
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.headers.Authorization,'Bearer '+token);
  assert.match(target,/^https:\/\/gate\.whapi\.cloud\/u);
  const path=new URL(target).pathname;
  const code=statuses[path]??200;
  const value=path==='/health'?health:
   path==='/settings'?settings:limits;
  return {status:code,json:async()=>value};
 };
 return {fetchImpl,history};
}
const run=(f)=>inspeccionarSandboxWhapiMvp331({
 token,channelId,fetchImpl:f.fetchImpl
});
test('MVP331: AUTH + exact channel and message POST webhook, no messages',async()=>{
 const f=mock();
 const r=await run(f);
 assert.equal(r.estado,'canal_y_webhook_aptos_para_preparar_prueba');
 assert.equal(r.canal,'AUTH');
 assert.equal(r.canalEsperadoCoincide,true);
 assert.equal(r.webhook,'coincide');
 assert.equal(r.webhookDeMensajes,true);
 assert.equal(r.encabezadoAutenticacionConfigurado,true);
 assert.equal(r.chatsConsumidos,2);
 assert.equal(r.httpConsultas,3);
 assert.equal(r.habilitarCotironda,false);
 assert.equal(r.pruebaCompletaAcreditada,false);
 assert.equal(r.mensajesEnviados,0);
 assert.equal(r.cambiosRealizados,0);
 assert.deepEqual(f.history.map(c=>new URL(c.target).pathname),
  ['/health','/settings','/limits']);
 assert.equal(new URL(f.history[0].target).searchParams.get('wakeup'),
  'false');
 assert.doesNotMatch(JSON.stringify(r),
  /private-chat|whapi_secret|never-print-this|s\.whatsapp\.net/u);
});
test('MVP331: no token/channel/invalid env refuses any call',async()=>{
 const f=mock();
 for(const args of [
  {token:'',channelId},
  {token,channelId:''},
  {token:token+'\nX-Leak: x',channelId},
  {token,channelId:'bad channel'},
  {token,channelId,expectedWebhook:'https://evil.example/hook'}
 ]){
  const r=await inspeccionarSandboxWhapiMvp331({...args,fetchImpl:f.fetchImpl});
  assert.equal(r.estado,'no_configurado');
  assert.equal(r.httpConsultas,0);
 }
 assert.equal(f.history.length,0);
});
test('MVP331: STOP does not wake channel, does not request settings',async()=>{
 const f=mock({health:{health:{status:{text:'STOP'}},channel_id:channelId}});
 const r=await run(f);
 assert.equal(r.estado,'canal_detenido');
 assert.equal(r.httpConsultas,1);
 assert.equal(new URL(f.history[0].target).searchParams.get('wakeup'),
  'false');
});
test('MVP331: QR, LAUNCH and unknown statuses are not readiness',async()=>{
 for(const status of ['QR','LAUNCH','INIT','SYNC_ERROR','UNKNOWN']){
  const f=mock({health:{health:{status:{text:status}},channel_id:channelId}});
  const r=await run(f);
  assert.equal(r.estado,'canal_no_autorizado');
  assert.equal(f.history.length,1);
 }
});
test('MVP331: wrong channel ID blocks even with AUTH',async()=>{
 const f=mock({health:{health:{status:{text:'AUTH'}},
  channel_id:'OTHER-CHANNEL'}});
 const r=await run(f);
 assert.equal(r.estado,'canal_no_autorizado');
 assert.equal(r.canalEsperadoCoincide,false);
 assert.equal(f.history.length,1);
});
test('MVP331: webhooks must point to exact pilot with body messages POST',async()=>{
 for(const webhook of [
  {url,mode:'body',events:[{type:'messages',method:'post'}],
   headers:{'other-header':'invalid'}},
  {url:'https://other.example/hook',mode:'body',
   events:[{type:'messages',method:'post'}]},
  {url,mode:'method',events:[{type:'messages',method:'post'}]},
  {url,mode:'body',events:[{type:'messages',method:'patch'}]},
  {url,mode:'body',events:[]}
 ]){
  const f=mock({settings:{webhooks:[webhook]}});
  const r=await run(f);
  assert.equal(r.estado,'webhook_incompatible');
  assert.equal(f.history.length,2);
 }
});
test('MVP331: exactly five chats requires destination-scope confirmation',async()=>{
 const f=mock({limits:{chats:['a','b','c','d','e'],messages:10,
  requests:10,checks:10}});
 const r=await run(f);
 assert.equal(r.estado,'cupo_lleno_verificar_destinatarios');
 assert.equal(r.chatsConsumidos,5);
 assert.equal(r.habilitarCotironda,false);
});
test('MVP331: malformed/over-limit quotas never become ready',async()=>{
 for(const limits of [{messages:5}, {chats:['a','b','c','d','e','f']}]){
  const f=mock({limits});
  const r=await run(f);
  assert.notEqual(r.estado,'canal_y_webhook_aptos_para_preparar_prueba');
 }
});
test('MVP331: HTTP auth/plan/limit/errors fail closed without response bodies',async()=>{
 for(const [code,expected] of [
  [401,'sin_autorizacion'],[402,'limite_o_plan_bloqueado'],
  [403,'sin_autorizacion'],[429,'demasiadas_consultas'],
  [500,'error_http']
 ]){
  const f=mock({statuses:{'/health':code}});
  const r=await run(f);
  assert.equal(r.estado,expected);
  assert.equal(r.httpConsultas,1);
 }
});
test('MVP331: no limit info via 204 cannot claim a Sandbox test ready',async()=>{
 const f=mock({statuses:{'/limits':204}});
 const r=await run(f);
 assert.equal(r.estado,'sin_limites_reportados');
 assert.equal(r.httpConsultas,3);
});
test('MVP331: network failures are sanitized and never retried',async()=>{
 let n=0;
 const r=await inspeccionarSandboxWhapiMvp331({
  token,channelId,
  fetchImpl:async()=>{n++;throw Error('token and contacts private');}
 });
 assert.equal(r.estado,'error_de_red');
 assert.equal(r.httpConsultas,1);
 assert.equal(n,1);
 assert.doesNotMatch(JSON.stringify(r),/token and contacts private/u);
});
test('MVP331: malformed JSON and missing status fail closed',async()=>{
 const r=await run(mock({health:{channel_id:channelId}}));
 assert.equal(r.estado,'canal_no_autorizado');
 const f=mock();
 f.fetchImpl=async()=>({status:200,json:async()=>{throw Error('raw data')}});
 const r2=await run(f);
 assert.equal(r2.estado,'respuesta_invalida');
});
