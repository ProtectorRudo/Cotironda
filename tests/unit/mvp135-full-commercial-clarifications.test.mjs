import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkGeneralPdfSource} from '../../supabase/functions/cotironda-piloto-whapi/supplier-source-pdf-general.ts';
import {proposeDocumentAI} from '../../supabase/functions/cotironda-piloto-whapi/document-ai-draft.ts';
const pdf={bytes:new Uint8Array(512),mime:'application/pdf',sha256:'b'.repeat(64)};
const rows=[
 {page:1,text:'PRESUPUESTO'},
 {page:1,text:'cemento avellaneda x 25 kg   40,00   $9.798,58   $304.148,00'},
 {page:1,text:'Sinteplast Hidrofugo 5lts  1,00   $8.004,15   $6.211,22'},
 {page:1,text:'Total $310.359,22'},
 {page:1,text:'PRECIOS LISTA 7'},
 {page:1,text:'PRECIOS DE PAGO CONTADO EN EFECTIVO'},
 {page:1,text:'FLETE A CONVENIR'},
 {page:1,text:'DEVOLUCION DE PALLETS'},
 {page:1,text:'ENTREGA A COORDINAR'}
];
const note=['PRECIOS LISTA 7','PRECIOS DE PAGO CONTADO EN EFECTIVO',
 'FLETE A CONVENIR','DEVOLUCION DE PALLETS','ENTREGA A COORDINAR'].join('; ');
const draft={
 status:'review_required',kind:'supplier_quote',delivery_city:null,
 requested_delivery_note:note,
 lines:[
  {original_description:'cemento avellaneda x 25 kg',quantity:'40,00',unit:null,
   unit_price:'$9.798,58',line_total:'$304.148,00',
   evidence_location:'página 1 fila 2',ambiguity:null},
  {original_description:'Sinteplast Hidrofugo 5lts',quantity:'1,00',unit:null,
   unit_price:'$8.004,15',line_total:'$6.211,22',
   evidence_location:'página 1 fila 3',ambiguity:null}
 ],total_declared:'$310.359,22',unanswered:[]
};
const reader=r=>async()=>({pages:1,rows:r,scanned:false});
test('MVP135: table with list price, different line amount and unitless decimals',async()=>{
 const x=await checkGeneralPdfSource(pdf,draft,reader(rows));
 assert.equal(x.state,'source_text_covered');
 assert.equal(x.reason,'covered');
 assert.equal(x.publicationAllowed,false);
 assert.equal(x.rankingAllowed,false);
 assert.equal(draft.lines[0].unit,null);
 assert.equal(draft.lines[0].unit_price,'$9.798,58');
 assert.equal(draft.lines[0].line_total,'$304.148,00');
});
test('MVP135: every literal supplier clarification is required',async()=>{
 for(const phrase of ['PRECIOS LISTA 7','PRECIOS DE PAGO CONTADO EN EFECTIVO',
  'FLETE A CONVENIR','DEVOLUCION DE PALLETS','ENTREGA A COORDINAR']){
  const x=await checkGeneralPdfSource(pdf,{
   ...draft,requested_delivery_note:note.replace(phrase,'')
  },reader(rows));
  assert.equal(x.reason,'uncovered_terms',phrase);
 }
});
test('MVP135: charge for pallet return cannot hide in commercial notes',async()=>{
 const source=[...rows,{page:1,text:'Cargo por retorno de pallet $4.000,00'}];
 const res=await checkGeneralPdfSource(pdf,{
  ...draft,requested_delivery_note:note+'; Cargo por retorno de pallet $4.000,00'
 },reader(source));
 assert.equal(res.reason,'uncovered_money');
});
test('MVP135: no quantity inference from product size or price',async()=>{
 const source=rows.map(x=>({...x}));
 source[1]={...source[1],text:'cemento avellaneda x 25 kg  $9.798,58  $304.148,00'};
 assert.equal((await checkGeneralPdfSource(pdf,draft,reader(source))).reason,'line_not_found');
 const changed={...draft,lines:[{...draft.lines[0],quantity:'25'},draft.lines[1]]};
 assert.equal((await checkGeneralPdfSource(pdf,changed,reader(rows))).reason,'line_not_found');
});
test('MVP135: unresolved IVA, stock and monetary basis remain unranked',async()=>{
 const uncertain={...draft,unanswered:['IVA no especificado',
  'Disponibilidad no informada','Moneda indicada solo con símbolo $']};
 const x=await checkGeneralPdfSource(pdf,uncertain,reader(rows));
 assert.equal(x.reason,'unresolved');assert.equal(x.rankingAllowed,false);
});
test('MVP135: prompt preserves terms; draft has no invented unit or discount',async()=>{
 const bytes=new TextEncoder().encode('%PDF-1.7\nTEST PDF');
 const args={manifest:{version:1,origin:'whapi',kind:'document',mime:'application/pdf',
  media_id:'safe',size:bytes.length,filename:'quote.pdf',caption:null,
  providerSha256:null,state:'awaiting_secure_download'},
  file:{bytes,sha256:'a'.repeat(64),mime:'application/pdf'},
  apiKey:'sk-test123456789abcdefghijklmnop',enabled:true};
 const response={status:'completed',output:[{type:'message',role:'assistant',
  content:[{type:'output_text',text:JSON.stringify({...draft,status:undefined})}]}]};
 let prompt='';
 const result=await proposeDocumentAI({...args,fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body);
  prompt=body.input[0].content[0].text;
  return new Response(JSON.stringify(response),{status:200});
 }});
 assert.equal(result.requested_delivery_note,note);
 assert.equal(result.lines[0].unit,null);
 assert.match(prompt,/TODAS las aclaraciones/);
 assert.match(prompt,/PRECIOS LISTA 7/);
 assert.match(prompt,/devoluci[oó]n\/retorno\/cargo de pallets/);
 assert.match(prompt,/No deduzcas porcentajes de descuento/);
 assert.match(prompt,/NO infieras IVA, ARS ni stock/);
});
test('MVP135: quote publication preserves original gates, no guessed winners',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const source=read('../../supabase/functions/cotironda-piloto-whapi/supplier-source-pdf-general.ts');
 const sql=read('../../supabase/piloto/mvp135_full_supplier_clarifications_in_quote.sql');
 assert.match(source,/publicationAllowed:false,rankingAllowed:false/);
 assert.match(sql,/ACLARACIONES DEL PROVEEDOR/);
 assert.match(sql,/note_/);
 assert.match(sql,/m\.content_sha256=q\.source_sha256/);
 assert.match(sql,/dual\.state='model_readings_match'/);
 assert.match(sql,/amounts\.state='balanced'/);
 assert.match(sql,/supplier\.consent_at is not null/);
 assert.match(sql,/buyer\.consent_at is not null/);
 assert.match(sql,/v_text ~\*/);
 assert.doesNotMatch(sql,/\b(?:insert\s+into|update|delete\s+from)\s+cotironda_piloto_privado\.offer_versions/iu);
 assert.doesNotMatch(sql,/http_post|net\.http|whapi\.cloud/iu);
 assert.match(sql,/to service_role;/u);
});
