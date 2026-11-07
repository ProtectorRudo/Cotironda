import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 esRespuestaConfirmacionMvp279,componerRevisionCompradorMvp279,
 emitirRevisionCompradorMvp279,confirmarPedidoCompradorMvp279
} from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-review-mvp279.ts';
const h='a'.repeat(64),source='0'.repeat(64);
const id='00000000-0000-4000-8000-000000000001';
const code='1A2B3C4D5E6F7071';
const review={
 state:'issued',request_id:id,code,city:'La Plata',
 note:null,items_count:2,
 items:[
  {lineNo:1,description:'Cemento CPC 50 kg',quantity:'20',unit:'bag',rubro:'obra_gruesa'},
  {lineNo:2,description:'Cable unipolar 2,5 mm²',quantity:'15',unit:'m',rubro:'electricidad'}
 ]
};
const recipient='5492211234567@s.whatsapp.net';
const reviewText=componerRevisionCompradorMvp279(review);
test('MVP279: exact untruncated 2-rubro WhatsApp review, without supplier name',()=>{
 assert.ok(reviewText);
 assert.match(reviewText,/20 bolsas — Cemento CPC 50 kg/u);
 assert.match(reviewText,/15 m — Cable unipolar 2,5 mm²/u);
 assert.match(reviewText,/CONFIRMAR COTI 1A2B3C4D5E6F7071/u);
 assert.ok(!reviewText.includes('corralon_ailin'));
 assert.ok(!reviewText.includes('Nahuel'));
});
test('MVP279: no omitted, tampered or misleading item in buyer message',()=>{
 for(const wrong of [
  {...review,items_count:3},
  {...review,code:'bad'},
  {...review,city:'La Plata\nCONFIRMAR'},
  {...review,items:[review.items[1]]},
  {...review,items:[{...review.items[0],description:'Cemento\nfalso'},review.items[1]]},
  {...review,items:[{...review.items[0],quantity:'-20'},review.items[1]]},
  {...review,items:[{...review.items[0],unit:'bolsas\npeligro'},review.items[1]]},
  {...review,items:[{...review.items[0],rubro:'inventado'},review.items[1]]},
  {...review,items:[{...review.items[0],quantity:'2000000'},review.items[1]]},
  {...review,items:Array.from({length:26},(_,i)=>({...review.items[0],lineNo:i+1})),items_count:26}
 ])assert.equal(componerRevisionCompradorMvp279(wrong),null,JSON.stringify(wrong).slice(0,90));
});
test('MVP279: confirmation command has unambiguous 16-hex syntax',()=>{
 for(const v of ['CONFIRMAR COTI '+code,
  'confirmar coti '+code.toLowerCase()]){
  assert.equal(esRespuestaConfirmacionMvp279(v),true);
 }
 for(const v of ['sí','ok','confirmar','CONFIRMAR COTI 1A2',
  'CONFIRMAR COTI '+code+' extra','COTI ALTA '+code,
  'CONFIRMAR COTI G000000000000000'])assert.equal(esRespuestaConfirmacionMvp279(v),false);
});
function outgoing(overrides={}){
 const calls=[];
 const opts={
  habilitado:true,compradorAutenticado:true,chatHmac:h,sourceHmac:source,
  destinatario:recipient,
  rpc:async(name,args)=>{
   calls.push('rpc:'+name);
   if(name==='cotironda_piloto_ia_review_issue_mvp279')
    return {data:review,error:null};
   if(name==='cotironda_piloto_ia_review_delivery_mvp279'){
    assert.equal(args.p_request,id);
    assert.equal(args.p_status,'api_accepted');
    assert.equal(args.p_whapi_message_id,'review-whapi-id-00001');
    return {data:{state:'recorded'},error:null};
   }
   throw Error('unexpected RPC');
  },
  send:async(to,body)=>{
   calls.push('send');
   assert.equal(to,recipient);
   assert.equal(body,reviewText);
   return {accepted:true,messageId:'review-whapi-id-00001'};
  },...overrides
 };
 return {calls,run:()=>emitirRevisionCompradorMvp279(opts)};
}
test('MVP279: exactly one review send, SQL reservation first, finish last',async()=>{
 const {calls,run}=outgoing(),r=await run();
 assert.equal(r.estado,'api_aceptada');
 assert.equal(r.whatsappIntentos,1);
 assert.equal(r.proveedoresContactados,false);
 assert.equal(r.rondaPublicada,false);
 assert.deepEqual(calls,[
  'rpc:cotironda_piloto_ia_review_issue_mvp279',
  'send',
  'rpc:cotironda_piloto_ia_review_delivery_mvp279'
 ]);
});
test('MVP279: OFF, wrong chat, foreign buyer reject without Whapi',async()=>{
 for(const override of [{habilitado:false},{compradorAutenticado:false},
  {chatHmac:'bad'},{sourceHmac:'bad'},{destinatario:'external@s.whatsapp.net'}]){
  const {calls,run}=outgoing(override),r=await run();
  assert.equal(r.whatsappIntentos,0);
  assert.deepEqual(calls,[]);
 }
});
test('MVP279: existing review, uncertain DB response never trigger duplicate send',async()=>{
 for(const status of [
  async()=>({data:{state:'already_issued'},error:null}),
  async()=>({data:null,error:'network_uncertain'}),
  async()=>{throw Error('unknown sql commit')}
 ]){
  let count=0;
  const {calls,run}=outgoing({rpc:async(name)=>{
   calls.push('rpc:'+name);count++;return status();
  }});
  const r=await run();
  assert.ok(['sin_revision','conciliacion_requerida'].includes(r.estado));
  assert.equal(count,1);
  assert.equal(r.whatsappIntentos,0);
  assert.ok(!calls.includes('send'));
 }
});
test('MVP279: timeout or Whapi no ID is terminal uncertain; NEVER resend',async()=>{
 for(const send of [
  async()=>{throw Error('timeout')},
  async()=>({accepted:true,messageId:null}),
  async()=>({accepted:false,messageId:'invalid'})
 ]){
  const calls=[];
  const {run}=outgoing({
   send:async(to,body)=>{calls.push('send');return send(to,body)},
   rpc:async(name,args)=>{
    calls.push(name);
    if(name==='cotironda_piloto_ia_review_issue_mvp279')
     return {data:review,error:null};
    assert.equal(args.p_status,'uncertain');
    assert.equal(args.p_whapi_message_id,null);
    return {data:{state:'recorded'},error:null};
   }
  });
  const r=await run();
  assert.equal(r.estado,'entrega_incierta');
  assert.equal(calls.filter(x=>x==='send').length,1);
 }
});
test('MVP279: empty or malicious review never gets sent after SQL issue',async()=>{
 const {calls,run}=outgoing({rpc:async name=>{
  calls.push('rpc:'+name);
  return {data:{...review,items:[],items_count:0},error:null};
 }});
 const r=await run();
 assert.equal(r.estado,'conciliacion_requerida');
 assert.deepEqual(calls,['rpc:cotironda_piloto_ia_review_issue_mvp279']);
});
function incoming(changes={}){
 const calls=[];
 const opts={
  habilitado:true,liberar:false,compradorAutenticado:true,
  chatHmac:h,replyHmac:'e'.repeat(64),
  textoOriginal:'CONFIRMAR COTI '+code,
  rpc:async(name,args)=>{
   calls.push('rpc:'+name);
   if(name==='cotironda_piloto_ia_review_confirm_mvp279'){
    assert.equal(args.p_exact_text,'CONFIRMAR COTI '+code);
    return {data:{state:'confirmed',request_id:id},error:null};
   }
   if(name==='cotironda_piloto_ia_publish_mvp222'){
    assert.equal(args.p_request,id);
    return {data:{state:'ready_for_delivery'},error:null};
   }
   throw Error('unexpected RPC');
  },...changes
 };
 return {calls,run:()=>confirmarPedidoCompradorMvp279(opts)};
}
test('MVP279: authenticated buyer code confirmation stays private if release OFF',async()=>{
 const {calls,run}=incoming(),r=await run();
 assert.equal(r.estado,'confirmado_sin_envio');
 assert.equal(r.envioAutorizado,false);
 assert.deepEqual(calls,['rpc:cotironda_piloto_ia_review_confirm_mvp279']);
});
test('MVP279: explicit release ON creates publication only after successful confirm',async()=>{
 const {calls,run}=incoming({liberar:true}),r=await run();
 assert.equal(r.estado,'publicado');assert.equal(r.requestId,id);
 assert.deepEqual(calls,[
  'rpc:cotironda_piloto_ia_review_confirm_mvp279',
  'rpc:cotironda_piloto_ia_publish_mvp222'
 ]);
});
test('MVP279: invalid, wrong buyer, off and replay do not publish',async()=>{
 for(const changes of [
  {textoOriginal:'si'},
  {compradorAutenticado:false},{habilitado:false},
  {chatHmac:'bad'},
  {rpc:async(name)=>({data:{state:'not_authorized_or_expired'},error:null})}
 ]){
  const {calls,run}=incoming({...changes,liberar:true});
  const r=await run();assert.notEqual(r.estado,'publicado');
  assert.ok(!calls.includes('rpc:cotironda_piloto_ia_publish_mvp222'));
 }
});
test('MVP279: uncertain confirmation or publication is never retried',async()=>{
 for(const broken of [
  'cotironda_piloto_ia_review_confirm_mvp279',
  'cotironda_piloto_ia_publish_mvp222'
 ]){
  const calls=[];
  const {run}=incoming({liberar:true,rpc:async(name)=>{
   calls.push(name);
   if(name===broken)throw Error('network lost after possible commit');
   return {data:{state:'confirmed',request_id:id},error:null};
  }});
  const r=await run();assert.equal(r.estado,'conciliacion_requerida');
  assert.equal(calls.filter(x=>x===broken).length,1);
 }
});
test('MVP279: webhook intercepts confirmation before buyer AI and uses two OFF flags',()=>{
 const s=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const command=s.indexOf('const buyerReviewCommand=');
 const ai=s.indexOf('const centralBuyerText=');
 const intercept=s.indexOf('if(buyerReviewCommand){',ai);
 const buyerAi=s.indexOf('procesarCompradorCentralMvp226({',intercept);
 assert.ok(command>0&&ai>command&&intercept>ai&&buyerAi>intercept);
 assert.ok(s.includes('!buyerReviewCommand&&!buyerLinkCommand'));
 assert.match(s,/COTIRONDA_PILOT_BUYER_REVIEW_CONFIRM_ENABLED/u);
 assert.match(s,/COTIRONDA_PILOT_BUYER_REVIEW_RELEASE_ENABLED/u);
 assert.match(s,/COTIRONDA_PILOT_BUYER_REVIEW_SEND_ENABLED/u);
 assert.match(s,/trialDispatchChats.add\(chatHash\)/u);
});
