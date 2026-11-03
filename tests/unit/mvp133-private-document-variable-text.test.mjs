import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeDocumentAI,documentFailureCode} from '../../supabase/functions/cotironda-piloto-whapi/document-ai-draft.ts';
const bytes=new TextEncoder().encode('%PDF-1.7\nTEST PRIVATE REALISTIC QUOTE');
const manifest={version:1,origin:'whapi',kind:'document',media_id:'sample',
 mime:'application/pdf',size:bytes.length,filename:'real.pdf',caption:null,
 providerSha256:null,state:'awaiting_secure_download'};
const base={manifest,file:{bytes,mime:'application/pdf',sha256:'a'.repeat(64)},
 apiKey:'sk-test123456789abcdefghijklmnop',enabled:true};
const line=()=>({original_description:'Bolsa cemento 50 kg',quantity:'2',
 unit:'bolsas',unit_price:'$ 9.000',line_total:'$ 18.000',
 evidence_location:'Página 1, fila 2',ambiguity:null});
const raw=(l=()=>line())=>({
 kind:'supplier_quote',delivery_city:null,requested_delivery_note:null,
 lines:[l()],total_declared:'$ 18.000',unanswered:[]
});
const response=v=>new Response(JSON.stringify({
 status:'completed',output:[{type:'message',role:'assistant',
 content:[{type:'output_text',text:JSON.stringify(v)}]}]
}),{status:200});
const read=async val=>proposeDocumentAI({...base,fetchImpl:async()=>response(val)});
test('MVP133: long original conditions and multiline evidence preserved unchanged in PRIVATE draft',async()=>{
 const v=raw();
 v.requested_delivery_note=('IVA incluido, entrega pendiente de confirmar; flete a convenir. ').repeat(9)+'\nPago contra entrega';
 v.lines[0].original_description=('Cemento CPC50, 50 kg; lote consultado, paletizado. ').repeat(9);
 v.lines[0].evidence_location='Página 1\nColumna cantidad y precio\n'+('Tabla 1 - ').repeat(35);
 v.unanswered=['Aclarar límite de stock:\n'+('pendiente de verificar ').repeat(10)];
 const draft=await read(v);
 assert.equal(draft.status,'review_required');
 assert.equal(draft.requested_delivery_note,v.requested_delivery_note);
 assert.equal(draft.lines[0].original_description,v.lines[0].original_description);
 assert.equal(draft.lines[0].evidence_location,v.lines[0].evidence_location);
 assert.deepEqual(draft.unanswered,v.unanswered);
});
test('MVP133: model may represent empty unreadable product without falsely publishing',async()=>{
 const v=raw();v.lines[0].original_description='';
 v.lines[0].quantity=null;v.lines[0].unit_price=null;
 v.unanswered=['descripcion_ilegible'];
 const draft=await read(v);
 assert.equal(draft.status,'review_required');
 assert.equal(draft.lines[0].original_description,'');
 assert.deepEqual(draft.unanswered,['descripcion_ilegible']);
});
test('MVP133: reject malicious NUL and absurdly long fields while keeping failure redacted',async()=>{
 for(const v of [
  (()=>{const p=raw();p.lines[0].original_description='abc\u0000def';return p})(),
  (()=>{const p=raw();p.requested_delivery_note='x'.repeat(6000);return p})(),
  (()=>{const p=raw();p.lines[0].evidence_location='y'.repeat(3000);return p})()
 ]){
  await assert.rejects(async()=>{try{await read(v)}catch(e){
   assert.equal(documentFailureCode(e),'schema_rejected');throw e
  }});
 }
});
