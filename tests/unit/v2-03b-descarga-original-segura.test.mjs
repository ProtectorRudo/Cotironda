import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {descargarOriginalV2}
 from '../../src/server/v2-03b-descarga-originales.ts';
import {nombreDescargaOriginalV2}
 from '../../apps/portal/lib/piloto-v2-nombre-descarga.ts';

const uuid='aaaaaaaa-1111-4111-8111-111111111111';
const doc='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const user='11111111-1111-4111-8111-111111111111';
const session='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const msg='d'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.7 Original intacto');
const digest=createHash('sha256').update(bytes).digest('hex');
const env={
 COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'true',
 COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA:'f'.repeat(40),
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:'f'.repeat(40),
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_PILOT_SUPABASE_URL:'https://ilggkalaafhtiysyzlmg.supabase.co',
 COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake_no_access',
 COTIRONDA_PILOT_SUPABASE_SECRET_KEY:'sb_secret_fake_no_access'
};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({
 iss:'https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 role:'authenticated',aud:'authenticated',sub:user,session_id:session,exp:now+3600
 })+'.'+'x'.repeat(64);
const url='https://cotironda.test/api/piloto/v2/rondas/'+uuid+'/originales/'+doc;
const request=(u=url,auth=token)=>new Request(u,{
 headers:{Authorization:'Bearer '+auth}
});
const source={
 state:'authorized_original_v2',requestId:uuid,documentId:doc,
 buyerKey:'buyer_a',supplierKey:'supplier_a',messageHmac:msg,
 bucket:'cotironda-piloto-originals',path:'media/'+msg,
 mime:'application/pdf',byteCount:bytes.length,sha256:digest,
 consentAt:Date.now()-7200000,invitedAt:Date.now()-3600000
};
function mocked(){
 const state={source:{...source},raw:new Uint8Array(bytes),getUserCalls:0,
  sourceCalls:0,readCalls:0,auditCalls:0,auditSuccess:true};
 const ports={
  getUser:async()=>{state.getUserCalls++;return {
   id:user,phone:'5491123456789',phone_confirmed_at:'2026-11-10',
   is_anonymous:false
  }},
  source:async q=>{state.sourceCalls++;
   assert.deepEqual(q,{rondaId:uuid,documentoId:doc,usuarioId:user,sessionId:session});
   return state.source;
  },
  read:async(bucket,path)=>{state.readCalls++;
   assert.equal(bucket,source.bucket);assert.equal(path,source.path);
   return state.raw;
  },
  audit:async q=>{state.auditCalls++;
   assert.deepEqual(q,{rondaId:uuid,documentoId:doc,usuarioId:user,
    sessionId:session,sha256:digest,byteCount:bytes.length});
   return state.auditSuccess;
  }
 };
 return {state,ports};
}
const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_03b_fuente_original_auditoria_privada.sql',
 import.meta.url),'utf8');

