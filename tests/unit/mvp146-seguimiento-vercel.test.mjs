import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import handler from "../../piloto/seguimiento-web/api/estado.js";
const root=new URL("../../piloto/seguimiento-web/",import.meta.url);
function fakeReq(method="POST",body={token:"a".repeat(64)},type="application/json"){
  return {method,body,headers:{"content-type":type}};
}
function fakeRes(){
  return {code:200,headers:{},payload:undefined,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(n){this.code=n;return this;},
    end(){return this;},
    json(v){this.payload=v;return this;}};
}
test("MVP146: valid token is proxied once without leaking in URL or headers",async()=>{
  const old=globalThis.fetch;let called=0;
  try{globalThis.fetch=async(url,opts)=>{
    called++;assert.equal(opts.method,"POST");
    assert.equal(new URL(url).search,"");assert.equal(new URL(url).hash,"");
    assert.deepEqual(JSON.parse(opts.body),{token:"a".repeat(64)});
    assert.equal(opts.redirect,"error");
    return {ok:true,text:async()=>JSON.stringify({state:"waiting",received_count:2,files_pending_review:0,can_open:true,offers:[{label:"Presupuesto 1",text:"Total 220250"}]})};
  };
  const res=fakeRes();await handler(fakeReq(),res);
  assert.equal(called,1);assert.equal(res.code,200);assert.equal(res.payload.offers.length,1);
  assert.match(res.headers["Cache-Control"],/no-store/);
  }finally{globalThis.fetch=old;}
});
test("MVP146: malformed input and wrong method never contact Supabase",async()=>{
  const old=globalThis.fetch;globalThis.fetch=()=>{throw Error("unexpected fetch");};
  try{for(const [req,status] of [[fakeReq("GET"),405],[fakeReq("POST",{token:"abc"}),400],[fakeReq("POST",{token:"a".repeat(64),extra:true}),400],[fakeReq("POST",{token:"a".repeat(64)},"text/plain"),415]]){
    const res=fakeRes();await handler(req,res);assert.equal(res.code,status);
  }}finally{globalThis.fetch=old;}
});
test("MVP146: backend outage fails closed and no contents are sent",async()=>{
  const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error("private upstream error");};
  try{const res=fakeRes();await handler(fakeReq(),res);assert.equal(res.code,502);assert.deepEqual(res.payload,{state:"unavailable"});}finally{globalThis.fetch=old;}
});
test("MVP146: static pilot page is CSP constrained; no token in GET URLs",()=>{
  const html=readFileSync(new URL("index.html",root),"utf8");
  const js=readFileSync(new URL("site.js",root),"utf8");
  const vercel=JSON.parse(readFileSync(new URL("vercel.json",root),"utf8"));
  assert.match(html,/charset="utf-8"/);
  assert.match(js,/window\.location\.hash\.slice\(1\)/);
  assert.match(js,/textContent/);
  assert.doesNotMatch(js,/innerHTML|location\.search|localStorage|document\.cookie/);
  assert.deepEqual(vercel.rewrites,[{source:"/seguimiento",destination:"/index.html"}]);
  assert.match(vercel.headers[0].headers.find(x=>x.key==="Content-Security-Policy").value,/script-src 'self'/);
});
test("MVP179: legacy buyer link redirects to verified pilot Preview without a token in Location",()=>{
  const src=readFileSync(new URL("../../supabase/functions/cotironda-piloto-seguimiento/index.ts",import.meta.url),"utf8");
  assert.match(src,/status:302/);
  assert.match(src,/Location:DESTINO_SEGUIMIENTO_PILOTO_MVP212/);
   assert.match(src,/enlace-seguimiento-piloto-mvp212/);
  assert.ok(!src.includes('https://cotironda-seguimiento-vista-piloto.vercel.app/seguimiento'));
  assert.doesNotMatch(src,/Location:[^\n]*#\$\{/);
  assert.match(src,/if\(req\.method!==\x27POST\x27\)/);
});
