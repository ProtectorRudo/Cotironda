import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {checkSupplierOfficeSource} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-source-office.ts';

const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const cpc='20 bolsas · Cemento CPC 50 kg · $ 9.500,00 x 20 = $ 190.000,00';
const freight='Flete a obra · $ 12.000,00';
const total='Total: $ 202.000,00';
const proposal={status:'review_required',kind:'supplier_quote',
 delivery_city:null,requested_delivery_note:null,unanswered:[],
 lines:[
  {original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas',
   unit_price:'$ 9.500,00',line_total:'$ 190.000,00',
   evidence_location:'Fila 1',ambiguity:null},
  {original_description:'Flete a obra',quantity:null,unit:null,
   unit_price:null,line_total:'$ 12.000,00',
   evidence_location:'Fila 2',ambiguity:null}
 ],
 total_declared:'$ 202.000,00'
};
function crc32(data){
 let x=0xffffffff;
 for(const b of data){x^=b;for(let i=0;i<8;i++)
  x=(x>>>1)^(x&1?0xedb88320:0)}
 return (x^0xffffffff)>>>0;
}
function pack(entries,deflated=true){
 const encoder=new TextEncoder();const all=[];const central=[];let at=0;
 const u16=(b,n,o)=>b.writeUInt16LE(n,o);
 const u32=(b,n,o)=>b.writeUInt32LE(n>>>0,o);
 for(const [name,contents] of Object.entries(entries)){
  const n=Buffer.from(encoder.encode(name));
  const data=Buffer.from(encoder.encode(contents));
  const zipped=deflated?deflateRawSync(data):data;const mode=deflated?8:0;
  const c=crc32(data);
  const header=Buffer.alloc(30);
  u32(header,0x04034b50,0);u16(header,20,4);u16(header,mode,8);
  u32(header,c,14);u32(header,zipped.length,18);
  u32(header,data.length,22);u16(header,n.length,26);
  all.push(header,n,zipped);
  const entry=Buffer.alloc(46);
  u32(entry,0x02014b50,0);u16(entry,20,4);u16(entry,20,6);
  u16(entry,mode,10);u32(entry,c,16);u32(entry,zipped.length,20);
  u32(entry,data.length,24);u16(entry,n.length,28);u32(entry,at,42);
  central.push(entry,n);at+=header.length+n.length+zipped.length;
 }
 const cd=Buffer.concat(central);
 const end=Buffer.alloc(22);
 u32(end,0x06054b50,0);u16(end,Object.keys(entries).length,8);
 u16(end,Object.keys(entries).length,10);
 u32(end,cd.length,12);u32(end,at,16);
 return Uint8Array.from(Buffer.concat([...all,cd,end]));
}
function source(mime,zip){return {mime,sha256:'d'.repeat(64),bytes:zip}}
function escape(s){return s.replaceAll('&','&amp;').replaceAll('<','&lt;')}
function word(paragraphs=[cpc,freight,total],extra=''){
 const xml='<?xml version="1.0" encoding="UTF-8"?>'+
 '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
 '<w:body>'+paragraphs.map(p=>'<w:p><w:r><w:t>'+
 escape(p)+'</w:t></w:r></w:p>').join('')+extra+
 '</w:body></w:document>';
 return pack({'[Content_Types].xml':'<Types/>','word/document.xml':xml});
}
function excel({formula=false,hidden=false,second=false}={}){
 const rows=[
  ['20','bolsas','Cemento CPC 50 kg','$ 9.500,00','20','$ 190.000,00'],
  ['Flete a obra','$ 12.000,00'],
  ['Total:','$ 202.000,00']
 ];
 const content=rows.map((cells,i)=>
  '<row r="'+(i+1)+'"'+(hidden&&i===1?' hidden="1"':'')+'>'+
  cells.map((v,j)=>'<c r="'+String.fromCharCode(65+j)+(i+1)+
  '" t="inlineStr"><is><t>'+escape(v)+'</t></is></c>').join('')+
  (formula&&i===1?'<c r="H2"><f>SUM(A1:A2)</f><v>12</v></c>':'')+
  '</row>').join('');
 const entries={'[Content_Types].xml':'<Types/>',
  'xl/workbook.xml':'<workbook><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/worksheets/sheet1.xml':'<worksheet><sheetData>'+content+
  '</sheetData></worksheet>'};
 if(second)entries['xl/worksheets/sheet2.xml']=
  '<worksheet><sheetData><row><c t="inlineStr"><is><t>Otro precio</t></is></c></row></sheetData></worksheet>';
 return pack(entries);
}
test('MVP111: DOCX literal paragraphs verify against original ZIP bytes',async()=>{
 const result=await checkSupplierOfficeSource(source(DOCX,word()),proposal);
 assert.equal(result.state,'source_text_covered');
 assert.equal(result.reason,'covered');
 assert.equal(result.sourceSha256,'d'.repeat(64));
 assert.equal(result.publicationAllowed,false);
 assert.equal(result.rankingAllowed,false);
});
test('MVP111: XLSX literal spreadsheet rows verify descriptions, amounts and totals',async()=>{
 const result=await checkSupplierOfficeSource(source(XLSX,excel()),proposal);
 assert.equal(result.state,'source_text_covered');
 assert.equal(result.lines,2);
});
test('MVP111: stored ZIP entries work without decompression',async()=>{
 const xml='<w:document><w:body>'+[cpc,freight,total].map(t=>
  '<w:p><w:r><w:t>'+escape(t)+'</w:t></w:r></w:p>').join('')+
 '</w:body></w:document>';
 const archive=pack({'[Content_Types].xml':'<Types/>',
  'word/document.xml':xml},false);
 assert.equal((await checkSupplierOfficeSource(source(DOCX,archive),proposal)).state,
  'source_text_covered');
});
test('MVP111: changing one price or omitting a line blocks automated verification',async()=>{
 let edited=word([cpc.replace('$ 9.500,00','$ 8.500,00'),freight,total]);
 assert.equal((await checkSupplierOfficeSource(source(DOCX,edited),proposal)).state,
  'needs_source_review');
 edited=word([cpc,total]);
 assert.equal((await checkSupplierOfficeSource(source(DOCX,edited),proposal)).reason,
  'unsupported_layout');
});
test('MVP111: formulas, hidden Excel rows and extra sheet block auto-publication',async()=>{
 for(const x of [{formula:true},{hidden:true},{second:true}]){
  const v=await checkSupplierOfficeSource(source(XLSX,excel(x)),proposal);
  assert.equal(v.state,'needs_source_review',JSON.stringify(x));
 }
});
test('MVP111: Word embedded images and tracked changes are not silently ignored',async()=>{
 const packed=word([cpc,freight,total],'<w:ins><w:p><w:r><w:t>Oculto</w:t></w:r></w:p></w:ins>');
 const v=await checkSupplierOfficeSource(source(DOCX,packed),proposal);
 assert.equal(v.reason,'unsupported_layout');
 const xml='<w:document><w:body>'+[cpc,freight,total].map(t=>
  '<w:p><w:r><w:t>'+escape(t)+'</w:t></w:r></w:p>').join('')+
 '</w:body></w:document>';
 const withImage=pack({'[Content_Types].xml':'<Types/>',
  'word/document.xml':xml,'word/media/image1.png':'NOT A VALID IMAGE'});
 assert.equal((await checkSupplierOfficeSource(source(DOCX,withImage),proposal)).reason,
  'unsupported_layout');
});
test('MVP111: ZIP CRC tampering, malformed archives and PDF are rejected',async()=>{
 const bytes=word();bytes[47]^=0xff;
 assert.equal((await checkSupplierOfficeSource(source(DOCX,bytes),proposal)).state,
  'needs_source_review');
 assert.equal((await checkSupplierOfficeSource(source(XLSX,new Uint8Array(5)),proposal)).reason,
  'invalid_source');
 assert.equal((await checkSupplierOfficeSource(source('application/pdf',word()),proposal)).reason,
  'unsupported_format');
});
test('MVP111: vendor identity in source, ambiguous amount or missing IVA cannot be auto-approved',async()=>{
 const withPhone=word([cpc,freight+' Contacto: +54 221 555 4321',total]);
 assert.equal((await checkSupplierOfficeSource(source(DOCX,withPhone),proposal)).reason,
  'unsafe_contact');
 const uncertain={...proposal,unanswered:['IVA ilegible']};
 assert.equal((await checkSupplierOfficeSource(source(DOCX,word()),uncertain)).reason,
  'unresolved');
});
