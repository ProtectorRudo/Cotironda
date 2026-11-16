import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ejecutarRecuperacionVaultD013,SQL_D013_APPROVED_COMMIT} from
 '../../supabase/functions/cotironda-piloto-v2-review-recovery-d013/worker-core.ts';
import {guardScheduledRecovery} from
 '../../supabase/functions/cotironda-piloto-document-recovery/scheduled-auth.ts';
const url='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-v2-review-recovery-d013';
const vaultToken='a'.repeat(96);
const make=(action,headers={})=>new Request(url,{
 method:'POST',
 headers:{'content-type':'application/json','x-cotironda-recovery-token':vaultToken,...headers},
 body:JSON.stringify(action)
});
const success=(estado)=>({estado,requestId:null,outboundSent:false});
test('D013: lectura check pasa sin IA ni escritura',async()=>{
 let actions=[];
 const res=await ejecutarRecuperacionVaultD013(make({action:'check'}),{
  enabled:true,recover:async execute=>{actions.push(execute);return success('source_verified')}
 });
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{state:'source_verified'});
 assert.deepEqual(actions,[false]);
 assert.equal(res.headers.get('cache-control'),'no-store');
});
test('D013: jamás ejecuta preparación sin liberación exacta de SHA',async()=>{
 let called=0;
 for(const headers of [{},{'x-cotironda-d013-release':'0'.repeat(40)}]){
  const res=await ejecutarRecuperacionVaultD013(make({action:'execute'},headers),{
   enabled:true,recover:async()=>{called++;return success('staged_no_send')}
  });
  assert.equal(res.status,403);
 }
 assert.equal(called,0);
});
test('D013: execute autorizado sólo devuelve borrador sin datos sensibles',async()=>{
 let actions=[];
 const res=await ejecutarRecuperacionVaultD013(
  make({action:'execute'},{'x-cotironda-d013-release':SQL_D013_APPROVED_COMMIT}),{
   enabled:true,recover:async execute=>{
    actions.push(execute);
    return {estado:'staged_no_send',requestId:'123e4567-e89b-42d3-a456-426614174000',outboundSent:false};
   }
  });
 assert.equal(res.status,200);
 const body=await res.text();
 assert.deepEqual(JSON.parse(body),{state:'draft_created_no_dispatch'});
 assert.doesNotMatch(body,/123e4567|message_hmac|plaintext|phone/i);
 assert.deepEqual(actions,[true]);
});
test('D013: errores y envío inesperado fallan cerrados y no exponen contexto',async()=>{
 for(const recover of [
  async()=>success('needs_operator_review'),
  async()=>({estado:'staged_no_send',requestId:null,outboundSent:true}),
  async()=>{throw Error('secret-record-buyer')}
 ]){
  const res=await ejecutarRecuperacionVaultD013(
   make({action:'execute'},{'x-cotironda-d013-release':SQL_D013_APPROVED_COMMIT}),
   {enabled:true,recover});
  assert.ok(res.status===409||res.status===503);
  assert.doesNotMatch(await res.text(),/secret-record-buyer/i);
 }
});
test('D013: entrada inválida, cuerpo grande y estado OFF sin efectos',async()=>{
 const invalid=[
  {action:'check',extra:'not_allowed'},
  {action:'unknown'},
  {action:'execute',request_id:'anything'},
  {action:'check',filler:'x'.repeat(65)}
 ];
 let calls=0;
 for(const value of invalid){
  const res=await ejecutarRecuperacionVaultD013(make(value),{
   enabled:true,recover:async()=>{calls++;return success('staged_no_send')}
  });
  assert.equal(res.status,400);
 }
 const disabled=await ejecutarRecuperacionVaultD013(make({action:'check'}),{
  enabled:false,recover:async()=>{calls++;return success('staged_no_send')}
 });
 assert.equal(disabled.status,503);
 assert.equal(calls,0);
});
test('D013: token Vault inválido impide consultar o procesar',async()=>{
 let calls=0, auths=0;
 const req=new Request(url,{
  method:'POST',headers:{'x-cotironda-recovery-token':'0'.repeat(96),
   'content-type':'application/json'},body:'{"action":"execute"}'
 });
 const res=await guardScheduledRecovery(req,{
  enabled:true,
  authorize:async token=>{auths++;return token===vaultToken},
  run:async()=>{calls++;return ejecutarRecuperacionVaultD013(req,{
   enabled:true,recover:async()=>success('staged_no_send')})}
 });
 assert.equal(res.status,401);
 assert.equal(calls,0);
 assert.equal(auths,1);
});
test('D013: sin ningún camino a Whapi, proveedores ni SQL publish',()=>{
 const src=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-v2-review-recovery-d013/index.ts',
  import.meta.url),'utf8');
 assert.match(src,/cotironda_piloto_recovery_token_allowed_mvp132/u);
 assert.match(src,/guardScheduledRecovery/u);
 assert.match(src,/recuperarBuyerReviewD013/u);
 assert.doesNotMatch(src,/gate\.whapi\.cloud|dispatchPending|invite|auto_release|whapi_outbox/iu);
 assert.doesNotMatch(src,/COTIRONDA_PILOT_WEBHOOK_SECRET/u);
});
