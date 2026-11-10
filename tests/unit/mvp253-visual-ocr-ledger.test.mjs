import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverOneStoredDocument} from
 '../../supabase/functions/cotironda-piloto-whapi/private-document-recovery.ts';

const h='a'.repeat(64),chat='b'.repeat(64);
const bytes=new Uint8Array([255,216,255,224,1,2,3,4,5,6,7,8,9,10,11,12]);
const digest=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))]
 .map(v=>v.toString(16).padStart(2,'0')).join('');
const quote={
 status:'review_required',kind:'supplier_quote',delivery_city:null,
 requested_delivery_note:null,total_declared:'$178.000',unanswered:[],
 lines:[{original_description:'Cemento CPC 50 kg',
  quantity:'20',unit:'bolsas',unit_price:'$8.900',
  line_total:'$178.000',evidence_location:'foto 1',ambiguity:null}]
};
const recognized='20 bolsas Cemento CPC 50 kg $8.900 $178.000\nTOTAL GENERAL $178.000';
let accountPromise;
async function fakeAccount(){
 if(accountPromise)return accountPromise;
 accountPromise=(async()=>{
  const keys=await crypto.subtle.generateKey({
   name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
   publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'
  },true,['sign','verify']);
  const data=new Uint8Array(await crypto.subtle.exportKey('pkcs8',keys.privateKey));
  return JSON.stringify({
   type:'service_account',
   client_email:'ci-test@ci-testproject.iam.gserviceaccount.com',
   private_key:'-----BEGIN PRIVATE KEY-----\n'+
    Buffer.from(data).toString('base64').match(/.{1,64}/g).join('\n')+
    '\n-----END PRIVATE KEY-----\n'
  });
 })();
 return accountPromise;
}
const validLease='12345678-1234-4234-8234-1234567890ab';

function fixture({permission='approved_for_private_processing',finish='saved_private'}={}){
 const calls=[],network=[];
 const filePromise=(async()=>({mime:'image/jpeg',bytes,sha256:await digest(bytes)}))();
 const rpc=async (name,p)=>{
  calls.push({name,p});
  if(name==='cotironda_piloto_next_document_retry_mvp128')
   return {data:{state:'candidate',message_hmac:h},error:null};
  if(name==='cotironda_piloto_reserve_document_retry_mvp127'){
   const file=await filePromise;
   return {data:{state:'reserved',mime:file.mime,
    source_sha256:file.sha256,size_bytes:file.bytes.length},error:null};
  }
  if(name==='cotironda_piloto_note_media_proposal_mvp095'||
     name==='cotironda_piloto_note_document_draft_mvp127')
   return {data:true,error:null};
  if(name==='cotironda_piloto_record_supplier_media_mvp098')
   return {data:{state:'stored_unverified'},error:null};
  if(name==='cotironda_piloto_compare_supplier_readings_mvp102')
   return {data:{state:'model_readings_match'},error:null};
  if(name==='cotironda_piloto_audit_supplier_amounts_mvp103')
   return {data:{state:'balanced'},error:null};
  if(name==='cotironda_piloto_visual_ocr_permission_mvp252'){
   const file=await filePromise;
   return {data:{state:permission,source_sha256:file.sha256,
    reservation_token:validLease},error:null};
  }
  if(name==='cotironda_piloto_visual_ocr_finish_mvp253')
   return {data:{state:finish},error:null};
  if(name==='cotironda_piloto_record_supplier_source_check_mvp106')
   return {data:{state:'needs_source_review'},error:null};
  if(name==='cotironda_piloto_publish_source_text_mvp107')
   assert.fail('OCR no debe publicar ofertas');
  if(name==='cotironda_piloto_note_document_failure_mvp127')
   return {data:true,error:null};
  throw Error('unexpected RPC '+name);
 };
 const fetchImpl=async(url)=>{
  network.push(url);
  if(url==='https://oauth2.googleapis.com/token')
   return Response.json({access_token:'synthetic-token',token_type:'Bearer'});
  assert.equal(url,'https://vision.googleapis.com/v1/images:annotate');
  return Response.json({responses:[{fullTextAnnotation:{
   text:recognized,pages:[{blocks:[{paragraphs:[{words:
     Array.from({length:10},()=>({confidence:0.99}))
   }]}]}]
  }}]});
 };
 const run=async()=>recoverOneStoredDocument({
  enabled:true,triggerChatHmac:chat,apiKey:'test_key_no_network',
  io:{rpc,download:async path=>{
   assert.equal(path,'media/'+h);
   return {data:new Blob([bytes]),error:null};
  }},
  read:async()=>structuredClone(quote),
  visualOcr:{enabled:true,externalConsent:true,
   serviceAccountJson:await fakeAccount(),fetchImpl}
 });
 return {run,calls,network,filePromise};
}
test('MVP253: permiso SQL ausente evita toda salida externa y publicación',async()=>{
 const f=fixture({permission:'not_authorized'});
 assert.equal(await f.run(),'recovered_private');
 assert.equal(f.network.length,0);
 assert.equal(f.calls.some(c=>c.name==='cotironda_piloto_visual_ocr_finish_mvp253'),false);
 assert.equal(f.calls.some(c=>c.name==='cotironda_piloto_publish_source_text_mvp107'),false);
});
test('MVP253: consentimiento+lease permiten SOLO OCR privado con huella y token',async()=>{
 const f=fixture();
 assert.equal(await f.run(),'recovered_private');
 assert.equal(f.network.length,2);
 const saved=f.calls.find(c=>c.name==='cotironda_piloto_visual_ocr_finish_mvp253')?.p;
 assert.ok(saved);
 assert.equal(saved.p_reservation_token,validLease);
 assert.equal(saved.p_state,'covered_private');
 assert.equal(saved.p_reason,'ocr_text_lines_covered');
 assert.equal(saved.p_pages,1);
 assert.ok(saved.p_min_confidence_milli>=900);
 assert.match(saved.p_ocr_text_sha256,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(saved).includes('Cemento'),false);
 assert.equal(f.calls.some(c=>c.name==='cotironda_piloto_publish_source_text_mvp107'),false);
});
test('MVP253: fallo de persistencia requiere conciliación, nunca publicación',async()=>{
 const f=fixture({finish:'not_permitted'});
 assert.equal(await f.run(),'failed');
 assert.equal(f.network.length,2);
 assert.equal(f.calls.some(c=>c.name==='cotironda_piloto_publish_source_text_mvp107'),false);
});
