import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {procesarPendienteAutomaticoMvp292} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts';
import {correlacionAutomaticaMvp291 as correlacionMvp336} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.ts';

const H='a'.repeat(64),C='b'.repeat(64);
const TARGET='11111111-1111-4111-8111-111111111111';
const OLD='22222222-2222-4222-8222-222222222222';
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const draft={
 kind:'supplier_quote',status:'review_required',
 delivery_city:null,requested_delivery_note:'La Plata',
 lines:[
  {original_description:'Cemento Avellaneda',quantity:'15,00',unit:null,
   unit_price:'$100',line_total:'$1500',evidence_location:'p1',ambiguity:null},
  {original_description:'BIG BAG de Arena',quantity:'2,00',unit:null,
   unit_price:'$200',line_total:'$400',evidence_location:'p1',ambiguity:null},
  {original_description:'BIG BAG de Piedra',quantity:'1,00',unit:null,
   unit_price:'$300',line_total:'$300',evidence_location:'p1',ambiguity:null}
 ],total_declared:'$2200',unanswered:[]
};
const quote=draft.lines.map((r,i)=>({
 line_no:i+1,description:r.original_description,quantity:r.quantity,unit:r.unit
}));
const candidates=[
 {request_id:TARGET,lines:[
  {line_no:1,description:'Cemento CPC 50 kg',quantity:'15',unit:'bolsas'},
  {line_no:2,description:'Arena',quantity:'2',unit:'bolsones'},
  {line_no:3,description:'Piedra',quantity:'1',unit:'bolsón'}
 ]},
 {request_id:OLD,lines:[
  {line_no:1,description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas'},
  {line_no:2,description:'Arena',quantity:'3',unit:'bolsones'}
 ]}
];
const pairs={matches:[
 ...[1,2,3].map(i=>({
  candidate:'r1',source_line:i,request_line:i,relation:'equivalent'
 })),
 ...[1,2].map(i=>({
  candidate:'r2',source_line:i,request_line:i,relation:'equivalent'
 }))
]};
function setup({inconsistent=false,duplicate=false}={}){
 const events=[];let once=duplicate,readings=0,comparing=0,replayCount=0;
 const rpc=async(name,args={})=>{
  events.push(name);
  if(name==='cotironda_piloto_claim_auto_recovery_mvp292')
   return {data:{state:'empty'},error:null};
  if(name==='cotironda_piloto_claim_reviewed_auto_recovery_mvp336'){
   if(once)return {data:{state:'empty'},error:null};
   once=true;
   return {data:{
    state:'claimed',retry_reviewed:true,
    source_hmac:H,chat_hmac:C,source_sha256:sha,
    kind:'document',mime:'application/pdf',size_bytes:bytes.length,draft
   },error:null};
  }
  if(name==='cotironda_piloto_auto_correlation_retry_prepare_mvp336'){
   assert.equal(args.p_source_hmac,H);
   assert.equal(args.p_chat_hmac,C);
   return {data:{state:'reserved',source_sha256:sha,
    quote,candidates,note:null},error:null};
  }
  if(name==='cotironda_piloto_auto_correlation_bind_mvp291'){
   assert.equal(args.p_request,TARGET);
   assert.equal(args.p_source_sha256,sha);
   return {data:{state:'linked_private'},error:null};
  }
  if(name==='cotironda_piloto_finish_auto_recovery_mvp292'){
   assert.equal(args.p_state,inconsistent?'review':'linked');
   return {data:{state:'recorded'},error:null};
  }
  if(name==='cotironda_piloto_auto_correlation_finish_mvp291'){
   assert.equal(args.p_state,'review');
   return {data:{state:'recorded'},error:null};
  }
  throw Error('unexpected_rpc_'+name);
 };
 const args={
  enabled:true,trustedWorker:true,
  apiKey:'synthetic-only-not-real-credential-123456',
  model:'gpt-6-luna',documentSemanticEnabled:false,
  textCommercialEnabled:false,rpc,
  shaText:async()=>{throw Error('not_text')},
  decrypt:async()=>{throw Error('not_text')},
  download:async path=>{
   events.push('storage_download');
   assert.equal(path,'media/'+H);
   return {data:new Blob([bytes]),error:null};
  },
  readDocument:async()=>{
   readings++;
   return inconsistent?
    {...draft,lines:[{...draft.lines[0],quantity:'16'},...draft.lines.slice(1)]}:
    {...draft};
  },
  correlate:async inputs=>{
   assert.equal(inputs.retryReviewedOnce,true);
   return correlacionMvp336({...inputs,compare:async()=>{
    comparing++;
    return pairs;
   }});
  },
  replay:async({corroborationSha256,corroboration})=>{
   replayCount++;
   assert.equal(corroborationSha256,sha);
   assert.equal(corroboration.lines.length,3);
   assert.equal(corroboration.lines[0].unit,null);
   return {
    state:'review_required',
    reason:'independent_source_economics_not_verified',
    outboundMessages:0
   };
  }
 };
 return {
  args,events,
  get readings(){return readings},
  get comparing(){return comparing},
  get replayCount(){return replayCount}
 };
}
test('MVP343 E2E privado: PDF archivado -> segunda lectura -> empate resuelto 15/2/1 -> revisión comercial',async()=>{
 const s=setup();
 const result=await procesarPendienteAutomaticoMvp292(s.args);
 // A unique round match is PRIVATE, not evidence that economic gates passed.
 assert.equal(result.state,'review_required');
 assert.equal(result.reason,'archive_quote_economic_or_source_review_required');
 assert.equal(result.outboundMessages,0);
 assert.equal(result.processed,1);
 assert.equal(s.readings,1);
 assert.equal(s.comparing,2);
 assert.equal(s.replayCount,1);
 assert.deepEqual(s.events,[
  'cotironda_piloto_claim_auto_recovery_mvp292',
  'cotironda_piloto_claim_reviewed_auto_recovery_mvp336',
  'storage_download',
  'cotironda_piloto_auto_correlation_retry_prepare_mvp336',
  'cotironda_piloto_auto_correlation_bind_mvp291',
  'cotironda_piloto_finish_auto_recovery_mvp292'
 ]);
 // No automatic quote publication when the separate economic gates are not met.
 const again=await procesarPendienteAutomaticoMvp292(s.args);
 assert.equal(again.state,'empty');
 assert.equal(s.readings,1);
 assert.equal(s.comparing,2);
 assert.equal(s.replayCount,1);
});
test('MVP343 E2E privado: reading mismatch must not bind, replay or send WhatsApp',async()=>{
 const s=setup({inconsistent:true});
 const r=await procesarPendienteAutomaticoMvp292(s.args);
 assert.equal(r.state,'review_required');
 assert.equal(r.outboundMessages,0);
 assert.equal(s.readings,1);
 assert.equal(s.comparing,0);
 assert.equal(s.replayCount,0);
 assert.equal(s.events.includes('cotironda_piloto_auto_correlation_bind_mvp291'),false);
});
test('MVP343 E2E privado: no new claim means zero downloads/AI',async()=>{
 const s=setup({duplicate:true});
 const r=await procesarPendienteAutomaticoMvp292(s.args);
 assert.equal(r.state,'empty');
 assert.equal(r.outboundMessages,0);
 assert.equal(s.readings,0);
 assert.equal(s.comparing,0);
 assert.equal(s.replayCount,0);
 assert.equal(s.events.includes('storage_download'),false);
});
