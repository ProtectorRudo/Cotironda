import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {procesarArchivoVinculadoV2} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-linked-document-replay-v2.ts';

const h=(char)=>char.repeat(64);
const source=h('a'),chat=h('b');
const bytes=new TextEncoder().encode('%PDF-1.4\nCotironda prueba privada de integridad.');
const original=new Blob([bytes]);
const sha=createHash('sha256').update(bytes).digest('hex');
const selected={state:'eligible',source_hmac:source,chat_hmac:chat};
const claim={state:'reserved',sha256:sha,size_bytes:bytes.length,draft:{
 kind:'supplier_quote',status:'review_required',lines:[{original_description:'Arena',quantity:'2'}]
}};
const responses=(opts={})=>{
 const calls=[];
 return {
  calls,
  rpc:async(name,params)=>{
   calls.push({name,params});
   if(name==='cotironda_piloto_next_linked_supplier_document_v2')
    return {data:opts.selection??selected,error:null};
   if(name==='cotironda_piloto_reserve_archive_replay_mvp292')
    return {data:opts.claim??claim,error:null};
   if(name==='cotironda_piloto_finish_archive_replay_mvp292')
    return {data:opts.finish??{state:'recorded'},error:null};
   throw Error('unexpected RPC '+name);
  }
 };
};
const base=({rpc,download,enabled=true,trustedInternalWorker=true}={})=>({
 enabled,trustedInternalWorker,apiKey:'x'.repeat(30),
 model:'gpt-6-luna',documentSemanticEnabled:true,
 rpc:rpc??responses().rpc,
 download:download??(async()=>({data:original,error:null}))
});
test('sin autenticación interna no lee fuente ni ejecuta RPC',async()=>{
 let called=0;
 const rpc=async()=>{called++;return {data:selected,error:null}};
 assert.equal((await procesarArchivoVinculadoV2(base({enabled:false,rpc}))).state,'disabled');
 assert.equal((await procesarArchivoVinculadoV2(base({trustedInternalWorker:false,rpc}))).state,'disabled');
 assert.equal(called,0);
});
test('cola vacía nunca lee PDF ni pide otro modelo',async()=>{
 const r=responses({selection:{state:'empty'}});
 let downloads=0;
 const x=await procesarArchivoVinculadoV2(base({
  rpc:r.rpc,download:async()=>{downloads++;return {data:original,error:null}}
 }));
 assert.deepEqual(x,{state:'empty',processed:0,outboundMessages:0});
 assert.equal(downloads,0);assert.equal(r.calls.length,1);
});
test('HMAC inválido no crea lease ni accede al original',async()=>{
 const r=responses({selection:{state:'eligible',source_hmac:source,chat_hmac:'invalid'}});
 const x=await procesarArchivoVinculadoV2(base({rpc:r.rpc}));
 assert.equal(x.state,'reconciliation_required');assert.equal(r.calls.length,1);
});
test('única lectura IA archivada, SHA verificado, lease/finish una sola vez',async()=>{
 const r=responses();
 const x=await procesarArchivoVinculadoV2(base({rpc:r.rpc}));
 assert.deepEqual(x,{state:'original_private',processed:1,outboundMessages:0});
 assert.deepEqual(r.calls.map(v=>v.name),[
  'cotironda_piloto_next_linked_supplier_document_v2',
  'cotironda_piloto_reserve_archive_replay_mvp292',
  'cotironda_piloto_finish_archive_replay_mvp292'
 ]);
 assert.equal(r.calls.at(-1).params.p_state,'review');
 assert.equal(r.calls.at(-1).params.p_reason,'original_sha_verified_analysis_pending');
 assert.equal(r.calls[1].params.p_chat_hmac,chat);
});
test('SHA cambiado, no se acredita un original y queda revisión privada',async()=>{
 const r=responses();
 const corrupted=new Blob([new TextEncoder().encode('X'.repeat(bytes.length))]);
 const x=await procesarArchivoVinculadoV2(base({
  rpc:r.rpc,download:async()=>({data:corrupted,error:null})
 }));
 assert.equal(x.state,'review_private');
 assert.equal(r.calls.at(-1).params.p_state,'uncertain');
 assert.equal(r.calls.at(-1).params.p_reason,'source_integrity_review');
});
test('original faltante no publica ni repite lectura',async()=>{
 const r=responses();
 const x=await procesarArchivoVinculadoV2(base({
  rpc:r.rpc,download:async()=>({data:null,error:'not found'})
 }));
 assert.equal(x.state,'review_private');
 assert.equal(r.calls.at(-1).params.p_state,'uncertain');
});
test('claim reservado por otro worker no duplica ni consume',async()=>{
 const r=responses({claim:{state:'already_reserved'}});
 const x=await procesarArchivoVinculadoV2(base({rpc:r.rpc}));
 assert.equal(x.state,'review_private');assert.equal(x.processed,0);
 assert.equal(r.calls.length,2);
});
test('el ledger incierto no se declara éxito',async()=>{
 const r=responses({finish:{state:'not_leased'}});
 const x=await procesarArchivoVinculadoV2(base({rpc:r.rpc}));
 assert.equal(x.state,'reconciliation_required');assert.equal(x.outboundMessages,0);
});
test('fallo RPC no filtra mensajes ni originales',async()=>{
 const x=await procesarArchivoVinculadoV2(base({
  rpc:async()=>{throw Error('no DB')}
 }));
 assert.equal(x.state,'reconciliation_required');assert.equal(x.processed,0);
});
const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_d013_archivo_vinculado_recuperacion_CANDIDATE.sql',import.meta.url
),'utf8');
test('SQL selector reutiliza identidad, SHA, vínculo y consentimientos; nunca publica',()=>{
 for(const key of [
  "decision.state='linked'",
  'decision.selected_request_id=link.request_id',
  'm.request_id=link.request_id',
  "a.state='stored'",
  "a.storage_path='media/'||m.message_hmac",
  "a.content_sha256=link.source_sha256",
  'u.resolved_request_id=link.request_id',
  "link.status='awaiting_semantic_review'",
  "r.state='prepared'",
  "supplier.opted_out_at IS NULL",
  "buyer.opted_out_at IS NULL",
  "j.state='api_accepted'",
  'ai_supplier_archive_replay_mvp292',
  'supplier_media_quotes_mvp098',
  'offer_versions',
  'whatsapp_inbound_enabled',
  'ai_central_control_mvp226',
  'FROM PUBLIC,anon,authenticated',
  'TO service_role'
 ])assert.ok(sql.includes(key),key);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?cotironda_piloto_privado\./iu);
});
test('el Edge antiguo no se reescribe: continúa con un único SHA y sin doble lectura',()=>{
 const edge=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-auto-recovery/index.ts',import.meta.url
 ),'utf8');
 const worker=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/supplier-linked-document-replay-v2.ts',import.meta.url
 ),'utf8');
 assert.match(edge,/if\(commercial.state!=='empty'\)return/);
 assert.match(edge,/procesarArchivoVinculadoV2\(/);
 assert.match(worker,/cotironda_piloto_reserve_archive_replay_mvp292/);
 assert.match(worker,/crypto\.subtle\.digest/);
 assert.doesNotMatch(worker,/proposeDocumentAI|reprocesarOriginalHistoricoMvp292|fetch\(|messages\/document/iu);
});
