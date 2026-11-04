import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const path=new URL("../../piloto/seguimiento-web/api/estado.js",import.meta.url);
const script=readFileSync(path,"utf8").replace("export default async function handler","async function handler");
const token="a".repeat(64);
const coverage={
 state:"cobertura_revisada",quotations:2,requested_items:3,comparisons:6,
 commercial_alternatives:4,packaging_unproven:1,not_evaluated:1,
 explicit_differences:0,technical_uncertainty:0,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
};
function sample(){
 return {state:"waiting",can_open:true,received_count:2,files_pending_review:0,
  deadline:"2026-11-10T18:00:00Z",
  offers:[{label:"Presupuesto 1",text:"Una oferta original sin cambios"}],
  coverage};
}
function harness(reply=sample()){
 const calls=[];
 const context={
  AbortSignal,
  fetch:async(url,opts)=>{
   calls.push({url,method:opts.method,redirect:opts.redirect,
    body:JSON.parse(opts.body)});
   if(reply instanceof Error)throw reply;
   return {ok:true,text:async()=>JSON.stringify(reply)};
  }
 };
 vm.runInNewContext(script+"\nthis.proxyHandler=handler;",context,{timeout:1000});
 async function invoke({method="POST",body={token},
  headers={"content-type":"application/json"}}={}){
  const result={statusCode:200,headers:{},payload:undefined,ended:false};
  const res={
   setHeader(k,v){result.headers[k]=v;return res;},
   status(n){result.statusCode=n;return res;},
   end(){result.ended=true;return res;},
   json(v){result.payload=JSON.parse(JSON.stringify(v));return res;}
  };
  await context.proxyHandler({method,body,headers},res);
  return result;
 }
 return {calls,invoke};
}
test("MVP176 proxy: minimizes the private envelope without touching offer text",async()=>{
 const incoming=sample();
 incoming.source_hmac="secret_hash";
 incoming.customer_phone="+549000";
 incoming.offers[0].supplier_phone="+549111";
 incoming.coverage={...coverage,private_supplier_id:"secret_id"};
 incoming.finalists=[{name:"Forbidden",whatsapp:"+549222"}];
 const h=harness(incoming),r=await h.invoke();
 assert.equal(r.statusCode,200);
 assert.deepEqual(Object.keys(r.payload).sort(),[
  "state","can_open","received_count","files_pending_review","deadline",
  "offers","coverage"
 ].sort());
 assert.deepEqual(r.payload.offers,[{label:"Presupuesto 1",
   text:"Una oferta original sin cambios"}]);
 assert.equal(r.payload.coverage.private_supplier_id,undefined);
 assert.doesNotMatch(JSON.stringify(r.payload),/secret_hash|secret_id|\+549/);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].body.token,token);
 assert.match(h.calls[0].url,/cotironda-piloto-seguimiento$/);
 assert.equal(h.calls[0].redirect,"error");
 assert.match(r.headers["Cache-Control"],/no-store/);
});
test("MVP176 proxy: no opening permission means no quotes or contacts",async()=>{
 const h=harness({...sample(),can_open:false,
  finalists:[{name:"Private",whatsapp:"+549999"}]});
 const r=await h.invoke();
 assert.equal(r.statusCode,200);
 assert.equal(r.payload.can_open,false);
 assert.equal(r.payload.offers,undefined);
 assert.equal(r.payload.coverage,undefined);
 assert.equal(r.payload.finalists,undefined);
});
test("MVP176 proxy: revoked or cancelled state clears the whole envelope",async()=>{
 for(const state of ["not_found","cancelled"]){
  const h=harness({...sample(),state,private:"hidden"}),r=await h.invoke();
  assert.equal(r.statusCode,200);
  assert.deepEqual(r.payload,state==="not_found"?
   {state:"not_found"}:{state:"cancelled",can_open:false});
 }
});
test("MVP176 proxy: closed and authorized finalists reveal only intended fields",async()=>{
 const h=harness({...sample(),state:"closed",
  finalists:[{name:"Habilitado",whatsapp:"+5491123456789",cuit:"secret_cuit"}],
  joint_supplier_coverage:true});
 const r=await h.invoke();
 assert.equal(r.statusCode,200);
 assert.deepEqual(r.payload.finalists,
  [{name:"Habilitado",whatsapp:"+5491123456789"}]);
 assert.equal(r.payload.joint_supplier_coverage,true);
 assert.doesNotMatch(JSON.stringify(r.payload),/secret_cuit/);
});
test("MVP176 proxy: malformed offer is rejected rather than forwarded",async()=>{
 const h=harness({...sample(),offers:[{label:"X",text:42,extra:"private"}]});
 const r=await h.invoke();
 assert.equal(r.statusCode,502);
 assert.deepEqual(r.payload,{state:"unavailable"});
});
test("MVP176 proxy: invalid method, JSON type or token never reaches Edge",async()=>{
 const h=harness();
 assert.equal((await h.invoke({method:"GET"})).statusCode,405);
 assert.equal((await h.invoke({headers:{"content-type":"text/plain"}})).statusCode,415);
 assert.equal((await h.invoke({body:{token:"x"}})).statusCode,400);
 assert.equal((await h.invoke({body:{token,extra:"x"}})).statusCode,400);
 assert.equal(h.calls.length,0);
});
test("MVP176 proxy: upstream outage returns only a generic error",async()=>{
 const h=harness(new Error("offline")),r=await h.invoke();
 assert.equal(r.statusCode,502);
 assert.deepEqual(r.payload,{state:"unavailable"});
 assert.equal(JSON.stringify(r.payload).includes(token),false);
});

const economy180=()=>({
 state:"economia_observada_sin_ranking",quotations:1,
 iva_not_informed:1,freight_not_informed:0,freight_to_agree:1,
 stock_unverified:1,payment_not_informed:0,net_unverified:1,
 delivery_unverified:1,minimum_unverified:1,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
});
test("MVP180 proxy: only economic counts reach buyer, never source or identity",async()=>{
 const data=sample();
 data.economy={...economy180(),supplier_phone:"+5491112345678",
   message_hmac:"secret",price_cents:"999999999",other:"source"};
 const h=harness(data),r=await h.invoke();
 assert.equal(r.statusCode,200);
 assert.deepEqual(r.payload.economy,economy180());
 assert.doesNotMatch(JSON.stringify(r.payload),/supplier_phone|message_hmac|price_cents|999999999|\+54911/);
 assert.equal(r.payload.offers[0].text,data.offers[0].text);
});
test("MVP180 proxy: suppress unauthorized, cancelled, mismatched or fabricated economics",async()=>{
 for(const candidate of [
  {...sample(),can_open:false,economy:economy180()},
  {...sample(),state:"cancelled",economy:economy180()},
  {...sample(),economy:{...economy180(),quotations:2}},
  {...sample(),economy:{...economy180(),freight_not_informed:1}},
  {...sample(),economy:{...economy180(),stock_unverified:null}},
  {...sample(),economy:{...economy180(),ranking_allowed:true}}
 ]){
  const h=harness(candidate),r=await h.invoke();
  assert.equal(r.payload.economy,undefined,JSON.stringify(candidate));
 }
});
test("MVP180 proxy: null counts are never turned into verified zero",async()=>{
 const h=harness({...sample(),received_count:null,files_pending_review:null});
 const r=await h.invoke();
 assert.equal(r.statusCode,200);
 assert.equal(r.payload.received_count,undefined);
 assert.equal(r.payload.files_pending_review,undefined);
});
