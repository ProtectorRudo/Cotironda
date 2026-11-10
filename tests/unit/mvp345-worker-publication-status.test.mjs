import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {procesarPendienteAutomaticoMvp292} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts';

const H='a'.repeat(64),C='b'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const draft={
 kind:'supplier_quote',status:'review_required',delivery_city:null,
 requested_delivery_note:'Flete a convenir',
 lines:[{original_description:'BIG BAG de Arena',quantity:'2',unit:null,
  unit_price:'$ 300',line_total:'$ 500',evidence_location:'p1',ambiguity:null}],
 total_declared:'$ 500',unanswered:[]
};

function setup(replayResult){
 const calls=[];
 const args={
  enabled:true,trustedWorker:true,apiKey:'synthetic-test-credential-12345678',
  model:'gpt-6-luna',documentSemanticEnabled:false,textCommercialEnabled:false,
  shaText:async()=>{throw Error('should not hash text')},
  decrypt:async()=>{throw Error('should not decrypt text')},
  download:async(path)=>{
   assert.equal(path,'media/'+H);
   return {data:new Blob([bytes]),error:null};
  },
  rpc:async(name,params)=>{
   calls.push({name,params});
   if(name==='cotironda_piloto_claim_auto_recovery_mvp292')
    return {data:{state:'claimed',source_hmac:H,chat_hmac:C,
     source_sha256:sha,kind:'document',mime:'application/pdf',
     size_bytes:bytes.length,draft},error:null};
   if(name==='cotironda_piloto_finish_auto_recovery_mvp292')
    return {data:{state:'recorded'},error:null};
   throw Error('unexpected rpc '+name);
  },
  readDocument:async()=>structuredClone(draft),
  correlate:async()=>({state:'linked_private',reason:'unique',outboundMessages:0}),
  replay:async(input)=>{
   assert.equal(input.corroborationSha256,sha);
   assert.deepEqual(input.corroboration,draft);
   return replayResult;
  }
 };
 return {args,calls};
}

for(const [label,replay,state,reason] of [
 ['verified',{state:'published_private',reason:'independent_source_verified'},
  'linked_private','archive_quote_published_anonymous'],
 ['price-conflict',{state:'review_required',reason:'unit_price_source_recheck_required'},
  'review_required','archive_quote_unit_price_source_recheck_required'],
 ['source-unverified',{state:'review_required',reason:'source_or_amounts_unverified'},
  'review_required','archive_quote_economic_or_source_review_required'],
 ['reconciliation',{state:'reconciliation_required',reason:'archive_recovery_uncertain'},
  'reconciliation_required','archive_quote_replay_needs_reconciliation'],
 ['not-eligible',{state:'not_eligible',reason:'already_claimed'},
  'review_required','archive_quote_not_published']
]){
 test('MVP345: '+label+' no se confunde con publicación',async()=>{
  const t=setup(replay);
  const result=await procesarPendienteAutomaticoMvp292(t.args);
  assert.equal(result.state,state);
  assert.equal(result.reason,reason);
  assert.equal(result.processed,1);
  assert.equal(result.outboundMessages,0);
  const finishes=t.calls.filter(c=>c.name==='cotironda_piloto_finish_auto_recovery_mvp292');
  assert.equal(finishes.length,1);
  // Only association is marked linked; never claim an economic publication
  // through the correlation lease's state field.
  assert.equal(finishes[0].params.p_state,'linked');
  assert.equal(finishes[0].params.p_reason,reason);
 });
}
