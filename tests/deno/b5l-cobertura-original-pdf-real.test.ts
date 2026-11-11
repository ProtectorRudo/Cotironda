import {assertEquals,assert} from 'jsr:@std/assert@1.0.15';
import {readPdfWithGeometryB5f} from
 '../../supabase/functions/cotironda-piloto-v2-shadow/pdf-geometry-b5f.ts';
import {comprobarRenglonesPdfOriginalB5} from
 '../../src/domain/presupuestos-v2/evidencia-pdf-original-b5.ts';
import {diagnosticarGeometriaTotalB5i} from
 '../../src/domain/presupuestos-v2/diagnostico-geometria-total-b5i.ts';
import {reconciliarEconomiaTotalB5j} from
 '../../src/domain/presupuestos-v2/reconciliacion-economica-b5j.ts';
import {cotejarMonedaOriginalB5k} from
 '../../src/domain/presupuestos-v2/cotejo-moneda-original-b5k.ts';
import {auditarCoberturaPdfOriginalB5l} from
 '../../src/domain/presupuestos-v2/auditoria-cobertura-original-b5l.ts';

function originalPdf(total:string='$4.600,00',extra:[number,number,string][]=[]) :Uint8Array{
 const items:[number,number,string][]=[
  [30,750,'Cantidad'],[130,750,'Descripcion'],
  [350,750,'Unitario'],[500,750,'Total'],
  [30,710,'40,00'],[130,710,'Cemento CPC'],
  [350,710,'$100,00'],[500,710,'$4.000,00'],
  [30,680,'3,00'],[130,680,'Arena Big Bag'],
  [350,680,'$200,00'],[500,680,'$600,00'],
  [500,620,total],...extra
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
 total_declared_raw:total,currency_declared_raw:null,
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
 const currency=cotejarMonedaOriginalB5k({
  candidate:quote,source:proof,geometry:position,rows:geom.rows
 });
 const before=reconciliarEconomiaTotalB5j({
  candidate:quote,source:proof,geometry:position,rows:geom.rows
 });
 const check=reconciliarEconomiaTotalB5j({
  candidate:quote,source:proof,geometry:position,rows:geom.rows,
  currencyEvidence:currency
 });
 const coverage=auditarCoberturaPdfOriginalB5l({
  candidate:quote,rows:geom.rows,source:proof,geometry:position,
  scanned:geom.scanned,pages:geom.pages
 });
 return {proof,position,currency,before,check,coverage};
}
Deno.test('B5k: original PDF.js x/y + 2 source lines + footer match, still private',async()=>{
 const {proof,position,currency,before,check}=await study('$4.600,00');
 assert(proof.lines.every(x=>x.state==='source_line_corresponds'));
 assertEquals(position.code,'amount_after_material_table');
 assertEquals(position.column,'aligned_material_total');
 assertEquals(currency.code,'uniform_dollar_symbol_iso_unstated');
 assertEquals(currency.currency_iso_verified,false);
 assertEquals(currency.material_lines_with_symbol,2);
 assertEquals(currency.unit_prices_with_symbol,2);
 assertEquals(before.code,'currency_ambiguous');
 assertEquals(check.code,'grand_total_balances_private');
 assertEquals(check.material_arithmetic_matches,2);
 assertEquals(check.source_verified,false);
 assertEquals(check.full_document_covered,false);
 assertEquals(check.can_publish,false);
 assertEquals(check.can_rank,false);
 assertEquals(check.can_reveal_contacts,false);
});
Deno.test('B5k: a one-cent source-total discrepancy never earns approval',async()=>{
 const {check,currency}=await study('$4.600,01');
 assertEquals(currency.code,'uniform_dollar_symbol_iso_unstated');
 assertEquals(check.code,'grand_total_differs');
 assertEquals(check.can_publish,false);
 assertEquals(check.source_verified,false);
});

Deno.test('B5l: synthetic real PDF.js rows fully attributed without source certification',async()=>{
 const {proof,position,coverage}=await study('$4.600,00');
 assertEquals(proof.sha_verified,true);
 assertEquals(position.code,'amount_after_material_table');
 assertEquals(coverage.code,'visible_rows_accounted_private');
 assertEquals(coverage.attributed_lines,2);
 assertEquals(coverage.unattributed_rows,0);
 assertEquals(coverage.full_document_covered,false);
 assertEquals(coverage.can_publish,false);
 assertEquals(coverage.can_rank,false);
 assertEquals(coverage.can_reveal_contacts,false);
});

Deno.test('B5l: real PDF.js places a full freight term in an independent part on material row',async()=>{
 const bytes=originalPdf('$4.600,00',[[555,710,'Flete a coordinar']]);
 const geom=await readPdfWithGeometryB5f(bytes);
 assertEquals(geom.scanned,false);
 assert(geom.rows.some(r=>r.text.includes('Cemento CPC')&&
  r.text.includes('Flete a coordinar')));
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer)),x=>
   x.toString(16).padStart(2,'0')).join('');
 const quote={...makeQuote('$4.600,00'),
  currency_declared_raw:'$',
  commercial_conditions_raw:['Flete a coordinar']};
 const proof=await comprobarRenglonesPdfOriginalB5({
  originalBytes:bytes,sourceSha256:sha,candidate:quote,
  readPdf:async()=>geom
 });
 const geometry=diagnosticarGeometriaTotalB5i({
  rows:geom.rows,declaredTotal:quote.total_declared_raw,lines:quote.lines
 });
 const coverage=auditarCoberturaPdfOriginalB5l({
  candidate:quote,rows:geom.rows,source:proof,geometry,
  scanned:geom.scanned,pages:geom.pages
 });
 const economic=reconciliarEconomiaTotalB5j({
  candidate:quote,rows:geom.rows,source:proof,geometry
 });
 assertEquals(coverage.code,'visible_rows_accounted_private');
 assertEquals(coverage.corroborated_conditions,1);
 assertEquals(coverage.unattributed_rows,0);
 assertEquals(economic.code,'fiscal_or_freight_ambiguous');
 assertEquals(economic.freight,'mentioned_unpriced');
 assertEquals(economic.material_total_matches_declared,true);
 assertEquals(economic.source_verified,false);
 assertEquals(coverage.full_document_covered,false);
 assertEquals(economic.can_publish,false);
 assertEquals(economic.can_rank,false);
});


