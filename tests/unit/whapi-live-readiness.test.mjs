import test from 'node:test';
import assert from 'node:assert/strict';
import {PILOT_WEBHOOK_URL,NON_ACTIONABLE_PROBE,comprobarWebhookPiloto}
 from '../../scripts/piloto/whapi-live-readiness.mjs';

const reply=(status,state='probe_only')=>
 new Response(JSON.stringify({state}),{status,
  headers:{'content-type':'application/json; charset=utf-8'}});

test('preflight: solo POST fijo, evento inocuo, sin credenciales ni datos de cliente',async()=>{
 let calls=0;
 const result=await comprobarWebhookPiloto(async(url,options)=>{
  calls++;
  assert.equal(url,PILOT_WEBHOOK_URL);
  assert.equal(options.method,'POST');
  assert.deepEqual(options.headers,{'content-type':'application/json'});
  assert.deepEqual(JSON.parse(options.body),{
   event:{type:'cotironda_preflight',event:'noop'},messages:[]
  });
  assert(!/authorization|x-cotironda-webhook-key|apikey/iu.test(
   JSON.stringify(options.headers)));
  assert.equal(options.redirect,'error');
  return reply(200);
 });
 assert.equal(calls,1);
 assert.deepEqual(result,{ready:true,reason:'config_ready_not_auth_verified'});
 assert(!/message_hmac|supplier_key|whatsapp|phone_number/iu.test(NON_ACTIONABLE_PROBE));
});

test('preflight: 503 por secreto mal configurado bloquea aceptación de nueva ronda',async()=>{
 assert.deepEqual(await comprobarWebhookPiloto(async()=>reply(503,'pilot_not_enabled')),
  {ready:false,reason:'webhook_config_unavailable'});
});

test('preflight: falla cerrado ante webhook incorrecto, cuerpo inválido o red caída',async()=>{
 for(const [status,state] of [[200,'accepted'],[401,'unauthorized'],[404,'missing']]){
  const r=await comprobarWebhookPiloto(async()=>reply(status,state));
  assert.equal(r.ready,false);
 }
 assert.deepEqual(await comprobarWebhookPiloto(async()=>{
  throw new Error('SECRET SHOULD NOT BE PRINTED');
 }),{ready:false,reason:'network_unavailable'});
 assert.deepEqual(await comprobarWebhookPiloto(async()=>new Response('oops',{
  status:200,headers:{'content-type':'text/plain'}
 })),{ready:false,reason:'invalid_response_type'});
});
