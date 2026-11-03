import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {checkSupplierPdfSource} from '../../supabase/functions/cotironda-piloto-whapi/supplier-source-pdf.ts';

const cpc='20 bolsas - Cemento CPC 50 kg - $ 9.500,00 x 20 = $ 190.000,00';
const freight='Flete a obra - $ 12.000,00';
const total='Total: $ 202.000,00';
const proposal={status:'review_required',kind:'supplier_quote',
 delivery_city:null,requested_delivery_note:null,unanswered:[],
 lines:[
  {original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas',
   unit_price:'$ 9.500,00',line_total:'$ 190.000,00',
   evidence_location:'pagina 1',ambiguity:null},
  {original_description:'Flete a obra',quantity:null,unit:null,
   unit_price:null,line_total:'$ 12.000,00',
   evidence_location:'pagina 1',ambiguity:null}
 ],
 total_declared:'$ 202.000,00'
};
function pdf(rows=[cpc,freight,total],opts={}){
 const commands=opts.graphics?['q','0 0 100 100 re','S','Q']:
  ['BT','/F1 12 Tf','72 730 Td',...rows.flatMap((r,i)=>
   i===0?['('+r+') Tj']:['0 -18 Td','('+r+') Tj']),'ET'];
 const plain=Buffer.from(commands.join('\n')+'\n','latin1');
 const data=opts.compressed?deflateSync(plain):plain;
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count '+(opts.pages??1)+' >>',
  '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 595 842] /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  Buffer.concat([
   Buffer.from('<< /Length '+data.length+(opts.compressed?' /Filter /FlateDecode':'')+' >>\nstream\n'),
   data,Buffer.from('\nendstream')
  ])
 ];
 if(opts.extraImage)objects.push('<< /Type /XObject /Subtype /Image >>');
 const out=[Buffer.from('%PDF-1.4\n','latin1')],offsets=[0];let at=out[0].length;
 for(let i=0;i<objects.length;i++){
  offsets.push(at);
  const head=Buffer.from((i+1)+' 0 obj\n');
  const body=Buffer.isBuffer(objects[i])?objects[i]:Buffer.from(objects[i]);
  const part=Buffer.concat([head,body,Buffer.from('\nendobj\n')]);
  out.push(part);at+=part.length;
 }
 const xref=at;
 out.push(Buffer.from(['xref','0 '+offsets.length,'0000000000 65535 f ',
  ...offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ')
  ].join('\n')+'\ntrailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF'));
 return Uint8Array.from(Buffer.concat(out));
}
const media=(bytes,mime='application/pdf')=>({mime,sha256:'d'.repeat(64),bytes});
test('MVP114: single page original text PDF exact totals and delivery fee',async()=>{
 const r=await checkSupplierPdfSource(media(pdf()),proposal);
 assert.equal(r.state,'source_text_covered');
 assert.equal(r.reason,'covered');
 assert.equal(r.lines,2);
 assert.equal(r.sourceSha256,'d'.repeat(64));
 assert.equal(r.publicationAllowed,false);
 assert.equal(r.rankingAllowed,false);
});
test('MVP114: original FlateDecode PDF can be independently checked',async()=>{
 const r=await checkSupplierPdfSource(media(pdf(undefined,{compressed:true})),proposal);
 assert.equal(r.state,'source_text_covered');
});
test('MVP114: changed original price and missing fee refuse publication',async()=>{
 const wrong=pdf([cpc.replace('$ 9.500,00','$ 8.500,00'),freight,total]);
 assert.equal((await checkSupplierPdfSource(media(wrong),proposal)).state,
  'needs_source_review');
 const removed=pdf([cpc,total]);
 assert.equal((await checkSupplierPdfSource(media(removed),proposal)).state,
  'needs_source_review');
});
test('MVP114: scanned images, drawn tables and multiple page PDFs are quarantined',async()=>{
 for(const opts of [{extraImage:true},{graphics:true},{pages:2}]){
  const r=await checkSupplierPdfSource(media(pdf(undefined,opts)),proposal);
  assert.equal(r.state,'needs_source_review',JSON.stringify(opts));
 }
});
test('MVP114: source file tampering, MIME spoofing, numeric uncertainty fail closed',async()=>{
 const corrupt=pdf();corrupt[0]=0;
 assert.equal((await checkSupplierPdfSource(media(corrupt),proposal)).reason,
  'invalid_source');
 assert.equal((await checkSupplierPdfSource(media(pdf(),'image/png'),proposal)).reason,
  'unsupported_format');
 const unclear={...proposal,unanswered:['IVA sin leer']};
 assert.equal((await checkSupplierPdfSource(media(pdf()),unclear)).reason,'unresolved');
});
test('MVP114: source proof passes economic and RLS gates, not bypass',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const audit=readFileSync(new URL('../../supabase/piloto/mvp106_supplier_source_text_check.sql',import.meta.url),'utf8');
 const projection=readFileSync(new URL('../../supabase/piloto/mvp107_anonymous_text_projection.sql',import.meta.url),'utf8');
 assert.match(edge,/checkSupplierPdfSource\(downloadedForReview,proposal\)/u);
 assert.match(edge,/cotironda_piloto_audit_supplier_amounts_mvp103/);
 assert.match(edge,/cotironda_piloto_record_supplier_source_check_mvp106/);
 assert.match(edge,/cotironda_piloto_publish_source_text_mvp107/);
 assert.match(audit,/'application\/pdf'/);
 assert.match(projection,/m\.mime in \('text\/plain','text\/csv','application\/pdf'/);
 assert.match(audit,/enable row level security/);
});