Deno.test('B5n: PDF.js real attributes punctuation-marked payment as its own source part',async()=>{
 const bytes=originalPdf('$4.600,00',[[555,710,'precios en efectivo:']]);
 const reader=await readPdfWithGeometryB5f(bytes);
 assertEquals(reader.scanned,false);
 assert(reader.rows.some(r=>r.text.includes('Cemento CPC')&&
  r.parts?.some(p=>p.text==='precios en efectivo:')));
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer)),x=>
   x.toString(16).padStart(2,'0')).join('');
 const quote={...makeQuote('$4.600,00'),
  currency_declared_raw:'$',
  commercial_conditions_raw:['precios en efectivo']};
 const proof=await comprobarRenglonesPdfOriginalB5({
  originalBytes:bytes,sourceSha256:sha,candidate:quote,
  readPdf:async()=>reader
 });
 const geometry=diagnosticarGeometriaTotalB5i({
  rows:reader.rows,declaredTotal:quote.total_declared_raw,
  lines:quote.lines
 });
 const coverage=auditarCoberturaPdfOriginalB5l({
  candidate:quote,rows:reader.rows,source:proof,geometry,
  scanned:reader.scanned,pages:reader.pages
 });
 assertEquals(coverage.code,'visible_rows_accounted_private');
 assertEquals(coverage.corroborated_conditions,1);
 assertEquals(coverage.unattributed_rows,0);
 assertEquals(coverage.source_verified,false);
 assertEquals(coverage.full_document_covered,false);
 assertEquals(coverage.can_publish,false);
 assertEquals(coverage.can_rank,false);
 assertEquals(coverage.can_reveal_contacts,false);
});
Deno.test('B5n: PDF.js real rejects payment and unpriced freight merged in one source part',async()=>{
 const bytes=originalPdf('$4.600,00',
  [[555,710,'precios en efectivo: flete a convenir']]);
 const reader=await readPdfWithGeometryB5f(bytes);
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer)),x=>
   x.toString(16).padStart(2,'0')).join('');
 const quote={...makeQuote('$4.600,00'),
  currency_declared_raw:'$',
  commercial_conditions_raw:['precios en efectivo','flete a convenir']};
 const proof=await comprobarRenglonesPdfOriginalB5({
  originalBytes:bytes,sourceSha256:sha,candidate:quote,
  readPdf:async()=>reader
 });
 const geometry=diagnosticarGeometriaTotalB5i({
  rows:reader.rows,declaredTotal:quote.total_declared_raw,
  lines:quote.lines
 });
 const coverage=auditarCoberturaPdfOriginalB5l({
  candidate:quote,rows:reader.rows,source:proof,geometry,
  scanned:reader.scanned,pages:reader.pages
 });
 assertEquals(coverage.code,'line_assignment_ambiguous');
 assertEquals(coverage.corroborated_conditions,0);
 assertEquals(coverage.source_verified,false);
 assertEquals(coverage.can_publish,false);
 assertEquals(coverage.can_rank,false);
});


