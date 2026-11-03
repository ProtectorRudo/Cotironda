import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {readOfficeVisibleRows} from '../../supabase/functions/cotironda-piloto-whapi/supplier-source-office.ts';
import {verifySupplierEvidence} from '../../supabase/functions/cotironda-piloto-whapi/supplier-evidence-mvp138.ts';

const H='a'.repeat(64);
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const xl={
 status:'review_required',kind:'supplier_quote',delivery_city:null,
 requested_delivery_note:null,total_declared:'220250',unanswered:[],
 lines:[
  {original_description:'CEMENTO CPC 50 KG',quantity:'20',unit:null,
   unit_price:'10250',line_total:'205000',evidence_location:'Hoja 1',ambiguity:null},
  {original_description:'HIDROFUGO EN PASTA',quantity:'5',unit:null,
   unit_price:'3050',line_total:'15250',evidence_location:'Hoja 2',ambiguity:null}
 ]
};
const c=(s)=>'<c t="inlineStr"><is><t>'+s+'</t></is></c>';
const v=(s)=>'<c><v>'+s+'</v></c>';
const row=(cells)=>'<row>'+cells.join('')+'</row>';
const sheet=(rows)=>'<worksheet><sheetData>'+rows.join('')+'</sheetData></worksheet>';
function entries(){
 return {
  '[Content_Types].xml':'<Types/>',
  'xl/workbook.xml':'<workbook><sheets><sheet name="Primera" sheetId="1" r:id="rId1"/><sheet name="Segunda" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':sheet([
   row([c('Producto'),c('Cantidad'),c('Unitario'),c('Importe')]),
   row([c('CEMENTO CPC 50 KG'),v('20'),v('10250'),v('205000')])
  ]),
  'xl/worksheets/sheet2.xml':sheet([
   row([c('HIDROFUGO EN PASTA'),v('5'),v('3050'),v('15250')]),
   row([c('TOTAL'),v('220250')])
  ])
 };
}
function crc32(buf){
 let n=0xffffffff;
 for(const b of buf){
  n^=b;
  for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);
 }
 return (n^0xffffffff)>>>0;
}
function zipped(objects){
 const locals=[],centrals=[];let offset=0;
 for(const [path,str] of Object.entries(objects)){
  const name=Buffer.from(path),plain=Buffer.from(str);
  const zipped=deflateRawSync(plain);
  const crc=crc32(plain);
  const loc=Buffer.alloc(30);
  loc.writeUInt32LE(0x04034b50,0);
  loc.writeUInt16LE(20,4);loc.writeUInt16LE(8,8);
  loc.writeUInt32LE(crc,14);loc.writeUInt32LE(zipped.length,18);
  loc.writeUInt32LE(plain.length,22);loc.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);
  central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);
  central.writeUInt32LE(zipped.length,20);central.writeUInt32LE(plain.length,24);
  central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  locals.push(loc,name,zipped);centrals.push(central,name);
  offset+=loc.length+name.length+zipped.length;
 }
 const directory=Buffer.concat(centrals);
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(Object.keys(objects).length,8);
 end.writeUInt16LE(Object.keys(objects).length,10);
 end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Uint8Array.from(Buffer.concat([...locals,directory,end]));
}
function file(objects=entries()){
 return {mime,bytes:zipped(objects),sha256:H};
}
test('MVP140: XLSX realista con ZIP deflate, 2 hojas y números sin $',async()=>{
 const input=file();
 const rows=await readOfficeVisibleRows(input);
 assert.equal(rows.length,4);
 assert.ok(rows.some(x=>x.includes('HIDROFUGO EN PASTA · 5 · 3050 · 15250')));
 assert.deepEqual(await verifySupplierEvidence(input,xl),{
  state:'verified',reason:'covered',lines:2
 });
});
test('MVP140: no oculta cobros adicionales en la segunda hoja',async()=>{
 const input=entries();
 input['xl/worksheets/sheet2.xml']=sheet([
  row([c('HIDROFUGO EN PASTA'),v('5'),v('3050'),v('15250')]),
  row([c('PALLET'),v('1'),v('2500'),v('2500')]),
  row([c('TOTAL'),v('220250')])
 ]);
 const r=await verifySupplierEvidence(file(input),xl);
 assert.equal(r.state,'needs_source_review',JSON.stringify(r));
 assert.equal(r.reason,'extra_charge');
});
test('MVP140: hojas ocultas se rechazan para evitar omisiones',async()=>{
 const input=entries();
 input['xl/workbook.xml']=input['xl/workbook.xml'].replace('sheetId="2"','state="hidden" sheetId="2"');
 const r=await verifySupplierEvidence(file(input),xl);
 assert.equal(r.state,'needs_source_review');
 assert.equal(r.reason,'unreadable');
});
const pdf={...xl,total_declared:'$220.250,00',
 lines:xl.lines.map((l,i)=>({
  ...l,unit_price:i===0?'$10.250,00':'$3.050,00',
  line_total:i===0?'$205.000,00':'$15.250,00'
 }))};
