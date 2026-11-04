import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkGeneralPdfSource} from '../../supabase/functions/cotironda-piloto-whapi/supplier-source-pdf-general.ts';

const pdf={bytes:new Uint8Array(512),mime:'application/pdf',sha256:'f'.repeat(64)};
const draft={
 status:'review_required',kind:'supplier_quote',
 delivery_city:null,requested_delivery_note:null,
 lines:[
  {original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsa',
   unit_price:'$ 11.000,00',line_total:'$ 220.000,00',
   evidence_location:'página 1, fila 2',ambiguity:null},
  {original_description:'Pallets vacíos',quantity:'2',unit:'unidades',
   unit_price:'$ 300,00',line_total:'$ 600,00',
   evidence_location:'página 2, fila 1',ambiguity:null}
 ],
 total_declared:'$ 220.600,00',unanswered:[]
};
const original=[
 {page:1,text:'PRESUPUESTO DE MATERIALES'},
 {page:1,text:'Cemento CPC 50 kg   20 bolsa   $ 11.000,00   $ 220.000,00'},
 {page:2,text:'Pallets vacíos   2 unidades   $ 300,00   $ 600,00'},
 {page:2,text:'Total $ 220.600,00'}
];
const reader=(rows=original,scanned=false)=>async()=>({pages:2,rows,scanned});
test('MVP130: multi-page PDF table with all prices and extra pallets is covered',async()=>{
 const actual=await checkGeneralPdfSource(pdf,draft,reader());
 assert.equal(actual.state,'source_text_covered');
 assert.equal(actual.reason,'covered');
 assert.equal(actual.lines,2);
 assert.equal(actual.sourceSha256,pdf.sha256);
 assert.equal(actual.publicationAllowed,false);
 assert.equal(actual.rankingAllowed,false);
});
test('MVP130: quantity cannot be proven by digits inside the total or a product size',async()=>{
 const wrongQuantity=original.map(x=>({...x}));
 wrongQuantity[1]={...wrongQuantity[1],text:'Cemento CPC 50 kg   2 bolsa   $ 11.000,00   $ 220.000,00'};
 assert.equal((await checkGeneralPdfSource(pdf,draft,reader(wrongQuantity))).reason,'line_not_found');
 const wrongUnit={...draft,lines:[{...draft.lines[0],quantity:'50',unit:'kg'},draft.lines[1]]};
 assert.equal((await checkGeneralPdfSource(pdf,wrongUnit,reader())).reason,'line_not_found');
});
test('MVP130: quantity and unit may be in either column order, with plural variation',async()=>{
 const reversed=original.map(x=>({...x}));
 reversed[1]={...reversed[1],text:'Cemento CPC 50 kg   bolsas 20   $ 11.000,00   $ 220.000,00'};
 assert.equal((await checkGeneralPdfSource(pdf,draft,reader(reversed))).state,'source_text_covered');
});

test('MVP130: one omitted unexpected source price invalidates the whole proof',async()=>{
 const rows=original.map(x=>({...x}));
 rows[1]={...rows[1],text:rows[1].text+' $ 9.999,99'};
 const actual=await checkGeneralPdfSource(pdf,draft,reader(rows));
 assert.equal(actual.reason,'uncovered_money');
 assert.equal(actual.state,'needs_source_review');
});
test('MVP130: extra freight not quoted, subtotal not declared and altered total fail closed',async()=>{
 const rows=original.map(x=>({...x}));
 rows.splice(3,0,{page:2,text:'Flete a obra $ 10.000,00'});
 assert.equal((await checkGeneralPdfSource(pdf,draft,reader(rows))).reason,'uncovered_money');
 const subtotal=original.map(x=>({...x}));
 subtotal.splice(3,0,{page:2,text:'Subtotal $ 210.000,00'});
 assert.equal((await checkGeneralPdfSource(pdf,draft,reader(subtotal))).reason,'uncovered_money');
 const total=original.map(x=>({...x}));
 total[3]={page:2,text:'Total $ 222.600,00'};
 assert.equal((await checkGeneralPdfSource(pdf,draft,reader(total))).reason,'total_not_found');
});
test('MVP130: explicit IVA clause must be preserved verbatim',async()=>{
 const rows=[...original,{page:2,text:'IVA incluido'}];
 assert.equal((await checkGeneralPdfSource(pdf,draft,reader(rows))).reason,'uncovered_terms');
 const preserved={...draft,requested_delivery_note:'IVA incluido'};
 assert.equal((await checkGeneralPdfSource(pdf,preserved,reader(rows))).state,'source_text_covered');
});
test('MVP130: explicit freight as an item is allowed and not lost',async()=>{
 const p={...draft,lines:[...draft.lines,{
  original_description:'Flete a obra',quantity:'1',unit:'envío',
  unit_price:'$ 10.000,00',line_total:'$ 10.000,00',
  evidence_location:'página 2, fila 2',ambiguity:null
 }],total_declared:'$ 230.600,00'};
 const rows=[...original.slice(0,3),
  {page:2,text:'Flete a obra 1 envío $ 10.000,00 $ 10.000,00'},
  {page:2,text:'Total $ 230.600,00'}];
 assert.equal((await checkGeneralPdfSource(pdf,p,reader(rows))).state,'source_text_covered');
});
test('MVP130: scanned image, hidden layers, unresolved lines and numeric headers stay private',async()=>{
 assert.equal((await checkGeneralPdfSource(pdf,draft,reader(original,true))).reason,'unsupported_layout');
 const unverified={...draft,unanswered:['Pallets unreadable']};
 assert.equal((await checkGeneralPdfSource(pdf,unverified,reader())).reason,'unresolved');
 const numbered=[{page:1,text:'COTIZACION NRO 123'},...original];
 assert.equal((await checkGeneralPdfSource(pdf,draft,reader(numbered))).reason,'uncovered_number');
});
test('MVP130: PDF proof never treats matching two AI outputs as source evidence',()=>{
 const code=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/supplier-source-pdf-general.ts',import.meta.url),'utf8');
 assert.match(code,/npm:unpdf@2\.1\.0/u);
 assert.match(code,/maxImageSize:16_777_216/u);
 assert.match(code,/pdf\.numPages>12/u);
 assert.match(code,/extractTextItems\(pdf\)/u);
 assert.match(code,/page\.invisibleTextLength>0/u);
 assert.match(code,/publicationAllowed:false/u);
 assert.doesNotMatch(code,/INSERT INTO|publish_source_text|console\.log/u);
});