Deno.test('B5o: PDF.js source note and condition are the SAME one source fact',async()=>{
 const bytes=originalPdf('$4.600,00',[
  [130,560,'precios en efectivo'],[130,530,'flete a convenir']]);
 const reader=await readPdfWithGeometryB5f(bytes);
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer)),x=>
   x.toString(16).padStart(2,'0')).join('');
 const note=(ordinal:number,value:string)=>({
  ordinal,kind:'commercial_note' as const,
  original_line_raw:value,original_description_raw:value,
  quantity_raw:null,unit_raw:null,unit_price_raw:null,
  unit_price_role:'absent' as const,line_total_raw:null,
  source_location_raw:'página 1'
 });
 const quote={...makeQuote('$4.600,00'),
  currency_declared_raw:'$',
  lines:[...makeQuote('$4.600,00').lines,
   note(3,'precios en efectivo'),note(4,'flete a convenir')],
  commercial_conditions_raw:['precios en efectivo','flete a convenir']};
 const proof=await comprobarRenglonesPdfOriginalB5({
  originalBytes:bytes,sourceSha256:sha,candidate:quote,readPdf:async()=>reader
 });
 assertEquals(proof.sha_verified,true);
 assert(proof.lines.every(l=>l.state==='source_line_corresponds'));
 const geometry=diagnosticarGeometriaTotalB5i({
  rows:reader.rows,declaredTotal:quote.total_declared_raw,lines:quote.lines
 });
 const coverage=auditarCoberturaPdfOriginalB5l({
  candidate:quote,rows:reader.rows,source:proof,geometry,
  scanned:reader.scanned,pages:reader.pages
 });
 assertEquals(coverage.code,'visible_rows_accounted_private');
 assertEquals(coverage.attributed_lines,4);
 assertEquals(coverage.corroborated_conditions,2);
 assertEquals(coverage.first_unresolved_condition_ordinal,null);
 assertEquals(coverage.source_verified,false);
 assertEquals(coverage.full_document_covered,false);
 assertEquals(coverage.can_publish,false);
 assertEquals(coverage.can_rank,false);
 assertEquals(coverage.can_reveal_contacts,false);
 const economic=reconciliarEconomiaTotalB5j({
  candidate:quote,rows:reader.rows,source:proof,geometry
 });
 assertEquals(economic.code,'fiscal_or_freight_ambiguous');
 assertEquals(economic.freight,'mentioned_unpriced');
 assertEquals(economic.can_publish,false);
});
Deno.test('B5o: PDF.js note with EXTRA IVA does not become a verified condition',async()=>{
 const bytes=originalPdf('$4.600,00',[
  [130,560,'precios en efectivo'],[355,560,'IVA 21%']]);
 const reader=await readPdfWithGeometryB5f(bytes);
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer)),x=>
   x.toString(16).padStart(2,'0')).join('');
 const quote={...makeQuote('$4.600,00'),
  currency_declared_raw:'$',
  lines:[...makeQuote('$4.600,00').lines,{
   ordinal:3,kind:'commercial_note' as const,
   original_line_raw:'precios en efectivo',
   original_description_raw:'precios en efectivo',
   quantity_raw:null,unit_raw:null,unit_price_raw:null,
   unit_price_role:'absent' as const,line_total_raw:null,
   source_location_raw:'página 1'
  }],commercial_conditions_raw:['precios en efectivo']};
 const proof=await comprobarRenglonesPdfOriginalB5({
  originalBytes:bytes,sourceSha256:sha,candidate:quote,readPdf:async()=>reader
 });
 const geometry=diagnosticarGeometriaTotalB5i({
  rows:reader.rows,declaredTotal:quote.total_declared_raw,lines:quote.lines
 });
 const coverage=auditarCoberturaPdfOriginalB5l({
  candidate:quote,rows:reader.rows,source:proof,geometry,
  scanned:reader.scanned,pages:reader.pages
 });
 assertEquals(coverage.code,'unmapped_fiscal_or_logistics');
 assertEquals(coverage.can_publish,false);
 assertEquals(coverage.can_rank,false);
});


