import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {contrastarDocumentoCompradorMvp277} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-binary-mvp277.ts';

const PDF='application/pdf';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const source=[
 'PEDIDO DE MATERIALES',
 'Cemento CPC 50 kg 20 bolsas',
 'Cable unipolar 2,5 mm2 15 m',
 'Entrega La Plata'
];
const draft={
 status:'review_required',kind:'buyer_request',
 delivery_city:'La Plata',requested_delivery_note:null,total_declared:null,
 unanswered:[],lines:[
  {original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas',
   unit_price:null,line_total:null,evidence_location:'Página 1',ambiguity:null},
  {original_description:'Cable unipolar 2,5 mm2',quantity:'15',unit:'m',
   unit_price:null,line_total:null,evidence_location:'Página 1',ambiguity:null}
 ]
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixture=(mime,bytes)=>({mime,bytes,sha256:sha(bytes)});
const mockPdf=(rows=source,scanned=false,pages=1)=>
 async()=>({pages,scanned,rows:rows.map((text,i)=>({page:i===0?1:pages,text}))});
const makePdf=()=>fixture(PDF,new Uint8Array(512).fill(37));
function check(changes={}){
 const original=makePdf();
 const args={habilitado:true,original,primera:draft,
  segunda:structuredClone(draft),lectorPdf:mockPdf(),...changes};
 return contrastarDocumentoCompradorMvp277(args);
}
const alwaysPrivate=r=>{
 assert.equal(r.rondaCreada,false);
 assert.equal(r.whatsappEnviado,false);
 assert.equal(r.soloVistaPrivada,true);
};
test('MVP277: PDF embedded text corroborates 2 original items, no round',async()=>{
 const v=await check();
 assert.equal(v.estado,'fuente_contrastada_privada');
 assert.equal(v.sha256Original,makePdf().sha256);
 assert.equal(v.renglonesAcreditados,2);
 assert.equal(v.textoFuentePrivado,source.join('\n'));
 assert.match(v.sha256TextoDerivado,/^[a-f0-9]{64}$/u);
 alwaysPrivate(v);
});
test('MVP277: two agreeing models still need independently visible source rows',async()=>{
 for(const rows of [
  source.filter(v=>!v.startsWith('Cable')),
  source.map(v=>v.replace('15 m','150 m')),
  [...source,'Arena fina sin cantidad'],
  [...source,'Bolson de arena 1 unidad'],
  [...source,'Flete a convenir'],
  [...source,'Total $100000'],
  [...source,'PEDIDO 2026'],
  [...source,'Otro artículo sin cantidad'],
  source.map(v=>v.replace('20 bolsas','2 bolsas')),
  source.map(v=>v.replace('15 m','15 mm2'))
 ]){
  const v=await check({lectorPdf:mockPdf(rows)});
  assert.equal(v.estado,'requiere_revision',JSON.stringify(rows));
  assert.equal(v.textoFuentePrivado,null);
  alwaysPrivate(v);
 }
});
test('MVP277: source digits in product dimensions cannot be quantity',async()=>{
 const changed={...draft,lines:[
  {...draft.lines[0],quantity:'50',unit:'kg'},draft.lines[1]
 ]};
 const v=await check({primera:changed,segunda:structuredClone(changed)});
 assert.equal(v.estado,'requiere_revision');
 alwaysPrivate(v);
});
test('MVP277: rejects blind mismatch, unresolved, extra lines, economic price fields',async()=>{
 const cases=[
  {segunda:{...draft,lines:draft.lines.slice(0,1)}},
  {segunda:{...draft,delivery_city:'Berisso'}},
  {segunda:{...draft,unanswered:['celda ilegible']}},
  {primera:{...draft,lines:[{...draft.lines[0],unit_price:'$2000'},draft.lines[1]]}},
  {primera:{...draft,total_declared:'$300000'}},
  {primera:{...draft,lines:Array.from({length:26},()=>draft.lines[0])}},
  {primera:{...draft,lines:[{...draft.lines[0],ambiguity:'cantidad borrosa'},draft.lines[1]]}},
 ];
 for(const change of cases){
  const v=await check(change);
  assert.equal(v.estado,'requiere_revision');
  alwaysPrivate(v);
 }
});
test('MVP277: no guessed locality; missing source city requests review/zone',async()=>{
 const rows=source.filter(x=>!x.startsWith('Entrega'));
 const result=await check({lectorPdf:mockPdf(rows)});
 assert.equal(result.estado,'requiere_zona');
 assert.equal(result.textoFuentePrivado,null);
 alwaysPrivate(result);
});
test('MVP277: scan, false pages, too many rows or size/digest invalid',async()=>{
 for(const change of [
  {lectorPdf:mockPdf(source,true)},
  {lectorPdf:mockPdf(source,false,13)},
  {lectorPdf:mockPdf(Array(100).fill('PEDIDO DE MATERIALES'))},
  {original:{...makePdf(),sha256:'0'.repeat(64)}},
  {original:{...makePdf(),bytes:new Uint8Array(2)}},
  {original:{...makePdf(),mime:'image/png'}},
  {original:{...makePdf(),mime:'application/msword'}}
 ]){
  const v=await check(change);
  assert.equal(v.estado,'requiere_revision');
  alwaysPrivate(v);
 }
});
test('MVP277: disabled reader does not touch contents',async()=>{
 let called=false;
 const v=await check({habilitado:false,lectorPdf:async()=>{
  called=true;throw Error('must not call');
 }});
 assert.equal(v.estado,'apagado');
 assert.equal(called,false);alwaysPrivate(v);
});
function crc32(bytes){
 let x=0xffffffff;
 for(const b of bytes){
  x^=b;
  for(let i=0;i<8;i++)x=(x>>>1)^((x&1)?0xedb88320:0);
 }
 return (x^0xffffffff)>>>0;
}
function zip(entries){
 const local=[],central=[];let offset=0;
 for(const [key,val] of Object.entries(entries)){
  const name=Buffer.from(key),data=Buffer.from(val);
  const l=Buffer.alloc(30),c=Buffer.alloc(46);
  l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);
  l.writeUInt32LE(crc32(data),14);l.writeUInt32LE(data.length,18);
  l.writeUInt32LE(data.length,22);l.writeUInt16LE(name.length,26);
  c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);
  c.writeUInt16LE(20,6);c.writeUInt32LE(crc32(data),16);
  c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);
  c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
  local.push(l,name,data);central.push(c,name);
  offset+=l.length+name.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(central.length/2,8);
 end.writeUInt16LE(central.length/2,10);
 end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Uint8Array.from(Buffer.concat([...local,directory,end]));
}
const xmlEscape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const docx=(rows=source,extra='')=>{
 const paragraphs=rows.map(r=>'<w:p><w:r><w:t>'+xmlEscape(r)+
  '</w:t></w:r></w:p>').join('');
 return zip({'[Content_Types].xml':'<Types/>',
  'word/document.xml':'<w:document><w:body>'+paragraphs+
   extra+'</w:body></w:document>'});
};
const xlsx=(rows=source,extra='')=>{
 const body=rows.map((value,i)=>{
  const parts=i===1?['Cemento CPC 50 kg','20','bolsas']:
   i===2?['Cable unipolar 2,5 mm2','15','m']:[value];
  return '<row r="'+(i+1)+'">'+parts.map((v,j)=>
   '<c r="'+String.fromCharCode(65+j)+(i+1)+
   '" t="inlineStr"><is><t>'+xmlEscape(v)+
   '</t></is></c>').join('')+'</row>';
 }).join('')+extra;
 return zip({'[Content_Types].xml':'<Types/>',
  'xl/workbook.xml':'<workbook><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/worksheets/sheet1.xml':'<worksheet><sheetData>'+body+
   '</sheetData></worksheet>'});
};
test('MVP277: real DOCX ZIP/XML source-check independent of AI',async()=>{
 const original=fixture(DOCX,docx());
 const v=await check({original});
 assert.equal(v.estado,'fuente_contrastada_privada');
 assert.equal(v.renglonesAcreditados,2);
 alwaysPrivate(v);
});
test('MVP277: real XLSX ZIP/XML rows check descriptions, quantities and units',async()=>{
 const original=fixture(XLSX,xlsx());
 const v=await check({original});
 assert.equal(v.estado,'fuente_contrastada_privada');
 assert.match(v.textoFuentePrivado,/Cemento CPC 50 kg · 20 · bolsas/u);
 assert.match(v.textoFuentePrivado,/Cable unipolar 2,5 mm2 · 15 · m/u);
 alwaysPrivate(v);
});
test('MVP277: hidden sheet, formula, embedded content and modified CRC all fail closed',async()=>{
 const formula=xlsx(source,'<row><c r="D9"><f>SUM(A1:A9)</f><v>2</v></c></row>');
 const hidden=xlsx();const hiddenB=Buffer.from(hidden);
 const content=Buffer.from('<workbook><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>');
 // Make a valid workbook containing hidden worksheet markup to verify structural rejection.
 const hiddenXml=xlsx(source).length>0?
  zip({'[Content_Types].xml':'<Types/>',
   'xl/workbook.xml':'<workbook><sheets><sheet name="Hoja1" sheetId="1" state="hidden" r:id="rId1"/></sheets></workbook>',
   'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row><c t="inlineStr"><is><t>Hidden</t></is></c></row></sheetData></worksheet>'}):hiddenB;
 const withImage=zip({'[Content_Types].xml':'<Types/>',
  'word/document.xml':'<w:document><w:body>'+
  source.map(x=>'<w:p><w:r><w:t>'+xmlEscape(x)+'</w:t></w:r></w:p>').join('')+
  '</w:body></w:document>',
  'word/media/image1.png':'untrusted'});
 const mutated=docx();mutated[40]^=0xff;
 for(const [mime,bytes] of [[XLSX,formula],[XLSX,hiddenXml],
  [DOCX,withImage],[DOCX,mutated]]){
  const v=await check({original:fixture(mime,bytes)});
  assert.equal(v.estado,'requiere_revision',mime);
  alwaysPrivate(v);
 }
});
test('MVP277: webhook preview is OFF by default and never prepares a round',()=>{
 const code=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const start=code.indexOf("if(proposal.kind==='buyer_request'&&!verifiedSupplier){");
 const end=code.indexOf("}else if(proposal.kind==='supplier_quote'){",start);
 assert.ok(start>0&&end>start);
 const branch=code.slice(start,end);
 assert.match(branch,/COTIRONDA_PILOT_BUYER_BINARY_CENTRAL_PREVIEW_ENABLED/u);
 assert.match(branch,/contrastarDocumentoCompradorMvp277\(/u);
 assert.match(branch,/\}else if\(centralConfigured&&[\s\S]*COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_ACTIVE_ENABLED/u);
 assert.match(branch,/\}else\{\s*const plan=await db\.rpc\('cotironda_piloto_plan_document_mvp098'/u);
 const preview=branch.slice(branch.indexOf('contrastarDocumentoCompradorMvp277'),
  branch.indexOf('}else if(centralConfigured&&',branch.indexOf('contrastarDocumentoCompradorMvp277')));
 assert.doesNotMatch(preview,/db\.rpc|fetch\(|preparedDocumentSourceHmac=/u);
});
