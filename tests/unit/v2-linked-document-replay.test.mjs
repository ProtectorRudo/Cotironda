import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {procesarArchivoVinculadoV2} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-linked-document-replay-v2.ts';

const h=(char)=>char.repeat(64);
const candidate={state:'eligible',source_hmac:h('a'),chat_hmac:h('b')};
const base=({rpc,replay,enabled=true,trustedInternalWorker=true}={})=>({
 enabled,trustedInternalWorker,apiKey:'x'.repeat(30),
 model:'gpt-6-luna',documentSemanticEnabled:true,
 rpc:rpc??(async()=>({data:candidate,error:null})),
 download:async()=>({data:null,error:null}),
 replay
});
test('no lee fuente ni llama RPC sin credenciales internas válidas',async()=>{
 let called=0;
 const result=await procesarArchivoVinculadoV2(base({enabled:false,rpc:async()=>{called++;return {data:candidate,error:null}}}));
 assert.equal(result.state,'disabled');assert.equal(called,0);
 assert.equal((await procesarArchivoVinculadoV2(base({trustedInternalWorker:false}))).state,'disabled');
});
test('no vuelve a procesar si la base indica cola vacía',async()=>{
 let repeats=0;
 const r=await procesarArchivoVinculadoV2(base({
  rpc:async()=>({data:{state:'empty'},error:null}),
  replay:async()=>{repeats++;return {state:'published_private',reason:'',outboundMessages:0}}
 }));
 assert.deepEqual(r,{state:'empty',processed:0,outboundMessages:0});
 assert.equal(repeats,0);
});
test('rechaza cualquier fuente sin HMACs verificables',async()=>{
 let replayed=0;
 const r=await procesarArchivoVinculadoV2(base({
  rpc:async()=>({data:{state:'eligible',source_hmac:h('a'),chat_hmac:'invalid'},error:null}),
  replay:async()=>{replayed++;return {state:'published_private',reason:'',outboundMessages:0}}
 }));
 assert.equal(r.state,'reconciliation_required');assert.equal(replayed,0);
});
test('se limita a llamar UNA VEZ al reprocesador con fuente ya asociada',async()=>{
 let replayed=0;let given;
 const r=await procesarArchivoVinculadoV2(base({
  replay:async args=>{
   replayed++;given=args;
   return {state:'published_private',reason:'independent_revised_source_verified',outboundMessages:0}
  }
 }));
 assert.deepEqual(r,{state:'published_private',processed:1,outboundMessages:0});
 assert.equal(replayed,1);
 assert.equal(given.sourceHmac,candidate.source_hmac);
 assert.equal(given.chatHmac,candidate.chat_hmac);
 assert.equal(given.trustedInternalWorker,true);
 assert.equal(given.documentSemanticEnabled,true);
});
test('lecturas no concordantes, cálculos o fuente no verificada quedan privadas',async()=>{
 for(const kind of ['review_required','not_eligible','disabled']){
  const result=await procesarArchivoVinculadoV2(base({
   replay:async()=>({state:kind,reason:'source_or_amounts_unverified',outboundMessages:0})
  }));
  assert.equal(result.state,'review_private');
  assert.equal(result.outboundMessages,0);
 }
});
test('incertidumbre del RPC o de la auditoría no se declara éxito',async()=>{
 for(const rpc of [
  async()=>({data:null,error:'denied'}),
  async()=>{throw Error('network');},
  async()=>({data:{state:'not_expected'},error:null})
 ]){
  const r=await procesarArchivoVinculadoV2(base({rpc}));
  assert.equal(r.state,'reconciliation_required');
 }
 const x=await procesarArchivoVinculadoV2(base({replay:async()=>{throw Error('replay');}}));
 assert.equal(x.state,'reconciliation_required');
});
const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_d013_archivo_vinculado_recuperacion_CANDIDATE.sql',import.meta.url
),'utf8');
test('SQL selector solo lectura reutiliza source/buyer/supplier y no inventa autorización',()=>{
 for(const key of [
  "decision.state='linked'",
  'decision.selected_request_id=link.request_id',
  "m.request_id=link.request_id",
  "a.state='stored'",
  "a.storage_path='media/'||m.message_hmac",
  "a.content_sha256=link.source_sha256",
  "u.resolved_request_id=link.request_id",
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
 assert.doesNotMatch(sql,/net\.http|vault\.|whapi\.cloud|messages\/document/iu);
});
test('Edge recuperador no altera envío ni reserva archivo sin passing claims',()=>{
 const edge=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-auto-recovery/index.ts',import.meta.url
 ),'utf8');
 assert.match(edge,/if\(commercial.state!=='empty'\)return/);
 assert.match(edge,/procesarArchivoVinculadoV2\(/);
 assert.match(edge,/document_reconciliation_required/);
 const worker=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/supplier-linked-document-replay-v2.ts',import.meta.url
 ),'utf8');
 assert.match(worker,/reprocesarOriginalHistoricoMvp292/);
 assert.match(worker,/cotironda_piloto_next_linked_supplier_document_v2/);
 assert.doesNotMatch(worker,/https:\/\/gate\.whapi|messages\/document|\.send\(/iu);
});
