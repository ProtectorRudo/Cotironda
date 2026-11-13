import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolverTextoPrivadoV2}
 from '../../supabase/functions/cotironda-piloto-v2-text-reader/text-core.ts';
import {leerTextoOriginalPorEdgeV2}
 from '../../src/server/v2-15-texto-edge-client.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const requestId='aaaaaaaa-1111-4111-8111-111111111111';
const documentId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sub='11111111-1111-4111-8111-111111111111';
const session='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const text='10 bolsas de cemento: $82.000 total. Transferencia: consultar. Flete no informado. IVA no informado.';
const bytes=new TextEncoder().encode(text);
const sha=createHash('sha256').update(bytes).digest('hex');
const aesHex='41'.repeat(32);
const shared='segregated_broker_shared_secret_only_for_pilot_xxxx';
const hmac='c'.repeat(64),chat='d'.repeat(64);
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt=(p={})=>{
 const now=Math.floor(Date.now()/1000);
 return enc({alg:'HS256',typ:'JWT'})+'.'+enc({
  iss:PILOT+'/auth/v1',aud:'authenticated',role:'authenticated',
  sub,session_id:session,exp:now+3600,...p
 })+'.'+'x'.repeat(64);
};
const buyer={id:sub,phone:'5491123456789',
 phone_confirmed_at:'2026-11-12T14:00:00Z',is_anonymous:false};
const config={
 enabled:true,url:PILOT,sharedSecret:shared,aesHex
};
const env={
 COTIRONDA_PILOT_SUPABASE_URL:PILOT,
 COTIRONDA_PILOT_V2_TEXT_ENABLED:'true',
 COTIRONDA_PILOT_V2_TEXT_SHARED_SECRET:shared
};
let source;
async function createSource(){
 const iv=Uint8Array.from({length:12},(_,i)=>i+3);
 const key=await crypto.subtle.importKey('raw',Buffer.from(aesHex,'hex'),
  'AES-GCM',false,['encrypt']);
 const encrypted=await crypto.subtle.encrypt({
  name:'AES-GCM',iv,tagLength:128,
  additionalData:new TextEncoder().encode(chat+'|'+hmac+'|text')
 },key,bytes);
 source={
  state:'authorized_text_v2',requestId,documentId,buyerKey:'buyer_a',
  supplierKey:'supplier_a',messageHmac:hmac,chatHmac:chat,
  nonceB64:Buffer.from(iv).toString('base64'),
  ciphertextB64:Buffer.from(encrypted).toString('base64'),
  mime:'text/plain',sha256:sha,consentAt:1000,invitedAt:3000
 };
 return source;
}
const ports=(overrides={})=>({
 getUser:async()=>buyer,
 source:async()=>source,
 ...overrides
});
const send=(token=jwt(),inner=shared,body={requestId,documentId})=>new Request(
 PILOT+'/functions/v1/cotironda-piloto-v2-text-reader',{
 method:'POST',headers:{
  Authorization:'Bearer '+token,'X-Cotironda-Text-Internal':inner,
  'Content-Type':'application/json'
 },body:JSON.stringify(body)
});

test('V2-15: Edge con dos factores entrega bytes idénticos y revalida Auth y SQL',async()=>{
 await createSource();
 let users=0,sources=0;
 const allowed=ports({
  getUser:async()=>{users++;return buyer},
  source:async q=>{sources++;
   assert.deepEqual(q,{requestId,documentId,authUserId:sub,authSessionId:session});
   return source;
  }
 });
 const res=await resolverTextoPrivadoV2(send(),config,allowed);
 assert.equal(res.status,200);
 assert.equal(res.headers.get('x-original-sha256'),sha);
 assert.equal(res.headers.get('content-type'),'application/octet-stream');
 assert.match(res.headers.get('cache-control'),/no-store/u);
 assert.deepEqual(Buffer.from(await res.arrayBuffer()),Buffer.from(bytes));
 assert.equal(users,2);assert.equal(sources,2);
});

test('V2-15: Node usa broker Edge, nunca recibe AES ni ciphertext del cliente',async()=>{
 await createSource();
 let called=0;
 const fetched=async (url,init)=>{
  called++;
  assert.equal(url,PILOT+'/functions/v1/cotironda-piloto-v2-text-reader');
  assert.equal(init.headers['X-Cotironda-Text-Internal'],shared);
  assert.ok(!init.body.includes('ciphertextB64'));
  assert.ok(!init.body.includes('aesHex'));
  assert.deepEqual(JSON.parse(init.body),{requestId,documentId});
  return resolverTextoPrivadoV2(new Request(url,init),config,ports());
 };
 const original=await leerTextoOriginalPorEdgeV2(source,jwt(),env,fetched);
 assert.deepEqual(Buffer.from(original),Buffer.from(bytes));
 assert.equal(called,1);
});

test('V2-15: secretos ausentes/incorrectos y flag OFF niegan antes de datos',async()=>{
 await createSource();
 for(const change of [
  {enabled:false},{url:'https://otro.supabase.co'},
  {sharedSecret:'short'},{aesHex:'0'.repeat(64)}
 ]){
  let calls=0;
  const blocked=await resolverTextoPrivadoV2(send(),{
   ...config,...change
  },ports({
   getUser:async()=>{calls++;return buyer},
   source:async()=>{calls++;return source}
  }));
  assert.notEqual(blocked.status,200);
  assert.equal(calls,0);
 }
 for(const variant of ['',undefined,'0'.repeat(42)]){
  let called=0;
  const r=await leerTextoOriginalPorEdgeV2(source,jwt(),{
   ...env,COTIRONDA_PILOT_V2_TEXT_SHARED_SECRET:variant
  },async()=>{called++;return new Response('wrong')});
  assert.equal(r,null);assert.equal(called,0);
 }
 assert.equal(await leerTextoOriginalPorEdgeV2(source,jwt(),{
  ...env,COTIRONDA_PILOT_V2_TEXT_ENABLED:'false'
 }),null);
 let called=0;
 const blocked=await resolverTextoPrivadoV2(send(jwt(),'wrong'),config,ports({
  getUser:async()=>{called++;return buyer}
 }));
 assert.equal(blocked.status,404);assert.equal(called,0);
});

