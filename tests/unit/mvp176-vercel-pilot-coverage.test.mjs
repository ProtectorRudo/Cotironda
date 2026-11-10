import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const root=new URL("../../piloto/seguimiento-web/",import.meta.url);
const code=readFileSync(new URL("site.js",root),"utf8");
const html=readFileSync(new URL("index.html",root),"utf8");
const css=readFileSync(new URL("site.css",root),"utf8");
const vercel=JSON.parse(readFileSync(new URL("vercel.json",root),"utf8"));
const proxy=readFileSync(new URL("api/estado.js",root),"utf8");

class Node{
 constructor(){this.children=[];this.textContent="";this.hidden=false;this.className="";}
 append(...items){this.children.push(...items);}
 appendChild(item){this.children.push(item);return item;}
 replaceChildren(){this.children=[];}
}
const coverage=()=>({
 state:"cobertura_revisada",quotations:2,requested_items:3,comparisons:6,
 commercial_alternatives:4,packaging_unproven:1,not_evaluated:1,
 explicit_differences:0,technical_uncertainty:0,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
});
const allowed=()=>({
 state:"waiting",can_open:true,received_count:2,files_pending_review:0,
 deadline:"2026-11-10T18:00:00Z",
 offers:[{label:"Presupuesto 1",text:"Oferta revisada de prueba"}],
 coverage:coverage()
});
async function simulate(responses){
 const nodes=new Map(), timers=[];let fetchCalls=0;
 const getElementById=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)};
 const context={
  window:{location:{hash:"#"+ "a".repeat(64)}},
  document:{getElementById,createElement:()=>new Node()},
  fetch:async(url,options)=>{
   assert.equal(url,"/api/estado");assert.equal(options.method,"POST");
   assert.equal(JSON.parse(options.body).token,"a".repeat(64));
   fetchCalls++;
   const reply=await responses.shift();
   if(reply?.error)throw Error("offline");
   return {ok:true,json:async()=>reply};
  },
  setInterval:fn=>{timers.push(fn);}
 };
 vm.runInNewContext(code,context,{timeout:1000});
 await new Promise(resolve=>setTimeout(resolve,0));
 return {node:getElementById,calls:()=>fetchCalls,refresh:async()=>{
  if(timers.length)timers[0]();
  await new Promise(resolve=>setTimeout(resolve,0));
 }};
}
test("MVP176: real Vercel pilot directory serves the new coverage section with strict CSP",()=>{
 assert.match(html,/id="coverageGrid"/);
 assert.match(html,/id="coverageSection"/);
 assert.match(html,/href="\/site.css"/);
 assert.match(html,/src="\/site.js"/);
 assert.match(css,/\.coverage-panel/);
 assert.match(css,/\[hidden\]/);
 assert.equal(vercel.rewrites.find(x=>x.source==="/seguimiento")?.destination,"/index.html");
 assert.match(vercel.headers[0].headers.find(x=>x.key==="Content-Security-Policy").value,/script-src 'self'/);
 assert.doesNotMatch(code,/\binnerHTML\b/);
 assert.match(proxy,/cotironda-piloto-seguimiento/);
 assert.match(proxy,/upstream=await fetch/);
});
test("MVP176: buyer sees commercial alternatives but no made-up positions",async()=>{
 const page=await simulate([allowed()]);
 assert.equal(page.node("coverageSection").hidden,false);
 assert.equal(page.node("coverageGrid").children.length,3);
 assert.match(page.node("coverageCaption").textContent,/6 cruces de artículos/);
 const labels=page.node("coverageGrid").children.flatMap(x=>x.children.map(y=>y.textContent)).join("|");
 assert.match(labels,/Alternativas comerciales razonables/);
 assert.match(labels,/Presentaciones sin acreditar/);
 assert.match(labels,/Artículos pendientes de cotejo/);
 assert.doesNotMatch(labels,/ganador|primer puesto|mejor precio/iu);
 assert.equal(page.node("offers").children.length,1);
});
test("MVP176: forged coverage is suppressed even if normal anonymous offers exist",async()=>{
 for(const c of [{ranking_allowed:true},{comparisons:8},{packaging_unproven:99},
  {contacts_revealed:true},{requested_items:0},{commercial_alternatives:-1}]){
  const page=await simulate([{...allowed(),coverage:{...coverage(),...c}}]);
  assert.equal(page.node("coverageSection").hidden,true,JSON.stringify(c));
  assert.equal(page.node("coverageGrid").children.length,0);
 }
});
test("MVP176: revoked token erases prior offers, counts and coverage",async()=>{
 const page=await simulate([allowed(),{state:"not_found"}]);
 assert.equal(page.node("offers").children.length,1);
 await page.refresh();
 assert.equal(page.node("offers").children.length,0);
 assert.equal(page.node("coverageSection").hidden,true);
 assert.equal(page.node("count").textContent,"—");
 assert.equal(page.node("deadline").textContent,"");
});
test("MVP176: network outage erases previously visible private data",async()=>{
 const page=await simulate([allowed(),{error:true}]);
 await page.refresh();
 assert.equal(page.node("offers").children.length,0);
 assert.equal(page.node("coverageSection").hidden,true);
 assert.equal(page.node("count").textContent,"—");
 assert.equal(page.node("state").textContent,"Sin conexión");
});

