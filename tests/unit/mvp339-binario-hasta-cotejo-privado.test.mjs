import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {armarZip} from '../helpers/xlsx-fixture.mjs';
import {extraerEvidenciaPrivadaMvp338} from
 '../../src/domain/ia-central/fuente-binaria-privada-mvp338.ts';
import {procesarLotesIAInternosMvp339} from
 '../../src/domain/ia-central/procesador-ia-lotes-mvp339.ts';
import {readOfficeVisibleRows} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-source-office.ts';

const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
function xlsx(){
 const rows=['LISTA MAYORISTA',...Array.from({length:36},(_,i)=>
  'Articulo '+(i+1)+' - 2 u - $ 1200'),
  'Flete a convenir','IVA no incluido','TOTAL $ 43200'];
 const first=rows.slice(0,20),second=rows.slice(20);
 const sheet=lines=>'<worksheet><sheetData>'+lines.map((s,i)=>
  '<row r="'+(i+1)+'"><c t="inlineStr"><is><t>'+
   xml(s)+'</t></is></c></row>').join('')+'</sheetData></worksheet>';
 return armarZip({
  '[Content_Types].xml':'<Types/>',
  'xl/workbook.xml':'<workbook><sheets>'+
   '<sheet name="Comercial" sheetId="1" r:id="r1"/>'+
   '<sheet name="Condiciones" sheetId="2" r:id="r2"/>'+
   '</sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships>'+
   '<Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'+
   '<Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'+
   '</Relationships>',
  'xl/worksheets/sheet1.xml':sheet(first),
  'xl/worksheets/sheet2.xml':sheet(second)
 });
}
function docx(){
 const values=['PRESUPUESTO DE PRUEBA',
  '15 bolsas Cemento CPC 50 kg $ 8500 $ 127500',
  '2 bolsones arena $ 36500 $ 73000',
  'Descuento especial -$ 3500','Flete a convenir',
  'TOTAL $ 197000'];
 return armarZip({
  '[Content_Types].xml':'<Types/>',
  'word/document.xml':'<w:document><w:body>'+
   values.map(s=>'<w:p><w:r><w:t>'+xml(s)+
    '</w:t></w:r></w:p>').join('')+'</w:body></w:document>'
 });
}
const original=(mime,bytes)=>({
 mime,bytes:new Uint8Array(bytes),
 sha256:createHash('sha256').update(bytes).digest('hex')
});
const scope={roundId:'aefe169e-7801-4efc-aabf-25cd134744eb',
 supplierKey:'corralon_ailin',
 messageHmac:'b'.repeat(64),chatHmac:'c'.repeat(64)};
const infer=row=>{
 let kind='material';
 if(/^TOTAL /u.test(row.literal))kind='total';
 else if(/flete|iva no incluido/iu.test(row.literal))kind='condition';
 else if(/descuento/iu.test(row.literal))kind='extra';
 else if(/^PRESUPUESTO|^LISTA MAYORISTA/iu.test(row.literal))kind='header';
 return {
  position:row.position,kind,evidence:row.literal,
  description:null,quantity:null,unit:null,unitPrice:null,
  lineTotal:kind==='total'?
   row.literal.match(/\$ \d+/u)?.[0]??null:
   kind==='extra'?row.literal.match(/-\$ \d+/u)?.[0]??null:
   kind==='material'?row.literal.match(/\$ \d+(?!.*\$)/u)?.[0]??null:null
 };
};
for(const [mime,data] of [[DOCX,docx()],[XLSX,xlsx()]]){
 test('MVP339 integración binaria privada '+(mime===DOCX?'DOCX':'XLSX'),async()=>{
  const bin=await extraerEvidenciaPrivadaMvp338(original(mime,data),{
   readOfficeVisibleRows
  });
  assert.equal(bin.state,'evidence_planned_private',bin.reason);
  assert.ok(bin.plan);
  const calls=[],finishes=[];
  const result=await procesarLotesIAInternosMvp339({
   scope,plan:bin.plan,
   budget:{
    maxModelCalls:bin.plan.lots.length*2,
    maxInputChars:bin.plan.lots.flatMap(l=>l.rows).reduce(
     (n,r)=>n+r.literal.length,0)*2
   },
   reserve:async({scope:ctx,sourceSha256})=>({
    state:'reserved',...ctx,sourceSha256,
    receipt:'q'.repeat(32)
   }),
   finish:async f=>{finishes.push(f);return 'recorded'},
   interpret:async req=>{
    calls.push({lot:req.lotNumber,perspective:req.perspective});
    return {sourceSha256:req.sourceSha256,lotNumber:req.lotNumber,
     lotDigest:req.lotDigest,readings:req.rows.map(infer)};
   }
  });
  assert.equal(result.state,'ready_for_independent_source_audit',result.reason);
  assert.equal(result.readings.length,bin.rows);
  assert.equal(result.modelCalls,bin.lots*2);
  assert.equal(calls.length,bin.lots*2);
  assert.equal(finishes.length,1);
  assert.equal(finishes[0].state,'analysis_ready_private');
  assert.equal(result.economicPublicationAllowed,false);
  assert.equal(result.whatsappMessages,0);
  if(mime===XLSX){
   assert.equal(bin.rows,40);
   assert.ok(bin.lots>=2);
  }
  if(mime===DOCX){
   assert.equal(bin.rows,6);
   assert.ok(result.readings.some(x=>x.kind==='extra'));
  }
 });
}
