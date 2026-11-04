import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../../site/seguimiento/app.js',import.meta.url),'utf8');
class Node{
 constructor(){this.children=[];this.hidden=false;this.textContent='';this.disabled=false;
  this.className='';this.handlers={};}
 replaceChildren(...values){this.children=values;}
 appendChild(c){this.children.push(c);return c;}
 append(...values){this.children.push(...values);}
 addEventListener(type,handler){this.handlers[type]=handler;}
}
const coverage=()=>({
 state:'cobertura_revisada',quotations:2,requested_items:3,comparisons:6,
 commercial_alternatives:4,packaging_unproven:1,not_evaluated:1,
 explicit_differences:0,technical_uncertainty:0,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
});
async function render(data){
 const dom=new Map();
 const node=id=>{if(!dom.has(id))dom.set(id,new Node());return dom.get(id)};
 const document={getElementById:node,createElement:()=>new Node(),
  visibilityState:'visible'};
 let next=0;
 const fetch=async()=>{
  const entry=Array.isArray(data)?data[Math.min(next++,data.length-1)]:data;
  if(entry?.network_error)throw Error('outage');
  return {ok:true,json:async()=>entry};
 };
 const ctx={document,location:{hash:'#'+'a'.repeat(64)},fetch,
  setInterval:()=>0};
 vm.runInNewContext(script,ctx,{timeout:500});
 await new Promise(r=>setTimeout(r,0));
 return {section:node('coverageSection'),grid:node('coverageGrid'),
  caption:node('coverageCaption'),offers:node('approvedOffers'),
  button:node('refresh')};
}
test('MVP175 browser: valid token-authorized coverage shows reasonable alternatives without ranking',async()=>{
 const page=await render({
  state:'waiting',received_count:2,files_pending_review:0,
  deadline:'2026-11-10T18:00:00Z',can_open:true,offers:[],
  coverage:coverage()
 });
 assert.equal(page.section.hidden,false);
 assert.equal(page.grid.children.length,3);
 assert.match(page.caption.textContent,/6 cruces de artículos/);
 const contents=page.grid.children.map(x=>x.children.map(y=>y.textContent).join(' ')).join(' | ');
 assert.match(contents,/4 Alternativas comerciales razonables/);
 assert.match(contents,/1 Presentaciones sin acreditar/);
 assert.match(contents,/1 Artículos todavía sin cotejar/);
 assert.doesNotMatch(contents,/primer puesto|ganador|ranking/i);
});
test('MVP175 browser: unknown/revoked/cancelled token never displays injected coverage',async()=>{
 for(const [state,can_open] of [['not_found',false],['cancelled',true],
  ['waiting',false],['closed',false]]){
  const p=await render({state,can_open,received_count:0,
   files_pending_review:0,offers:[],coverage:coverage()});
  assert.equal(p.section.hidden,true,state);
  assert.equal(p.grid.children.length,0,state);
 }
});
test('MVP175 browser: forged count, false ranking guard or missing totals do not show a misleading widget',async()=>{
 for(const changes of [
  {ranking_allowed:true},{price_comparable:true},
  {contacts_revealed:true},{comparisons:9},
  {commercial_alternatives:40},{not_evaluated:-2},
  {quotations:0},{requested_items:999}
 ]){
  const p=await render({state:'waiting',can_open:true,
   received_count:2,files_pending_review:0,
   deadline:'2026-11-10T18:00:00Z',offers:[],
   coverage:{...coverage(),...changes}});
  assert.equal(p.section.hidden,true,JSON.stringify(changes));
 }
});
test('MVP175 browser: no unrelated supplier original fields are copied to the DOM',async()=>{
 const p=await render({state:'waiting',can_open:true,
  received_count:2,files_pending_review:0,
  deadline:'2026-11-10T18:00:00Z',offers:[],
  coverage:{...coverage(),hmac:'hidden-secret',supplier:'Private Name',price:'$123'}});
 assert.equal(p.section.hidden,false);
 const s=p.grid.children.flatMap(x=>x.children.map(n=>n.textContent)).join('|')+
  p.caption.textContent;
 assert.ok(!s.includes('hidden-secret'));
 assert.ok(!s.includes('Private Name'));
 assert.ok(!s.includes('$123'));
});
test('MVP175 browser: revoked link AFTER approved view clears prior private offers',async()=>{
 const allowed={state:'waiting',can_open:true,received_count:2,
  deadline:'2026-11-10T18:00:00Z',files_pending_review:0,
  offers:[{label:'Presupuesto 1',text:'Oferta revisada'}],
  coverage:coverage()};
 const page=await render([allowed,{state:'not_found'}]);
 assert.equal(page.section.hidden,false);
 assert.equal(page.offers.children.length,1);
 page.button.handlers.click();
 await new Promise(r=>setTimeout(r,0));
 assert.equal(page.section.hidden,true);
 assert.equal(page.offers.children.length,0);
 assert.equal(page.grid.children.length,0);
});
test('MVP175 browser: network error also erases previously visible private offers',async()=>{
 const allowed={state:'waiting',can_open:true,received_count:1,
  deadline:'2026-11-10T18:00:00Z',files_pending_review:0,
  offers:[{label:'Presupuesto 1',text:'Oferta revisada'}],
  coverage:coverage()};
 const page=await render([allowed,{network_error:true}]);
 assert.equal(page.offers.children.length,1);
 page.button.handlers.click();
 await new Promise(r=>setTimeout(r,0));
 assert.equal(page.offers.children.length,0);
 assert.equal(page.section.hidden,true);
});
