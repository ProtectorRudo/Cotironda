import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notificarSeguimientoMvp289} from '../../supabase/functions/cotironda-piloto-whapi/buyer-tracking-confirmation-mvp289.ts';

const id='00000000-0000-4000-8000-000000000029';
const h='a'.repeat(64),event='b'.repeat(64);
const recipient='5492211234567@s.whatsapp.net';
function fixture(overrides={}){
 const calls=[];
 const options={
  enabled:true,buyerVerified:true,mode:'confirmed',requestId:id,
  chatHmac:h,eventHmac:event,recipient,
  rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='cotironda_piloto_issue_confirmed_tracking_mvp289'){
    assert.equal(args.p_chat_hmac,h);
    assert.equal(args.p_event_hmac,event);
    assert.equal(args.p_request,id);
    assert.match(args.p_token_hash,/^[a-f0-9]{64}$/u);
    return {data:{state:'issued',request_id:id},error:null};
   }
   if(name==='cotironda_piloto_finish_tracking_mvp091'){
    assert.equal(args.p_state,'api_accepted');
    return {data:true,error:null};
   }
   if(name==='cotironda_piloto_record_tracking_id_mvp119'){
    assert.equal(args.p_whapi_message_id,'mvp289-msg-000001');
    return {data:true,error:null};
   }
   throw Error('unexpected RPC');
  },
  send:async(to,body)=>{
   calls.push({name:'send',to,body});
   assert.equal(to,recipient);
   assert.match(body,/confirmado y enviamos las solicitudes/u);
   assert.match(body,/cotizaciones por rubro/u);
   assert.match(body,/adjudicación la decidís vos/u);
   assert.match(body,/https:\/\/cotironda-seguimiento-vista-piloto-[^\s]+\/seguimiento#[a-f0-9]{64}/u);
   assert.doesNotMatch(body,/corralon_ailin|Nahuel|token_hash|@s\.whatsapp\.net/u);
   return {accepted:true,messageId:'mvp289-msg-000001'};
  },...overrides
 };
 return {calls,run:()=>notificarSeguimientoMvp289(options)};
}
test('MVP289: link is sent once after private issue and recorded with delivery id',async()=>{
 const {calls,run}=fixture();
 const result=await run();
 assert.deepEqual(result,{estado:'api_aceptada',intentos:1});
 assert.deepEqual(calls.map(c=>c.name),[
  'cotironda_piloto_issue_confirmed_tracking_mvp289',
  'send',
  'cotironda_piloto_finish_tracking_mvp091',
  'cotironda_piloto_record_tracking_id_mvp119'
 ]);
});
test('MVP289: recovery requires separate authenticated SQL decision, never a new dispatch',async()=>{
 const {calls,run}=fixture({mode:'recovery',requestId:null,rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='cotironda_piloto_issue_confirmed_tracking_mvp289'){
   assert.equal(args.p_mode,'recovery');
   assert.equal(args.p_request,null);
   return {data:{state:'issued',request_id:id},error:null};
  }
  if(name==='cotironda_piloto_finish_tracking_mvp091')return {data:true,error:null};
  if(name==='cotironda_piloto_record_tracking_id_mvp119')return {data:true,error:null};
  throw Error('not expected');
 }});
 const result=await run();
 assert.equal(result.estado,'api_aceptada');
 assert.ok(calls.every(c=>!c.name.includes('dispatch')&&!c.name.includes('publish')));
});
test('MVP289: invalid buyer, event, recipient, mode or kill switch cannot issue',async()=>{
 for(const o of [
  {enabled:false},{buyerVerified:false},{chatHmac:'wrong'},
  {eventHmac:'bad'},{recipient:'anyone@example.com'},
  {mode:'recovery',requestId:id},{mode:'confirmed',requestId:null},
  {mode:'other'}
 ]){
  const {calls,run}=fixture(o);
  const r=await run();
  assert.equal(r.intentos,0);
  assert.equal(calls.length,0);
 }
});
test('MVP289: duplicate or foreign SQL reservation never sends',async()=>{
 for(const state of ['already_issued','not_eligible_or_issued','not_authorized']){
  const {calls,run}=fixture({rpc:async(name,args)=>{
   calls.push({name,args});return {data:{state},error:null};
  }});
  assert.equal((await run()).estado,'no_elegible');
  assert.deepEqual(calls.map(x=>x.name),
   ['cotironda_piloto_issue_confirmed_tracking_mvp289']);
 }
});
test('MVP289: uncertain SQL reservation is terminal without WhatsApp',async()=>{
 for(const rpc of [
  async()=>{throw Error('commit unknown')},
  async()=>({data:null,error:'rpc unavailable'})
 ]){
  const {calls,run}=fixture({rpc:async(...a)=>{calls.push({name:a[0]});return rpc(...a)}});
  assert.equal((await run()).estado,'conciliacion_requerida');
  assert.equal(calls.length,1);
 }
});
test('MVP289: Whapi timeout/invalid message id records uncertainty once',async()=>{
 for(const send of [
  async()=>{throw Error('timeout')},
  async()=>({accepted:false,messageId:null}),
  async()=>({accepted:true,messageId:null})
 ]){
  const calls=[];
  const f=fixture({
   send:async(to,body)=>{calls.push('send');return send(to,body)},
   rpc:async(name,args)=>{
    calls.push(name);
    if(name==='cotironda_piloto_issue_confirmed_tracking_mvp289')
     return {data:{state:'issued',request_id:id},error:null};
    assert.equal(name,'cotironda_piloto_finish_tracking_mvp091');
    assert.equal(args.p_state,'uncertain');
    return {data:true,error:null};
   }
  });
  const result=await f.run();
  assert.equal(result.estado,'entrega_incierta');
  assert.equal(result.intentos,1);
  assert.deepEqual(calls,[
   'cotironda_piloto_issue_confirmed_tracking_mvp289',
   'send','cotironda_piloto_finish_tracking_mvp091'
  ]);
 }
});
test('MVP289: webhook intercepts buyer recovery before AI, sends after dispatch',()=>{
 const s=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const recovery=s.indexOf('if(buyerLinkCommand){');
 const ai=s.indexOf('procesarCompradorCentralMvp226({');
 const dispatch=s.indexOf('const result=await despacharSolicitudCentralMvp223({');
 const notify=s.indexOf('for(const notice of buyerLinkRequests){');
 assert.ok(recovery>0&&ai>recovery&&dispatch>ai&&notify>dispatch);
 assert.match(s,/!buyerReviewCommand&&!buyerLinkCommand/u);
 assert.match(s,/trialDispatchChats\.add\(chatHash\)/u);
 assert.match(s,/COTIRONDA_PILOT_BUYER_TRACKING_ENABLED/u);
 assert.ok(!s.slice(recovery,recovery+550).includes('despacharSolicitudCentralMvp223'));
});
