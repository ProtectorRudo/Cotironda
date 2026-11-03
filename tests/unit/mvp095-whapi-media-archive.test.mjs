import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getVerifiedWhapiMedia,storeVerifiedMedia,MediaError}
 from '../../supabase/functions/cotironda-piloto-whapi/whapi-media-archive.ts';

const media=(mime='application/pdf',length=null)=>({
 version:1,origin:'whapi',kind:'document',mime,
 size:length,filename:'pedido.pdf',caption:null,providerSha256:null,
 media_id:'pdf-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57',
 state:'awaiting_secure_download'
});
const payload=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
const token='secret-token-test-01234567890';
const reply=(bytes,headers={})=>new Response(bytes,{
 status:200,headers:{'content-type':'application/pdf',...headers}
});
test('MVP095: GET Whapi por ID fijo, sin aceptar URL de usuario',async()=>{
 const f=await getVerifiedWhapiMedia({manifest:media(),token,
 fetchImpl:async(url,opt)=>{
  assert.equal(url,'https://gate.whapi.cloud/media/pdf-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57');
  assert.equal(opt.redirect,'error');assert.equal(opt.method,'GET');
  assert.equal(opt.headers.Authorization,'Bearer '+token);
  return reply(payload);
 }});
 assert.equal(f.mime,'application/pdf');
 assert.ok(f.sha256.match(/^[a-f0-9]{64}$/));
 assert.deepEqual(f.bytes,payload);
});
test('MVP095: original va al bucket privado con clave opaca sin overwrite',async()=>{
 const f={bytes:payload,sha256:'a'.repeat(64),mime:'application/pdf'};
 const h='d'.repeat(64);let call=0;
 const storage={from(bucket){
  assert.equal(bucket,'cotironda-piloto-originals');
  return {async upload(path,bytes,options){
   call++;assert.equal(path,'media/'+h);
   assert.deepEqual(bytes,payload);assert.equal(options.upsert,false);
   assert.equal(options.contentType,'application/pdf');
   return {error:null};
  }};
 }};
 await storeVerifiedMedia(storage,h,f);
 assert.equal(call,1);
});
test('MVP095: no permiten URLs, media IDs no-whapi, audio o ZIP no autorizado',async()=>{
 for(const m of [
  {...media(),media_id:'https://evil.example/a.pdf'},
  {...media(),media_id:'../../etc/passwd'},
  {...media(),state:'unsupported_needs_review'},
  {...media(),kind:'audio'},
  {...media(),size:3*1024*1024+1},
  {...media(),mime:'application/x-msdownload'}
 ]){
  await assert.rejects(getVerifiedWhapiMedia({manifest:m,token,
    fetchImpl:async()=>{throw Error('Unexpected request')}
  }),/media_parameters_rejected/);
 }
});
test('MVP095: firmas no coincidentes no se almacenan ni interpretan',async()=>{
 await assert.rejects(getVerifiedWhapiMedia({
  manifest:media(),token,fetchImpl:async()=>reply(new TextEncoder().encode('{"status":"ok"}'))
 }),/media_signature_mismatch/);
});
test('MVP095: respuestas vacías, truncadas o mayores al límite bloqueadas',async()=>{
 await assert.rejects(getVerifiedWhapiMedia({
  manifest:media(),token,fetchImpl:async()=>new Response(null,{status:200})
 }),/media_remote_rejected/);
 await assert.rejects(getVerifiedWhapiMedia({
  manifest:media('application/pdf',999),token,fetchImpl:async()=>reply(payload)
 }),/media_length_mismatch/);
 await assert.rejects(getVerifiedWhapiMedia({
  manifest:media(),token,fetchImpl:async()=>reply(payload,{'content-length':'3145729'})
 }),/media_too_large/);
});
test('MVP095: no reintentar errores de red y no seguir redirecciones externas',async()=>{
 await assert.rejects(getVerifiedWhapiMedia({
  manifest:media(),token,fetchImpl:async(url,opt)=>{
   assert.equal(opt.redirect,'error');throw Error('redirect rejected')
  }
 }),/media_download_unavailable/);
});
test('MVP095: hash de proveedor adulterado bloquea archivo',async()=>{
 await assert.rejects(getVerifiedWhapiMedia({
  manifest:{...media(),providerSha256:'A'.repeat(43)+'='},token,
  fetchImpl:async()=>reply(payload)
 }),/media_provider_hash_mismatch/);
});
test('MVP095: integración en webhook queda bajo flag independiente y SQL privado',()=>{
 const s=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(s,/cotironda_piloto_media_enabled_mvp095/);
 assert.match(s,/cotironda_piloto_reserve_media_mvp095/);
 assert.match(s,/cotironda_piloto_finish_media_mvp095/);
 assert.match(s,/getVerifiedWhapiMedia/);
 assert.match(s,/storeVerifiedMedia/);
 assert.match(s,/outcome\(out\.data\)==='needs_review'/);
});
