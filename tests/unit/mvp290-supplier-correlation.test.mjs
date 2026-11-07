import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 esCodigoDeRondaMvp290,construirConsultaRondaMvp290,
 consultarRondaMvp290,resolverEleccionMvp290
} from '../../supabase/functions/cotironda-piloto-whapi/supplier-choice-mvp290.ts';
import {procesarFuenteArchivadaMvp290} from '../../supabase/functions/cotironda-piloto-whapi/supplier-archived-replay-mvp290.ts';
const H='a'.repeat(64),E='b'.repeat(64);
const recipient='5492211234567@s.whatsapp.net';
const options=[
 {code:'abcd123456',date:'07/11',city:'La Plata',material:'cemento CPC 50 kg'},
 {code:'f987654321',date:'03/11',city:'La Plata',material:'cemento gris 25 kg'}
];
test('MVP290: never guess the newest or a price; all option codes are explicit',()=>{
 const message=construirConsultaRondaMvp290(options);
 assert.ok(message);
 assert.match(message,/COTI abcd123456/u);
 assert.match(message,/COTI f987654321/u);
 assert.match(message,/No hace falta reenviar el presupuesto/u);
 assert.doesNotMatch(message,/whatsapp|ganador|cliente:|CUIT/iu);
 assert.equal(construirConsultaRondaMvp290([options[0],options[0]]),null);
 assert.equal(construirConsultaRondaMvp290([{...options[0],material:'texto\nprivado'}]),null);
 assert.equal(construirConsultaRondaMvp290(Array.from({length:25},()=>options[0])),null);
 assert.equal(esCodigoDeRondaMvp290('COTI abcd123456'),true);
 for(const invalid of ['COTI','COTI 123456','COTI ABCD123456',
 'COTI abcd123456 ', 'COTI abcd123456 $500'])assert.equal(esCodigoDeRondaMvp290(invalid),false);
});
function sendFixture(overrides={}){
 const calls=[];
 const args={enabled:true,trustedSupplier:true,sourceHmac:H,chatHmac:E,
  recipient,
  rpc:async(name,params)=>{
   calls.push({name,params});
   if(name==='cotironda_piloto_reserve_supplier_choice_mvp290'){
    assert.equal(params.p_source_hmac,H);assert.equal(params.p_chat_hmac,E);
    return {data:{state:'reserved',options},error:null};
   }
   assert.equal(name,'cotironda_piloto_finish_supplier_choice_mvp290');
   assert.equal(params.p_source_hmac,H);
   assert.equal(params.p_state,'api_accepted');
   assert.equal(params.p_whapi_message_id,'mvp290-prompt-000001');
   return {data:{state:'recorded'},error:null};
  },
  send:async(to,body)=>{
   calls.push({name:'send',to,body});
   assert.equal(to,recipient);assert.match(body,/COTI f987654321/u);
   return {accepted:true,messageId:'mvp290-prompt-000001'};
  },...overrides};
 return {calls,run:()=>consultarRondaMvp290(args)};
}
test('MVP290: one private prompt, one DB claim, one Whapi attempt, one finish',async()=>{
 const f=sendFixture();const r=await f.run();
 assert.deepEqual(r,{state:'accepted',attempts:1,choices:2});
 assert.deepEqual(f.calls.map(x=>x.name),[
  'cotironda_piloto_reserve_supplier_choice_mvp290','send',
  'cotironda_piloto_finish_supplier_choice_mvp290'
 ]);
});
test('MVP290: duplicate claim or unauthorised sender never sends or charges',async()=>{
 for(const overrides of [
  {enabled:false},{trustedSupplier:false},{chatHmac:'wrong'},
  {recipient:'wrong@example.com'}, {sourceHmac:'not-a-hash'}
 ]){
  const f=sendFixture(overrides);
  const r=await f.run();assert.equal(r.attempts,0);assert.equal(f.calls.length,0);
 }
 const calls=[];
 const f=sendFixture({rpc:async(name)=>{
  calls.push(name);return {data:{state:'already_reserved'},error:null}
 }});
 assert.equal((await f.run()).state,'not_eligible');
 assert.deepEqual(calls,['cotironda_piloto_reserve_supplier_choice_mvp290']);
});
test('MVP290: uncertain response is terminal, no second WhatsApp',async()=>{
 const calls=[];
 const f=sendFixture({
  send:async()=>{calls.push('send');throw Error('timeout')},
  rpc:async(name,params)=>{
   calls.push(name);
   if(name==='cotironda_piloto_reserve_supplier_choice_mvp290')
    return {data:{state:'reserved',options},error:null};
   assert.equal(params.p_state,'uncertain');
   assert.equal(params.p_whapi_message_id,null);
   return {data:{state:'recorded'},error:null};
  }
 });
 assert.equal((await f.run()).state,'uncertain');
 assert.deepEqual(calls,[
  'cotironda_piloto_reserve_supplier_choice_mvp290',
  'send','cotironda_piloto_finish_supplier_choice_mvp290'
 ]);
});
test('MVP290: a control reply is bound to its original source, not a new quote',async()=>{
 const calls=[];
 const r=await resolverEleccionMvp290({
  enabled:true,trustedSupplier:true,chatHmac:H,replyHmac:E,
  body:'COTI abcd123456',
  rpc:async(name,params)=>{
   calls.push({name,params});
   return {data:{state:'resolved_private',source_hmac:H,source_kind:'document'},error:null};
  }
 });
 assert.deepEqual(r,{state:'resolved_private',sourceHmac:H,sourceKind:'document'});
 assert.equal(calls[0].name,'cotironda_piloto_resolve_supplier_choice_mvp290');
 assert.equal(calls[0].params.p_original_text,'COTI abcd123456');
 const wrong=await resolverEleccionMvp290({
  enabled:true,trustedSupplier:true,chatHmac:H,replyHmac:E,
  body:'COTI abcd123456',
  rpc:async()=>({data:{state:'not_eligible'},error:null})
 });
 assert.equal(wrong.state,'not_eligible');
});
const original=new TextEncoder().encode('%PDF-1.4\n1 0 obj\nendobj\n%%EOF\n');
const validDraft={kind:'supplier_quote',status:'review_required',
 delivery_city:null,requested_delivery_note:null,
 lines:[{original_description:'Bolsa de cemento 25kg',
 quantity:'40',unit:'bolsas',unit_price:'$100',line_total:'$4.000',
 evidence_location:'p1',ambiguity:null}],
 total_declared:'$4.000',unanswered:[]};
