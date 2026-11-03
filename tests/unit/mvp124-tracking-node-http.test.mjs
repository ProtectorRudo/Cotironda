import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrackingServer} from '../../apps/seguimiento-piloto/server.js';

test('MVP124: fallback server renders real HTML on /seguimiento and serves assets with safe headers',async()=>{
 const server=createTrackingServer();
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 const port=server.address().port;
 const root='http://127.0.0.1:'+port;
 try{
  const html=await fetch(root+'/seguimiento');
  assert.equal(html.status,200);
  assert.match(html.headers.get('content-type'),/^text\/html/iu);
  assert.equal(html.headers.get('referrer-policy'),'no-referrer');
  assert.match(html.headers.get('content-security-policy'),/connect-src 'self'/u);
  assert.match(await html.text(),/Tus presupuestos, en un solo lugar/u);
  const js=await fetch(root+'/app.js');
  assert.equal(js.status,200);
  assert.match(js.headers.get('content-type'),/text\/javascript/u);
  const css=await fetch(root+'/styles.css');
  assert.equal(css.status,200);
  assert.match(css.headers.get('content-type'),/text\/css/u);
  const unknown=await fetch(root+'/.env');
  assert.equal(unknown.status,404);
  const urlQuery=await fetch(root+'/seguimiento?token=secret');
  assert.equal(urlQuery.status,400);
  const apiGet=await fetch(root+'/api/status');
  assert.equal(apiGet.status,405);
  const malformed=await fetch(root+'/api/status',{method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify({token:'invalid'})});
  assert.equal(malformed.status,400);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
