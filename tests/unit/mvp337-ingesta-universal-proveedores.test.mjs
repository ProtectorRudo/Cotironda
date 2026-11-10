import test from 'node:test';
import assert from 'node:assert/strict';
import {presupuestosMvp337} from '../fixtures/mvp337-presupuestos-heterogeneos.mjs';
import {
 planificarEvidenciaMvp337,corroborarLecturasMvp337
} from '../../src/domain/ia-central/ingesta-evidencia-flexible-mvp337.ts';
import {
 filasTextoMvp337,filasMensajesMvp337
} from '../../src/domain/ia-central/adaptador-texto-flexible-mvp337.ts';

assert.equal(presupuestosMvp337.length,192);
const SHA='a'.repeat(64);
const r=(text,position)=>({position,section:'mensaje:1',literal:text});
const item=(position,evidence,kind='material',others={})=>({
 position,kind,evidence,description:null,quantity:null,unit:null,
 unitPrice:null,lineTotal:null,...others
});
const plan=rows=>planificarEvidenciaMvp337({
 format:'whatsapp_text',sourceSha256:SHA,rows
});
for(const fixture of presupuestosMvp337){
 test('MVP337 corpus offline '+fixture.id+' conserva '+fixture.expectedRows+' filas',()=>{
  const p=planificarEvidenciaMvp337({
   format:fixture.format,sourceSha256:fixture.sha256,rows:fixture.rows
  });
  assert.equal(p.state,'planned');
  assert.equal(p.totalRows,fixture.expectedRows);
  assert.equal(p.sourceSha256,fixture.sha256);
  const flatten=p.lots.flatMap(l=>l.rows);
  assert.deepEqual(flatten,fixture.rows);
  assert.ok(p.lots.every(l=>l.rows.length<=20&&
   l.rows.reduce((n,r)=>n+r.literal.length,0)<=4500));
  assert.deepEqual(p.lots.map(x=>x.number),
   Array.from({length:p.lots.length},(_,i)=>i+1));
  assert.equal(p.whatsappMessages,0);
  assert.equal(p.economicPublicationAllowed,false);
  const audit=corroborarLecturasMvp337(p,fixture.reading,
   fixture.reading.map(x=>({...x})));
  assert.equal(audit.state,'ready_for_independent_source_audit',
   JSON.stringify(audit));
  assert.equal(audit.agreed,fixture.expectedRows);
  assert.deepEqual(audit.missing,[]);
  assert.deepEqual(audit.invalid,[]);
  assert.equal(audit.economicPublicationAllowed,false);
  if(!fixture.hasDeclaredTotal)
   assert.equal(fixture.reading.some(x=>x.kind==='total'),false);
 });
}
test('MVP337: 25+ y 80+ renglones atraviesan todos los lotes sin perder gastos',()=>{
 for(const n of [26,42,90,170]){
  const rows=Array.from({length:n},(_,i)=>r('item '+(i+1)+' / $ 1.000',i+1));
  const p=plan(rows);
  assert.equal(p.state,'planned');assert.ok(p.lots.length>=Math.ceil(n/20));
  assert.deepEqual(p.lots.flatMap(x=>x.rows),rows);
 }
});
test('MVP337: soporta mensajes libres, saltos de línea, CSV sin transformar números',()=>{
 const text='Buen día\n15,00;Cemento Avellaneda;$ 8.500;$ 127.500\r\n\nIVA no incluido\nFlete a convenir';
 const rows=filasTextoMvp337(text);
 assert.equal(rows.length,4);
 assert.equal(rows[1].literal,'15,00;Cemento Avellaneda;$ 8.500;$ 127.500');
 assert.equal(rows[2].literal,'IVA no incluido');
 assert.equal(rows[3].literal,'Flete a convenir');
 const multiple=filasMensajesMvp337([
  {text:'15 bolsas cemento CPC'},
  {text:'2 bolsones arena\nDescuento 22.4%'},
  {text:'Más IVA. Flete aparte.'}
 ]);
 assert.equal(multiple.length,4);
 assert.deepEqual(multiple.map(x=>x.section),
  ['mensaje:1','mensaje:2','mensaje:2','mensaje:3']);
 assert.deepEqual(multiple.map(x=>x.position),[1,2,3,4]);
});
test('MVP337: lecturas parciales o discordantes nunca entran a auditoría final',()=>{
 const rows=[r('15 bolsas Cemento CPC $ 8.500',1),
  r('2 bolsones Arena $ 30.000',2),r('Flete a convenir',3)];
 const base=plan(rows);
 const full=[
  item(1,rows[0].literal,'material',{description:'Cemento CPC',
    quantity:'15',unit:'bolsas',unitPrice:'$ 8.500'}),
  item(2,rows[1].literal,'material',{description:'Arena',
    quantity:'2',unit:'bolsones',unitPrice:'$ 30.000'}),
  item(3,rows[2].literal,'condition')
 ];
 const missing=corroborarLecturasMvp337(base,full,full.slice(0,2));
 assert.equal(missing.state,'review_required');assert.deepEqual(missing.missing,[3]);
 const altered=full.map((x,i)=>i===0?{...x,quantity:'25'}:x);
 const invalid=corroborarLecturasMvp337(base,full,altered);
 assert.equal(invalid.state,'review_required');assert.deepEqual(invalid.invalid,[1]);
 const changed=full.map((x,i)=>i===0?{...x,quantity:null}:x);
 const disagree=corroborarLecturasMvp337(base,full,changed);
 assert.equal(disagree.state,'review_required');assert.deepEqual(disagree.disagree,[1]);
 const duplicate=corroborarLecturasMvp337(base,[...full,full[0]],full);
 assert.equal(duplicate.state,'review_required');
 assert.equal(duplicate.reason,'duplicate_or_extra_source_row');
 const unknown=corroborarLecturasMvp337(base,
  [...full.slice(0,2),{...full[2],kind:'unknown'}],
  [...full.slice(0,2),{...full[2],kind:'unknown'}]);
 assert.equal(unknown.state,'review_required');assert.deepEqual(unknown.unknown,[3]);
});
test('MVP337: una cantidad no puede extraerse de un precio mayor',()=>{
 const src=[r('Cemento 15000 pesos x 3 bolsas',1)];
 const p=plan(src);
 const fake=[item(1,src[0].literal,'material',{description:'Cemento',quantity:'15'})];
 assert.deepEqual(corroborarLecturasMvp337(p,fake,fake).invalid,[1]);
 const real=[item(1,src[0].literal,'material',{description:'Cemento',quantity:'3',unit:'bolsas'})];
 assert.equal(corroborarLecturasMvp337(p,real,real).state,
  'ready_for_independent_source_audit');
});
test('MVP337: precio presente sin evidencia económica se retiene; total inventado se retiene',()=>{
 const src=[r('Cemento CPC $ 120.000',1),r('TOTAL: $ 120.000',2)];
 const p=plan(src);
 const fake=[item(1,src[0].literal,'material',{description:'Cemento CPC'}),
  item(2,src[1].literal,'total',{lineTotal:'$ 120.000'})];
 assert.deepEqual(corroborarLecturasMvp337(p,fake,fake).invalid,[1]);
 const invented=[{...fake[0],lineTotal:'$ 120.000'},
  {...fake[1],lineTotal:'$ 130.000'}];
 assert.deepEqual(corroborarLecturasMvp337(p,invented,invented).invalid,[2]);
 const header=[{...fake[0],kind:'header'},fake[1]];
 assert.deepEqual(corroborarLecturasMvp337(p,header,header).invalid,[1]);
});
test('MVP337: sin interpretación no afirma exactitud ni convierte documentos en ofertas',()=>{
 const row=[r('Imagen borrosa: $ 2?0.000',1)];
 const p=planificarEvidenciaMvp337({
  format:'image_ocr',sourceSha256:SHA,rows:row
 });
 assert.equal(p.state,'planned');
 assert.equal(corroborarLecturasMvp337(p,[],[]).state,'review_required');
 assert.equal(p.economicPublicationAllowed,false);
});
test('MVP337: invalidez de hash, control, saltos de posición, filas gigantes y overflow',()=>{
 assert.equal(planificarEvidenciaMvp337({
  format:'pdf_text',sourceSha256:'bad',rows:[r('Cemento',1)]
 }).state,'review_required');
 assert.equal(plan([r('Cemento',2)]).state,'review_required');
 assert.equal(plan([r('Cemento\u0000',1)]).state,'review_required');
 assert.equal(plan([r('x'.repeat(4501),1)]).state,'review_required');
 assert.equal(plan(Array.from({length:1201},(_,i)=>r('Cemento',i+1)))
  .state,'review_required');
 assert.equal(planificarEvidenciaMvp337({
  format:'pdf_text',sourceSha256:SHA,rows:[r('Cemento',1)],
  maxRowsPerLot:1000
 }).state,'review_required');
 assert.equal(filasTextoMvp337('a'.repeat(8193)),null);
 assert.equal(filasTextoMvp337('hola\u0000'),null);
 assert.equal(filasMensajesMvp337([{text:'hola'},{text:'\u0000'}]),null);
});
test('MVP337: lote manipulado rompe integridad y nunca se publica',()=>{
 const rows=[r('Cemento',1)];
 const p=plan(rows);
 const changed={...p,lots:[{...p.lots[0],sourceSha256:'f'.repeat(64)}]};
 const obs=[item(1,'Cemento')];
 const result=corroborarLecturasMvp337(changed,obs,obs);
 assert.equal(result.state,'review_required');
 assert.equal(result.reason,'plan_integrity_failed');
 assert.equal(result.economicPublicationAllowed,false);
});