test('V2-15: buyer ajeno, sesión malformada o vencida no llegan al texto',async()=>{
 await createSource();
 for(const buyerChange of [
  null,{...buyer,is_anonymous:true},{...buyer,phone_confirmed_at:null},
  {...buyer,id:'22222222-2222-4222-8222-222222222222'}
 ]){
  let sourceCalls=0;
  const result=await resolverTextoPrivadoV2(send(),config,ports({
   getUser:async()=>buyerChange,
   source:async()=>{sourceCalls++;return source}
  }));
  assert.equal(result.status,404);assert.equal(sourceCalls,0);
 }
 for(const token of [
  jwt({exp:1}),jwt({role:'anon'}),jwt({session_id:'bad'}),
  jwt({iss:'https://otro.supabase.co/auth/v1'}),jwt({aud:'wrong'})
 ]){
  let sourceCalls=0;
  const res=await resolverTextoPrivadoV2(send(token),config,ports({
   source:async()=>{sourceCalls++;return source}
  }));
  assert.equal(res.status,404);assert.equal(sourceCalls,0);
 }
});

test('V2-15: SHA/AAD/tag manipulados y revocación entre consultas nunca entregan bytes',async()=>{
 await createSource();
 for(const change of [
  {sha256:'0'.repeat(64)},
  {chatHmac:'1'.repeat(64)},
  {messageHmac:'2'.repeat(64)},
  {nonceB64:Buffer.alloc(12,8).toString('base64')},
  {ciphertextB64:source.ciphertextB64.slice(0,-4)+'AAAA'}
 ]){
  const res=await resolverTextoPrivadoV2(send(),config,ports({
   source:async()=>({...source,...change})
  }));
  assert.notEqual(res.status,200);
 }
 let sourceCalls=0;
 const revoked=await resolverTextoPrivadoV2(send(),config,ports({
  source:async()=>{
   sourceCalls++;return sourceCalls===1?source:null;
  }
 }));
 assert.equal(revoked.status,404);assert.equal(sourceCalls,2);
});

test('V2-15: browser no puede invocar sin secreto; no CORS ni GET ni datos arbitrarios',async()=>{
 await createSource();
 for(const req of [
  send(jwt(),'wrong'),new Request(PILOT+'/functions/v1/cotironda-piloto-v2-text-reader'),
  send(jwt(),shared,{requestId,documentId:'../private'}),
  send(jwt(),shared,{requestId,documentId,extra:true}),
  new Request(PILOT+'/functions/v1/cotironda-piloto-v2-text-reader?x=1',{
   method:'POST',headers:{Authorization:'Bearer '+jwt(),
    'X-Cotironda-Text-Internal':shared,'Content-Type':'application/json'},
   body:JSON.stringify({requestId,documentId})
  })
 ]){
  const res=await resolverTextoPrivadoV2(req,config,ports());
  assert.notEqual(res.status,200);
  assert.equal(res.headers.get('access-control-allow-origin'),null);
 }
});

test('V2-15: Node rechaza respuesta falsa, SHA falso, bytes excesivos o tipo cambiado',async()=>{
 await createSource();
 const f=async response=>leerTextoOriginalPorEdgeV2(source,jwt(),env,
  async()=>response);
 for(const response of [
  new Response(bytes,{status:200,headers:{'content-type':'text/plain',
   'x-original-sha256':sha}}),
  new Response(bytes,{status:200,headers:{'content-type':'application/octet-stream',
   'x-original-sha256':'0'.repeat(64)}}),
  new Response(bytes,{status:503,headers:{'content-type':'application/octet-stream',
   'x-original-sha256':sha}}),
  new Response(Buffer.alloc(4001,65),{status:200,headers:{
   'content-type':'application/octet-stream','x-original-sha256':sha}}),
  new Response(new TextEncoder().encode('alterado'),{status:200,headers:{
   'content-type':'application/octet-stream','x-original-sha256':sha}})
 ])assert.equal(await f(response),null);
});

test('V2-15: la aplicación nunca requiere ni registra AES de WhatsApp en Vercel',()=>{
 for(const p of [
  '../../apps/portal/lib/piloto-v2-descarga-http.ts',
  '../../apps/portal/lib/piloto-v2-analisis-http.ts'
 ]){
  const s=readFileSync(new URL(p,import.meta.url),'utf8');
  assert.ok(s.includes('leerTextoOriginalPorEdgeV2'));
  assert.ok(s.includes('COTIRONDA_PILOT_V2_TEXT_SHARED_SECRET'));
  assert.ok(!s.includes('COTIRONDA_PILOT_AES_HEX'));
  assert.ok(!s.includes('descifrarTextoWhatsAppV2'));
 }
 const toml=readFileSync(new URL('../../supabase/config.toml',import.meta.url),'utf8');
 assert.match(toml,/\[functions\.cotironda-piloto-v2-text-reader\][\s\S]*verify_jwt = true/u);
 const edge=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-v2-text-reader/index.ts',
  import.meta.url),'utf8');
 assert.ok(edge.includes("COTIRONDA_PILOT_AES_HEX"));
 assert.ok(edge.includes('SUPABASE_SECRET_KEYS'));
 assert.ok(edge.includes('resolverTextoPrivadoV2'));
});
