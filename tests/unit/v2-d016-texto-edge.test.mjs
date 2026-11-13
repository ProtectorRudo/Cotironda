import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolverTextoPrivadoD016}
 from '../../supabase/functions/cotironda-piloto-v2-text-reader-d016/text-core.ts';
import {leerTextoOriginalEdgeD016}
 from '../../src/server/v2-d016-texto-edge-client.ts';

const URL_PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const ROUND='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION='c'.repeat(64),CHAT='d'.repeat(64),MESSAGE='e'.repeat(64);
const SECRET='InternalSecretD016_Aa9_Zz8_Qq7_Rr6_Ss5_Tt4_Uu3';
const APIKEY='sb_secret_'+'X'.repeat(44);
const KEY_BYTES=Uint8Array.from({length:32},(_,i)=>(i*7+5)%256);
const AES=Buffer.from(KEY_BYTES).toString('hex');
const PLAINTEXT=Buffer.from('Presupuesto: cemento 50 kg x 15; arena 3 m3.\nTotal pendiente de confirmar.');
const SHA=createHash('sha256').update(PLAINTEXT).digest('hex');
async function source(){
 const nonce=Uint8Array.from({length:12},(_,i)=>i+1);
 const cryptoKey=await crypto.subtle.importKey('raw',KEY_BYTES.buffer,
  'AES-GCM',false,['encrypt']);
 const aad=new TextEncoder().encode(CHAT+'|'+MESSAGE+'|text');
 const cipher=await crypto.subtle.encrypt({
  name:'AES-GCM',iv:nonce.buffer,additionalData:aad.buffer,tagLength:128
 },cryptoKey,PLAINTEXT);
 return {
  state:'authorized_text_v2',requestId:ROUND,documentId:DOC,
  buyerKey:'buyer_a',supplierKey:'supplier_a',messageHmac:MESSAGE,
  chatHmac:CHAT,nonceB64:Buffer.from(nonce).toString('base64'),
  ciphertextB64:Buffer.from(cipher).toString('base64'),
  mime:'text/plain',sha256:SHA,
  consentAt:1700000000000,invitedAt:1700000000001
 };
}
const config=()=>({
 enabled:true,url:URL_PILOT,internalSecret:SECRET,serviceKey:APIKEY,aesHex:AES
});
function request(options={}){
 const data=options.body??{requestId:ROUND,documentId:DOC,sessionHmac:SESSION};
 return new Request(URL_PILOT+'/functions/v1/cotironda-piloto-v2-text-reader-d016'+
  (options.query??''),{
   method:options.method??'POST',headers:{
    'apikey':options.apikey??APIKEY,
    'x-cotironda-d016-text-internal':options.internalSecret??SECRET,
    'content-type':options.type??'application/json'
   },
   body:options.method==='GET'?undefined:JSON.stringify(data)
  });
}
async function fixture(){
 const state={ctxCount:0,sourceCount:0,allowed:true,afterAllowed:true,
  mutateAfter:null,original:await source()};
 const ports={
  contexto:async q=>{
   state.ctxCount++;
   assert.deepEqual(q,{requestId:ROUND,sessionHmac:SESSION});
   if(!state.allowed||(state.ctxCount===2&&!state.afterAllowed))
    return null;
   return {state:'authorized_buyer_whatsapp_session',
    buyerKey:'buyer_a',requestId:ROUND};
  },
  fuente:async q=>{
   state.sourceCount++;
   assert.deepEqual(q,{requestId:ROUND,documentId:DOC,sessionHmac:SESSION});
   if(state.sourceCount===2&&state.mutateAfter)
    return {...state.original,...state.mutateAfter};
   return state.original;
  }
 };
 return {state,ports,run:(req=request(),cfg=config())=>
  resolverTextoPrivadoD016(req,cfg,ports)};
}
test('D016 Edge texto: AES-GCM correcto con AAD, fuente y sesión doble',async()=>{
 const f=await fixture();const res=await f.run();
 assert.equal(res.status,200);
 assert.equal(res.headers.get('content-type'),'application/octet-stream');
 assert.equal(res.headers.get('x-original-sha256'),SHA);
 assert.match(res.headers.get('cache-control'),/no-store/u);
 assert.deepEqual(Buffer.from(await res.arrayBuffer()),PLAINTEXT);
 assert.deepEqual([f.state.ctxCount,f.state.sourceCount],[2,2]);
});
test('D016 Edge texto: sin dos credenciales, fuente no se consulta',async()=>{
 for(const bad of [
  {apikey:'sb_secret_wrong'}, {internalSecret:'wrong'},
  {type:'text/plain'},{query:'?sessionHmac='+SESSION},
  {body:{requestId:ROUND,documentId:DOC,sessionHmac:'f'.repeat(64),userId:'u'}},
  {body:{requestId:ROUND,documentId:DOC,sessionHmac:'g'.repeat(64)}}
 ]){
  const f=await fixture();const res=await f.run(request(bad));
  assert.notEqual(res.status,200,JSON.stringify(bad));
  if(bad.apikey||bad.internalSecret||bad.type||bad.query||bad.body?.userId)
   assert.equal(f.state.ctxCount,0);
 }
 for(const bad of [{enabled:false},{aesHex:'0'.repeat(64)},
  {internalSecret:'a'.repeat(64)},{url:'https://otra.supabase.co'}]){
  const f=await fixture();
  const res=await f.run(request(),{...config(),...bad});
  assert.equal(res.status,503);
  assert.equal(f.state.ctxCount,0);
 }
});
test('D016 Edge texto: SHA/AAD alterados, cadena base64 y revocación bloquean bytes',async()=>{
 for(const patch of [
  {sha256:'f'.repeat(64)}, {chatHmac:'f'.repeat(64)},
  {nonceB64:'AA=='}, {ciphertextB64:'/'+'a'.repeat(60)},
  {buyerKey:'buyer_b'},{requestId:'ffffffff-ffff-4fff-8fff-ffffffffffff'},
  {consentAt:1700000000002,invitedAt:1700000000001}
 ]){
  const f=await fixture();f.state.original={...f.state.original,...patch};
  const res=await f.run();assert.notEqual(res.status,200,JSON.stringify(patch));
  assert.equal(res.headers.get('x-original-sha256'),null);
 }
 for(const kind of ['session','supplier']){
  const f=await fixture();
  if(kind==='session')f.state.afterAllowed=false;
  if(kind==='supplier')f.state.mutateAfter={supplierKey:'supplier_b'};
  const res=await f.run();assert.equal(res.status,404,kind);
  assert.equal(res.headers.get('content-type'),'application/json; charset=utf-8');
 }
});
test('D016 Next cliente: sólo HMAC sesión y referencias, jamás el sobre o AES',async()=>{
 const f=await fixture();let seen=null;
 const bytes=Buffer.from(await (await f.run()).arrayBuffer());
 const fetchMock=async(url,init)=>{
  seen={url,init};
  return new Response(Uint8Array.from(bytes).buffer,{status:200,headers:{
   'content-type':'application/octet-stream',
   'content-length':String(bytes.length),'x-original-sha256':SHA
  }});
 };
 const data=await leerTextoOriginalEdgeD016(f.state.original,SESSION,{
  COTIRONDA_PILOT_SUPABASE_URL:URL_PILOT,
  COTIRONDA_PILOT_SUPABASE_SECRET_KEY:APIKEY,
  COTIRONDA_D016_TEXT_ENABLED:'true',
  COTIRONDA_D016_TEXT_SHARED_SECRET:SECRET
 },fetchMock);
 assert.deepEqual(Buffer.from(data),PLAINTEXT);
 assert.equal(seen.url,URL_PILOT+'/functions/v1/cotironda-piloto-v2-text-reader-d016');
 const body=JSON.parse(seen.init.body);
 assert.deepEqual(body,{requestId:ROUND,documentId:DOC,sessionHmac:SESSION});
 assert.ok(!seen.init.body.includes(f.state.original.ciphertextB64));
 assert.equal(seen.init.headers.apikey,APIKEY);
 assert.equal(seen.init.headers['x-cotironda-d016-text-internal'],SECRET);
 assert.equal(seen.init.headers.Authorization,undefined);
 assert.equal(seen.init.redirect,'error');
 assert.equal(seen.init.credentials,'omit');
});
test('D016 Next: fallos, bytes corruptos, secreto ausente y bandera OFF devuelven null',async()=>{
 const s=await source();let fetchCount=0;
 const env={COTIRONDA_PILOT_SUPABASE_URL:URL_PILOT,
  COTIRONDA_PILOT_SUPABASE_SECRET_KEY:APIKEY,
  COTIRONDA_D016_TEXT_ENABLED:'true',
  COTIRONDA_D016_TEXT_SHARED_SECRET:SECRET};
 const fn=async()=>{fetchCount++;throw Error('no network')};
 for(const bad of [
  {...env,COTIRONDA_D016_TEXT_ENABLED:'false'},
  {...env,COTIRONDA_D016_TEXT_SHARED_SECRET:'no'},
  {...env,COTIRONDA_PILOT_SUPABASE_SECRET_KEY:''}
 ]){
  assert.equal(await leerTextoOriginalEdgeD016(s,SESSION,bad,fn),null);
  assert.equal(fetchCount,0);
 }
 const corrupt=async()=>new Response(Uint8Array.from(Buffer.from('ALTERED')).buffer,{
  status:200,headers:{'content-type':'application/octet-stream',
   'x-original-sha256':SHA}});
 assert.equal(await leerTextoOriginalEdgeD016(s,SESSION,env,corrupt),null);
 assert.equal(await leerTextoOriginalEdgeD016(
  {...s,requestId:'wrong'},SESSION,env,fn),null);
});