async function replayFixture(overrides={}){
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',original)),
  x=>x.toString(16).padStart(2,'0')).join('');
 const calls=[];
 const opts={
  enabled:true,authenticatedSupplier:true,sourceHmac:H,chatHmac:E,
  apiKey:'not-a-real-api-key-for-tests',model:'gpt-6-luna',
  allowOneCorroboration:false,documentQuoteEnabled:false,
  download:async(path)=>{calls.push({name:'download',path});
   assert.equal(path,'media/'+H);
   return {data:new Blob([original],{type:'application/pdf'}),error:null};
  },
  checkPdf:async()=>{calls.push({name:'pdf_validation'});
   return {state:'source_text_covered',reason:'covered',sourceSha256:sha,lines:1};
  },
  rpc:async(name,params)=>{
   calls.push({name,params});
   const states={
    cotironda_piloto_reserve_supplier_replay_mvp290:{
     state:'reserved',sha256:sha,mime:'application/pdf',
     size_bytes:original.length,draft:validDraft,second:validDraft
    },
    cotironda_piloto_record_supplier_media_mvp098:{state:'stored_unverified'},
    cotironda_piloto_compare_supplier_readings_mvp102:{state:'model_readings_match'},
    cotironda_piloto_audit_supplier_amounts_mvp103:{state:'balanced'},
    cotironda_piloto_record_supplier_source_check_mvp106:{state:'source_text_covered'},
    cotironda_piloto_publish_source_text_mvp107:{state:'published_anonymous'},
    cotironda_piloto_finish_supplier_replay_mvp290:{state:'recorded'}
   };
   if(!Object.hasOwn(states,name))throw Error('unexpected SQL '+name);
   return {data:states[name],error:null};
  },...overrides
 };
 return {calls,run:()=>procesarFuenteArchivadaMvp290(opts),sha};
}
test('MVP290: linked archived PDF reuses stored readings, binary SHA and economic guards',async()=>{
 const f=await replayFixture();
 const r=await f.run();
 assert.equal(r.state,'published_private');assert.equal(r.outboundMessages,0);
 const paths=f.calls.map(x=>x.name);
 assert.ok(paths.indexOf('cotironda_piloto_compare_supplier_readings_mvp102')>
   paths.indexOf('cotironda_piloto_record_supplier_media_mvp098'));
 assert.ok(paths.indexOf('cotironda_piloto_publish_source_text_mvp107')>
   paths.indexOf('pdf_validation'));
 assert.equal(paths.at(-1),'cotironda_piloto_finish_supplier_replay_mvp290');
 assert.ok(paths.every(x=>!x.includes('dispatch')&&!x.includes('whapi')));
});
test('MVP290: wrong binary SHA or duplicate replay cannot publish or resend',async()=>{
 const f=await replayFixture({download:async()=>({data:new Blob(['FAKE BYTES']),error:null})});
 assert.equal((await f.run()).state,'reconciliation_required');
 assert.ok(!f.calls.some(x=>x.name==='cotironda_piloto_publish_source_text_mvp107'));
 let count=0;
 const g=await replayFixture({rpc:async()=>{count++;return {data:{state:'already_reserved'},error:null}}});
 assert.equal((await g.run()).state,'not_eligible');assert.equal(count,1);
});
test('MVP290: uncorroborated source stays private; never fabricate an offer',async()=>{
 const f=await replayFixture({rpc:async(name,args)=>{
  f.calls.push({name,args});
  const states={
   cotironda_piloto_reserve_supplier_replay_mvp290:{
    state:'reserved',sha256:f.sha,mime:'application/pdf',
    size_bytes:original.length,draft:validDraft,second:null
   },
   cotironda_piloto_record_supplier_media_mvp098:{state:'stored_unverified'},
   cotironda_piloto_finish_supplier_replay_mvp290:{state:'recorded'}
  };
  assert.ok(Object.hasOwn(states,name),'unexpected economic publication '+name);
  return {data:states[name],error:null};
 }});
 const r=await f.run();assert.equal(r.state,'review_required');
 assert.equal(r.reason,'corroboration_missing');
 assert.ok(!f.calls.some(x=>x.name==='cotironda_piloto_publish_source_text_mvp107'));
});
test('MVP290: webhook supplier codes cannot reach other routes or trigger a new invitation',()=>{
 const s=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const recv=s.indexOf("const out=await db.rpc('cotironda_piloto_receive_whapi_v1'");
 const choice=s.indexOf('if(supplierChoiceReply){');
 const normal=s.indexOf("if(row.type==='text'&&centralSupplier&&!isClarificationAnswer");
 const dispatch=s.indexOf('const result=await despacharSolicitudCentralMvp223(');
 assert.ok(recv>0&&choice>recv&&normal>choice&&dispatch>normal);
 assert.match(s,/COTIRONDA_PILOT_SUPPLIER_CHOICES_MVP290_ENABLED/u);
 assert.match(s,/cotironda_piloto_stage_supplier_secondary_mvp290/u);
 assert.match(s,/if\(clarificationSourceHmac&&[\s\S]*?!\(supplierChoiceEnabled&&supplierChoiceSourceHmac\)/u);
});
