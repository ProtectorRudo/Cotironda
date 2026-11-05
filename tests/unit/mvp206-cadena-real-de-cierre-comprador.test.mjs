import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resumirCoberturaCompradorMvp175 as coverageSource}
 from '../../src/domain/resumen-cobertura-comprador-mvp175.ts';
import {resumirEconomiaCompradorMvp180 as economySource}
 from '../../src/domain/resumen-economia-comprador-mvp180.ts';
import {resumirImportesCotizadosCompradorMvp186 as pricesSource}
 from '../../src/domain/resumen-importes-cotizados-mvp186.ts';
import {resumirAlternativasCoberturaMvp189 as optionsSource}
 from '../../src/domain/alternativas-cobertura-mvp189.ts';
import {resumirCoberturaImportesMvp194 as pricedCoverageSource}
 from '../../src/domain/cobertura-importes-cierre-mvp194.ts';
import {resumirCondicionesEconomicasPorOfertaMvp204 as termsSource}
 from '../../src/domain/condiciones-economicas-por-oferta-mvp204.ts';

const root=new URL('../../piloto/seguimiento-web/',import.meta.url);
const source=JSON.parse(readFileSync(new URL(
 '../fixtures/mvp199-pilot-shape-anonymized.json',import.meta.url),'utf8'));
const proxyCode=readFileSync(new URL('api/estado.js',root),'utf8');
const siteCode=readFileSync(new URL('site.js',root),'utf8');
const begin=proxyCode.indexOf('function buyerView(parsed){');
const end=proxyCode.indexOf('export default async function handler',begin);
assert.ok(begin>=0&&end>begin,'usar el proxy real, no una copia del filtrado');
const buyerView=vm.runInNewContext(
 proxyCode.slice(begin,end)+'\nbuyerView',{}, {timeout:1200});

class FakeNode{
 constructor(){
  this.children=[];this.hidden=false;this.textContent='';
  this.className='';this.dataset={};
 }
 append(...nodes){this.children.push(...nodes)}
 appendChild(node){this.children.push(node);return node}
 replaceChildren(){this.children=[]}
}
const page=async replies=>{
 const dom=new Map(),intervals=[];
 const node=id=>{
  if(!dom.has(id))dom.set(id,new FakeNode());
  return dom.get(id);
 };
 vm.runInNewContext(siteCode,{
  window:{location:{hash:'#'+'a'.repeat(64)}},
  document:{getElementById:node,createElement:()=>new FakeNode()},
  fetch:async()=>{
   const reply=await replies.shift();
   if(reply?.simulateNetworkError)throw Error('offline');
   return {ok:true,json:async()=>reply};
  },
  setInterval:fn=>intervals.push(fn)
 },{timeout:1200});
 await new Promise(resolve=>setTimeout(resolve,0));
 return {node,next:async()=>{
  intervals[0]();
  await new Promise(resolve=>setTimeout(resolve,0));
 }};
};

function fromVerifiedOriginals(caseNumber,{swapInputs=false,state='closed'}={}){
 const input=structuredClone(source.rounds[caseNumber].input);
 // Public texts are synthetic labels; no actual chat text, HMAC or URL leaks.
 input.quotations.forEach((q,i)=>q.publicText='COTIZACION_REVISADA_'+i);
 if(swapInputs)input.quotations.reverse();
 const offers=[
  {label:'Presupuesto 1',text:'COTIZACION_REVISADA_1'},
  {label:'Presupuesto 2',text:'COTIZACION_REVISADA_0'}
 ];
 const c=input.quotations.map(q=>q.economia.condiciones);
 const economicCounters={
  state:'economia_observada_sin_ranking',quotations:2,
  iva_not_informed:c.filter(q=>q.iva.estado==='no_informado').length,
  freight_not_informed:c.filter(q=>q.flete.estado==='no_informado').length,
  freight_to_agree:c.filter(q=>q.flete.estado==='a_convenir').length,
  payment_not_informed:c.filter(q=>q.pago.estado==='no_informado').length,
  stock_unverified:2,net_unverified:2,delivery_unverified:2,
  minimum_unverified:2,
  ranking_allowed:false,price_comparable:false,contacts_revealed:false
 };
 const status={
  state,can_open:true,offers,received_count:2,files_pending_review:0,
  deadline:'2026-11-08T21:00:00Z'
 };
 // The same functions imported by the Edge; not synthetic summaries.
 const coverage=coverageSource(status,input);
 const economy=economySource(status,economicCounters);
 const envelope={...status,coverage,economy};
 const item_prices=pricesSource(envelope,input);
 const priced_coverage=pricedCoverageSource(envelope,item_prices);
 const coverage_options=optionsSource(envelope,input);
 const economic_readiness=termsSource(envelope,input,item_prices);
 return {input,edge:{
  ...envelope,item_prices,priced_coverage,coverage_options,economic_readiness
 }};
}
const plain=x=>JSON.parse(JSON.stringify(x));

