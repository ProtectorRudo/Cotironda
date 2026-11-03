import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifySupplierEvidence} from '../../supabase/functions/cotironda-piloto-whapi/supplier-evidence-mvp138.ts';
import {auditStoredSupplierQuote} from '../../supabase/functions/cotironda-piloto-document-recovery/supplier-evidence.ts';
const H='a'.repeat(64);
const base={
 status:'review_required',kind:'supplier_quote',delivery_city:null,
 requested_delivery_note:'Condición de pago: 1. Contado Efectivo; plazo de entrega: 0 DIAS; FLETE A CONVENIR; PRECIOS LISTA 7; PRECIOS DE PAGO CONTADO EN EFECTIVO.',
 total_declared:'$310.359,22',
 unanswered:['No se especifica el tratamiento del IVA.','No se indica disponibilidad.',
  'La moneda no está identificada explícitamente; los precios llevan el símbolo “$”.'],
 lines:[
  {original_description:'cemento avellaneda x 25 kg',quantity:'40,00',unit:null,unit_price:'$9.798,58',line_total:'$304.148,00',
   ambiguity:'Unidad de cantidad no indicada. Descuento visible: 22,4%.',evidence_location:'Página 1'},
  {original_description:'Sinteplast Hidrofugo 5lts',quantity:'1,00',unit:null,unit_price:'$8.004,15',line_total:'$6.211,22',
   ambiguity:'Unidad de cantidad no indicada. Descuento visible: 22,4%.',evidence_location:'Página 1'}
 ]
};
const pdfRows=[
 '40,00 cemento avellaneda x 25 kg $9.798,58 22,4% $304.148,00',
 '1,00 Sinteplast Hidrofugo 5lts $8.004,15 22,4% $6.211,22',
 'TOTAL $310.359,22','Condición de pago: 1. Contado Efectivo',
 'plazo de entrega: 0 DIAS','FLETE A CONVENIR','PRECIOS LISTA 7',
 'PRECIOS DE PAGO CONTADO EN EFECTIVO.'
];
const xl={
 ...base,requested_delivery_note:null,total_declared:'220250',unanswered:[],
 lines:[
  {original_description:'CEMENTO CPC 50 KG',quantity:'20',unit:null,unit_price:'10250',line_total:'205000',ambiguity:null,evidence_location:'Hoja1 Fila2'},
  {original_description:'HIDROFUGO EN PASTA',quantity:'5',unit:null,unit_price:'3050',line_total:'15250',ambiguity:null,evidence_location:'Hoja1 Fila3'}
 ]
};
const excelRows=[
 'Producto · Cantidad · Precio unitario · Importe',
 'CEMENTO CPC 50 KG · 20 · 10250 · 205000',
 'HIDROFUGO EN PASTA · 5 · 3050 · 15250',
 'TOTAL · 220250'
];
const mockFile=mime=>({mime,bytes:new Uint8Array(128).fill(5),sha256:H});
test('MVP138: real Ailin-shaped discount 22,4% preserves source price and line totals',async()=>{
 const r=await verifySupplierEvidence(mockFile('application/pdf'),base,async()=>pdfRows);
 assert.deepEqual(r,{state:'verified',reason:'covered',lines:2});
});
test('MVP138: real Nahuel-shaped Excel without $ passes independent evidence',async()=>{
 const r=await verifySupplierEvidence(mockFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),xl,async()=>excelRows);
 assert.equal(r.state,'verified');
});
test('MVP138: extra pallet/freight price never silently omitted',async()=>{
 const rows=[...pdfRows,'Pallets vacíos $5000'];
 const r=await verifySupplierEvidence(mockFile('application/pdf'),base,async()=>rows);
 assert.equal(r.state,'needs_source_review');
});
test('MVP138: absent price, unproven discount, removed commercial condition cannot publish',async()=>{
 const checks=[
  [base,pdfRows.map(v=>v.replace('22,4%','99,9%'))],
  [base,pdfRows.filter(v=>!v.includes('FLETE A CONVENIR'))],
  [{...base,total_declared:'$310.359,23'},pdfRows],
  [{...base,lines:base.lines.map((x,i)=>i===0?{...x,unit_price:'$9.798,59'}:x)},pdfRows],
  [{...base,unanswered:['No se indica el precio final']},pdfRows]
 ];
 for(const [p,rows] of checks){
  const r=await verifySupplierEvidence(mockFile('application/pdf'),p,async()=>rows);
  assert.equal(r.state,'needs_source_review',JSON.stringify(r));
 }
});
test('MVP138: never publish source with concealed contact or unverified notes',async()=>{
 const p={...base,requested_delivery_note:base.requested_delivery_note+'; WhatsApp 2215550000'};
 const r=await verifySupplierEvidence(mockFile('application/pdf'),p,async()=>pdfRows);
 assert.equal(r.state,'needs_source_review');
});
test('MVP138: audit employee uses original SHA and returns anonymous-only state',async()=>{
 const bytes=new Uint8Array(128).fill(5);
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
  b=>b.toString(16).padStart(2,'0')).join('');
 let recorded=null;
 const io={
  lookup:async()=>({error:null,data:{state:'candidate',message_hmac:H,
   source_sha256:sha,mime:'application/pdf',size_bytes:128,line_count:2,proposal:base}}),
  download:async path=>{assert.equal(path,'media/'+H);return {error:null,data:new Blob([bytes])}},
  record:async x=>{recorded=x;return {error:null,data:{state:'verified'}}}
 };
 const validator=async()=>({state:'verified',reason:'covered',lines:2});
 assert.equal(await auditStoredSupplierQuote(io,validator),'verified_anonymous');
 assert.equal(recorded.p_source_sha256,sha);
 assert.equal(recorded.p_state,'verified');
});
test('MVP138: incorrect SHA never calls database publication',async()=>{
 let called=false;
 const r=await auditStoredSupplierQuote({
  lookup:async()=>({error:null,data:{state:'candidate',message_hmac:H,source_sha256:'f'.repeat(64),mime:'application/pdf',
   size_bytes:128,line_count:2,proposal:base}}),
  download:async()=>({error:null,data:new Blob([new Uint8Array(128)])}),
  record:async()=>{called=true;return {error:null,data:{state:'verified'}}}
 },async()=>({state:'verified',reason:'covered',lines:2}));
 assert.equal(r,'failed');assert.equal(called,false);
});
test('MVP138: SQL uses source hash, buyer privacy, idempotency and no ranking',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp138_verified_supplier_presentation.sql',import.meta.url),'utf8');
 const status=readFileSync(new URL('../../supabase/piloto/mvp138_tracking_verified_supplier_presentation.sql',import.meta.url),'utf8');
 for(const v of [
  'supplier_evidence_mvp138','enable row level security','supplier_evidence_immutable_mvp138',
  "p.participant_role='supplier'","p.opted_out_at is null",
  "r.closes_at>clock_timestamp()","m.content_sha256=q.source_sha256",
  "p_message_hmac=p_message_hmac","q.source_sha256=p_source_sha256",
  'public.cotironda_piloto_next_supplier_evidence_mvp138',
  'public.cotironda_piloto_record_supplier_evidence_mvp138',
  "'ranking_allowed',false","to service_role"
 ])assert.ok(sql.includes(v),v);
 assert.match(status,/supplier_evidence_mvp138/u);
 assert.match(status,/e.state='verified'/u);
 assert.match(status,/t.revoked_at is null/u);
 assert.match(status,/buyer_tracking_mvp091/u);
 assert.doesNotMatch(sql,/net\.http|whapi|send_whatsapp/iu);
});
