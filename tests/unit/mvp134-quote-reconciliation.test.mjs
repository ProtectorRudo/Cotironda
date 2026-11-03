import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnoseOneStoredQuote} from '../../supabase/functions/cotironda-piloto-document-recovery/quote-reconciliation.ts';
import {runRecoveryService} from '../../supabase/functions/cotironda-piloto-document-recovery/logic.ts';
const h='a'.repeat(64);
const bytes=new Uint8Array(256).fill(65);
const hash=async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
 v=>v.toString(16).padStart(2,'0')).join('');
const document=(questions=['IVA sin aclarar','Ver presentación','Confirmar stock'])=>({
 status:'review_required',kind:'supplier_quote',delivery_city:'La Plata',
 requested_delivery_note:'Condiciones sujetas a disponibilidad',
 total_declared:'$ 18000',unanswered:questions,
 lines:[{original_description:'Cemento CPC 50 kg',quantity:'2',unit:'bolsas',
  unit_price:'$ 9000',line_total:'$ 18000',
  evidence_location:'Página 1 fila 1',ambiguity:null}]
});
const result=(state,reason)=>({
 state,reason,lines:1,sourceSha256:null,sourceVerified:false,
 publicationAllowed:false,rankingAllowed:false
});
async function setup(questions,override={}){
 const source=await hash();
 const calls={lookup:0,download:0,record:0,checker:0,recordArgs:null};
 const io={
  lookup:async()=>{calls.lookup++;return {error:null,data:{
   state:'candidate',message_hmac:h,source_sha256:source,
   size_bytes:bytes.length,line_count:1,proposal:document(questions),...override
  }}},
  download:async(path)=>{calls.download++;assert.equal(path,'media/'+h);
   return {error:null,data:new Blob([bytes])}},
  record:async(p)=>{calls.record++;calls.recordArgs=p;
   return {data:{state:'recorded'},error:null}}
 };
 const checker=async(_file,proposal)=>{
  calls.checker++;assert.deepEqual(proposal.unanswered,[]);
  return result('source_text_covered','covered');
 };
 return {io,calls,checker};
}
test('MVP134: scan is PRIVATE even with three model uncertainties',async()=>{
 const {io,calls,checker}=await setup(['IVA','producto','disponibilidad']);
 assert.equal(await diagnoseOneStoredQuote(io,checker),'diagnosed_private');
 assert.equal(calls.download,1);assert.equal(calls.checker,1);
 assert.deepEqual([calls.recordArgs.p_state,calls.recordArgs.p_reason,
  calls.recordArgs.p_question_count],['needs_review','unresolved_questions',3]);
 assert.equal(calls.recordArgs.p_message_hmac,h);
 assert.equal(calls.recordArgs.p_source_sha256,await hash());
});
test('MVP134: matched source without questions is only an advisory, not approval',async()=>{
 const {io,calls,checker}=await setup([]);
 assert.equal(await diagnoseOneStoredQuote(io,checker),'diagnosed_private');
 assert.equal(calls.recordArgs.p_state,'source_candidate');
 assert.equal(calls.recordArgs.p_reason,'covered');
 assert.equal(calls.recordArgs.p_question_count,0);
 assert.equal('ranking_allowed' in calls.recordArgs,false);
});
test('MVP134: original file hash mismatch blocks evidence checker',async()=>{
 const {io,calls,checker}=await setup([], {source_sha256:'b'.repeat(64)});
 assert.equal(await diagnoseOneStoredQuote(io,checker),'diagnosed_private');
 assert.equal(calls.checker,0);
 assert.equal(calls.recordArgs.p_state,'needs_review');
 assert.equal(calls.recordArgs.p_reason,'source_mismatch');
});
test('MVP134: incompatible PDF is private and unauthorised for ranking',async()=>{
 const {io,calls}=await setup(['IVA']);
 const checker=async()=>result('needs_source_review','unsupported_layout');
 assert.equal(await diagnoseOneStoredQuote(io,checker),'diagnosed_private');
 assert.equal(calls.recordArgs.p_reason,'unsupported_layout');
 assert.equal(calls.recordArgs.p_state,'needs_review');
});
test('MVP134: missing, spoofed or forbidden candidate is harmless',async()=>{
 const missing=await setup([]);
 missing.io.lookup=async()=>({data:{state:'none'},error:null});
 assert.equal(await diagnoseOneStoredQuote(missing.io,missing.checker),'none');
 assert.equal(missing.calls.download,0);
 const invalid=await setup([], {message_hmac:'spoof'});
 assert.equal(await diagnoseOneStoredQuote(invalid.io,invalid.checker),'failed');
 assert.equal(invalid.calls.download,0);
 const denied=await setup([]);
 denied.io.record=async()=>({data:{state:'not_permitted'},error:null});
 assert.equal(await diagnoseOneStoredQuote(denied.io,denied.checker),'failed');
});
test('MVP134: new incoming documents always take priority over archived reviews',async()=>{
 const run=new Request('https://test.invalid/',{method:'POST'});
 const hmac='f'.repeat(64);let inspected=0,processed=0;
 const flags={enabled:true,modelKeyAvailable:true,projectMatches:true};
 const fromNew=await runRecoveryService(run,flags,{
  lookup:async()=>({error:null,data:{state:'candidate',trigger_chat_hmac:hmac}}),
  recover:async()=>{processed++;return 'recovered_private'},
  review:async()=>{inspected++;return 'diagnosed_private'}
 });
 assert.equal(fromNew.status,200);assert.equal(processed,1);assert.equal(inspected,0);
 const fromOld=await runRecoveryService(run,flags,{
  lookup:async()=>({error:null,data:{state:'none'}}),
  recover:async()=>{throw Error('should not recover')},
  review:async()=>{inspected++;return 'diagnosed_private'}
 });
 assert.equal((await fromOld.json()).state,'reconciliation_private');
 assert.equal(inspected,1);
});
test('MVP134: no public offer, outbound WhatsApp or webhook in diagnosis',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const scan=read('../../supabase/functions/cotironda-piloto-document-recovery/quote-reconciliation.ts');
 const sql=read('../../supabase/piloto/mvp134_private_quote_reconciliation.sql');
 const edge=read('../../supabase/functions/cotironda-piloto-document-recovery/index.ts');
 assert.match(scan,/crypto\.subtle\.digest\('SHA-256',bytes\)/u);
 assert.match(scan,/unanswered:\[\]/u);
 assert.match(scan,/source_candidate/u);
 assert.match(sql,/enable row level security/u);
 assert.match(sql,/before update or delete/u);
 assert.match(sql,/from public,anon,authenticated,service_role/u);
 assert.match(sql,/grant execute on function public\.cotironda_piloto_next_reconciliation_mvp134\(\)[\s\S]*?to service_role/u);
 assert.match(sql,/p\.consent_at is not null and p\.opted_out_at is null/u);
 assert.match(sql,/r\.closes_at>clock_timestamp\(\)/u);
 assert.match(edge,/diagnoseOneStoredQuote/u);
 // Comments may name protected tables to explain why they remain unchanged.
 // Assert that no business mutation or outbound call is actually implemented.
 assert.doesNotMatch(sql+scan,/\b(?:insert\s+into|update|delete\s+from)\s+(?:\w+\.)?(?:offer_versions|anonymous_supplier_docs_mvp107)\b/iu);
 for(const word of ['publish_source_text','net.http_post','whapi.cloud','sendMessage'])
   assert.equal(sql.includes(word)||scan.includes(word),false,word);
});
