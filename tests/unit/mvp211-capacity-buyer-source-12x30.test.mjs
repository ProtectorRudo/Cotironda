import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {diagnosticarRondaPrivadaMvp172} from
 '../../src/domain/diagnostico-ronda-mvp172.ts';
import {resumirCoberturaCompradorMvp175} from
 '../../src/domain/resumen-cobertura-comprador-mvp175.ts';
import {resumirImportesCotizadosCompradorMvp186} from
 '../../src/domain/resumen-importes-cotizados-mvp186.ts';
import {resumirAlternativasCoberturaMvp189} from
 '../../src/domain/alternativas-cobertura-mvp189.ts';
import {resumirCoberturaImportesMvp194} from
 '../../src/domain/cobertura-importes-cierre-mvp194.ts';
import {resumirCondicionesEconomicasPorOfertaMvp204} from
 '../../src/domain/condiciones-economicas-por-oferta-mvp204.ts';

const fixture=JSON.parse(readFileSync(new URL(
 '../fixtures/mvp199-pilot-shape-anonymized.json',import.meta.url),'utf8'));
const proxy=readFileSync(new URL(
 '../../piloto/seguimiento-web/api/estado.js',import.meta.url),'utf8');
const browser=readFileSync(new URL(
 '../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
const v=proxy.indexOf('function buyerView(parsed){');
const w=proxy.indexOf('export default async function handler',v);
assert.ok(v>=0&&w>v);
const buyerView=vm.runInNewContext(proxy.slice(v,w)+'\nbuyerView',{}, {timeout:1000});
const copy=o=>structuredClone(o);

function build(quoteCount=12,itemCount=30){
 const original=fixture.rounds[0].input;
 const requestItems=copy(original.requestItems);
 for(let i=4;i<=itemCount;i++){
  requestItems.push({
   id:'item_'+String(i).padStart(3,'0'),
   descripcionLiteral:'material eléctrico genérico '+i,
   cantidad:'1.000',unidad:'unit',familia:'material_electrico'
  });
 }
 const quotations=[];
 for(let i=0;i<quoteCount;i++){
  const q=copy(original.quotations[i%original.quotations.length]);
  const hash='a'.repeat(63)+(i+1).toString(16);
  const digest='b'.repeat(63)+(i+1).toString(16);
  q.publicText='Presupuesto revisado fuente '+String(i+1);
  q.doc.messageHmac=hash;q.doc.sourceSha256=digest;
  q.doc.prueba.messageHmac=hash;q.doc.prueba.sourceSha256=digest;
  q.fuente.messageHmac=hash;q.fuente.sourceSha256=digest;
  q.economia.sourceSha256=digest;
  quotations.push(q);
 }
 const input={state:'private_inputs',rankingAllowed:false,contactsRevealed:false,
  requestItems,quotations};
 const offers=quotations.slice().reverse().map((q,i)=>({
  label:'Presupuesto '+(i+1),text:q.publicText
 }));
 const conditions=quotations.map(x=>x.economia.condiciones);
 const num=(section,state)=>conditions.filter(x=>x[section]?.estado===state).length;
 const economy={
  state:'economia_observada_sin_ranking',quotations:quoteCount,
  iva_not_informed:num('iva','no_informado'),
  freight_not_informed:num('flete','no_informado'),
  freight_to_agree:num('flete','a_convenir'),
  payment_not_informed:num('pago','no_informado'),
  stock_unverified:quoteCount,net_unverified:quoteCount,
  delivery_unverified:quoteCount,minimum_unverified:quoteCount,
  ranking_allowed:false,price_comparable:false,contacts_revealed:false
 };
 const status={state:'closed',can_open:true,offers,economy,
  received_count:quoteCount,files_pending_review:0};
 return {input,status};
}

test('MVP211: 30 artículos × 12 ofertas fuente: ninguna se omite',()=>{
 const {input,status}=build();
 const d=diagnosticarRondaPrivadaMvp172(input);
 assert.equal(d.estado,'diagnostico_privado');
 assert.equal(d.rondaResumen.cotizacionesAuditadas,12);
 assert.equal(d.rondaResumen.articulosSolicitados,30);
 assert.equal(d.proveedoresAnonimos.length,12);
 assert.ok(d.proveedoresAnonimos.every(x=>x.articulos.length===30));
 assert.equal(d.rankingHabilitado,false);
 assert.equal(d.contactosRevelados,false);

 const coverage=resumirCoberturaCompradorMvp175(status,input);
 assert.ok(coverage);
 assert.equal(coverage.comparisons,360);
 assert.equal(coverage.quotations,12);
 assert.equal(coverage.requested_items,30);
 assert.equal(coverage.ranking_allowed,false);
 status.coverage=coverage;
 const amounts=resumirImportesCotizadosCompradorMvp186(status,input);
 assert.ok(amounts,'source-backed item amounts should remain available');
 assert.equal(amounts.quotations,12);
 assert.equal(amounts.articulos.length,30);
 assert.ok(amounts.articulos.every(x=>x.referencias.length===12));
 assert.deepEqual(amounts.articulos[0].referencias.map(x=>x.oferta),
  status.offers.map(x=>x.label));
 const options=resumirAlternativasCoberturaMvp189(status,input);
 assert.ok(options);
 assert.equal(options.coberturaPorOferta.length,12);
 assert.equal(options.requested_items,30);
 assert.equal(options.alternativas.length,0,
  '30 items are NOT complete just because quotes have similar totals');
 const amountCoverage=resumirCoberturaImportesMvp194(status,amounts);
 assert.ok(amountCoverage);
 assert.equal(amountCoverage.coberturaPorOferta.length,12);
 assert.equal(amountCoverage.requested_items,30);
 assert.equal(amountCoverage.parejasConImportesParaTodos.length,0);
 for(const x of [coverage,amounts,options,amountCoverage]){
  const serialized=JSON.stringify(x);
  assert.ok(!serialized.includes(input.quotations[0].doc.messageHmac));
  assert.ok(!serialized.includes(input.quotations[0].doc.sourceSha256));
 }
 status.item_prices=amounts;
 status.coverage_options=options;
 status.priced_coverage=amountCoverage;
 const reduced=JSON.parse(JSON.stringify(buyerView(status)));
 assert.ok(reduced,'proxy should authorize full safe output');
 assert.equal(reduced.offers.length,12);
 assert.equal(reduced.coverage?.comparisons,360);
 assert.equal(reduced.item_prices?.articulos.length,30);
 assert.equal(reduced.coverage_options?.coberturaPorOferta.length,12);
 assert.equal(reduced.priced_coverage?.coberturaPorOferta.length,12);
 assert.equal(reduced.material_baskets,undefined,
  'larger requests never get fabricated preliminary economic rankings');
 assert.equal(reduced.finalists,undefined);
 assert.equal(reduced.offers.length,input.quotations.length);
 assert.ok(JSON.stringify(reduced).length<524288);
});

test('MVP211: 13.ª oferta o 31.º artículo rechazan el diagnóstico en lugar de truncarlo',()=>{
 const overflowOffers=build(13,30);
 const rejected=diagnosticarRondaPrivadaMvp172(overflowOffers.input);
 assert.equal(rejected.estado,'insumos_invalidos');
 assert.equal(rejected.proveedoresAnonimos.length,0);
 assert.equal(resumirCoberturaCompradorMvp175(
  overflowOffers.status,overflowOffers.input),null);
 const overflowItems=build(12,31);
 const rejected2=diagnosticarRondaPrivadaMvp172(overflowItems.input);
 assert.equal(rejected2.estado,'insumos_invalidos');
 assert.equal(rejected2.proveedoresAnonimos.length,0);
});

test('MVP211: toda oferta necesita HMAC/SHA v9 y texto público independiente',()=>{
 for(const mutate of [
  x=>{x.input.quotations[11].doc.prueba.revisionVigente=false},
  x=>{x.input.quotations[11].fuente.sourceSha256='f'.repeat(64)},
  x=>{x.input.quotations[11].economia.descuentos.precios[0].fila=999},
  x=>{x.input.quotations[11].publicText=x.input.quotations[0].publicText},
  x=>{x.status.offers[11].text='TEXTO ALTERADO'}
 ]){
  const x=build();mutate(x);
  const c=resumirCoberturaCompradorMvp175(x.status,x.input);
  const amounts=resumirImportesCotizadosCompradorMvp186(x.status,x.input);
  if(c&&amounts&&x.status.offers.length===12){
   x.status.coverage=c;
   assert.equal(resumirAlternativasCoberturaMvp189(x.status,x.input),null);
  }else assert.ok(c===null||amounts===null);
 }
});

test('MVP211: navegador mantiene las capas de privacidad para cargas grandes',()=>{
 assert.match(browser,/p\.requested_items>30/);
 assert.match(browser,/o\.quotations>12/);
 assert.match(browser,/o\.alternativas\.length>78/);
 assert.match(browser,/p\.parejasConImportesParaTodos\.length>66/);
 assert.match(browser,/n<=360/);
 assert.match(browser,/clearPrivateView\(\)/);
 assert.match(browser,/requestedToken!==token/);
 assert.doesNotMatch(browser,/\.innerHTML\s*=/);
});

test('MVP211: SQL y UI mantienen 25 renglones fuente por documento y límites coherentes',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/mvp211_private_round_inputs_capacity_12x30.sql',import.meta.url),'utf8');
 assert.match(sql,/v_items_count>30/);
 assert.match(sql,/v_quotes_count>12/);
 assert.match(sql,/l\.line_no>30/);
 assert.match(sql,/q\.line_count between 1 and 25/);
 assert.match(sql,/length\(v_documents::text\)>300000/);
 assert.match(sql,/set search_path=''/);
 assert.match(sql,/revoke all.*private_round_inputs_mvp172[\s\S]*?from public,anon,authenticated/iu);
 assert.match(sql,/to service_role/iu);
 assert.match(proxy,/if\(body\.length>524288\)/);
 assert.match(proxy,/optionSet\.quotations<=12/);
 assert.match(proxy,/optionSet\.requested_items<=30/);
 assert.match(proxy,/optionSet\.alternativas\.length<=78/);
 assert.match(proxy,/pc\.parejasConImportesParaTodos\.length<=66/);
});

test('MVP211: navegador explica optimizador suspendido, conserva 12 ofertas y limpia la revocación',()=>{
 const {input,status}=build();
 const coverage=resumirCoberturaCompradorMvp175(status,input);
 assert.ok(coverage);status.coverage=coverage;
 const amount=resumirImportesCotizadosCompradorMvp186(status,input);
 assert.ok(amount);status.item_prices=amount;
 const options=resumirAlternativasCoberturaMvp189(status,input);
 assert.ok(options);status.coverage_options=options;
 const terms=resumirCondicionesEconomicasPorOfertaMvp204(status,input,amount);
 assert.ok(terms);status.economic_readiness=terms;
 const reduced=JSON.parse(JSON.stringify(buyerView(status)));
 assert.ok(reduced?.economic_readiness);
 class E{
  constructor(){this.textContent='';this.children=[];this.hidden=false;this.className=''}
  append(...xs){this.children.push(...xs)}
  appendChild(x){this.children.push(x);return x}
  replaceChildren(){this.children=[]}
 }
 const nodes=new Map(),get=id=>{
  if(!nodes.has(id))nodes.set(id,new E());return nodes.get(id);
 };
 const render=vm.runInNewContext(browser+'\nrender',{
  window:{location:{hash:'#'}},
  document:{getElementById:get,createElement:()=>new E()},
  setInterval:()=>{},fetch:async()=>{throw Error('unexpected network')}
 },{timeout:1500});
 render(reduced);
 assert.equal(get('offers').children.length,12);
 assert.equal(get('itemPricesSection').hidden,false);
 assert.equal(get('materialBasketsSection').hidden,false);
 assert.match(get('materialBasketsCaption').textContent,/mayor tamaño/);
 assert.match(JSON.stringify(get('materialBasketsGrid').children),
  /Todos los presupuestos/);
 render({state:'not_found'});
 assert.equal(get('materialBasketsSection').hidden,true);
 assert.equal(get('materialBasketsGrid').children.length,0);
 assert.equal(get('offers').children.length,0);
});
