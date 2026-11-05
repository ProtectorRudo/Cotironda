import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root=new URL('../../piloto/seguimiento-web/',import.meta.url);
const script=readFileSync(new URL('site.js',root),'utf8');
const html=readFileSync(new URL('index.html',root),'utf8');
class Node{
 constructor(){this.children=[];this.hidden=false;this.textContent='';this.className=''}
 append(...items){this.children.push(...items)}
 appendChild(item){this.children.push(item);return item}
 replaceChildren(){this.children=[]}
}
const coverage=()=>({
 state:'cobertura_revisada',quotations:2,requested_items:2,comparisons:4,
 commercial_alternatives:2,packaging_unproven:0,not_evaluated:2,
 explicit_differences:0,technical_uncertainty:0,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
});
const economy=()=>({
 state:'economia_observada_sin_ranking',quotations:2,
 iva_not_informed:2,freight_not_informed:2,freight_to_agree:0,
 stock_unverified:2,payment_not_informed:2,net_unverified:2,
 delivery_unverified:2,minimum_unverified:2,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
});
const options=()=>({
 state:'alternativas_cobertura_sin_ranking',quotations:2,requested_items:2,
 coberturaPorOferta:[
  {oferta:'Presupuesto 1',articulosConAlternativa:1,articulosSolicitados:2},
  {oferta:'Presupuesto 2',articulosConAlternativa:1,articulosSolicitados:2}
 ],
 alternativas:[{
  modo:'complementaria',ofertasAnonimas:['Presupuesto 1','Presupuesto 2'],
  articulos:[
   {itemId:'item_001',ofertasConAlternativa:['Presupuesto 1']},
   {itemId:'item_002',ofertasConAlternativa:['Presupuesto 2']}
  ]
 }],
 ranking_allowed:false,price_comparable:false,tax_calculated:false,
 freight_calculated:false,stock_confirmed:false,contacts_revealed:false,
 automatic_award:false,finalists_selected:false,whatsapp_sent:false,
 originals_downloadable:false
});
const data=()=>({
 state:'closed',can_open:true,received_count:2,files_pending_review:0,
 deadline:'2026-11-08T22:00:00Z',
 offers:[{label:'Presupuesto 1',text:'Revisado A'},
         {label:'Presupuesto 2',text:'Revisado B'}],
 coverage:coverage(),economy:economy(),coverage_options:options()
});
async function page(replies){
 const dom=new Map(),timers=[];
 const node=id=>{if(!dom.has(id))dom.set(id,new Node());return dom.get(id)};
 vm.runInNewContext(script,{
  window:{location:{hash:'#'+'a'.repeat(64)}},
  document:{getElementById:node,createElement:()=>new Node()},
  fetch:async()=>{
   const v=await replies.shift();
   if(v?.networkError)throw Error('offline');
   return {ok:true,json:async()=>v};
  },setInterval:fn=>timers.push(fn)
 },{timeout:1000});
 await new Promise(r=>setTimeout(r,0));
 return {node,next:async()=>{
  timers[0]();await new Promise(r=>setTimeout(r,0));
 }};
}
test('MVP189 UI: ronda cerrada enseña pareja complementaria sin puntajes ni precios',async()=>{
 const p=await page([data()]);
 assert.equal(p.node('coverageOptionsSection').hidden,false);
 assert.equal(p.node('coverageOptionsCounts').children.length,2);
 assert.equal(p.node('coverageOptionsGrid').children.length,1);
 const text=JSON.stringify(p.node('coverageOptionsGrid').children);
 assert.match(text,/Combinación complementaria/);
 assert.match(text,/Presupuesto 1/);
 assert.match(text,/Presupuesto 2/);
 assert.match(text,/Artículo 1/);
 assert.match(text,/Artículo 2/);
 assert.doesNotMatch(text,/\b(?:ganadores?|menor precio|puesto 1|adjudicados?|total final)\b/iu);
 assert.match(html,/id="coverageOptionsSection"/);
 assert.match(p.node('coverageOptionsCaption').textContent,/No son ganadores/);
});
test('MVP189 UI: oculta opciones con ronda abierta sin alterar las ofertas',async()=>{
 const d=data();d.state='waiting';
 const p=await page([d]);
 assert.equal(p.node('coverageOptionsSection').hidden,true);
 assert.equal(p.node('coverageOptionsGrid').children.length,0);
 assert.ok(p.node('offers').children.length>0);
});
test('MVP189 UI: al revocar token o perder conexión desaparecen combinaciones',async()=>{
 for(const next of [{state:'not_found'},{networkError:true}]){
  const p=await page([data(),next]);
  assert.equal(p.node('coverageOptionsSection').hidden,false);
  await p.next();
  assert.equal(p.node('coverageOptionsSection').hidden,true);
  assert.equal(p.node('coverageOptionsGrid').children.length,0);
  assert.equal(p.node('coverageOptionsCounts').children.length,0);
  assert.equal(p.node('coverageOptionsCaption').textContent,'');
 }
});
test('MVP189 UI: no admite referencias de proveedor desconocido ni estado de adjudicación',async()=>{
 for(const change of [
  x=>{x.coverage_options.automatic_award=true},
  x=>{x.coverage_options.finalists_selected=true},
  x=>{x.coverage_options.price_comparable=true},
  x=>{x.coverage_options.coberturaPorOferta[0].oferta='Negocio privado'},
  x=>{x.coverage_options.alternativas[0].articulos[0].itemId='otro'},
  x=>{x.coverage_options.alternativas[0].articulos[0].ofertasConAlternativa=['Peligro']},
  x=>{x.coverage_options.alternativas[0].articulos.pop()},
  x=>{x.coverage.commercial_alternatives=4}
 ]){
  const d=data();change(d);
  const p=await page([d]);
  assert.equal(p.node('coverageOptionsSection').hidden,true);
 }
});
test('MVP189 UI: lista incompleta no fabrica ganadores y deja ofertas parciales',async()=>{
 const d=data();d.coverage_options.alternativas=[];
 const p=await page([d]);
 assert.equal(p.node('coverageOptionsSection').hidden,false);
 assert.match(p.node('coverageOptionsCaption').textContent,/No encontramos/);
 assert.equal(p.node('coverageOptionsGrid').children.length,0);
 assert.ok(p.node('offers').children.length>=2);
});
test('MVP189 UI: entradas con HTML hostil quedan como texto, nunca se interpretan',async()=>{
 const d=data();d.offers[0].label='<img onerror=alert(1)>';
 d.coverage_options.coberturaPorOferta[0].oferta=d.offers[0].label;
 d.coverage_options.alternativas[0].ofertasAnonimas[0]=d.offers[0].label;
 d.coverage_options.alternativas[0].articulos[0].ofertasConAlternativa[0]=d.offers[0].label;
 const p=await page([d]);
 assert.equal(p.node('coverageOptionsSection').hidden,false);
 assert.match(JSON.stringify(p.node('coverageOptionsGrid').children),/<img onerror=alert\(1\)>/);
 assert.doesNotMatch(script,/\.innerHTML\s*=/);
});

