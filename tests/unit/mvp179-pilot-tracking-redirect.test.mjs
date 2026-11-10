import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const edge=readFileSync(
 new URL("../../supabase/functions/cotironda-piloto-seguimiento/index.ts",import.meta.url),
 "utf8");
const frontend=readFileSync(
 new URL("../../piloto/seguimiento-web/site.js",import.meta.url),"utf8");
const proxy=readFileSync(
 new URL("../../piloto/seguimiento-web/api/estado.js",import.meta.url),"utf8");
const target="https://cotironda-seguimiento-vista-piloto-protector-rudo-s-projects.vercel.app/seguimiento";
const oldTarget="cotironda-seguimiento-vist-git-43f7cf-protector-rudo-s-projects.vercel.app";

test("MVP179/MVP212: GET redirect points at stable owned pilot PROJECT alias",()=>{
 assert.match(edge,/Location:DESTINO_SEGUIMIENTO_PILOTO_MVP212/u);
 assert.equal(edge.includes(oldTarget),false);
 const url=new URL(target);
 assert.equal(url.protocol,"https:");
 assert.equal(url.search,"");
 assert.equal(url.hash,"");
 assert.equal(url.pathname,"/seguimiento");
});
test("MVP179: GET never reads or forwards the buyer bearer token as query",()=>{
 const get=edge.indexOf("if(req.method==='GET')");
 const post=edge.indexOf("if(req.method!=='POST')");
 assert.ok(get>0&&post>get);
 const getCode=edge.slice(get,post);
 assert.match(getCode,/if\(new URL\(req\.url\)\.search\)/u);
 assert.match(getCode,/status:400/u);
 assert.match(getCode,/status:302/u);
 assert.match(getCode,/Location:/u);
 assert.doesNotMatch(getCode,/token|source_sha256|message_hmac|service_role/iu);
});
test("MVP179: POST stays at protected Edge; frontend uses same-origin proxy",()=>{
 assert.match(frontend,/window\.location\.hash\.slice\(1\)/u);
 assert.match(frontend,/fetch\("\/api\/estado",\{method:"POST"/u);
 assert.match(frontend,/credentials:"omit",cache:"no-store"/u);
 assert.match(proxy,/req\.method!=="POST"/u);
 assert.match(proxy,/redirect:"error"/u);
 assert.match(proxy,/body:JSON\.stringify\(\{token:d\.token\}\)/u);
});
test("MVP179: no original files or contact data are exposed by redirect",()=>{
 const get=edge.slice(edge.indexOf("if(req.method==='GET')"),edge.indexOf("if(req.method!=='POST')"));
 assert.equal(get.includes("original"),false);
 assert.equal(get.includes("contact"),false);
 assert.equal(get.includes("message_hmac"),false);
 assert.equal(get.includes("source_sha256"),false);
 assert.match(proxy,/if\(!opened\)return safe;/u);
});