test("MVP176: a stale authorized response cannot resurrect an already revoked link",async()=>{
 let release;
 const delayed=new Promise(resolve=>{release=resolve;});
 const page=await simulate([allowed(),delayed,{state:"not_found"},allowed()]);
 await page.refresh(); // prior request stays in flight
 await page.refresh(); // revocation arrives first
 assert.equal(page.node("offers").children.length,0);
 assert.equal(page.node("coverageSection").hidden,true);
 release(allowed()); // the older in-flight authorized response arrives late
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(page.node("offers").children.length,0);
 assert.equal(page.node("state").textContent,"Enlace vencido o revocado");
 const calls=page.calls();
 await page.refresh();
 assert.equal(page.calls(),calls,"no new POST once revoked");
});

test("MVP176: a stale network error cannot erase a newer valid response",async()=>{
 let release;
 const delayed=new Promise(resolve=>{release=resolve;});
 const page=await simulate([allowed(),delayed,allowed()]);
 await page.refresh();
 await page.refresh();
 assert.equal(page.node("offers").children.length,1);
 release({error:true});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(page.node("offers").children.length,1);
 assert.equal(page.node("state").textContent,"Ronda abierta · presupuestos anónimos disponibles");
});

test("MVP176: finalistas are never rendered when can_open is false",async()=>{
 const page=await simulate([{
  ...allowed(),state:"closed",can_open:false,
  finalists:[{name:"No habilitado",whatsapp:"+5491111111111"}]
 }]);
 assert.equal(page.node("finalists").children.length,0);
 assert.equal(page.node("offers").children.length,0);
});

test("MVP176: BIG BAG y bolsón se explican como presentación nominal usual de áridos",async()=>{
 for(const description of ["BIG BAG arena","bolsón piedra"]){
  const page=await simulate([{...allowed(),offers:[{label:"Presupuesto 1",text:description}]}]);
  assert.match(page.node("equivalence").textContent,/1 m³ nominal/);
  assert.match(page.node("equivalence").textContent,/capacidad distinta/);
  assert.doesNotMatch(page.node("equivalence").textContent,/Presentación a confirmar/);
 }
});

test("MVP176: no presenta ofertas como disponibles cuando no están habilitadas",async()=>{
 for(const state of ["waiting","closed"]){
  const page=await simulate([{...allowed(),state,can_open:false}]);
  assert.match(page.node("state").textContent,/esperando presupuestos verificados|sin presupuestos habilitados/);
  assert.equal(page.node("offers").children.length,0);
  assert.equal(page.node("finalists").children.length,0);
 }
});