const orientation=(tipo='pareja_complementaria',ofertasAnonimas=['Presupuesto 1','Presupuesto 2'],n=1)=>({
 state:'orientacion_de_cobertura_no_economica',tipo,ofertasAnonimas,
 alternativasCompletas:n,presupuestosRevisados:2,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false,
 automatic_award:false,originales_descargables:false
});
test('MVP203 UI: al cierre ofrece pareja única como orientación, mantiene TODOS los originales anónimos',async()=>{
 const d=data();d.orientacion=orientation();
 const p=await page([d]);
 assert.equal(p.node('orientacionSection').hidden,false);
 assert.equal(p.node('orientacionGrid').children.length,1);
 const content=JSON.stringify(p.node('orientacionGrid').children);
 assert.match(content,/Presupuesto 1/);
 assert.match(content,/Presupuesto 2/);
 assert.match(content,/IVA, flete, stock/);
 assert.doesNotMatch(content,/\bganador\b|adjudicad[oa]|1\\.(?:er|º)\\s+puesto/iu);
 assert.match(content,/No implica menor precio/);
 assert.equal(p.node('offers').children.length,2);
 assert.match(html,/id="orientacionSection"/);
 assert.match(p.node('orientacionCaption').textContent,/no por competitividad económica/iu);
});
test('MVP203 UI: al cancelar o perder acceso elimina orientación y todas las ofertas',async()=>{
 for(const next of [{state:'not_found'},{networkError:true}]){
  const d=data();d.orientacion=orientation();
  const p=await page([d,next]);
  assert.equal(p.node('orientacionSection').hidden,false);
  await p.next();
  assert.equal(p.node('orientacionSection').hidden,true);
  assert.equal(p.node('orientacionGrid').children.length,0);
  assert.equal(p.node('orientacionCaption').textContent,'');
  assert.equal(p.node('offers').children.length,0);
 }
});
test('MVP203 UI: estado abierto, parámetros alterados y recomendación suplantada fallan cerrados',async()=>{
 for(const mutate of [
  d=>d.state='waiting',
  d=>d.can_open=false,
  d=>d.orientacion.price_comparable=true,
  d=>d.orientacion.ranking_allowed=true,
  d=>d.orientacion.tipo='dos_individuales',
  d=>d.orientacion.ofertasAnonimas=['Presupuesto 1'],
  d=>d.orientacion.ofertasAnonimas=['Presupuesto 1','Negocio particular'],
  d=>d.orientacion.alternativasCompletas=2,
  d=>d.coverage_options.alternativas=[],
  d=>d.coverage_options.automatic_award=true
 ]){
  const d=data();d.orientacion=orientation();mutate(d);
  const p=await page([d]);
  assert.equal(p.node('orientacionSection').hidden,true);
  assert.equal(p.node('orientacionGrid').children.length,0);
 }
});
test('MVP203 UI: ambigüedad o ausencia de cobertura no inventa recomendados',async()=>{
 for(const [tipo,alternativas,n,caption] of [
  ['sin_cobertura_completa',[],0,/No hay una propuesta/],
  ['multiples_sin_preferencia',[options().alternativas[0],{
    modo:'individual',ofertasAnonimas:['Presupuesto 1'],
    articulos:[
     {itemId:'item_001',ofertasConAlternativa:['Presupuesto 1']},
     {itemId:'item_002',ofertasConAlternativa:['Presupuesto 1']}
    ]
  }],2,/no selecciona dos arbitrariamente/]
 ]){
  const d=data();d.coverage_options.alternativas=alternativas;
  if(tipo==='multiples_sin_preferencia'){
   d.coverage_options.coberturaPorOferta[0].articulosConAlternativa=2;
   d.coverage.commercial_alternatives=3;
   // Complementary option is not admissible when one provider covers all:
   // the UI should deny the WHOLE forged coverage envelope.
   const p=await page([d]);assert.equal(p.node('orientacionSection').hidden,true);
   continue;
  }
  d.orientacion=orientation(tipo,[],n);
  const p=await page([d]);
  assert.equal(p.node('orientacionSection').hidden,false);
  assert.equal(p.node('orientacionGrid').children.length,0);
  assert.match(p.node('orientacionCaption').textContent,caption);
  assert.equal(p.node('offers').children.length,2);
 }
});
