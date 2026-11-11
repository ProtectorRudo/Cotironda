import {readPdfWithGeometryB5f} from
 '../../supabase/functions/cotironda-piloto-v2-shadow/pdf-geometry-b5f.ts';
import {comprobarRenglonesPdfOriginalB5} from
 '../../src/domain/presupuestos-v2/evidencia-pdf-original-b5.ts';
import {assertEquals,assert} from 'jsr:@std/assert@1.0.15';
import {diagnosticarTotalPdfB5h} from
 '../../src/domain/presupuestos-v2/diagnostico-total-pdf-b5h.ts';

function pdfFixture():Uint8Array{
 // One genuinely parseable PDF: no OCR, remote fonts, model or user files.
 const items=[
  [50,735,'Cantidad'],[135,735,'Descripcion'],[310,735,'Lista'],
  [430,735,'Dscto.'],[530,735,'Total'],
  [50,700,'40,00'],[135,700,'Cemento CPC'],
  [310,700,'$9.798,58'],[430,700,'22.4%'],
  [530,700,'$304.148,00'],
  [420,650,'TOTAL GENERAL'],[530,650,'304.148,00']
 ] as const;
 const commands=items.map(([x,y,value])=>
  'BT /F1 9 Tf '+x+' '+y+' Td ('+value+') Tj ET').join('\n')+'\n';
 const enc=new TextEncoder();
 const obj=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 660 840] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+enc.encode(commands).length+' >>\nstream\n'+commands+'endstream'
 ];
 let pdf='%PDF-1.4\n';
 const offsets=[0];
 for(let i=0;i<obj.length;i++){
  offsets.push(enc.encode(pdf).length);
  pdf+=(i+1)+' 0 obj\n'+obj[i]+'\nendobj\n';
 }
 const xref=enc.encode(pdf).length;
 pdf+='xref\n0 6\n0000000000 65535 f \n';
 for(const n of offsets.slice(1))
  pdf+=String(n).padStart(10,'0')+' 00000 n \n';
 pdf+='trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return enc.encode(pdf);
}
Deno.test('B5f: PDF.js extracts actual x/y and corroborates same source total/discount',async()=>{
 const bytes=pdfFixture();
 const geometry=await readPdfWithGeometryB5f(bytes);
 assertEquals(geometry.scanned,false);
 assertEquals(geometry.pages,1);
 assertEquals(geometry.rows.length,3);
 const header=geometry.rows[0],body=geometry.rows[1];
 assert(header.text.includes('Dscto.'));
 assert(body.text.includes('22.4%'));
 const heading=header.parts?.find(x=>x.text==='Dscto.');
 const rate=body.parts?.find(x=>x.text==='22.4%');
 assert(heading&&rate);
 assertEquals(Math.abs(heading.x-rate.x)<=2,true);
 assertEquals(header.y!>body.y!,true);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer)),v=>
   v.toString(16).padStart(2,'0')).join('');
 const candidate={
  document_kind:'supplier_quote',
  lines:[{
   ordinal:1,kind:'material',
   original_line_raw:body.text,
   original_description_raw:'Cemento CPC',
   quantity_raw:'40,00',unit_raw:null,
   unit_price_raw:'$9.798,58',unit_price_role:'list_explicit',
   line_total_raw:'$304.148,00',source_location_raw:'página 1'
  }],
  total_declared_raw:'$304.148,00',currency_declared_raw:'$',
  commercial_conditions_raw:[]
 };
 const proof=await comprobarRenglonesPdfOriginalB5({
  originalBytes:bytes,sourceSha256:hash,candidate,
  readPdf:readPdfWithGeometryB5f
 });
 assertEquals(proof.state,'source_rows_correspond_private');
 assertEquals(proof.total_state,'unique_source_total');
 assertEquals(proof.lines[0].discount_evidence?.basis_points,'2240');
 assertEquals(proof.lines[0].discount_evidence?.origin,'aligned_header');
 assertEquals(proof.can_publish,false);
 assertEquals(proof.can_rank,false);
 assertEquals(proof.full_document_covered,false);
});

Deno.test('B5h: PDF auténtico en memoria clasifica total, sin habilitar publicación',async()=>{
 const parsed=await readPdfWithGeometryB5f(pdfFixture());
 const d=diagnosticarTotalPdfB5h(parsed.rows,'$304.148,00');
 assertEquals(d.code,'same_row_corresponds_private');
 assertEquals(d.header_rows,1);
 assertEquals(d.matching_amount_cells,1);
 assertEquals(d.source_verified,false);
 assertEquals(d.can_publish,false);
 assertEquals(d.can_rank,false);
});
