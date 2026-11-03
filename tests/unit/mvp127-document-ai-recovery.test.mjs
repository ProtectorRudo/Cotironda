import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  proposeDocumentAI,documentFailureCode,DOCUMENT_SCHEMA
} from '../../supabase/functions/cotironda-piloto-whapi/document-ai-draft.ts';

const sql=readFileSync(new URL('../../supabase/piloto/mvp127_document_ai_failures.sql',import.meta.url),'utf8');
const handler=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const bytes=new TextEncoder().encode('%PDF-1.7\nTEST PDF WITH 25 ROWS');
const manifest={
 version:1,origin:'whapi',kind:'document',mime:'application/pdf',
 media_id:'pdf-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57',
 size:bytes.length,filename:'presupuesto.pdf',caption:null,providerSha256:null,
 state:'awaiting_secure_download'
};
const args={manifest,file:{bytes,sha256:'a'.repeat(64),mime:'application/pdf'},
  apiKey:'sk-test123456789abcdefghijklmnop',enabled:true};
const sample=()=>({
 kind:'supplier_quote',delivery_city:null,requested_delivery_note:null,
 lines:Array.from({length:25},(_,i)=>({
  original_description:('Producto Nº '+(i+1)+' — tornillo, cable o material de obra. ').repeat(4),
  quantity:String(i+1),unit:'unidad',unit_price:'$ 1.234.567,89',
  line_total:'$ 12.345.678,90',evidence_location:('Página '+(i+1)+' fila '+(i+1)+' ').repeat(8),
  ambiguity:null
 })),
 total_declared:'$ 123.456.789,00',unanswered:[]
});
const pack=v=>({
 status:'completed',output:[{type:'message',role:'assistant',
  content:[{type:'output_text',text:JSON.stringify(v)}]}]
});
test('MVP127: full 25-line long supplier proposal not truncated by old 12KB response guard',async()=>{
 const long=JSON.stringify(pack(sample()));
 assert.ok(long.length>12000,'must actually exceed original MAX_RESPONSE=12000');
 assert.ok(long.length<50000);
 const out=await proposeDocumentAI({...args,fetchImpl:async(url,opt)=>{
  const body=JSON.parse(opt.body);
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(body.input[1].content[0].detail,'high');
  assert.ok(body.max_output_tokens>=6000);
  assert.equal(body.store,false);
  assert.deepEqual(body.tools,[]);
  assert.ok(opt.signal);
  return new Response(long,{status:200});
 }});
 assert.equal(out.lines.length,25);
 assert.equal(out.status,'review_required');
 assert.equal(out.kind,'supplier_quote');
 assert.equal(out.lines[0].line_total,'$ 12.345.678,90');
 assert.equal(DOCUMENT_SCHEMA.properties.lines.maxItems,25);
});
test('MVP127: exact error taxonomy avoids printing upstream error bodies or file data',()=>{
 const cases=[
  ['doc_ai_key_missing','api_credentials_missing'],
  ['doc_ai_http_unauthorized','api_unauthorized'],
  ['doc_ai_quota','api_rate_limited'],
  ['doc_ai_http_server','api_server_error'],
  ['doc_ai_transport_timeout','api_timeout'],
  ['doc_ai_response_incomplete','response_incomplete'],
  ['doc_ai_response_too_large','response_too_large'],
  ['doc_ai_output_invalid','schema_rejected'],
  ['draft_persistence_failed','draft_persistence_failed']
 ];
 for(const [message,expected] of cases)
  assert.equal(documentFailureCode(Error(message)),expected);
 assert.equal(documentFailureCode(Error('401 secret token sk-proj-not-print')), 'internal_error');
 assert.equal(documentFailureCode(new Error('My private PDF invoice $50')), 'internal_error');
 assert.equal(documentFailureCode(null),'internal_error');
});
test('MVP127: HTTP 429, 403, 500 and timeouts report distinct safe classes',async()=>{
 for(const [code,expected] of [
  [429,'api_rate_limited'],[403,'api_unauthorized'],
  [502,'api_server_error'],[400,'api_rejected']
 ]){
  await assert.rejects(async()=>{
   try{await proposeDocumentAI({...args,fetchImpl:async()=>new Response(
    JSON.stringify({private:'never log'}),{status:code})});
   }catch(e){
    assert.equal(documentFailureCode(e),expected);
    throw e;
   }
  });
 }
 await assert.rejects(async()=>{
  try{await proposeDocumentAI({...args,fetchImpl:async()=>{
   const e=new Error('Private data');e.name='TimeoutError';throw e;
  }});
  }catch(e){assert.equal(documentFailureCode(e),'api_timeout');throw e}
 });
});
test('MVP127: untrusted model proposals are NEVER published or ranked on API success',()=>{
 assert.match(handler,/p_needs_corrob:corroboration===null/u);
 assert.match(handler,/readings\[0\]\.status==='fulfilled'&&/u);
 assert.match(handler,/readings\[1\]\.status==='fulfilled'\?readings\[1\]\.value:null/u);
 assert.match(handler,/cotironda_piloto_note_document_failure_mvp127/u);
 assert.match(handler,/documentFailureCode\(err\)/u);
 assert.match(handler,/cotironda_piloto_record_supplier_source_check_mvp106/u);
 assert.match(handler,/cotironda_piloto_audit_supplier_amounts_mvp103/u);
 assert.match(handler,/cotironda_piloto_publish_source_text_mvp107/u);
 assert.doesNotMatch(handler,/catch\{\s*\/\* preserve original and review_required; no retry \*\/\s*\}/u);
});
test('MVP127: private diagnostic codes, no anon grants and no stored file/price/source text',()=>{
 assert.match(sql,/enable row level security/u);
 assert.match(sql,/revoke all on cotironda_piloto_privado\.document_ai_diagnostics_mvp127/u);
 assert.match(sql,/to service_role;/u);
 assert.match(sql,/check \(attempt_count between 0 and 3\)/u);
 assert.match(sql,/p\.opted_out_at is null/u);
 assert.match(sql,/p_proposal->>'status'<>'review_required'/u);
 assert.match(sql,/length\(p_proposal::text\)>40000/u);
 assert.doesNotMatch(sql,/to (?:anon|authenticated);/u);
 assert.doesNotMatch(sql,/create table[^;]+(?:content_text|file_bytes|raw_http_body)/u);
});
