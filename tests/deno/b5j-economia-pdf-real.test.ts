import {assertEquals,assert} from 'jsr:@std/assert@1.0.15';
import {readPdfWithGeometryB5f} from
 '../../supabase/functions/cotironda-piloto-v2-shadow/pdf-geometry-b5f.ts';
import {comprobarRenglonesPdfOriginalB5} from
 '../../src/domain/presupuestos-v2/evidencia-pdf-original-b5.ts';
import {diagnosticarGeometriaTotalB5i} from
 '../../src/domain/presupuestos-v2/diagnostico-geometria-total-b5i.ts';
import {reconciliarEconomiaTotalB5j} from
 '../../src/domain/presupuestos-v2/reconciliacion-economica-b5j.ts';

function originalPdf(total:string='$4.600,00'):Uint8Array{
 const items:[number,number,string][]=[
  [30,750,'Cantidad'],[130,750,'Descripcion'],
  [350,750,'Unitario'],[500,750,'Total'],
  [30,710,'40,00'],[130,710,'Cemento CPC'],
  [350,710,'$100,00'],[500,710,'$4.000,00'],
  [30,680,'3,00'],[130,680,'Arena Big Bag'],
  [350,680,'$200,00'],[500,680,'$600,00'],
  [500,620,total]
 ];
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
 let pdf='%PDF-1.4\n';const offsets=[0];
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
const makeQuote=(total:string)=>({
 document_kind:'supplier_quote' as const,
 lines:[
  {ordinal:1,kind:'material' as const,
   original_line_raw:'40,00 Cemento CPC $100,00 $4.000,00',
   original_description_raw:'Cemento CPC',
   quantity_raw:'40,00',unit_raw:null,
   unit_price_raw:'$100,00',
   unit_price_role:'effective_explicit' as const,
   line_total_raw:'$4.000,00',source_location_raw:'página 1'},
  {ordinal:2,kind:'material' as const,
   original_line_raw:'3,00 Arena Big Bag $200,00 $600,00',
   original_description_raw:'Arena Big Bag',
   quantity_raw:'3,00',unit_raw:null,
   unit_price_raw:'$200,00',
   unit_price_role:'effective_explicit' as const,
   line_total_raw:'$600,00',source_location_raw:'página 1'}
 ],
 total_declared_raw:total,currency_declared_raw:'$',
 commercial_conditions_raw:[]
});
async function study(total:string){
 const bytes=originalPdf(total);
 const geom=await readPdfWithGeometryB5f(bytes);
 assertEquals(geom.scanned,false);
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer)),x=>
   x.toString(16).padStart(2,'0')).join('');
 const quote=makeQuote(total);
 const proof=await comprobarRenglonesPdfOriginalB5({
  originalBytes:bytes,sourceSha256:sha,candidate:quote,
  readPdf:async()=>geom
 });
 const position=diagnosticarGeometriaTotalB5i({
  rows:geom.rows,declaredTotal:total,lines:quote.lines
 });
 const check=reconciliarEconomiaTotalB5j({
  candidate:quote,source:proof,geometry:position,rows:geom.rows
 });
 return {proof,position,check};
}
Deno.test('B5j: original PDF.js x/y + 2 source lines + footer match, still private',async()=>{
 const {proof,position,check}=await study('$4.600,00');
 assert(proof.lines.every(x=>x.state==='source_line_corresponds'));
 assertEquals(position.code,'amount_after_material_table');
 assertEquals(position.column,'aligned_material_total');
 assertEquals(check.code,'grand_total_balances_private');
 assertEquals(check.material_arithmetic_matches,2);
 assertEquals(check.source_verified,false);
 assertEquals(check.full_document_covered,false);
 assertEquals(check.can_publish,false);
 assertEquals(check.can_rank,false);
 assertEquals(check.can_reveal_contacts,false);
});
Deno.test('B5j: a one-cent source-total discrepancy never earns approval',async()=>{
 const {check}=await study('$4.600,01');
 assertEquals(check.code,'grand_total_differs');
 assertEquals(check.can_publish,false);
 assertEquals(check.source_verified,false);
});
