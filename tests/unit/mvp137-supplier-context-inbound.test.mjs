import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {promoteVerifiedSupplierQuote} from '../../supabase/functions/cotironda-piloto-whapi/supplier-role-hint.ts';
import {proposeDocumentAI} from '../../supabase/functions/cotironda-piloto-whapi/document-ai-draft.ts';

const buyerQuote={
 status:'review_required',kind:'buyer_request',
 delivery_city:null,
 requested_delivery_note:'PRECIOS LISTA 7; PAGO CONTADO EFECTIVO; FLETE A CONVENIR; DEVOLUCION DE PALLETS',
 lines:[
 {original_description:'Cemento CPC 25 kg',quantity:'40',unit:null,
  unit_price:'$ 9.798,58',line_total:'$ 304.148,00',evidence_location:'hoja 1 fila 4',ambiguity:null},
 {original_description:'Hidrofugo 5 L',quantity:'1',unit:null,
  unit_price:'$ 8.004,15',line_total:'$ 6.211,22',evidence_location:'hoja 1 fila 5',ambiguity:null}
 ],total_declared:'$ 310.359,22',unanswered:[]
};
test('MVP137: verified supplier plus ALL priced lines => private supplier quote',()=>{
 const result=promoteVerifiedSupplierQuote(buyerQuote,true);
 assert.equal(result.kind,'supplier_quote');
 assert.equal(result.lines,buyerQuote.lines);
 assert.equal(result.requested_delivery_note,buyerQuote.requested_delivery_note);
 assert.equal(result.total_declared,buyerQuote.total_declared);
 assert.equal(buyerQuote.kind,'buyer_request');
});
test('MVP137: identity missing means buyer request remains buyer request',()=>{
 assert.equal(promoteVerifiedSupplierQuote(buyerQuote,false),buyerQuote);
});
test('MVP137: a real materials request lacking price never becomes a quotation',()=>{
 for(const change of [
   {total_declared:null},
   {lines:buyerQuote.lines.map((l,i)=>i===0?{...l,line_total:null}:l)},
   {lines:buyerQuote.lines.map((l,i)=>i===0?{...l,unit_price:null}:l)},
   {lines:[{...buyerQuote.lines[0],ambiguity:'not priced'}]},
   {lines:[]},
   {lines:[{...buyerQuote.lines[0],evidence_location:''}]}
 ]){
  assert.equal(promoteVerifiedSupplierQuote({...buyerQuote,...change},true).kind,
    'buyer_request',JSON.stringify(change));
 }
});
test('MVP137: malicious price string never becomes verified supplier price',()=>{
 for(const value of ['$ 100 hola','$ 100 IVA incluido','100<script>','http://prices',
  '$','-','1\n2','not a price']){
  const draft={...buyerQuote,lines:[
    {...buyerQuote.lines[0],unit_price:value},buyerQuote.lines[1]
  ]};
  assert.equal(promoteVerifiedSupplierQuote(draft,true).kind,'buyer_request',value);
 }
});
test('MVP137: source must be tied to registered supplier HMAC, not sender text',()=>{
 const index=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(index,/cotironda_piloto_reserve_media_mvp095/);
 assert.match(index,/const verifiedSupplier=\(await Promise\.all/u);
 assert.match(index,/sec\.recipients/u);
 assert.match(index,/equalSecret\(expected,chatHash\)/u);
 assert.match(index,/promoteVerifiedSupplierQuote\(readings\[0\]\.value,verifiedSupplier\)/u);
 assert.match(index,/proposal\.kind==='buyer_request'&&!verifiedSupplier/u);
 assert.doesNotMatch(index,/COTIRONDA_PILOT_SUPPLIER_OVERRIDE/u);
});
test('MVP137: model receives supplier context only from trusted flag',async()=>{
 const bytes=new TextEncoder().encode('%PDF-1.7\nTEST PDF');
 let inputs=[];
 const response={status:'completed',output:[{type:'message',role:'assistant',content:[
 {type:'output_text',text:JSON.stringify({
  kind:buyerQuote.kind,delivery_city:buyerQuote.delivery_city,
  requested_delivery_note:buyerQuote.requested_delivery_note,lines:buyerQuote.lines,
  total_declared:buyerQuote.total_declared,unanswered:buyerQuote.unanswered
 })}]}]};
 const file={bytes,sha256:'c'.repeat(64),mime:'application/pdf'};
 const manifest={version:1,origin:'whapi',kind:'document',mime:'application/pdf',
  media_id:'safe',size:bytes.length,filename:'quote.pdf',caption:null,
  providerSha256:null,state:'awaiting_secure_download'};
 for(const role of [false,true]){
  const result=await proposeDocumentAI({manifest,file,
   apiKey:'sk-test123456789abcdefghijklmnop',enabled:true,verifiedSupplier:role,
   fetchImpl:async(_url,options)=>{
    const body=JSON.parse(options.body);
    inputs.push(body.input[1].content[1].text);
    return new Response(JSON.stringify(response),{status:200});
   }
  });
  assert.equal(result.kind,'buyer_request');
 }
 assert.doesNotMatch(inputs[0],/PROVEEDOR verificado/u);
 assert.match(inputs[1],/PROVEEDOR verificado/u);
 assert.match(inputs[1],/supplier_quote/u);
});
