import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publicarRevisionEconomicaVerificadaMvp347} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-economic-publication-mvp347.ts';
import {reprocesarOriginalHistoricoMvp292} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-archive-replay-mvp292.ts';

const SOURCE='a'.repeat(64),CHAT='b'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const file={bytes,sha256:sha,mime:'application/pdf'};
const original={
 kind:'supplier_quote',status:'review_required',delivery_city:null,
 requested_delivery_note:'Contado. Flete a convenir.',
 lines:[
  {original_description:'Cemento CPC',quantity:'15,00',unit:null,
   unit_price:'$ 110,00',line_total:'$ 1.500,00',
   evidence_location:'p1',ambiguity:null},
  {original_description:'BIG BAG de Arena',quantity:'2,00',unit:null,
   unit_price:'$ 200,00',line_total:'$ 400,00',
   evidence_location:'p1',ambiguity:null},
  {original_description:'BIG BAG de Piedra',quantity:'1,00',unit:null,
   unit_price:'$ 300,00',line_total:'$ 300,00',
   evidence_location:'p1',ambiguity:null}
 ],
 total_declared:'$ 2.200,00',unanswered:[]
};
const corrected=()=>({...structuredClone(original),lines:[
 {...original.lines[0],unit_price:'$ 100,00'},...original.lines.slice(1)
]});
const covered=async(f,d)=>({
 state:'source_text_covered',reason:'covered',
 sourceSha256:f.sha256,lines:d.lines.length,
 sourceVerified:false,publicationAllowed:false,rankingAllowed:false
});
const args=(changes={})=>({
 sourceHmac:SOURCE,sha256:sha,originalFile:file,candidate:corrected(),
 sourceCheck:covered,
 rpc:async(name,params)=>{
  assert.equal(name,'cotironda_piloto_publish_revision_mvp347');
  assert.deepEqual(params,{p_message_hmac:SOURCE,p_source_sha256:sha});
  return {data:{state:'published_anonymous'},error:null};
 },
 ...changes
});
test('MVP347: source SHA, independent coverage and cents permit only anonymous publication',async()=>{
 const r=await publicarRevisionEconomicaVerificadaMvp347(args());
 assert.equal(r.state,'published_private');
 assert.equal(r.outboundMessages,0);
});
test('MVP347: unit conflict never reaches SQL',async()=>{
 let calls=0;
 const a=args({candidate:original,rpc:async()=>{calls++;throw Error('no')}});
 const r=await publicarRevisionEconomicaVerificadaMvp347(a);
 assert.equal(r.state,'review_required');assert.equal(calls,0);
});
test('MVP347: tampered PDF bytes and unclaimed PDF amount fail closed',async()=>{
 let calls=0;
 for(const a of [
  args({originalFile:{...file,bytes:new Uint8Array(bytes.length)}}),
  args({sourceCheck:async(f,d)=>({...await covered(f,d),
   state:'needs_source_review',reason:'uncovered_money'})})
 ]){
  a.rpc=async()=>{calls++;throw Error('no SQL allowed')};
  const r=await publicarRevisionEconomicaVerificadaMvp347(a);
  assert.equal(r.state,'review_required');
 }
 assert.equal(calls,0);
});
test('MVP347: denied SQL never reports an approved buyer-visible offer',async()=>{
 const a=args({rpc:async()=>({data:{state:'privacy_or_quality_review'},error:null})});
 const r=await publicarRevisionEconomicaVerificadaMvp347(a);
 assert.equal(r.state,'review_required');
});
test('MVP347: uncertain RPC outcome requires reconciliation',async()=>{
 const r=await publicarRevisionEconomicaVerificadaMvp347(args({
  rpc:async()=>({data:null,error:'db down'})
 }));
 assert.equal(r.state,'reconciliation_required');
});
test('MVP347: replay links source, saves revision, publishes; legacy reader bypassed safely',async()=>{
 const called=[];const candidate=corrected();
 const rpc=async(name,p)=>{
  called.push(name);
  const map={
   cotironda_piloto_reserve_archive_replay_mvp292:{
    state:'reserved',sha256:sha,mime:'application/pdf',
    size_bytes:bytes.length,draft:original},
   cotironda_piloto_record_supplier_media_mvp098:{state:'stored_unverified'},
   cotironda_piloto_store_revision_candidate_mvp346:{state:'candidate_stored'},
   cotironda_piloto_publish_revision_mvp347:{state:'published_anonymous'},
   cotironda_piloto_finish_archive_replay_mvp292:{state:'recorded'}
  };
  assert.ok(Object.hasOwn(map,name),'unexpected RPC '+name);
  if(name==='cotironda_piloto_finish_archive_replay_mvp292'){
   assert.equal(p.p_state,'published');
   assert.equal(p.p_reason,'independent_revised_source_verified');
  }
  return {data:map[name],error:null};
 };
 const r=await reprocesarOriginalHistoricoMvp292({
  enabled:true,trustedInternalWorker:true,
  sourceHmac:SOURCE,chatHmac:CHAT,
  apiKey:'synthetic-not-a-key-123456789',model:'gpt-6-luna',
  documentSemanticEnabled:false,rpc,
  download:async()=>({data:new Blob([bytes]),error:null}),
  corroboration:candidate,corroborationSha256:sha,
  revisionSourceCheck:covered
 });
 assert.equal(r.state,'published_private');
 assert.equal(r.reason,'independent_revised_source_verified');
 assert.equal(r.outboundMessages,0);
 assert.equal(called.includes('cotironda_piloto_compare_supplier_readings_mvp102'),false);
 assert.equal(called.includes('cotironda_piloto_publish_source_text_mvp107'),false);
 assert.equal(called.filter(v=>v==='cotironda_piloto_publish_revision_mvp347').length,1);
});
test('MVP347: independently reviewed document with a SQL denial never publishes',async()=>{
 const called=[];
 const rpc=async(name,p)=>{
  called.push(name);
  if(name==='cotironda_piloto_reserve_archive_replay_mvp292')
   return {data:{state:'reserved',sha256:sha,mime:'application/pdf',
    size_bytes:bytes.length,draft:original},error:null};
  if(name==='cotironda_piloto_record_supplier_media_mvp098')
   return {data:{state:'stored_unverified'},error:null};
  if(name==='cotironda_piloto_store_revision_candidate_mvp346')
   return {data:{state:'candidate_stored'},error:null};
  if(name==='cotironda_piloto_publish_revision_mvp347')
   return {data:{state:'privacy_or_quality_review'},error:null};
  if(name==='cotironda_piloto_compare_supplier_readings_mvp102')
   return {data:{state:'needs_source_review'},error:null};
  if(name==='cotironda_piloto_finish_archive_replay_mvp292'){
   assert.equal(p.p_state,'review');
   return {data:{state:'recorded'},error:null};
  }
  throw Error('unexpected '+name);
 };
 const r=await reprocesarOriginalHistoricoMvp292({
  enabled:true,trustedInternalWorker:true,sourceHmac:SOURCE,chatHmac:CHAT,
  apiKey:'synthetic-not-a-key-123456789',model:'gpt-6-luna',
  documentSemanticEnabled:false,rpc,
  download:async()=>({data:new Blob([bytes]),error:null}),
  corroboration:corrected(),corroborationSha256:sha,
  revisionSourceCheck:covered
 });
 assert.equal(r.state,'review_required');
 assert.equal(called.includes('cotironda_piloto_publish_source_text_mvp107'),false);
});
