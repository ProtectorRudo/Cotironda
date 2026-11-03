import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../site/',import.meta.url);
const file=(name)=>readFileSync(new URL(name,root),'utf8');
const html=file('seguimiento/index.html');
const script=file('seguimiento/app.js');
const css=file('seguimiento/styles.css');
const rules=JSON.parse(file('vercel.json'));

test('MVP125: cotironda.com serves a distinct real HTML tracking page, not an unrelated pilot hostname',()=>{
 assert.match(html,/<!doctype html>/iu);
 assert.match(html,/<title>Cotironda · Seguimiento privado<\/title>/u);
 assert.match(html,/href="\/seguimiento\/styles.css"/u);
 assert.match(html,/src="\/seguimiento\/app.js"/u);
 assert.ok(css.length>3000);
 assert.doesNotMatch(html,/<iframe|https:\/\/.*\.vercel\.app/iu);
 assert.equal(rules.rewrites.find(x=>x.source==='/seguimiento')?.destination,'/seguimiento/index.html');
});

test('MVP125: secure same-origin proxy maps only tracking status to isolated pilot Supabase',()=>{
 const api=rules.rewrites.find(x=>x.source==='/api/seguimiento');
 assert.equal(api?.destination,
  'https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-seguimiento');
 assert.equal(rules.rewrites.length,2);
 assert.match(script,/fetch\('\/api\/seguimiento'/u);
 assert.match(script,/location\.hash\.slice\(1\)/u);
 assert.match(script,/method: 'POST'/u);
 assert.match(script,/body: JSON\.stringify\(\{token\}\)/u);
 assert.doesNotMatch(html+script,/SUPABASE_SERVICE_ROLE_KEY|COTIRONDA_PILOT_AES_HEX|document\.write|innerHTML|sessionStorage|localStorage/u);
 assert.doesNotMatch(script,/location\.search|fetch\('https:\/\/|sendBeacon|XMLHttpRequest/u);
});

test('MVP125: no indexing, no cache, no credentials, strict CSP on all tracking assets',()=>{
 const h=rules.headers.find(x=>x.source==='/seguimiento/:path*');
 assert.ok(h);
 const val=(key)=>h.headers.find(x=>x.key===key)?.value;
 assert.match(val('Cache-Control'),/no-store/u);
 assert.equal(val('Referrer-Policy'),'no-referrer');
 assert.equal(val('X-Content-Type-Options'),'nosniff');
 assert.match(val('X-Robots-Tag'),/noindex/u);
 assert.match(val('Content-Security-Policy'),/default-src 'none'/u);
 assert.match(val('Content-Security-Policy'),/connect-src 'self'/u);
 assert.match(val('Content-Security-Policy'),/script-src 'self'/u);
 assert.doesNotMatch(val('Content-Security-Policy'),/unsafe-inline/u);
 const api=rules.headers.find(x=>x.source==='/api/seguimiento');
 assert.ok(api);
 assert.match(api.headers.find(x=>x.key==='Cache-Control')?.value,/no-store/u);
});

test('MVP125: anonymity is preserved even if backend returns unapproved offers',()=>{
 assert.match(script,/data\.can_open === true && Array\.isArray\(data\.offers\)/u);
 assert.match(script,/data\.state === 'closed' && Array\.isArray\(data\.finalists\)/u);
 assert.match(script,/\.textContent/u);
 assert.match(script,/Math\.min\(count, 25\)/u);
 assert.match(script,/setInterval\(/u);
});

test('MVP125: domain homepage stays unchanged and contains no login or form pretending to work',()=>{
 const homepage=file('index.html');
 assert.match(homepage,/VISTA PRELIMINAR/u);
 assert.match(homepage,/No admite licitaciones/u);
 assert.doesNotMatch(homepage,/<form\b/iu);
});