Deno.test('B7: original PDF.js scans late IVA even after an unknown text row',async()=>{
 const bytes=originalPdf('$4.600,00',[
  [130,550,'Una nota sin clasificar'],
  [130,530,'IVA no incluido']
 ]);
 const reader=await readPdfWithGeometryB5f(bytes);
 assertEquals(reader.scanned,false);
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer)),x=>
   x.toString(16).padStart(2,'0')).join('');
 const quote=makeQuote('$4.600,00');
 const source=await comprobarRenglonesPdfOriginalB5({
  originalBytes:bytes,sourceSha256:sha,candidate:quote,readPdf:async()=>reader
 });
 const geometry=diagnosticarGeometriaTotalB5i({
  rows:reader.rows,declaredTotal:quote.total_declared_raw,lines:quote.lines
 });
 const coverage=auditarCoberturaPdfOriginalB5l({
  candidate:quote,rows:reader.rows,source,geometry,
  scanned:reader.scanned,pages:reader.pages
 });
 assertEquals(source.sha_verified,true);
 assertEquals(coverage.code,'unmapped_fiscal_or_logistics');
 assertEquals(coverage.unattributed_rows,2);
 assertEquals(coverage.source_verified,false);
 assertEquals(coverage.can_publish,false);
 assertEquals(coverage.can_rank,false);
 assertEquals(coverage.can_reveal_contacts,false);
 assertEquals(JSON.stringify(coverage).includes('IVA no incluido'),false);
});
Deno.test('B7: real PDF.js keeps late price unknown, even after note',async()=>{
 const bytes=originalPdf('$4.600,00',[
  [130,550,'Observaciones generales'],
  [500,530,'$150,00']
 ]);
 const reader=await readPdfWithGeometryB5f(bytes);
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',Uint8Array.from(bytes).buffer)),x=>
   x.toString(16).padStart(2,'0')).join('');
 const quote=makeQuote('$4.600,00');
 const source=await comprobarRenglonesPdfOriginalB5({
  originalBytes:bytes,sourceSha256:sha,candidate:quote,readPdf:async()=>reader
 });
 const geometry=diagnosticarGeometriaTotalB5i({
  rows:reader.rows,declaredTotal:quote.total_declared_raw,lines:quote.lines
 });
 const coverage=auditarCoberturaPdfOriginalB5l({
  candidate:quote,rows:reader.rows,source,geometry,
  scanned:reader.scanned,pages:reader.pages
 });
 assertEquals(source.sha_verified,true);
 assertEquals(coverage.code,'unmapped_monetary_or_percentage');
 assertEquals(coverage.unattributed_rows,2);
 assertEquals(coverage.full_document_covered,false);
 assertEquals(coverage.can_publish,false);
 assertEquals(JSON.stringify(coverage).includes('$150,00'),false);
});
