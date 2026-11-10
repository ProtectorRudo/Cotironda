import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {armarZip} from '../helpers/xlsx-fixture.mjs';
import {procesarOriginalPrivadoMvp341} from
 '../../src/domain/ia-central/worker-privado-lotes-mvp341.ts';
import {extraerEvidenciaPrivadaMvp338} from
 '../../src/domain/ia-central/fuente-binaria-privada-mvp338.ts';
import {readOfficeVisibleRows} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-source-office.ts';

const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const msg='a'.repeat(64),chat='b'.repeat(64),round=
 'aefe169e-7801-4efc-aabf-25cd134744eb',supplier='corralon_ailin';
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const SHA=b=>createHash('sha256').update(b).digest('hex');
function docx(lines){
 return armarZip({
  '[Content_Types].xml':'<Types/>',
  'word/document.xml':'<w:document><w:body>'+
   lines.map(x=>'<w:p><w:r><w:t>'+xml(x)+'</w:t></w:r></w:p>')
    .join('')+'</w:body></w:document>'
 });
}
function xlsx(lines){
 const sheet=rows=>'<worksheet><sheetData>'+rows.map((x,i)=>
  '<row r="'+(i+1)+'"><c r="A'+(i+1)+'" t="inlineStr"><is><t>'+
   xml(x)+'</t></is></c></row>').join('')+'</sheetData></worksheet>';
 const left=lines.slice(0,24),right=lines.slice(24);
 return armarZip({
  '[Content_Types].xml':'<Types/>',
  'xl/workbook.xml':'<workbook><sheets>'+
   '<sheet name="Materiales" sheetId="1" r:id="r1"/>'+
   '<sheet name="Condiciones" sheetId="2" r:id="r2"/>'+
   '</sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships>'+
   '<Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'+
   '<Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'+
   '</Relationships>',
  'xl/worksheets/sheet1.xml':sheet(left),
  'xl/worksheets/sheet2.xml':sheet(right)
 });
}
const long=['PRESUPUESTO',
 ...Array.from({length:38},(_,i)=>'Item '+(i+1)+' cemento 2 bolsas $ 100'),
 'Descuento -$ 500','Flete a convenir','IVA no incluido','TOTAL $ 3800'];
const short=['PRESUPUESTO','Cemento CPC 15 bolsas $ 8500',
 'Arena 2 bolsones $ 73000','Pallet adicional $ 15000',
 'IVA no incluido','TOTAL $ 96500'];
