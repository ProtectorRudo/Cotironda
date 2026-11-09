import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {estadoRevisionComercialMvp326} from
 '../../src/domain/ia-central/estado-revision-comercial-mvp326.ts';

const base=()=>({
 state:'estado_comercial_sin_precios',vinculados:1,
 requieren_revision:1,en_proceso:0,verificados:0,
 precios_incluidos:false,identidades_reveladas:false,
 reproceso_automatico:false
});
const verified={received_count:1,files_pending_review:1,
 offers:[],rubros_ia:[]};
const web=readFileSync(new URL('../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
const proxy=readFileSync(new URL('../../piloto/seguimiento-web/api/estado.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-seguimiento/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../supabase/piloto/mvp326_estado_revision_comercial_comprador.sql',import.meta.url),'utf8');
const buyerView=vm.runInNewContext(proxy.slice(0,proxy.indexOf('export default'))+
 '\nbuyerView;',{}, {timeout:2000});
const response=(part=base())=>({
 state:'waiting',can_open:false,received_count:1,files_pending_review:1,
 deadline:'2026-11-11T11:27:22Z',estado_revision_ia:part
});
const reduce=(data)=>JSON.parse(JSON.stringify(buyerView(data)));

test('MVP326: source-bound status is accepted even before a verified offer',()=>{
 const x=estadoRevisionComercialMvp326(base(),verified);
 assert.deepEqual(x,base());
 const pub=reduce(response(x));
 assert.deepEqual(pub.estado_revision_ia,base());
 assert.equal(pub.can_open,false);
 assert.equal(pub.received_count,1);
 assert.equal(pub.files_pending_review,1);
});
test('MVP326: never expose reason, supplier, source, trace or economic content',()=>{
 const b={...base(),supplier:'Nahuel'};
 assert.equal(estadoRevisionComercialMvp326(b,verified),null);
 assert.equal(reduce(response(b)).estado_revision_ia,undefined);
 for(const key of ['source_hmac','reason_code','original_filename','money',
  'contact','raw_offer','price','model_response']){
  const bad={...base(),[key]:'SECRET'};
  assert.equal(reduce(response(bad)).estado_revision_ia,undefined);
 }
 assert.doesNotMatch(JSON.stringify(reduce(response())),/Nahuel|SECRET|reason|money|hmac/u);
});
test('MVP326: counts, flags and last-stage exclusivity are strictly validated',()=>{
 const cases=[
  {vinculados:2},{requieren_revision:2},{en_proceso:1},
  {verificados:1},{vinculados:-1},{requieren_revision:1.5},
  {verificados:'0'},{vinculados:26},{identidades_reveladas:true},
  {precios_incluidos:true},{reproceso_automatico:true},
  {state:'other'}, {requieren_revision:NaN}
 ];
 for(const patch of cases){
  const b={...base(),...patch};
  assert.equal(estadoRevisionComercialMvp326(b,verified),null,JSON.stringify(patch));
  assert.equal(reduce(response(b)).estado_revision_ia,undefined);
 }
});
test('MVP326: parsed response requires a real buyer count, never revives revoked or cancelled',()=>{
 for(const data of [
  {...response(),state:'not_found'},
  {...response(),state:'cancelled'},
  {...response(),received_count:0},
  {...response(),received_count:null},
  {...response(),estado_revision_ia:{...base(),verificados:1}}
 ]){
  assert.equal(reduce(data)?.estado_revision_ia,undefined);
 }
 assert.equal(reduce({...response(),state:'closed'}).estado_revision_ia.requieren_revision,1);
});
test('MVP326: Edge queries only independently token-gated, service_role-only RPC',()=>{
 assert.match(edge,/db\.rpc\('cotironda_piloto_ia_review_status_mvp326',\{\s*p_token_hash:digest/u);
 assert.match(edge,/estadoRevisionComercialMvp326\(status\.data,safe\)/u);
 assert.match(edge,/estado_revision_ia:reduced/u);
 assert.match(sql,/SECURITY DEFINER/u);
 assert.match(sql,/t\.revoked_at IS NULL/u);
 assert.match(sql,/buyer\.opted_out_at IS NULL/u);
 assert.match(sql,/l\.plaintext_sha256=l\.source_sha256/u);
 assert.match(sql,/d\.state='api_accepted'/u);
 assert.match(sql,/r\.finished_at IS NOT NULL/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION/u);
 assert.match(sql,/TO service_role/u);
 assert.doesNotMatch(sql,/\bUPDATE\b|\bDELETE FROM\b|\bINSERT INTO\b|\bTRUNCATE\b/u);
 assert.doesNotMatch(sql,/https:|fetch\(|OpenAI|WHAPI_SEND|sendTextMessage/u);
});
class Node{
 constructor(tag='div'){this.tagName=tag;this.children=[];
  this.textContent='';this.hidden=false;this.className='';}
 append(...v){this.children.push(...v)}
 appendChild(n){this.children.push(n);return n}
 replaceChildren(...v){this.children=[...v]}
 setAttribute(){}
}
function browser(){
 const nodes=new Map();
 const context={
  window:{location:{hash:''},addEventListener(){}},
  document:{createElement(tag){return new Node(tag)},
   getElementById(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)}},
  setInterval(){throw Error('no background polling in test')},
  fetch(){throw Error('no HTTP in test')},
  console:{log(){},warn(){},error(){}}
 };
 const run=vm.runInNewContext(web+'\n({render,clearPrivateView});',context,{timeout:3000});
 const visible=x=>typeof x==='string'?x:
  [x.textContent,...x.children.map(visible)].join(' ');
 return {run,nodes,visible};
}
test('MVP326: actual buyer screenshot case renders terminal review, NOT in-progress',()=>{
 const b=browser();const data=reduce(response());
 b.run.render(data);
 assert.match(b.nodes.get('state').textContent,/revisión comercial necesaria/u);
 assert.match(b.nodes.get('files').textContent,/fue analizada/u);
 assert.equal(b.nodes.get('receipts').children.length,1);
 const card=b.visible(b.nodes.get('receipts'));
 assert.match(card,/Respuesta procesada · revisión comercial necesaria/u);
 assert.match(card,/no pudo acreditar sus importes/u);
 assert.doesNotMatch(card,/Esperando verificación de su contenido|proceso en curso|Nahuel|\$[0-9]/u);
});
test('MVP326: processing vs terminal review, mixed old/new coverage, and clean revocation',()=>{
 const b=browser();
 const inFlight={...base(),requieren_revision:0,en_proceso:1};
 b.run.render(reduce(response(inFlight)));
 assert.match(b.visible(b.nodes.get('receipts')),/procesamiento en curso/u);
 assert.doesNotMatch(b.visible(b.nodes.get('receipts')),/Respuesta procesada/u);
 const both={...base(),vinculados:2,requieren_revision:1,en_proceso:1};
 const d={...response(both),received_count:2};
 b.run.render(reduce(d));
 assert.equal(b.nodes.get('receipts').children.length,2);
 b.run.render({state:'not_found'});
 assert.equal(b.nodes.get('receipts').children.length,0);
 assert.match(b.nodes.get('state').textContent,/vencido o revocado/u);
 assert.equal(b.nodes.get('files').textContent,'');
});
test('MVP326: legacy payload without new SQL remains supported',()=>{
 const b=browser();const old=reduce(response());
 delete old.estado_revision_ia;
 b.run.render(old);
 assert.match(b.nodes.get('state').textContent,/esperando presupuestos verificados/u);
 assert.match(b.visible(b.nodes.get('receipts')),/Respuesta registrada sin precios verificados/u);
});
