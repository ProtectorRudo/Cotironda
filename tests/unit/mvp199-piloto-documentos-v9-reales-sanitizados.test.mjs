import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnosticarRondaPrivadaMvp172} from
 '../../src/domain/diagnostico-ronda-mvp172.ts';
import {seleccionarComercialmenteMvp196 as select,
 resumirSeleccionComercialMvp196 as publicSummary} from
 '../../src/domain/seleccion-finalistas-v9-mvp196.ts';
import {cantidadFuenteMvp162,centavosFuenteMvp162} from
 '../../src/domain/adaptador-documental-mvp162.ts';

const sample=JSON.parse(readFileSync(new URL(
 '../fixtures/mvp199-pilot-shape-anonymized.json',
 import.meta.url),'utf8'));
const cases=sample.rounds;
const selected=x=>select({closureChecked:true,privateInputs:x});

test('MVP199: dos pedidos reales estructuralmente anonimizados, cuatro documentos y 10 lineas',()=>{
 assert.equal(sample.fixtureVersion,1);
 assert.deepEqual(cases.map(x=>x.caseLabel),['aridos-bolson-cemento','cemento-hidrofugo']);
 assert.equal(cases.length,2);
 assert.equal(cases.reduce((n,x)=>n+x.input.quotations.length,0),4);
 assert.equal(cases.reduce((n,x)=>n+x.input.quotations.reduce(
  (m,y)=>m+y.doc.lineas.length,0),0),10);
 assert.deepEqual(cases.map(x=>x.input.requestItems.length),[3,2]);
});

test('MVP199: los expedientes documentales reales cumplen el contrato privado MVP172',()=>{
 for(const entry of cases){
  const result=diagnosticarRondaPrivadaMvp172(entry.input);
  assert.equal(result.estado,'diagnostico_privado',entry.caseLabel);
  assert.equal(result.proveedoresAnonimos.length,2);
  assert.equal(result.rondaResumen.cotizacionesAuditadas,2);
  assert.equal(result.rankingHabilitado,false);
  assert.equal(result.contactosRevelados,false);
  assert.equal(result.originalesDescargables,false);
  assert.equal(result.whatsappEnviado,false);
 }
});
test('MVP199: selector v9 no rechaza los cuatro presupuestos vigentes del piloto',()=>{
 for(const entry of cases){
  const result=selected(entry.input);
  assert.notEqual(result.state,'insumos_invalidos',entry.caseLabel);
  assert.equal(result.requestId,entry.input.quotations[0].doc.requestId);
  assert.equal(result.allOffers.length,2);
  assert.equal(result.rankingAllowed,false);
  assert.equal(result.priceRanked,false);
  assert.equal(result.contactsRevealed,false);
  assert.equal(result.messagesSent,false);
  assert.equal(result.originalsDownloadable,false);
  const safe=publicSummary(result);
  assert.equal(safe.ofertas.length,2);
  assert.equal(safe.rankingAllowed,false);
  assert.equal(safe.contactsRevealed,false);
  assert.equal(safe.messagesSent,false);
  const raw=JSON.stringify(safe);
  for(const q of entry.input.quotations){
   assert.ok(!raw.includes(q.doc.messageHmac),entry.caseLabel);
   assert.ok(!raw.includes(q.doc.sourceSha256),entry.caseLabel);
  }
 }
});
test('MVP199: 10 montos del libro económico real conciliados por página/fila sin redondeos inventados',()=>{
 let lines=0;
 for(const r of cases)for(const q of r.input.quotations){
  assert.equal(q.doc.prueba.version,9);
  assert.equal(q.doc.prueba.revisionVigente,true);
  assert.equal(q.economia.descuentos.estado,'descuentos_conciliados_sin_iva');
  for(const l of q.doc.lineas){
   const p=q.economia.descuentos.precios.find(p=>p.linea===l.lineNo);
   const fact=q.fuente.lines.find(f=>f.lineNo===l.lineNo);
   assert.ok(p&&fact);
   assert.equal(p.pagina,fact.page);
   assert.equal(p.fila,fact.row);
   const qty=cantidadFuenteMvp162(l.quantityLiteral);
   const cents=centavosFuenteMvp162(l.lineTotalLiteral);
   const unit=centavosFuenteMvp162(p.unitarioComercialTrasDescuento);
   assert.ok(qty!==null&&cents!==null&&unit!==null);
   const [whole,frac='']=qty.split('.');
   const milli=BigInt(whole)*1000n+BigInt(frac.padEnd(3,'0')||'0');
   assert.equal((unit*milli+500n)/1000n,cents);
   lines++;
  }
 }
 assert.equal(lines,10);
});
test('MVP199: las dos rondas del piloto generan alternativas comerciales respaldadas, no ganador por total',()=>{
 const [aridos,cemento]=cases.map(e=>selected(e.input));
 assert.equal(aridos.state,'plan_ready','3 materiales en bolson/cemento');
 assert.equal(aridos.mode,'two_complete_alternatives');
 assert.equal(aridos.selected.length,2);
 assert.deepEqual(aridos.allOffers.map(x=>x.articulosCubiertos),[3,3]);

 assert.equal(cemento.state,'plan_ready','cemento y producto hidrofugo');
 assert.equal(cemento.mode,'one_complete_alternative');
 assert.equal(cemento.selected.length,1);
 assert.deepEqual(cemento.allOffers.map(x=>x.articulosCubiertos).sort(),[1,2]);
 for(const output of [aridos,cemento]){
  assert.equal(output.priceRanked,false);
  assert.equal(output.automaticAward,false);
  assert.equal(output.contactsRevealed,false);
 }
});

test('MVP199: edición documental, origen de la línea o descuentos falsos nunca habilitan finales',()=>{
 for(const r of cases){
  for(const mutation of [
   c=>{c.quotations[0].doc.prueba.revisionVigente=false},
   c=>{c.quotations[0].economia.descuentos.precios[0].fila=999},
   c=>{c.quotations[0].fuente.lines[0].page=null},
   c=>{c.quotations[0].doc.prueba.version=8}
  ]){
   const cloned=JSON.parse(JSON.stringify(r.input));
   mutation(cloned);
   const result=selected(cloned);
   assert.equal(result.state,'insumos_invalidos',r.caseLabel);
   assert.equal(result.selected.length,0);
  }
 }
});
test('MVP199: fixture sin PII ni hashes originales; unidades NULL permanecen NULL',()=>{
 const text=JSON.stringify(sample);
 for(const forbidden of ['recipient_key','supplier_key','chat_hmac',
  'token_hash','original_request','publicText','whatsapp',
  'ailin','ailín','nahuel','arquitecto','https://','@']){
  assert.equal(text.toLowerCase().includes(forbidden.toLowerCase()),false,forbidden);
 }
 for(const r of cases)for(const q of r.input.quotations){
  assert.equal(q.doc.anonId,'anon_private');
  assert.equal(q.doc.messageHmac.length,64);
  assert.equal(q.doc.sourceSha256.length,64);
  assert.ok(q.doc.lineas.every(l=>l.unitLiteral===null));
  assert.equal(q.doc.prueba.requestId,q.doc.requestId);
  assert.equal(q.doc.prueba.messageHmac,q.doc.messageHmac);
  assert.equal(q.fuente.sourceSha256,q.doc.sourceSha256);
 }
});