const make=(mime,lines)=>{
 const bytes=mime===DOCX?docx(lines):xlsx(lines);
 return {mime,bytes:new Uint8Array(bytes),sha:SHA(bytes)};
};
const realReader=async file=>extraerEvidenciaPrivadaMvp338(file,{
 readOfficeVisibleRows
});
const reading=row=>{
 const text=row.literal;
 const kind=/^TOTAL /u.test(text)?'total':
  /^PRESUPUESTO/u.test(text)?'header':
  /IVA|Flete/u.test(text)?'condition':
  /Pallet|Descuento/u.test(text)?'extra':'material';
 const price=text.match(/-?\$ \d+/u)?.[0]??null;
 return {
  position:row.position,kind,evidence:text,
  description:null,quantity:null,unit:null,
  unitPrice:kind==='material'?price:null,
  lineTotal:['total','extra'].includes(kind)?price:null
 };
};
const response=data=>({data,error:null});
function setup(original=make(XLSX,long),alter={}){
 const events=[],leased=new Set();
 const metadata={
  state:'candidate',messageHmac:msg,chatHmac:chat,
  supplierKey:supplier,roundId:round,sourceSha256:original.sha,
  mime:original.mime,sizeBytes:original.bytes.length,storagePath:'media/'+msg,
  ...alter
 };
 const rpc=async(name,params)=>{
  events.push({event:'rpc',name,params});
  if(name==='cotironda_piloto_source_for_lots_mvp341')
   return response(leased.has(msg)?{state:'already_processed'}:metadata);
  if(name==='cotironda_piloto_reserve_supplier_lots_mvp340'){
   assert.equal(params.p_source_sha256,original.sha);
   assert.equal(params.p_message_hmac,msg);
   assert.equal(params.p_round_id,round);
   if(leased.has(msg))return response({state:'already_processed'});
   leased.add(msg);
   return response({state:'reserved',receipt:'d'.repeat(32),
    sourceSha256:original.sha,roundId:round,supplierKey:supplier,
    messageHmac:msg,chatHmac:chat});
  }
  if(name==='cotironda_piloto_finish_supplier_lots_mvp340'){
   assert.equal(params.p_receipt,'d'.repeat(32));
   assert.equal(params.p_source_sha256,original.sha);
   return response({state:'recorded'});
  }
  throw Error('unexpected_rpc');
 };
 const download=async path=>{
  events.push({event:'download',path});
  return {data:new Blob([original.bytes]),error:null};
 };
 const readBinary=async src=>{
  events.push({event:'readBinary'});
  return realReader(src);
 };
 const interpret=async req=>{
  events.push({event:'model',perspective:req.perspective,lot:req.lotNumber});
  return {sourceSha256:req.sourceSha256,lotNumber:req.lotNumber,
   lotDigest:req.lotDigest,readings:req.rows.map(reading)};
 };
 return {events,original,
  args:{enabled:true,trustedInternal:true,sourceHmac:msg,
   maxModelCalls:12,rpc,download,readBinary,interpret}};
}
test('MVP341 XLSX 2 hojas y 43 filas: SHA real->reserva->doble lectura->fin sin publicar',async()=>{
 const {args,events}=setup();
 const result=await procesarOriginalPrivadoMvp341(args);
 assert.equal(result.state,'analysis_ready_private',result.reason);
 assert.equal(result.rows,long.length);
 assert.equal(result.economicPublicationAllowed,false);
 assert.equal(result.whatsappMessages,0);
 assert.equal(result.quotesPublished,0);
 const models=events.filter(x=>x.event==='model');
 assert.equal(result.modelCalls,models.length);
 assert.ok(models.length>=4);
 assert.equal(events[0].name,'cotironda_piloto_source_for_lots_mvp341');
 assert.equal(events[1].event,'download');
 assert.equal(events[1].path,'media/'+msg);
 assert.equal(events[2].event,'readBinary');
 const reserveIndex=events.findIndex(x=>x.name==='cotironda_piloto_reserve_supplier_lots_mvp340');
 assert.ok(reserveIndex>2);
 assert.equal(events.at(-1).name,'cotironda_piloto_finish_supplier_lots_mvp340');
 const second=await procesarOriginalPrivadoMvp341(args);
 assert.equal(second.state,'already_processed');
 assert.equal(events.filter(x=>x.event==='download').length,1);
 assert.equal(events.filter(x=>x.event==='model').length,models.length);
});
test('MVP341 DOCX real: conserva extras, flete y total solo como lectura privada',async()=>{
 const {args,events}=setup(make(DOCX,short));
 const result=await procesarOriginalPrivadoMvp341(args);
 assert.equal(result.state,'analysis_ready_private',result.reason);
 assert.equal(result.rows,short.length);
 assert.equal(result.modelCalls,2);
 assert.equal(events.filter(x=>x.event==='model').length,2);
});
test('MVP341 desactivado, no confiable o sin límite de costo: no toca SQL ni Storage',async()=>{
 for(const updates of [
  {enabled:false},{trustedInternal:false},{maxModelCalls:0},
  {maxModelCalls:121},{sourceHmac:'bad'}
 ]){
  const {args,events}=setup();
  const result=await procesarOriginalPrivadoMvp341({...args,...updates});
  assert.equal(result.state,'disabled');
  assert.equal(events.length,0);
 }
});
test('MVP341 metadata adulterada no descarga fuente ni llama a IA',async()=>{
 for(const alter of [
  {storagePath:'public/cotizacion.pdf'},{sourceSha256:'bad'},
  {supplierKey:'INVALID!'},{chatHmac:'f'.repeat(2)},
  {roundId:'not-a-uuid'}, {mime:'image/png'},
  {sizeBytes:10000000},{messageHmac:'f'.repeat(64)}
 ]){
  const {args,events}=setup(make(DOCX,short),alter);
  const res=await procesarOriginalPrivadoMvp341(args);
  assert.equal(res.state,'reconciliation_required');
  assert.equal(events.filter(x=>x.event==='download').length,0);
  assert.equal(events.filter(x=>x.event==='model').length,0);
 }
});
test('MVP341 bytes alterados o tamaño incorrecto: no reserva IA aunque lector diga sí',async()=>{
 for(const fake of ['wrong_size','wrong_bytes']){
  const {args,events,original}=setup(make(DOCX,short));
  const altered={...args,download:async()=>{
   events.push({event:'download'});
   return {data:new Blob([fake==='wrong_size'?
    original.bytes.slice(0,-1):Uint8Array.from(original.bytes,
     (x,i)=>i===15?x^255:x)]),error:null};
  },readBinary:async()=>{throw Error('should never read')}};
  const r=await procesarOriginalPrivadoMvp341(altered);
  assert.equal(r.state,'review_required');
  assert.equal(events.filter(x=>x.event==='model').length,0);
  assert.equal(events.filter(x=>x.name==='cotironda_piloto_reserve_supplier_lots_mvp340').length,0);
 }
});
test('MVP341 imagen sin lectura segura y archivo no corroborable: sin reservas ni mensajes',async()=>{
 const {args,events}=setup(make(DOCX,short));
 const r=await procesarOriginalPrivadoMvp341({...args,
  readBinary:async()=>{
   events.push({event:'readBinary'});
   return {state:'review_required',plan:null,reason:'ocr_independent_required',
    format:'docx',sourceSha256:null,rows:0,lots:0,
    economicPublicationAllowed:false,whatsappMessages:0};
  }});
 assert.equal(r.state,'review_required');
 assert.equal(events.some(x=>x.name==='cotironda_piloto_reserve_supplier_lots_mvp340'),false);
});
test('MVP341 40+ filas pero límite de 2 llamadas: no reserva ni cobra',async()=>{
 const {args,events}=setup();
 const r=await procesarOriginalPrivadoMvp341({...args,maxModelCalls:2});
 assert.equal(r.state,'budget_limited');
 assert.equal(r.modelCalls,0);
 assert.equal(events.filter(x=>x.event==='model').length,0);
 assert.equal(events.some(x=>x.name==='cotironda_piloto_reserve_supplier_lots_mvp340'),false);
});
test('MVP341 sin confirmación SQL final deja el resultado en conciliación',async()=>{
 const {args,events}=setup(make(DOCX,short));
 const rpc=async(name,params)=>{
  if(name==='cotironda_piloto_finish_supplier_lots_mvp340')
   return response({state:'not_leased'});
  return args.rpc(name,params);
 };
 const r=await procesarOriginalPrivadoMvp341({...args,rpc});
 assert.equal(r.state,'reconciliation_required');
 assert.equal(r.quotesPublished,0);
 assert.equal(r.economicPublicationAllowed,false);
 assert.ok(events.some(x=>x.event==='model'));
});
test('MVP341 respuesta inválida del modelo: revisión privada, sin reintentos',async()=>{
 const {args,events}=setup(make(DOCX,short));
 const r=await procesarOriginalPrivadoMvp341({...args,
  interpret:async req=>{
   events.push({event:'model'});
   throw Error('Presupuesto privado: proveedor y monto secreto');
  }
 });
 assert.equal(r.state,'review_required');
 assert.equal(r.modelCalls,1);
 assert.equal(JSON.stringify(r).includes('secreto'),false);
 assert.equal(r.quotesPublished,0);
 assert.equal(events.at(-1).name,'cotironda_piloto_finish_supplier_lots_mvp340');
});
test('MVP341 fallo de preflight SQL: no consulta Storage',async()=>{
 const {args,events}=setup();
 const r=await procesarOriginalPrivadoMvp341({...args,
  rpc:async()=>{throw Error('secret DB error')}
 });
 assert.equal(r.state,'reconciliation_required');
 assert.equal(events.length,0);
});