const rows=[
 'CEMENTO CPC 50 KG 20 $10.250,00 $205.000,00',
 'HIDROFUGO EN PASTA 5 $3.050,00 $15.250,00',
 'TOTAL GENERAL','$220.250,00'
];
test('MVP140: PDF con total separado por geometría conserva importe literal',async()=>{
 const r=await verifySupplierEvidence({mime:'application/pdf',bytes:new Uint8Array(128),sha256:H},
  pdf,async()=>rows);
 assert.deepEqual(r,{state:'verified',reason:'covered',lines:2});
});
test('MVP140: PDF con total sin acreditar o con cargo adicional jamás se publica',async()=>{
 const input={mime:'application/pdf',bytes:new Uint8Array(128),sha256:H};
 for(const variant of [
  rows.map(r=>r.replace('$220.250,00','$220.250,01')),
  [...rows,'Pallet $2.500,00'],
  ['CEMENTO CPC 50 KG 20 $10.250,00 $205.000,00',
   'HIDROFUGO EN PASTA 5 $3.050,00 $15.250,00',
   'TOTAL GENERAL','OTRA NOTA','$220.250,00']
 ]){
  const r=await verifySupplierEvidence(input,pdf,async()=>variant);
  assert.equal(r.state,'needs_source_review',JSON.stringify(r));
 }
});
test('MVP140: revisión 3 append-only y proyección selecciona una sola evidencia',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp140_source_verified_revision3.sql',import.meta.url),'utf8');
 assert.match(sql,/e\.verifier_version=3/u);
 assert.match(sql,/values\(p_message_hmac,3,/u);
 assert.match(sql,/order by e\.verifier_version desc limit 1/u);
 assert.match(sql,/e\.verifier_version between 2 and 3/u);
 assert.match(sql,/to service_role/u);
 assert.doesNotMatch(sql,/net\.http|send_whatsapp/iu);
});


test('MVP141: XML Excel con fila autoconclusiva vacía sí se puede verificar',async()=>{
 const doc=entries();
 doc['xl/worksheets/sheet1.xml']=doc['xl/worksheets/sheet1.xml']
  .replace('</sheetData>','<row r="27" /></sheetData>');
 const input=file(doc);
 const rows=await readOfficeVisibleRows(input);
 assert.equal(rows.length,4);
 assert.equal((await verifySupplierEvidence(input,xl)).state,'verified');
});
test('MVP141: fila vacía oculta se retiene por privacidad y cobertura',async()=>{
 const doc=entries();
 doc['xl/worksheets/sheet1.xml']=doc['xl/worksheets/sheet1.xml']
  .replace('</sheetData>','<row r="27" hidden="1"/></sheetData>');
 assert.equal((await verifySupplierEvidence(file(doc),xl)).reason,'unreadable');
});
test('MVP141: PDF con total en objeto distante pero exacto se verifica',async()=>{
 const original=[
  pdf.lines[0].original_description+' 20 $10.250,00 $205.000,00',
  pdf.lines[1].original_description+' 5 $3.050,00 $15.250,00',
  'TOTAL GENERAL','Presupuesto preparado','Observaciones',
  'Referencia','Cotización','Hoja','Número','Área','Versión',
  'Cliente','$220.250,00'
 ];
 const file={mime:'application/pdf',bytes:new Uint8Array(128),sha256:H};
 const result=await verifySupplierEvidence(file,pdf,async()=>original);
 assert.deepEqual(result,{state:'verified',reason:'covered',lines:2});
 const withExtra=[...original,'Pallet $2.500,00'];
 assert.equal((await verifySupplierEvidence(file,pdf,async()=>withExtra)).state,'needs_source_review');
 const withFalseTotal=[...original].map(x=>x==='$220.250,00'?'$220.250,01':x);
 assert.equal((await verifySupplierEvidence(file,pdf,async()=>withFalseTotal)).reason,'missing_total');
});
