import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {armarZip} from '../helpers/xlsx-fixture.mjs';
import {extraerEvidenciaPrivadaMvp338 as extraerCore} from
 '../../src/domain/ia-central/fuente-binaria-privada-mvp338.ts';
import {readOfficeVisibleRows} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-source-office.ts';
const extraerEvidenciaPrivadaMvp338=(source,reader)=>
 extraerCore(source,{readOfficeVisibleRows,
  ...(reader?{readPdfPositioned:reader}:{})});

const PDF='application/pdf',XLSX=
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const file=(mime,bytes)=>({mime,bytes:Uint8Array.from(bytes),
 sha256:createHash('sha256').update(bytes).digest('hex')});
const enc=new TextEncoder();
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
const docx=(lines,extra={})=>armarZip({
 '[Content_Types].xml':'<Types/>',
 'word/document.xml':'<w:document><w:body>'+
 lines.map(s=>'<w:p><w:r><w:t>'+xml(s)+'</w:t></w:r></w:p>').join('')+
 '</w:body></w:document>',...extra
});
const xlsx=(sheets,extra={},hidden=false)=>{
 const entries={
  '[Content_Types].xml':'<Types/>',
  'xl/workbook.xml':'<workbook><sheets>'+
    sheets.map((_,i)=>'<sheet name="Hoja'+(i+1)+'" sheetId="'+(i+1)+
     '" r:id="rId'+(i+1)+'"'+(hidden&&i===1?' state="hidden"':'')+'/>').join('')+
   '</sheets></workbook>'
 };
 if(sheets.length>1)entries['xl/_rels/workbook.xml.rels']=
  '<Relationships>'+sheets.map((_,i)=>
   '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>'
  ).join('')+'</Relationships>';
 for(let i=0;i<sheets.length;i++){
  entries['xl/worksheets/sheet'+(i+1)+'.xml']=
   '<worksheet><sheetData>'+sheets[i].map((r,j)=>
   '<row r="'+(j+1)+'"><c r="A'+(j+1)+
    '" t="inlineStr"><is><t>'+xml(r)+'</t></is></c></row>'
   ).join('')+'</sheetData></worksheet>';
 }
 return armarZip({...entries,...extra});
};
const privateResult=r=>{
 assert.equal(r.economicPublicationAllowed,false);
 assert.equal(r.whatsappMessages,0);
};
test('MVP338: DOCX real ZIP/XML conserva productos, descuentos y condiciones',async()=>{
 const original=file(DOCX,docx([
  'PRESUPUESTO', 'Cemento Avellaneda 15 bolsas $ 127.500',
  'BIG BAG Arena 2 $ 73.000', 'Flete a convenir',
  'Descuento especial -$ 3.500', 'TOTAL $ 197.000'
 ]));
 const result=await extraerEvidenciaPrivadaMvp338(original);
 assert.equal(result.state,'evidence_planned_private');
 assert.equal(result.format,'docx');assert.equal(result.rows,6);
 assert.equal(result.sourceSha256,original.sha256);
 const literal=result.plan.lots.flatMap(l=>l.rows);
 assert.equal(literal[4].literal,'Descuento especial -$ 3.500');
 assert.equal(literal[3].literal,'Flete a convenir');
 assert.ok(literal.every(x=>x.section==='docx:visible_row_order'));
 privateResult(result);
});
test('MVP338: XLSX real ZIP/XML con 2 hojas visibles y 35 renglones sin truncar',async()=>{
 const original=file(XLSX,xlsx([
  ['PRESUPUESTO',...Array.from({length:31},(_,i)=>
   'Articulo '+(i+1)+' | $ '+(i+1)+'.000')],
  ['IVA no incluido','Flete a convenir','TOTAL $ 500.000']
 ]));
 const r=await extraerEvidenciaPrivadaMvp338(original);
 assert.equal(r.state,'evidence_planned_private',r.reason);
 assert.equal(r.rows,35);
 assert.ok(r.plan.lots.length>=2);
 const all=r.plan.lots.flatMap(x=>x.rows);
 assert.equal(all[33].literal,'Flete a convenir');
 assert.equal(all[34].literal,'TOTAL $ 500.000');
 assert.deepEqual(all.map(x=>x.position),
  Array.from({length:35},(_,i)=>i+1));
 privateResult(r);
});
test('MVP338: fórmula, macro, Excel oculto y XML externo NO se publican',async()=>{
 const cases=[
  file(XLSX,xlsx([['Cemento $ 100','TOTAL $ 100']],{
   'xl/vbaProject.bin':'MALICIOUS_MARKER'})),
  file(XLSX,xlsx([['Cemento $ 100','TOTAL $ 100']],{
   'xl/externalLinks/externalLink1.xml':'external'},false)),
  file(XLSX,xlsx([['Cemento $ 100','TOTAL $ 100'],
   ['Precio oculto $ 5000']],{},true)),
  file(XLSX,xlsx([['Cemento $ 100','TOTAL $ 100']],{
   'xl/_rels/workbook.xml.rels':'<Relationships><Relationship TargetMode="External" Target="https://bad.invalid"/></Relationships>'
  }))
 ];
 for(const original of cases){
  const r=await extraerEvidenciaPrivadaMvp338(original);
  assert.equal(r.state,'review_required',r.reason);
  assert.equal(r.plan,null);
  privateResult(r);
 }
});
test('MVP338: TXT y CSV con bytes reales y decimal AR se mantienen literales',async()=>{
 for(const mime of ['text/plain','text/csv']){
  const original=file(mime,enc.encode(
   'Hola\n15,00; Cemento CPC; $ 8.500; $ 127.500\n\nIVA no incluido\nTOTAL $ 127.500'
  ));
  const r=await extraerEvidenciaPrivadaMvp338(original);
  assert.equal(r.state,'evidence_planned_private');
  assert.equal(r.rows,4);
  assert.equal(r.plan.lots[0].rows[1].literal,
   '15,00; Cemento CPC; $ 8.500; $ 127.500');
  privateResult(r);
 }
});
test('MVP338: imagen y formatos Office legado no simulan corroboración visual',async()=>{
 const mimeData=[
  ['image/png',[137,80,78,71,13,10,26,10,0,0,0,0],
   'independent_visual_evidence_required'],
  ['image/jpeg',[255,216,255,12,34,56],
   'independent_visual_evidence_required'],
  ['image/webp',[82,73,70,70,0,0,0,0,87,69,66,80],
   'independent_visual_evidence_required'],
  ['application/msword',[208,207,17,224,161,177,26,225],
   'legacy_office_reader_required'],
  ['application/vnd.ms-excel',[208,207,17,224,161,177,26,225],
   'legacy_office_reader_required']
 ];
 for(const [mime,bytes,reason] of mimeData){
  const r=await extraerEvidenciaPrivadaMvp338(file(mime,Uint8Array.from(bytes)));
  assert.equal(r.state,'review_required');
  assert.equal(r.reason,reason);
  privateResult(r);
 }
});
test('MVP338: PDF real firmado delega a lector posicional y mantiene cada página',async()=>{
 const fakePdf=enc.encode('%PDF-1.4\n'+('x'.repeat(200))+'\n%%EOF');
 const original=file(PDF,fakePdf);
 const reader=async bytes=>{
  assert.deepEqual(bytes,original.bytes);
  return {scanned:false,pages:2,rows:[
   {page:1,text:'Cemento CPC 15 bolsas $ 127.500'},
   {page:2,text:'Pallet adicional $ 15.000'},
   {page:2,text:'IVA no incluido'}
  ]};
 };
 const r=await extraerEvidenciaPrivadaMvp338(original,reader);
 assert.equal(r.state,'evidence_planned_private');
 assert.deepEqual(r.plan.lots.flatMap(x=>x.rows).map(x=>x.section),
  ['pagina:1','pagina:2','pagina:2']);
 assert.equal(r.rows,3);
 privateResult(r);
 const scan=await extraerEvidenciaPrivadaMvp338(original,
  async()=>({scanned:true,pages:1,rows:[]}));
 assert.equal(scan.reason,'scanned_pdf_requires_independent_ocr');
 privateResult(scan);
});
test('MVP338: hash incorrecto, MIME falso y TXT inválido no entran a parser',async()=>{
 const x=file(DOCX,docx(['PRESUPUESTO','TOTAL $ 100']));
 const badSha=await extraerEvidenciaPrivadaMvp338({...x,sha256:'a'.repeat(64)});
 assert.equal(badSha.reason,'original_sha256_mismatch');privateResult(badSha);
 const wrongMime=await extraerEvidenciaPrivadaMvp338({...x,mime:PDF});
 assert.equal(wrongMime.reason,'binary_signature_mismatch');
 privateResult(wrongMime);
 const invalidUtf8=await extraerEvidenciaPrivadaMvp338(
  file('text/plain',Uint8Array.from([0xc3,0x28])));
 assert.equal(invalidUtf8.state,'review_required');privateResult(invalidUtf8);
 const oversized=await extraerEvidenciaPrivadaMvp338({
  ...x,bytes:new Uint8Array(8*1024*1024+1)
 });
 assert.equal(oversized.state,'review_required');privateResult(oversized);
});
test('MVP338: el lector no puede inyectar filas vacías, páginas 13 o 301 filas',async()=>{
 const pdf=file(PDF,enc.encode('%PDF-1.4\n'+('0'.repeat(120))));
 for(const reader of [
  async()=>({scanned:false,pages:13,rows:[{page:1,text:'abc'}]}),
  async()=>({scanned:false,pages:1,rows:[{page:2,text:'abc'}]}),
  async()=>({scanned:false,pages:1,rows:[{page:1,text:'  '}]}),
  async()=>({scanned:false,pages:1,rows:Array.from({length:301},
   ()=>({page:1,text:'Cemento'}))})
 ]){
  const r=await extraerEvidenciaPrivadaMvp338(pdf,reader);
  assert.equal(r.state,'review_required');
  assert.equal(r.reason,'pdf_extraction_unverifiable');
  privateResult(r);
 }
});
