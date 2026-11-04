import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {extractLiteralFactsMvp163} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-source-facts-mvp163.ts';
import {auditStoredSourceFactsMvp163} from
 '../../supabase/functions/cotironda-piloto-document-recovery/source-facts.ts';

const make=(description='BIG BAG de Arena',unit=null,qty='1,00')=>({
 status:'review_required',kind:'supplier_quote',delivery_city:null,
 requested_delivery_note:null,unanswered:[],total_declared:'$ 300,00',
 lines:[{original_description:description,quantity:qty,unit,
  unit_price:'$ 100,00',line_total:'$ 300,00',
  evidence_location:'pagina 1',ambiguity:null}]
});
const rows=(...texts)=>texts.map((text,i)=>({page:1,row:i+1,text}));
test('MVP163: PDF tipo Ailín/Nahuel: BIG BAG visible pero volumen NO inventado',()=>{
 const p=make('BIG BAG de Arena; Dscto. 22,4%');
 const facts=extractLiteralFactsMvp163(p,rows(
  '1,00 BIG BAG de Arena $ 100,00 22,4% $ 300,00',
  'TOTAL $ 300,00','Dscto. 22,4%'));
 assert.equal(facts.state,'source_checked');
 assert.deepEqual(facts.lines[0],{lineNo:1,unitStatus:'not_explicit',
  unit:null,presentation:'big_bag',page:1,row:1});
 assert.equal(facts.rankingAllowed,false);
 assert.equal(facts.terms.stock,'not_proven');
 assert.ok(!JSON.stringify(facts).includes('Arena'));
 assert.ok(!JSON.stringify(facts).includes('$ 300'));
});
test('MVP163: unidad explícita de cantidad en PDF se atesta con página/renglón',()=>{
 const p=make('Arena fina',null,'2,00');
 const facts=extractLiteralFactsMvp163(p,rows(
  '2,00 m³ Arena fina $ 100,00 $ 300,00',
  'TOTAL $ 300,00'));
 assert.deepEqual(facts.lines[0],{
  lineNo:1,unitStatus:'explicit',unit:'m3',presentation:'none',page:1,row:1
 });
});
test('MVP163: producto 25kg NO equivale a cantidad 25 kg',()=>{
 const p=make('Cemento Avellaneda de 25kg',null,'25,00');
 const facts=extractLiteralFactsMvp163(p,rows(
  '25,00 Cemento Avellaneda de 25kg $ 100,00 $ 300,00',
  'TOTAL $ 300,00'));
 assert.equal(facts.lines[0].unit,null);
 assert.equal(facts.lines[0].unitStatus,'not_explicit');
});
test('MVP163: unidad fuera de descripcion / Excel visual rows con separadores',()=>{
 const p=make('Cemento gris 25 kg',null,'25,00');
 const f=extractLiteralFactsMvp163(p,rows(
  '25,00 · bolsas · Cemento gris 25 kg · $ 100,00 · $ 300,00',
  'Total · $ 300,00'
 ));
 assert.equal(f.lines[0].unit,'bag');
 assert.equal(f.lines[0].unitStatus,'explicit');
});
test('MVP163: unidad contradice al borrador IA, no se impone por confianza',()=>{
 const p=make('Arena fina','kg','2,00');
 const f=extractLiteralFactsMvp163(p,rows(
  '2,00 m3 Arena fina $ 100,00 $ 300,00','TOTAL $ 300,00'
 ));
 assert.equal(f.lines[0].unitStatus,'ambiguous');
 assert.equal(f.lines[0].unit,null);
});
test('MVP163: dos coincidencias indistinguibles no autorizan unidad',()=>{
 const p=make('Arena fina',null,'2,00');
 const f=extractLiteralFactsMvp163(p,rows(
  '2,00 m³ Arena fina $ 100,00 $ 300,00',
  '2,00 m³ Arena fina $ 100,00 $ 300,00',
  'TOTAL $ 300,00'
 ));
 assert.equal(f.lines[0].unitStatus,'ambiguous');
 assert.equal(f.lines[0].unit,null);
});
test('MVP163: IVA, flete y pago constan solo como HINTS, no montos',()=>{
 const p=make('Arena fina',null,'2,00');
 const f=extractLiteralFactsMvp163(p,rows(
  '2 m3 Arena fina $ 100,00 $ 300,00',
  'Pago contado. Flete a convenir. IVA no incluido.',
  'TOTAL $ 300,00'
 ));
 assert.equal(f.terms.iva,'excluded_rate_unknown');
 assert.equal(f.terms.freight,'to_agree');
 assert.equal(f.terms.payment,'cash');
 assert.equal(f.terms.stock,'not_proven');
 assert.equal(f.rankingAllowed,false);
 assert.ok(!JSON.stringify(f).includes('contado'));
});
test('MVP163: ausencia no equivale a IVA 0 ni flete gratis',()=>{
 const f=extractLiteralFactsMvp163(make(),rows(
  '1 BIG BAG de Arena $ 100,00 $ 300,00','TOTAL $ 300,00'
 ));
 assert.equal(f.terms.iva,'not_stated');
 assert.equal(f.terms.freight,'not_stated');
 assert.equal(f.terms.payment,'not_stated');
});
test('MVP163: PDF escaneado o ilegible no permite atestación',()=>{
 const f=extractLiteralFactsMvp163(make(),[]);
 assert.equal(f.state,'unreadable');
 assert.deepEqual(f.lines,[]);
 assert.equal(f.rankingAllowed,false);
});
test('MVP163: original TXT real simulado se verifica SHA y registra 1 vez sin IA',async()=>{
 const contents='2,00 m³ Arena fina $ 100,00 $ 300,00\nTOTAL $ 300,00\n'
  +'Condiciones comerciales no informadas.\n'+' '.repeat(150);
 const buf=new TextEncoder().encode(contents);
 const H=createHash('sha256').update(buf).digest('hex');
 const message='b'.repeat(64);
 const saved=[];
 const io={
  lookup:async()=>({data:{state:'candidate',message_hmac:message,
    source_sha256:H,mime:'text/plain',size_bytes:buf.length,
    line_count:1,proposal:make('Arena fina',null,'2,00')},error:null}),
  download:async path=>{
   assert.equal(path,'media/'+message);
   return {data:new Blob([buf]),error:null};
  },
  record:async p=>{saved.push(p);return {data:{state:'recorded'},error:null}}
 };
 const outcome=await auditStoredSourceFactsMvp163(io);
 assert.equal(outcome,'facts_recorded');
 assert.equal(saved.length,1);
 assert.equal(saved[0].p_source_sha256,H);
 assert.equal(saved[0].p_facts.lines[0].unit,'m3');
 assert.ok(!JSON.stringify(saved[0].p_facts).includes('Arena fina'));
 assert.equal(saved[0].p_facts.rankingAllowed,false);
});
test('MVP163: fuente alterada por 1 byte impide todo registro',async()=>{
 const buf=new Uint8Array(200).fill(11);
 let recorded=false;
 const state=await auditStoredSourceFactsMvp163({
  lookup:async()=>({data:{state:'candidate',message_hmac:'a'.repeat(64),
   source_sha256:'c'.repeat(64),mime:'text/plain',
   line_count:1,size_bytes:200,proposal:make()},error:null}),
  download:async()=>({data:new Blob([buf]),error:null}),
  record:async()=>{recorded=true;return {data:{state:'recorded'},error:null}}
 });
 assert.equal(state,'failed');assert.equal(recorded,false);
});
