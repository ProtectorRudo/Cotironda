import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeMediaManifest} from '../../supabase/functions/cotironda-piloto-whapi/media-intake.ts';
import {getVerifiedWhapiMedia} from '../../supabase/functions/cotironda-piloto-whapi/whapi-media-archive.ts';
import {proposeDocumentAI,safeDocumentFilename} from '../../supabase/functions/cotironda-piloto-whapi/document-ai-draft.ts';
const sql=readFileSync(new URL('../../supabase/piloto/mvp129_private_archive_mime_capacity.sql',import.meta.url),'utf8');
const mimetypes=[
 ['application/pdf','pdf'],
 ['application/msword','doc'],
 ['application/vnd.ms-excel','xls'],
 ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'],
 ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx'],
 ['text/csv','csv'],['text/plain','txt']
];
const h='a'.repeat(64),token='test-whapi-bearer-token-not-real';
const manifest=(mime,filename)=>makeMediaManifest({
 document:{id:'pdf-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57',
  mime_type:mime,file_name:filename,file_size:40}
},'document');
const draft={kind:'supplier_quote',delivery_city:null,requested_delivery_note:'Con IVA incluido',
 lines:[{original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsa',unit_price:'$ 500,00',
 line_total:'$ 10.000,00',evidence_location:'hoja 1, fila 2',ambiguity:null}],
 total_declared:'$ 10.000,00',unanswered:[]};
const response=new Response(JSON.stringify({status:'completed',output:[{
 type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(draft)}]
}]}),{status:200});
test('MVP129: all seven input file formats are accepted and named with correct extensions',()=>{
 for(const [mime,ext]of mimetypes){
  const m=manifest(mime,'presupuesto.'+ext);
  assert.equal(m?.state,'awaiting_secure_download',mime);
  assert.equal(safeDocumentFilename(mime),'cotironda-original.'+ext);
 }
});
test('MVP129: exact OLE2 signature admits legacy DOC/XLS privately but blocks forged bytes',async()=>{
 const cfb=Uint8Array.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1,
   ...Array.from({length:32},()=>0)]);
 for(const mime of ['application/msword','application/vnd.ms-excel']){
  const m={...manifest(mime,'cotizacion'),size:cfb.length};
  const f=await getVerifiedWhapiMedia({manifest:m,token,fetchImpl:async()=>new Response(cfb,{
   status:200,headers:{'content-type':mime}})});
  assert.equal(f.mime,mime);assert.equal(f.bytes.length,cfb.length);
  await assert.rejects(getVerifiedWhapiMedia({manifest:m,token,fetchImpl:async()=>
   new Response(new Uint8Array(cfb.length),{status:200})}),/media_signature_mismatch/);
 }
});
test('MVP129: genuine PDF uses high visual detail; Word/Excel use file-specific input_file',async()=>{
 const bytes=new TextEncoder().encode('%PDF-1.4\nfile-body-for-tests-not-a-real-supplier-file');
 for(const [mime,extension] of mimetypes){
  const m={...manifest(mime,'FILE_WITH_WRONG_EXTENSION.pdf'),size:bytes.length};
  let invoked=false;
  const result=await proposeDocumentAI({
   manifest:m,file:{bytes,mime,sha256:h},enabled:true,
   apiKey:'sk-test123456789abcdefghijklmnop',
   fetchImpl:async(url,options)=>{
    invoked=true;
    const body=JSON.parse(options.body);
    const part=body.input[1].content[0];
    assert.equal(part.type,'input_file');
    assert.equal(part.filename,'cotironda-original.'+extension);
    assert.equal(part.detail,mime==='application/pdf'?'high':undefined);
    assert.match(part.file_data,new RegExp('^data:'+mime.replaceAll('.','\\.')+';base64,'));
    assert.equal(body.store,false);
    return response.clone();
   }
  });
  assert.equal(result.kind,'supplier_quote');
  assert.equal(invoked,true);
 }
});
test('MVP129: archive bucket remains private and DDL/worker caps are consistent',()=>{
 assert.match(sql,/where id='cotironda-piloto-originals' and public=false/u);
 assert.match(sql,/check \(size_bytes is null or size_bytes between 1 and 8388608\)/u);
 assert.match(sql,/set file_size_limit=8388608/u);
 assert.match(sql,/p_size not between 1 and 8388608/u);
 assert.match(sql,/cotironda_piloto_reserve_document_retry_mvp127/u);
 assert.doesNotMatch(sql,/grant .* to (?:anon|authenticated);/u);
});
