import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {correctArchivedSupplierRole} from '../../supabase/functions/cotironda-piloto-document-recovery/supplier-role-recovery.ts';
import {runRecoveryService} from '../../supabase/functions/cotironda-piloto-document-recovery/logic.ts';

const H='a'.repeat(64);
const bytes=new Uint8Array(256).fill(60);
bytes.set([0x50,0x4b,0x03,0x04],0);
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),
 x=>x.toString(16).padStart(2,'0')).join('');
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function mock({alter={}}={}){
 const S=await sha(bytes);
 const calls={lookup:0,download:0,correct:0,params:null};
 const io={
  lookup:async()=>{calls.lookup++;return {error:null,data:{
   state:'candidate',message_hmac:H,source_sha256:S,mime,size_bytes:256,...alter
  }}},
  download:async(path)=>{calls.download++;assert.equal(path,'media/'+H);
   return {data:new Blob([bytes]),error:null}},
  correct:async p=>{calls.correct++;calls.params=p;
   return {data:{state:'reclassified_private',ranking_allowed:false},error:null}}
 };
 return {io,calls,S};
}
test('MVP136: XLSX classification may be fixed privately with SHA verified bytes',async()=>{
 const {io,calls,S}=await mock();
 assert.equal(await correctArchivedSupplierRole(io),'reclassified_private');
 assert.equal(calls.download,1);assert.equal(calls.correct,1);
 assert.deepEqual(calls.params,{p_message_hmac:H,p_source_sha256:S});
});
test('MVP136: tampered hash, wrong media magic or size fails before correction',async()=>{
 const a=await mock({alter:{source_sha256:'b'.repeat(64)}});
 assert.equal(await correctArchivedSupplierRole(a.io),'failed');
 assert.equal(a.calls.correct,0);
 const b=await mock();
 b.io.download=async()=>({data:new Blob([new Uint8Array(256)]),error:null});
 assert.equal(await correctArchivedSupplierRole(b.io),'failed');
 assert.equal(b.calls.correct,0);
 const c=await mock({alter:{size_bytes:257}});
 assert.equal(await correctArchivedSupplierRole(c.io),'failed');
 assert.equal(c.calls.correct,0);
});
test('MVP136: absent or forged candidate cannot access original',async()=>{
 const none=await mock();
 none.io.lookup=async()=>({data:{state:'none'},error:null});
 assert.equal(await correctArchivedSupplierRole(none.io),'none');
 assert.equal(none.calls.download,0);
 const forged=await mock({alter:{message_hmac:'not-a-hash'}});
 assert.equal(await correctArchivedSupplierRole(forged.io),'failed');
 assert.equal(forged.calls.download,0);
});
test('MVP136: SQL denial and network failure remain private',async()=>{
 const a=await mock();
 a.io.correct=async()=>({data:{state:'not_permitted'},error:null});
 assert.equal(await correctArchivedSupplierRole(a.io),'failed');
 const b=await mock();
 b.io.download=async()=>{throw Error('secret quote content')};
 assert.equal(await correctArchivedSupplierRole(b.io),'failed');
});
test('MVP136: role recovery has priority when no new document; no extra AI',async()=>{
 let newDocs=0,corrected=0,reviewed=0;
 const run=new Request('https://pilot.invalid/',{method:'POST'});
 const flags={enabled:true,modelKeyAvailable:true,projectMatches:true};
 const r=await runRecoveryService(run,flags,{
  lookup:async()=>({data:{state:'none'},error:null}),
  recover:async()=>{newDocs++;return 'recovered_private'},
  reclassify:async()=>{corrected++;return 'reclassified_private'},
  review:async()=>{reviewed++;return 'none'}
 });
 assert.equal(r.status,200);
 assert.equal((await r.json()).state,'reclassified_private');
 assert.equal(newDocs,0);assert.equal(corrected,1);assert.equal(reviewed,0);
});
test('MVP136: private SQL authorization, old draft immutable audit, no publishing',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp136_supplier_role_from_archived_quote.sql',import.meta.url),'utf8');
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-document-recovery/index.ts',import.meta.url),'utf8');
 for(const term of [
  'supplier_role_corrections_mvp136','original_proposal',
  'enable row level security','before update or delete',
  'p.consent_at is not null and p.opted_out_at is null',
  "p.participant_role='supplier'","r.closes_at>clock_timestamp()",
  'm.content_sha256=p_source_sha256',
  'supplier_media_quotes_mvp098','ranking_allowed', 'source_verified',
  'cotironda_piloto_record_supplier_media_mvp098'
 ]) assert.ok(sql.includes(term),term);
 assert.match(sql,/from public,anon,authenticated,service_role/u);
 assert.match(sql,/grant execute on function public\.cotironda_piloto_correct_supplier_role_mvp136\(text,text\)[\s\S]*?to service_role/u);
 assert.doesNotMatch(sql,/insert\s+into\s+cotironda_piloto_privado\.anonymous_supplier_docs_mvp107/iu);
 assert.doesNotMatch(sql,/send|http_post|whapi\.cloud/u);
 assert.match(edge,/correctArchivedSupplierRole/u);
});