test('MVP206: 2 rondas/4 fuentes v9 atraviesan Edge → proxy → pantalla AL CIERRE',async()=>{
 for(let i=0;i<2;i++){
  const {input,edge}=fromVerifiedOriginals(i);
  for(const key of ['coverage','economy','item_prices','priced_coverage',
    'coverage_options','economic_readiness'])
   assert.ok(edge[key],source.rounds[i].caseLabel+': '+key);
  assert.equal(edge.received_count,2);
  const publicStatus=plain(buyerView(edge));
  for(const key of ['coverage','economy','item_prices','priced_coverage',
    'coverage_options','orientacion','economic_readiness'])
   assert.ok(publicStatus[key],source.rounds[i].caseLabel+': proxy '+key);
  assert.deepEqual(publicStatus.offers.map(x=>x.label),
   ['Presupuesto 1','Presupuesto 2']);
  assert.equal(publicStatus.orientacion.ranking_allowed,false);
  assert.equal(publicStatus.orientacion.automatic_award,false);
  assert.equal(publicStatus.economic_readiness.price_comparable,false);
  assert.equal(publicStatus.economic_readiness.originals_downloadable,false);
  assert.equal(publicStatus.economic_readiness.ofertas.length,2);
  const all=JSON.stringify(publicStatus);
  for(const q of input.quotations){
   assert.equal(all.includes(q.doc.messageHmac),false,'HMAC privado');
   assert.equal(all.includes(q.doc.sourceSha256),false,'hash de original');
   assert.equal(all.includes(q.doc.requestId),false,'request interno');
  }
  assert.equal(all.includes('supplier_key'),false);
  assert.equal(all.includes('chat_hmac'),false);
  const p=await page([publicStatus]);
  assert.equal(p.node('offers').children.length,2);
  assert.equal(p.node('coverageOptionsSection').hidden,false);
  assert.equal(p.node('orientacionSection').hidden,false);
  assert.equal(p.node('economicReadinessSection').hidden,false);
  assert.equal(p.node('economicReadinessGrid').children.length,2);
  assert.equal(p.node('itemPricesSection').hidden,false);
  assert.equal(p.node('pricedCoverageSection').hidden,false);
  assert.match(p.node('economicReadinessCaption').textContent,
   /No se comparan sus totales/);
 }
});

test('MVP206: el comprador conserva las dos ofertas con SQL HMAC en orden opuesto',()=>{
 for(let i=0;i<2;i++){
  const normal=plain(buyerView(fromVerifiedOriginals(i).edge));
  const inverted=plain(buyerView(fromVerifiedOriginals(i,{swapInputs:true}).edge));
  assert.deepEqual(inverted,normal,'fuente interna no define qué presupuesto ve cada comprador');
 }
});

test('MVP206: durante una ronda abierta no hay finalistas, orientación ni condiciones postcierre',async()=>{
 const {edge}=fromVerifiedOriginals(0,{state:'waiting'});
 const publicStatus=plain(buyerView(edge));
 assert.equal(publicStatus.offers.length,2);
 assert.equal(publicStatus.orientacion,undefined);
 assert.equal(publicStatus.coverage_options,undefined);
 assert.equal(publicStatus.economic_readiness,undefined);
 assert.equal(publicStatus.priced_coverage,undefined);
 const p=await page([publicStatus]);
 assert.equal(p.node('offers').children.length,2);
 assert.equal(p.node('orientacionSection').hidden,true);
 assert.equal(p.node('economicReadinessSection').hidden,true);
});

test('MVP206: fuente v8, revisión vieja o SHA distinto bloquea toda cobertura documental',()=>{
 for(const mutation of [
  q=>{q.doc.prueba.version=8},
  q=>{q.doc.prueba.revisionVigente=false},
  q=>{q.fuente.sourceSha256='f'.repeat(64)}
 ]){
  const {input,edge}=fromVerifiedOriginals(0);
  mutation(input.quotations[0]);
  assert.equal(coverageSource(edge,input),null);
  const prices=pricesSource(edge,input);
  assert.equal(prices,null);
  assert.equal(termsSource(edge,input,prices),null);
  assert.equal(optionsSource(edge,input),null);
 }
});

test('MVP206: descuento con fila alterada bloquea importes, pero no borra cobertura comercial válida',()=>{
 const {input,edge}=fromVerifiedOriginals(0);
 input.quotations[0].economia.descuentos.precios[0].fila=299;
 assert.ok(coverageSource(edge,input),'los hechos físicos del material permanecen verificados');
 assert.ok(optionsSource(edge,input),'cobertura no depende de la conciliación económica');
 const prices=pricesSource(edge,input);
 assert.equal(prices,null,'importe contaminado no debe aparecer');
 assert.equal(termsSource(edge,input,prices),null,'sin precios íntegros no hay panel económico');
});

test('MVP206: token revocado o red caída vacía de inmediato TODOS los paneles',async()=>{
 for(const next of [{state:'not_found'},{simulateNetworkError:true}]){
  const {edge}=fromVerifiedOriginals(0);
  const safe=plain(buyerView(edge));
  const p=await page([safe,next]);
  assert.equal(p.node('offers').children.length,2);
  assert.equal(p.node('economicReadinessSection').hidden,false);
  await p.next();
  for(const id of ['offers','itemPricesGrid','coverageOptionsGrid',
    'orientacionGrid','economicReadinessGrid','pricedCoverageGrid'])
   assert.equal(p.node(id).children.length,0,id);
  assert.equal(p.node('economicReadinessSection').hidden,true);
  assert.equal(p.node('orientacionSection').hidden,true);
 }
});

test('MVP206: el proxy retira únicamente la proyección falsificada y conserva las dos ofertas',()=>{
 const {edge}=fromVerifiedOriginals(0);
 const tampered=structuredClone(edge);
 tampered.economic_readiness.ofertas[0].moneda='ARS';
 tampered.economic_readiness.ofertas[0].articulosConImporte=100;
 const publicStatus=plain(buyerView(tampered));
 assert.equal(publicStatus.economic_readiness,undefined);
 assert.equal(publicStatus.offers.length,2);
 assert.equal(publicStatus.economy.price_comparable,false);
 assert.equal(publicStatus.orientacion.automatic_award,false);
});
