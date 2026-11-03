import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recoverOneStoredDocument} from '../../supabase/functions/cotironda-piloto-whapi/private-document-recovery.ts';
const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../supabase/piloto/mvp128_legacy_document_recovery_queue.sql',import.meta.url),'utf8');
const h='a'.repeat(64),trigger='b'.repeat(64);
const pdf=new TextEncoder().encode('%PDF-1.4\nA synthetic PDF, not a real supplier document.\n%%EOF');
const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pdf)),b=>b.toString(16).padStart(2,'0')).join('');
const draft={status:'review_required',kind:'supplier_quote',delivery_city:null,
 requested_delivery_note:null,
 lines:[{original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsa',
 unit_price:'$ 11.000,00',line_total:'$ 220.000,00',evidence_location:'p.1/fila 1',ambiguity:null}],
 total_declared:'$ 220.000,00',unanswered:[]};
function setup(options={}){
 const calls=[];let downloaded=0;let reads=0;
 const io={
  async rpc(name,args){
   calls.push({name,args});
   if(name.endsWith('next_document_retry_mvp128'))
    return {data:{state:'candidate',message_hmac:h},error:null};
   if(name.endsWith('reserve_document_retry_mvp127'))
    return {data:{state:'reserved',source_sha256:options.badHash?'f'.repeat(64):sha,
      mime:'application/pdf',size_bytes:pdf.length,supplier_quote:true},error:null};
   if(name.endsWith('note_media_proposal_mvp095')||name.endsWith('note_document_draft_mvp127'))
    return {data:true,error:null};
   if(name.endsWith('record_supplier_media_mvp098'))
    return {data:{state:'stored_unverified'},error:null};
   if(name.endsWith('compare_supplier_readings_mvp102'))
    return {data:{state:args.p_second_proposal?'model_readings_match':'second_unavailable'},error:null};
   if(name.endsWith('audit_supplier_amounts_mvp103'))
    return {data:{state:'balanced'},error:null};
   if(name.endsWith('record_supplier_source_check_mvp106'))
    return {data:{state:'needs_source_review'},error:null};
   if(name.endsWith('note_document_failure_mvp127'))
    return {data:true,error:null};
   if(name.endsWith('publish_source_text_mvp107'))
    throw Error('Synthetic PDF must never be published');
   throw Error('Unknown RPC: '+name);
  },
  async download(path){
   downloaded++;
   assert.equal(path,'media/'+h);
   return {data:new Blob([pdf],{type:'application/pdf'}),error:null};
  }
 };
 const read=async(args)=>{
  reads++;
  assert.equal(args.apiKey,'sk-test-only');
  assert.equal(args.file.sha256,sha);
  assert.deepEqual(args.file.bytes,pdf);
  if(options.failPrimary&&args.perspective==='primary')throw Error('doc_ai_quota');
  if(options.failBoth)throw Error('doc_ai_transport_timeout');
  return {...draft};
 };
 return {io,read,calls,get downloads(){return downloaded},get reads(){return reads}};
}
test('MVP128: archive bytes are read privately and independently verified by SHA256',async()=>{
 const f=setup();
 const result=await recoverOneStoredDocument({io:f.io,triggerChatHmac:trigger,apiKey:'sk-test-only',enabled:true,read:f.read});
 assert.equal(result,'recovered_private');
 assert.equal(f.downloads,1);assert.equal(f.reads,2);
 assert.ok(f.calls.some(x=>x.name.endsWith('note_media_proposal_mvp095')));
 assert.ok(f.calls.some(x=>x.name.endsWith('record_supplier_media_mvp098')));
 assert.ok(f.calls.some(x=>x.name.endsWith('compare_supplier_readings_mvp102')));
 assert.ok(f.calls.some(x=>x.name.endsWith('audit_supplier_amounts_mvp103')));
 assert.ok(f.calls.some(x=>x.name.endsWith('record_supplier_source_check_mvp106')));
 assert.ok(!f.calls.some(x=>x.name.endsWith('publish_source_text_mvp107')));
 assert.ok(!f.calls.some(x=>/send|outbox|message|tracking|invitation/.test(x.name)&&!x.name.endsWith('note_document_failure_mvp127')));
});
test('MVP128: a single successful AI reading saves private draft only, cannot corroborate itself',async()=>{
 const f=setup({failPrimary:true});
 const state=await recoverOneStoredDocument({io:f.io,triggerChatHmac:trigger,apiKey:'sk-test-only',enabled:true,read:f.read});
 assert.equal(state,'recovered_private');
 assert.equal(f.reads,2);
 const compare=f.calls.find(x=>x.name.endsWith('compare_supplier_readings_mvp102'));
 assert.equal(compare?.args.p_second_proposal,null);
 assert.ok(!f.calls.some(x=>x.name.endsWith('audit_supplier_amounts_mvp103')));
 const note=f.calls.find(x=>x.name.endsWith('note_document_draft_mvp127'));
 assert.equal(note?.args.p_needs_corrob,true);
});
test('MVP128: wrong private source SHA256 and dual failure stop before making a quote',async()=>{
 for(const opts of [{badHash:true},{failBoth:true}]){
  const f=setup(opts);
  assert.equal(await recoverOneStoredDocument({io:f.io,triggerChatHmac:trigger,apiKey:'sk-test-only',enabled:true,read:f.read}), 'failed');
  assert.ok(f.calls.some(x=>x.name.endsWith('note_document_failure_mvp127')));
  assert.ok(!f.calls.some(x=>x.name.endsWith('note_media_proposal_mvp095')));
  assert.ok(!f.calls.some(x=>x.name.endsWith('record_supplier_media_mvp098')));
 }
});
test('MVP128: invalid trigger or disabled AI cannot process any archived source',async()=>{
 const f=setup();
 assert.equal(await recoverOneStoredDocument({io:f.io,triggerChatHmac:'not-a-hmac',apiKey:'sk-test-only',enabled:true,read:f.read}),'none');
 assert.equal(await recoverOneStoredDocument({io:f.io,triggerChatHmac:trigger,apiKey:'sk-test-only',enabled:false,read:f.read}),'none');
 assert.equal(f.calls.length,0);assert.equal(f.downloads,0);
});
test('MVP128: SQL queue is service-role only, capped and consent + deadline guarded',()=>{
 assert.match(sql,/legacy_unclassified/u);
 assert.match(sql,/p_trigger_chat_hmac/u);
 assert.match(sql,/participant_role in \('buyer','supplier'\)/u);
 assert.match(sql,/owner\.opted_out_at is null/u);
 assert.match(sql,/r\.closes_at>clock_timestamp\(\)/u);
 assert.match(sql,/max_document_ai_per_24h/u);
 assert.match(sql,/for update of m skip locked/u);
 assert.match(sql,/d\.state='pending' and d\.attempt_count<3/u);
 assert.match(sql,/d\.updated_at<clock_timestamp\(\)-interval '8 minutes'/u);
 assert.match(sql,/attempt_count=least\(3,cotironda_piloto_privado\.document_ai_diagnostics_mvp127\.attempt_count\+1\)/u);
 assert.match(sql,/on conflict\(message_hmac\) do nothing/u);
 assert.match(sql,/to service_role;/u);
 assert.doesNotMatch(sql,/to (?:anon|authenticated);/u);
});
test('MVP128: the signed Whapi webhook is the only background trigger, not GET/public probe',()=>{
 assert.match(edge,/let recoveryTriggerHmac:string\|null=null/u);
 assert.match(edge,/recoveryTriggerHmac=chatHash/u);
 assert.match(edge,/EdgeRuntime\.waitUntil\(recoverOneStoredDocument\(/u);
 assert.match(edge,/Deno\.env\.get\('COTIRONDA_PILOT_DOCUMENT_AI_ENABLED'\)==='true'/u);
 assert.match(edge,/cotironda-piloto-originals'\)\.download\(path\)/u);
 assert.doesNotMatch(edge,/console\.log\(.*(?:proposal|downloaded|file\.bytes|source_sha256)/u);
});
