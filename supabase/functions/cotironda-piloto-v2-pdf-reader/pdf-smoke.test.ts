/** Real PDF bytes, not an injected reader. Deno and unpdf 2.1.0 smoke. */
import {readPdfPositioned} from '../cotironda-piloto-whapi/supplier-source-pdf-general.ts';
function fixturePdf():Uint8Array{
 const stream=[
  'BT',
  '/F1 14 Tf',
  '72 738 Td',
  '(COTIZACION CEMENTO PORTLAND 50 KG 100 BOLSAS) Tj',
  '0 -24 Td',
  '(FORMA DE PAGO TRANSFERENCIA BANCARIA) Tj',
  'ET'
 ].join('\n')+'\n';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+new TextEncoder().encode(stream).length+' >>\nstream\n'+stream+'endstream'
 ];
 const enc=new TextEncoder();const offsets=[0];
 let body='%PDF-1.4\n';
 for(let i=0;i<objects.length;i++){
  offsets.push(enc.encode(body).length);
  body+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
 }
 const position=enc.encode(body).length;
 body+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(const value of offsets.slice(1)){
  body+=String(value).padStart(10,'0')+' 00000 n \n';
 }
 body+='trailer\n<< /Root 1 0 R /Size '+(objects.length+1)+
  ' >>\nstartxref\n'+position+'\n%%EOF\n';
 return enc.encode(body);
}
Deno.test('V2-04c: PDF real de una página extraído con posición',async()=>{
 const reader=await readPdfPositioned(fixturePdf());
 if(reader.scanned||reader.pages!==1||
  !reader.rows.some(x=>x.text.includes('COTIZACION CEMENTO PORTLAND'))||
  !reader.rows.some(x=>x.text.includes('TRANSFERENCIA BANCARIA')))
   throw Error('PDF_POSITIONED_READER_REAL_SMOKE_FAILED');
});
Deno.test('V2-04c: archivo corrupto no inventa evidencia',async()=>{
 let denied=false;
 try{await readPdfPositioned(new TextEncoder().encode('%PDF-1.4\nBAD'))}
 catch{denied=true}
 if(!denied)throw Error('CORRUPT_PDF_ACCEPTED');
});