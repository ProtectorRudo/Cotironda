import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crearEnlacePrivadoSeguimientoMvp212 as build,DESTINO_SEGUIMIENTO_PILOTO_MVP212 as site} from
 '../../src/domain/enlace-seguimiento-piloto-mvp212.ts';

const file=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const whapi=file('supabase/functions/cotironda-piloto-whapi/index.ts');
const edge=file('supabase/functions/cotironda-piloto-seguimiento/index.ts');
const browser=file('piloto/seguimiento-web/site.js');
const proxy=file('piloto/seguimiento-web/api/estado.js');
const routes=JSON.parse(file('piloto/seguimiento-web/vercel.json'));
const token='0123456789abcdef'.repeat(4);

test('MVP212: WhatsApp abre DIRECTO el alias estable Vercel, no una Edge JSON o preview efímera',()=>{
 const link=build(token);
 assert.equal(link,site+'#'+token);
 const parsed=new URL(link);
 assert.equal(parsed.protocol,'https:');
 assert.equal(parsed.hostname,'cotironda-seguimiento-vista-piloto-protector-rudo-s-projects.vercel.app');
 assert.equal(parsed.pathname,'/seguimiento');
 assert.equal(parsed.search,'');
 assert.equal(parsed.hash,'#'+token);
 assert.equal(parsed.username,'');
 assert.equal(parsed.password,'');
 assert.doesNotMatch(link,/supabase\.co|boqnfg2gk|iwcpjiqao/);
 assert.match(whapi,/crearEnlacePrivadoSeguimientoMvp212\(token\)/);
 assert.match(whapi,/cotironda_piloto_issue_tracking_mvp091/);
 assert.match(whapi,/if\(issue\.data\?\.state==='issued'\)/);
 assert.match(whapi,/cotironda_piloto_finish_tracking_mvp091/);
 assert.equal(routes.rewrites.find(x=>x.source==='/seguimiento')?.destination,'/index.html');
});

test('MVP212: no aceptar token nulo, query, JWT, URL arbitraria ni caracteres de control',()=>{
 const invalid=[
 null,undefined,0,'',token.toUpperCase(),token+'a',token.slice(1),
 token+'\n',token+'?redirect=https://evil.test',token+'%23',
 'https://evil.test/#'+token,'JWT.'+token,'a'.repeat(1024)
 ];
 for(const candidate of invalid)assert.equal(build(candidate),null,String(candidate));
});

test('MVP212: misma URL pública para la redirección LEGACY, sin leer ni reenviar token en GET',()=>{
 assert.match(edge,/DESTINO_SEGUIMIENTO_PILOTO_MVP212/);
 assert.doesNotMatch(edge,/Location:'https:\/\/cotironda-seguimiento-vista-piloto-boqnfg2gk/);
 const get=edge.slice(edge.indexOf("if(req.method==='GET')"),
  edge.indexOf("if(req.method!=='POST')"));
 assert.match(get,/if\(new URL\(req\.url\)\.search\)/);
 assert.match(get,/status:400/);
 assert.match(get,/status:302/);
 assert.match(get,/Location:DESTINO_SEGUIMIENTO_PILOTO_MVP212/);
 assert.doesNotMatch(get,/service_role|source_sha256|buyer_token_hash|request_id|original|contact/);
 assert.equal(build(token).slice(0,-65),site);
});

test('MVP212: la vista nunca recibe token de buyer como query ni lo filtra en Referer',()=>{
 assert.match(browser,/window\.location\.hash\.slice\(1\)/);
 assert.match(browser,/^[\s\S]*fetch\("\/api\/estado",\{method:"POST"/);
 assert.match(browser,/credentials:"omit",cache:"no-store"/);
 assert.doesNotMatch(browser,/location\.search|URLSearchParams|localStorage|sessionStorage/);
 assert.match(proxy,/body:JSON\.stringify\(\{token:d\.token\}\)/);
 assert.match(proxy,/redirect:"error"/);
 assert.match(file('piloto/seguimiento-web/vercel.json'),/Referrer-Policy/);
 assert.match(file('piloto/seguimiento-web/vercel.json'),/no-referrer/);
});

test('MVP212: emisión es una vez por fuente; replay no genera nuevo mensaje',()=>{
 const issued=whapi.indexOf("const issue=await db.rpc('cotironda_piloto_issue_tracking_mvp091'");
 const state=whapi.indexOf("if(issue.data?.state==='issued')",issued);
 const link=whapi.indexOf("const link=crearEnlacePrivadoSeguimientoMvp212(token)",state);
 const send=whapi.indexOf("fetch('https://gate.whapi.cloud/messages/text'",link);
 const finish=whapi.indexOf("const finish=await db.rpc('cotironda_piloto_finish_tracking_mvp091'",send);
 assert.ok(issued>0&&state>issued&&link>state&&send>link&&finish>send);
 assert.match(whapi,/accepted\?'api_accepted':'uncertain'/);
 assert.match(whapi,/No automatic retry: unknown Whapi delivery is not safe to duplicate/);
 assert.doesNotMatch(whapi,/new URL\(link\)\.searchParams/);
});
