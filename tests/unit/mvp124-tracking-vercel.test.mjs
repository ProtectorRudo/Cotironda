import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler from '../../apps/seguimiento-piloto/api/status.js';

const html = readFileSync(new URL('../../apps/seguimiento-piloto/index.html',import.meta.url),'utf8');
const js = readFileSync(new URL('../../apps/seguimiento-piloto/app.js',import.meta.url),'utf8');
const config = JSON.parse(readFileSync(new URL('../../apps/seguimiento-piloto/vercel.json',import.meta.url),'utf8'));
const token = 'a'.repeat(64);

function response(){
 return {code:null,payload:null,headers:{},
  setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},
  status(n){this.code=n;return this;},
  json(value){this.payload=value;return this;}
 };
}
test('MVP124: dedicated HTML site, secure noindex and strict CSP',()=>{
 assert.match(html,/<!doctype html>/iu);
 assert.match(html,/<script src="\/app.js" defer><\/script>/u);
 assert.match(html,/<link rel="stylesheet" href="\/styles.css">/u);
 assert.match(html,/noindex,nofollow,noarchive/u);
 assert.doesNotMatch(html,/<script(?:\s|>)(?!src="\/app.js")/u);
 const headers=config.headers[0].headers;
 const get=(name)=>headers.find(h=>h.key===name)?.value;
 assert.match(get('Content-Security-Policy'),/script-src 'self'/u);
 assert.match(get('Content-Security-Policy'),/connect-src 'self'/u);
 assert.match(get('Referrer-Policy'),/no-referrer/u);
 assert.match(get('Cache-Control'),/no-store/u);
 assert.equal(config.rewrites.find(x=>x.source==='/seguimiento').destination,'/index.html');
});

test('MVP124: fragment token only in POST body, never in GET logs or DOM HTML',()=>{
 assert.match(js,/location\.hash\.slice\(1\)/u);
 assert.match(js,/fetch\('\/api\/status'/u);
 assert.match(js,/method: 'POST'/u);
 assert.match(js,/body: JSON\.stringify\(\{token\}\)/u);
 assert.match(js,/\.textContent/u);
 assert.doesNotMatch(js,/innerHTML|document\.write|localStorage|sessionStorage|sendBeacon|location\.search/u);
 assert.doesNotMatch(html,/https:\/\/|<iframe|<img /iu);
});

test('MVP124: block GET, unexpected keys and malformed tokens without upstream network',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('should not fetch')};
 try {
  for(const request of [
   {method:'GET'},
   {method:'POST',body:{token:'bad'}},
   {method:'POST',body:{token,extra:'unexpected'}},
   {method:'POST',body:{token:'b'.repeat(63)}},
   {method:'POST',body:null}
  ]){
   const res=response();
   await handler(request,res);
   assert.equal(res.code,request.method==='GET'?405:400);
   assert.match(res.headers['cache-control'],/no-store/u);
  }
 }finally{globalThis.fetch=old}
});

test('MVP124: server passes only reviewed anonymous projection',async()=>{
 const old=globalThis.fetch;
 let called=0;
 globalThis.fetch=async(url,opts)=>{
  called++;
  assert.match(url,/functions\/v1\/cotironda-piloto-seguimiento/u);
  assert.equal(opts.method,'POST');
  assert.deepEqual(JSON.parse(opts.body),{token});
  return new Response(JSON.stringify({state:'waiting',received_count:2,files_pending_review:1,
    deadline:'2026-11-07T10:17:00Z',can_open:false,
    offers:[{label:'PROVEEDOR SECRETO',text:'No aprobado'}],
    finalists:[{name:'Proveedor secreto',whatsapp:'NO REVELAR'}],
    original_source:'secreto',internal_state:'raw'}),{status:200});
 };
 try{
  const res=response();await handler({method:'POST',body:{token}},res);
  assert.equal(res.code,200);assert.equal(called,1);
  assert.deepEqual(res.payload.offers,[]);
  assert.deepEqual(res.payload.finalists,[]);
  assert.equal(res.payload.original_source,undefined);
  assert.equal(res.payload.received_count,2);
 }finally{globalThis.fetch=old}
});

test('MVP124: invalid private token returns not_found; no service credentials required',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({state:'not_found'}),{status:200});
 try{
  const res=response();await handler({method:'POST',body:{token}},res);
  assert.equal(res.code,200);assert.deepEqual(res.payload,{state:'not_found'});
 }finally{globalThis.fetch=old}
});

test('MVP124: anonymized reviewed offers and specifically released finalists only',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({state:'closed',
  received_count:2,files_pending_review:0,deadline:'2026-11-07T10:17:00Z',
  can_open:true,offers:[{label:'Oferta anónima A',text:'2 artículos'}],
  finalists:[{name:'Nombre autorizado',whatsapp:'5492210000000'}],
  unauthorized_extra:'should never be copied'}),{status:200});
 try{
  const res=response();await handler({method:'POST',body:{token}},res);
  assert.equal(res.code,200);
  assert.equal(res.payload.offers.length,1);
  assert.equal(res.payload.finalists.length,1);
  assert.equal(res.payload.unauthorized_extra,undefined);
 }finally{globalThis.fetch=old}
});
