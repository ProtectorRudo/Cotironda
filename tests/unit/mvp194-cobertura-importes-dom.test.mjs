import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resumirCoberturaImportesMvp194 as summarize}
 from '../../src/domain/cobertura-importes-cierre-mvp194.ts';

const script=readFileSync(new URL('../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../piloto/seguimiento-web/index.html',import.meta.url),'utf8');
class Node{
 constructor(){this.children=[];this.hidden=false;this.textContent='';this.className=''}
 append(...elements){this.children.push(...elements)}
 appendChild(child){this.children.push(child);return child}
 replaceChildren(){this.children=[]}
}
const labels=['Presupuesto 1','Presupuesto 2'];
function data(){
 const economy={
  state:'economia_observada_sin_ranking',quotations:2,
  iva_not_informed:2,freight_not_informed:2,freight_to_agree:0,
  stock_unverified:2,payment_not_informed:2,net_unverified:2,
  delivery_unverified:2,minimum_unverified:2,
  ranking_allowed:false,price_comparable:false,contacts_revealed:false
 };
 const req=(oferta,amount)=>({
  oferta,importeCotizado:amount,
  cantidadCotizadaLiteral:amount===null?null:'1',
  estado:amount===null?'no_homologable':'alternativa_comercial_con_aclaracion',
  iva:'sin_iva_por_convencion'
 });
 const item_prices={
  state:'importes_por_articulo_sin_ranking',
  quotations:2,requested_items:2,articulos:[
   {itemId:'item_001',descripcionSolicitada:'Arena',cantidadSolicitada:'1.000',
    unidadSolicitada:'m3',referencias:[req(labels[0],'$ 150,00'),req(labels[1],null)]},
   {itemId:'item_002',descripcionSolicitada:'Piedra',cantidadSolicitada:'1.000',
    unidadSolicitada:'m3',referencias:[req(labels[0],null),req(labels[1],'$ 170,00')]}
  ],
  ranking_allowed:false,price_comparable:false,contacts_revealed:false,
  adjudicacion:false,originales_descargables:false,
  IVA_calculado:false,flete_calculado:false,stock_confirmado:false
 };
 const d={
  state:'closed',can_open:true,received_count:2,
  files_pending_review:0,deadline:'2026-11-09T14:00:00Z',
  offers:[{label:labels[0],text:'Revisado A'},{label:labels[1],text:'Revisado B'}],
  economy,item_prices
 };
 d.priced_coverage=structuredClone(summarize(d,item_prices));
 return d;
}
async function browser(replies){
 const dom=new Map(),timers=[];
 const node=id=>{if(!dom.has(id))dom.set(id,new Node());return dom.get(id)};
 vm.runInNewContext(script,{
  window:{location:{hash:'#'+'a'.repeat(64)}},
  document:{getElementById:node,createElement:()=>new Node()},
  fetch:async()=>{const v=await replies.shift();
   if(v?.error)throw Error('network');
   return {ok:true,json:async()=>v};},
  setInterval:fn=>timers.push(fn)
 },{timeout:1000});
 await new Promise(resolve=>setTimeout(resolve,0));
 return {node,next:async()=>{
  timers[0]();await new Promise(resolve=>setTimeout(resolve,0));
 }};
}
test('MVP194 UI: presenta las 2 ofertas y una combinación con importes respaldados, sin ranking',async()=>{
 const b=await browser([data()]);
 assert.equal(b.node('pricedCoverageSection').hidden,false);
 assert.equal(b.node('pricedCoverageGrid').children.length,3);
 const lines=JSON.stringify(b.node('pricedCoverageGrid').children);
 assert.match(lines,/Presupuesto 1/);
 assert.match(lines,/Presupuesto 2/);
 assert.match(lines,/1 de 2 artículos/);
 assert.match(lines,/referencias|importes respaldados/u);
 assert.doesNotMatch(lines,/150,00|170,00|1.er puesto|Ganador/i);
 assert.match(b.node('pricedCoverageCaption').textContent,/ninguna se adjudica automáticamente/i);
 assert.match(html,/id="pricedCoverageSection"/);
});
test('MVP194 UI: durante la ronda no se muestra una pareja potencial, pero sí las ofertas',async()=>{
 const d=data();d.state='waiting';
 const b=await browser([d]);
 assert.equal(b.node('pricedCoverageSection').hidden,true);
 assert.equal(b.node('pricedCoverageGrid').children.length,0);
 assert.ok(b.node('offers').children.length>0);
});
test('MVP194 UI: revocación y fallos de red limpian TODA la nueva vista',async()=>{
 for(const next of [{state:'not_found'},{error:true}]){
  const b=await browser([data(),next]);
  assert.equal(b.node('pricedCoverageSection').hidden,false);
  await b.next();
  assert.equal(b.node('pricedCoverageSection').hidden,true);
  assert.equal(b.node('pricedCoverageGrid').children.length,0);
  assert.equal(b.node('pricedCoverageCaption').textContent,'');
  assert.equal(b.node('offers').children.length,0);
 }
});
test('MVP194 UI: no muestra propuestas alteradas ni contactos agregados',async()=>{
 for(const change of [
  d=>d.priced_coverage.price_comparable=true,
  d=>d.priced_coverage.ranking_allowed=true,
  d=>d.priced_coverage.coberturaPorOferta[0].articulosConImporte=2,
  d=>d.priced_coverage.parejasConImportesParaTodos[0].ofertasAnonimas[0]='Proveedor privado',
  d=>d.priced_coverage.parejasConImportesParaTodos[0].articulos[1].itemId='item_003',
  d=>d.priced_coverage.parejasConImportesParaTodos[0].articulos[0].ofertasConImporte=[labels[1]],
  d=>d.priced_coverage.parejasConImportesParaTodos=[],
  d=>d.item_prices.articulos[0].referencias[0].importeCotizado=null,
  d=>d.can_open=false
 ]){
  const d=data();change(d);
  const b=await browser([d]);
  assert.equal(b.node('pricedCoverageSection').hidden,true);
  assert.equal(b.node('pricedCoverageGrid').children.length,0);
 }
 assert.doesNotMatch(script,/\.innerHTML\s*=/);
});