test("MVP177: al cerrar publica las cuatro ofertas habilitadas, sin excluir parciales",async()=>{
 const documents=[
  {label:"Presupuesto 1",text:"Cemento 40 bolsas y arena"},
  {label:"Presupuesto 2",text:"Solo cemento - cotización parcial"},
  {label:"Presupuesto 3",text:"Arena 1 metro cúbico"},
  {label:"Presupuesto 4",text:"Cable y pintura"}
 ];
 const page=await simulate([{
  ...allowed(),state:"closed",received_count:5,offers:documents,
  coverage:null,finalists:[]
 }]);
 assert.equal(page.node("resultsSection").hidden,false);
 assert.equal(page.node("offers").children.length,4);
 assert.match(page.node("resultsCaption").textContent,/4 presupuesto.*de 5 recibido/);
 assert.match(page.node("resultsCaption").textContent,/no se presentan como descartados/);
 assert.equal(page.node("finalists").children.length,0);
 const text=JSON.stringify(page.node("offers").children.map(x=>x.children));
 assert.match(text,/cotización parcial/);
 assert.match(html,/no son comparables/);
 assert.match(html,/no te obliga a comprarle/);
});
test("MVP177: no trunca la lista de cotizaciones habilitadas por el límite 25",async()=>{
 const offers=Array.from({length:30},(_,i)=>({label:"Presupuesto "+(i+1),text:"Cotización "+(i+1)}));
 const page=await simulate([{...allowed(),state:"closed",
  received_count:30,offers,coverage:null}]);
 assert.equal(page.node("offers").children.length,30);
 assert.equal(page.node("resultsSection").hidden,false);
 assert.match(page.node("resultsCaption").textContent,/30 presupuesto/);
});
test("MVP177: no habilita resumen de cierre sin autorización o en ronda abierta",async()=>{
 for(const candidate of [
  {...allowed(),state:"waiting"},
  {...allowed(),state:"closed",can_open:false},
  {...allowed(),state:"cancelled"}
 ]){
  const page=await simulate([candidate]);
  assert.equal(page.node("resultsSection").hidden,true);
  assert.equal(page.node("resultsCaption").textContent,"");
 }
});
test("MVP177: revocar enlace también elimina el resumen de ofertas de cierre",async()=>{
 const page=await simulate([{...allowed(),state:"closed"}, {state:"not_found"}]);
 assert.equal(page.node("resultsSection").hidden,false);
 await page.refresh();
 assert.equal(page.node("resultsSection").hidden,true);
 assert.equal(page.node("resultsCaption").textContent,"");
 assert.equal(page.node("offers").children.length,0);
});
test("MVP177: contador no verificado jamás se presenta como cero recibidos",async()=>{
 const page=await simulate([{...allowed(),state:"closed",received_count:null}]);
 assert.match(page.node("resultsCaption").textContent,/total de recepciones sin acreditar/);
 assert.equal(page.node("count").textContent,"—");
});

const econ180=()=>({
 state:"economia_observada_sin_ranking",quotations:1,
 iva_not_informed:1,freight_not_informed:0,freight_to_agree:1,
 stock_unverified:1,payment_not_informed:0,net_unverified:1,
 delivery_unverified:1,minimum_unverified:1,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
});
test("MVP180 buyer: real source-backed gap counts, never final price or ranking",async()=>{
 const page=await simulate([{...allowed(),economy:econ180()}]);
 assert.equal(page.node("economySection").hidden,false);
 assert.equal(page.node("economyGrid").children.length,6);
 const labels=JSON.stringify(page.node("economyGrid").children.map(c=>c.children.map(n=>n.textContent)));
 assert.match(labels,/IVA no especificado/);
 assert.match(labels,/Flete a convenir/);
 assert.match(labels,/Disponibilidad sin acreditar/);
 assert.match(page.node("economyCaption").textContent,/no significan IVA cero/);
 assert.equal(page.node("offers").children.length,1);
 assert.doesNotMatch(labels,/puesto|ganador|descuento obligado/iu);
 assert.match(html,/id="economySection"/);
 assert.match(css,/\.economy-panel/);
});
test("MVP180 buyer: different candidate counts cannot be conflated",async()=>{
 for(const e of [
  {...econ180(),quotations:2},
  {...econ180(),freight_not_informed:1},
  {...econ180(),iva_not_informed:null},
  {...econ180(),ranking_allowed:true},
  {...econ180(),price_comparable:true},
  {...econ180(),contacts_revealed:true},
  {...econ180(),stock_unverified:2}
 ]){
  const page=await simulate([{...allowed(),economy:e}]);
  assert.equal(page.node("economySection").hidden,true,JSON.stringify(e));
  assert.equal(page.node("economyGrid").children.length,0);
 }
});
test("MVP180 buyer: no economic summary without valid source or authorization",async()=>{
 for(const d of [
  {...allowed(),economy:undefined},
  {...allowed(),can_open:false,economy:econ180()},
  {...allowed(),state:"cancelled",economy:econ180()},
  {...allowed(),state:"not_found",economy:econ180()}
 ]){
  const page=await simulate([d]);
  assert.equal(page.node("economySection").hidden,true);
 }
});
test("MVP180 buyer: revoke and network error wipe previously visible economic facts",async()=>{
 for(const next of [{state:"not_found"},{error:true}]){
  const page=await simulate([{...allowed(),economy:econ180()},next]);
  assert.equal(page.node("economySection").hidden,false);
  await page.refresh();
  assert.equal(page.node("economySection").hidden,true);
  assert.equal(page.node("economyGrid").children.length,0);
  assert.equal(page.node("economyCaption").textContent,"");
 }
});