test('V2-03b: archivo original idéntico, cabeceras privadas, auditoria previa',async()=>{
 const {state,ports}=mocked();
 const result=await descargarOriginalV2(request(),uuid,doc,ports,env);
 assert.equal(result.status,200);
 assert.deepEqual(new Uint8Array(await result.arrayBuffer()),bytes);
 assert.equal(result.headers.get('content-type'),'application/pdf');
 assert.equal(result.headers.get('content-disposition'),
  'attachment; filename="cotironda-original-bbbbbbbb.pdf"');
 assert.match(result.headers.get('cache-control'),/no-store/u);
 assert.equal(state.sourceCalls,2);
 assert.equal(state.getUserCalls,2);
 assert.equal(state.auditCalls,1);
 assert.equal(state.readCalls,1);
});
test('V2-03b: OFF, JWT ausente, URL con query no llegan a datos privados',async()=>{
 for(const changes of [
  {COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'false'},
  {VERCEL_ENV:'production'},
  {VERCEL_GIT_COMMIT_SHA:'e'.repeat(40)},
  {COTIRONDA_PILOT_SUPABASE_SECRET_KEY:undefined}
 ]){
  const {state,ports}=mocked();
  const result=await descargarOriginalV2(request(),uuid,doc,ports,{...env,...changes});
  assert.equal(result.status,503);assert.equal(state.getUserCalls,0);
 }
 const {state,ports}=mocked();
 assert.equal((await descargarOriginalV2(new Request(url),uuid,doc,ports,env)).status,401);
 assert.equal((await descargarOriginalV2(request(url+'?token=no'),uuid,doc,ports,env)).status,400);
 assert.equal((await descargarOriginalV2(request(),uuid,'not-a-uuid',ports,env)).status,400);
 assert.equal(state.getUserCalls,0);
});
test('V2-03b: SHA alterado, tamaño y bucket inválidos no descargan',async()=>{
 for(const change of [
  {sha256:'0'.repeat(64)},{byteCount:bytes.length+1},
  {path:'media/'+'f'.repeat(64)},
  {bucket:'public'},{consentAt:Date.now()+1000}
 ]){
  const {state,ports}=mocked();
  state.source={...state.source,...change};
  const result=await descargarOriginalV2(request(),uuid,doc,ports,env);
  assert.equal(result.status,404);
  assert.equal(state.auditCalls,0);
 }
});
test('V2-03b: bytes modificados, revocacion durante I/O, auditoria fallida bloquean',async()=>{
 {
  const {state,ports}=mocked();
  state.raw=new TextEncoder().encode('%PDF-1.7 Original corrompido');
  assert.equal((await descargarOriginalV2(request(),uuid,doc,ports,env)).status,404);
  assert.equal(state.auditCalls,0);
 }
 {
  const {state,ports}=mocked();
  const original=ports.source;
  const latePorts={...ports,source:async q=>{
   const x=await original(q);
   if(state.sourceCalls===2)return null;
   return x;
  }};
  assert.equal((await descargarOriginalV2(request(),uuid,doc,latePorts,env)).status,404);
  assert.equal(state.auditCalls,0);
 }
 {
  const {state,ports}=mocked();
  state.auditSuccess=false;
  assert.equal((await descargarOriginalV2(request(),uuid,doc,ports,env)).status,503);
  assert.equal(state.auditCalls,1);
 }
});
test('V2-03b: usuario ajeno o cuenta revocada no filtra estado de archivo',async()=>{
 for(const userObj of [
  null,
  {id:user,phone:'5491123456789',phone_confirmed_at:null,is_anonymous:false},
  {id:'22222222-2222-4222-8222-222222222222',
   phone:'5491123456789',phone_confirmed_at:'2026-11-10',is_anonymous:false}
 ]){
  const {state,ports}=mocked();
  const failPorts={...ports,getUser:async()=>userObj};
  const response=await descargarOriginalV2(request(),uuid,doc,failPorts,env);
  assert.equal(response.status,404);
  assert.equal(state.sourceCalls,0);
 }
});
test('V2-03b: SQL never drops V2 consent, identity or source guards',()=>{
 for(const clause of [
  'cotironda_piloto_v2_responders_private',
  "v_catalog->>'state'<>'authorized_responders_v2'",
  "link.status='awaiting_semantic_review'",
  "link.association IN (",
  "'quoted_whapi_id','single_active_round','prior_supplier_preamble'",
  "a.state='stored'",
  "a.content_sha256=link.source_sha256",
  "source_msg.request_id=link.request_id",
  "c.revoked_at IS NULL",
  "a.storage_path='media/'||a.message_hmac",
  "FROM PUBLIC,anon,authenticated,service_role",
  'v2_original_download_audit','v2_original_source_private',
  'v2_record_download'
 ])assert.ok(sql.includes(clause),clause);
 assert.doesNotMatch(sql,/supplier_evidence_mvp138/u);
 assert.doesNotMatch(sql,/original_share_consents_mvp178/u);
 assert.doesNotMatch(sql,/createSignedUrl|signedUrl|publicUrl/u);
});

test('V2-09: descarga privada DOC/XLS lleva mismo sufijo que navegador',async()=>{
 for(const [mime,ext] of [
  ['application/msword','doc'],
  ['application/vnd.ms-excel','xls'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx']
 ]){
  const {state,ports}=mocked();
  state.source.mime=mime;
  const response=await descargarOriginalV2(request(),uuid,doc,ports,env);
  assert.equal(response.status,200,mime);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
  const expected='cotironda-original-bbbbbbbb.'+ext;
  assert.equal(response.headers.get('content-disposition'),
   'attachment; filename="'+expected+'"');
  assert.equal(nombreDescargaOriginalV2(doc,response.headers.get('content-type')),
   expected);
 }
});
