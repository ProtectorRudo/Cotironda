import assert from 'node:assert/strict';

const ORIGIN='https://cotironda-seguimiento-vist-git-147a4e-protector-rudo-s-projects.vercel.app';
const LEGACY='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-seguimiento';
const get=async(url,init={})=>fetch(url,{
  redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000),...init
});

async function check(){
  // No secret tracking token is used in any real HTTP smoke request.
  const page=await get(ORIGIN+'/seguimiento');
  assert.equal(page.status,200,'Vercel must serve the preview page over HTTPS');
  assert.match(page.headers.get('content-type')??'',/text\/html/i);
  assert.match(page.headers.get('cache-control')??'',/no-store/i);
  assert.match(page.headers.get('content-security-policy')??'',/script-src 'self'/i);
  assert.equal(page.headers.get('referrer-policy'),'no-referrer');
  const html=await page.text();
  assert.match(html,/<title>Cotironda · Seguimiento de cotizaciones<\/title>/u);
  assert.match(html,/id="offers"/u);
  assert.match(html,/id="count"/u);
  assert.doesNotMatch(html,/sk-[A-Za-z0-9_-]{16}|service_role/iu);

  const js=await get(ORIGIN+'/site.js');
  assert.equal(js.status,200);
  const code=await js.text();
  assert.match(code,/window\.location\.hash\.slice\(1\)/u);
  assert.match(code,/fetch\("\/api\/estado"/u);
  assert.doesNotMatch(code,/innerHTML|localStorage|document\.cookie/u);

  const apiGet=await get(ORIGIN+'/api/estado');
  assert.equal(apiGet.status,405,'the buyer JSON proxy must not serve GET');

  const apiBad=await get(ORIGIN+'/api/estado',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({token:'invalid'})
  });
  assert.equal(apiBad.status,400,'invalid/short tokens cannot reach Supabase');

  const fromWhatsapp=await get(LEGACY);
  assert.equal(fromWhatsapp.status,302,'old WhatsApp link must redirect');
  assert.equal(fromWhatsapp.headers.get('location'),ORIGIN+'/seguimiento');
  assert.match(fromWhatsapp.headers.get('cache-control')??'',/no-store/i);
  assert.ok(!(fromWhatsapp.headers.get('location')??'').includes('#'),
    'bearer must stay only in browser fragment');

  console.log('PILOT HTTP SMOKE PASS: HTTPS HTML, CSP, JS, API 400/405, legacy 302. No tokens used.');
}
await check();
