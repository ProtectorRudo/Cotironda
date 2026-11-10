import test from 'node:test';
import assert from 'node:assert/strict';
import {leerOCRGoogleMvp252} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-ocr-google-mvp252.ts';
import {auditarFuenteVisualOCRMvp252} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-visual-ocr-audit-mvp252.ts';

const jpeg=new Uint8Array([0xff,0xd8,0xff,0xe0,1,2,3,4,5,6,7,8,9,10,11,12]);
const pdf=new TextEncoder().encode('%PDF-1.7\nsample synthetic scan byte fixture');
const hash=async(bytes)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
 .map(b=>b.toString(16).padStart(2,'0')).join('');
const make=async(mime='image/jpeg',bytes=jpeg)=>({
 mime,bytes,sha256:await hash(bytes)
});
const quote={
 status:'review_required',kind:'supplier_quote',
 delivery_city:null,requested_delivery_note:null,
 total_declared:'$178.000',unanswered:[],
 lines:[{
  original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas',
  unit_price:'$8.900',line_total:'$178.000',
  evidence_location:'foto fila 1',ambiguity:null
 }]
};
const text='20 bolsas Cemento CPC 50 kg $8.900 $178.000\nTOTAL GENERAL $178.000';
const annotations=(txt=text,confidence=0.99)=>({
 fullTextAnnotation:{
  text:txt,
  pages:[{blocks:[{paragraphs:[{
   words:Array.from({length:12},()=>({confidence}))
  }]}]}]
 }
});
let serviceAccountPromise;
async function serviceAccount(){
 if(!serviceAccountPromise)serviceAccountPromise=(async()=>{
  const pair=await crypto.subtle.generateKey({
   name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
   publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'
  },true,['sign','verify']);
  const bytes=new Uint8Array(await crypto.subtle.exportKey('pkcs8',pair.privateKey));
  const b64=Buffer.from(bytes).toString('base64').match(/.{1,64}/g).join('\n');
  return JSON.stringify({
   type:'service_account',
   client_email:'cotironda-test@synthetic-project.iam.gserviceaccount.com',
   private_key:'-----BEGIN PRIVATE KEY-----\n'+b64+'\n-----END PRIVATE KEY-----\n'
  });
 })();
 return serviceAccountPromise;
}
function mocked({txt=text,confidence=0.99,pages=1,brokenPages=false}={}){
 const requests=[];
 const fetchImpl=async(url,init)=>{
  requests.push({url,init});
  if(url==='https://oauth2.googleapis.com/token'){
   assert.equal(init.method,'POST');
   const params=new URLSearchParams(init.body);
   assert.equal(params.get('grant_type'),
     'urn:ietf:params:oauth:grant-type:jwt-bearer');
   const jwt=params.get('assertion');
   assert.equal(jwt.split('.').length,3);
   const payload=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString());
   assert.equal(payload.iss,
    'cotironda-test@synthetic-project.iam.gserviceaccount.com');
   assert.equal(payload.aud,'https://oauth2.googleapis.com/token');
   return Response.json({access_token:'synthetic-access-token',token_type:'Bearer'});
  }
  assert.match(url,/^https:\/\/vision\.googleapis\.com\/v1\/(images|files):annotate$/);
  assert.equal(init.headers.Authorization,'Bearer synthetic-access-token');
  const body=JSON.parse(init.body);
  assert.equal(body.requests.length,1);
  assert.deepEqual(body.requests[0].features,[{type:'DOCUMENT_TEXT_DETECTION'}]);
  const pdf=url.endsWith('files:annotate');
  const bytes=Buffer.from(pdf
    ?body.requests[0].inputConfig.content:body.requests[0].image.content,
    'base64');
  assert.ok(bytes.length>0);
  if(pdf){
   assert.deepEqual(body.requests[0].pages,
    Array.from({length:pages},(_,i)=>i+1));
   return Response.json({
    responses:[{responses:Array.from({length:brokenPages?pages-1:pages},(_,i)=>({
      context:{pageNumber:i+1},...annotations(txt,confidence)
    }))}]
   });
  }
  return Response.json({responses:[annotations(txt,confidence)]});
 };
 return {fetchImpl,requests};
}
const checkSafe=(r)=>{
 assert.equal(r.publicationAllowed,false);
 assert.equal(r.rankingAllowed,false);
 assert.equal(r.sourceVerified,false);
 assert.equal(r.provider,'google_cloud_vision');
};

test('MVP252: primera validación OCR independiente de foto, SOLO privado',async()=>{
 const file=await make(),mock=mocked();
 const result=await auditarFuenteVisualOCRMvp252({
  source:file,primary:quote,secondary:structuredClone(quote),
  enabled:true,externalConsent:true,
  serviceAccountJson:await serviceAccount(),fetchImpl:mock.fetchImpl
 });
 checkSafe(result);
 assert.equal(result.state,'source_ocr_covered_private');
 assert.equal(result.reason,'ocr_text_lines_covered');
 assert.equal(result.sourceSha256,file.sha256);
 assert.equal(mock.requests.length,2);
 assert.ok(mock.requests[1].url.endsWith('images:annotate'));
});

test('MVP252: sin autorización de uso externo no existe ninguna transmisión',async()=>{
 const mock=mocked(),file=await make();
 for(const args of [
  {enabled:false,externalConsent:true},
  {enabled:true,externalConsent:false}
 ]){
  const outcome=await auditarFuenteVisualOCRMvp252({
   source:file,primary:quote,secondary:quote,
   serviceAccountJson:await serviceAccount(),
   fetchImpl:mock.fetchImpl,...args
  });
  assert.equal(outcome.state,'disabled');
 }
 assert.equal(mock.requests.length,0);
});

test('MVP252: diferencias en cantidad/importe, borrador o PII se bloquean antes de OCR',async()=>{
 const mock=mocked(),file=await make();
 for(const secondary of [
  null,
  {...quote,lines:[{...quote.lines[0],quantity:'2'}]},
  {...quote,lines:[{...quote.lines[0],line_total:'$188.000'}]},
  {...quote,lines:[{...quote.lines[0],ambiguity:'borroso'}]},
  {...quote,requested_delivery_note:'WhatsApp +54 221 111 2222'}
 ]){
  const outcome=await auditarFuenteVisualOCRMvp252({
   source:file,primary:quote,secondary,enabled:true,externalConsent:true,
   serviceAccountJson:await serviceAccount(),fetchImpl:mock.fetchImpl
  });
  assert.equal(outcome.state,'needs_review');
 }
 assert.equal(mock.requests.length,0);
});

test('MVP252: OCR omite importe, incorpora cargo no capturado o tiene baja confianza',async()=>{
 for(const params of [
  {txt:'20 bolsas Cemento CPC 50 kg $8.900\nTOTAL GENERAL $178.000'},
  {txt:text.replace('TOTAL GENERAL','Flete $15.000\nTOTAL GENERAL')},
  {confidence:0.72}
 ]){
  const mock=mocked(params);
  const outcome=await auditarFuenteVisualOCRMvp252({
   source:await make(),primary:quote,secondary:quote,
   enabled:true,externalConsent:true,
   serviceAccountJson:await serviceAccount(),fetchImpl:mock.fetchImpl
  });
  assert.equal(outcome.state,'needs_review');
  assert.equal(outcome.publicationAllowed,false);
  assert.equal(mock.requests.length,2);
 }
});

test('MVP252: SHA adulterado se rechaza sin enviar bytes',async()=>{
 const mock=mocked(),file=await make();
 const r=await auditarFuenteVisualOCRMvp252({
  source:{...file,sha256:'1'.repeat(64)},
  primary:quote,secondary:quote,enabled:true,externalConsent:true,
  serviceAccountJson:await serviceAccount(),fetchImpl:mock.fetchImpl
 });
 assert.equal(r.state,'needs_review');
 assert.equal(r.reason,'invalid_source');
 assert.equal(mock.requests.length,0);
});

test('MVP252: PDF escaneado con todas sus páginas se puede cotejar sin publicarlo',async()=>{
 const file=await make('application/pdf',pdf);
 const mock=mocked();
 const r=await auditarFuenteVisualOCRMvp252({
  source:file,primary:quote,secondary:quote,
  enabled:true,externalConsent:true,
  serviceAccountJson:await serviceAccount(),fetchImpl:mock.fetchImpl,
  inspectPdf:async()=>({pages:1,rows:[],scanned:true})
 });
 checkSafe(r);
 assert.equal(r.state,'source_ocr_covered_private');
 assert.equal(mock.requests[1].url.endsWith('files:annotate'),true);
 const bad=mocked({brokenPages:true});
 const r2=await auditarFuenteVisualOCRMvp252({
  source:file,primary:quote,secondary:quote,
  enabled:true,externalConsent:true,
  serviceAccountJson:await serviceAccount(),fetchImpl:bad.fetchImpl,
  inspectPdf:async()=>({pages:2,rows:[],scanned:true})
 });
 assert.equal(r2.state,'needs_review');
 assert.notEqual(r2.reason,'ocr_text_lines_covered');
 const unsupported=await auditarFuenteVisualOCRMvp252({
  source:file,primary:quote,secondary:quote,
  enabled:true,externalConsent:true,
  serviceAccountJson:await serviceAccount(),fetchImpl:bad.fetchImpl,
  inspectPdf:async()=>({pages:6,rows:[],scanned:true})
 });
 assert.equal(unsupported.state,'needs_review');
 assert.equal(unsupported.reason,'pdf_not_scanned_or_too_many_pages');
});

test('MVP252: lector no hace HTTP con credenciales inválidas o archivo inválido',async()=>{
 const mock=mocked();
 await assert.rejects(()=>leerOCRGoogleMvp252(awaitMakePlaceholder(),{
  enabled:true,consented:true,serviceAccountJson:'{}',fetchImpl:mock.fetchImpl
 }),/visual_ocr_invalid_source/);
 const file=await make();
 await assert.rejects(()=>leerOCRGoogleMvp252(file,{
  enabled:true,consented:true,serviceAccountJson:'{}',fetchImpl:mock.fetchImpl
 }),/visual_ocr_no_credentials/);
 assert.equal(mock.requests.length,0);
});
function awaitMakePlaceholder(){
 return {mime:'image/jpeg',bytes:new Uint8Array(9),sha256:'a'.repeat(64)};
}


test('MVP252: recuperación nunca llama a Google si falta el permiso SQL por archivo',async()=>{
 const {recoverOneStoredDocument}=await import(
  '../../supabase/functions/cotironda-piloto-whapi/private-document-recovery.ts');
 const original=await make();
 const h='a'.repeat(64),chat='b'.repeat(64);
 let remote=0,askedPermission=false;
 const rpc=async (name,params)=>{
  if(name==='cotironda_piloto_next_document_retry_mvp128')
   return {data:{state:'candidate',message_hmac:h},error:null};
  if(name==='cotironda_piloto_reserve_document_retry_mvp127')
   return {data:{state:'reserved',mime:original.mime,
     source_sha256:original.sha256,size_bytes:original.bytes.length},error:null};
  if(name==='cotironda_piloto_note_media_proposal_mvp095')
   return {data:true,error:null};
  if(name==='cotironda_piloto_note_document_draft_mvp127')
   return {data:true,error:null};
  if(name==='cotironda_piloto_record_supplier_media_mvp098')
   return {data:{state:'stored_unverified'},error:null};
  if(name==='cotironda_piloto_compare_supplier_readings_mvp102')
   return {data:{state:'model_readings_match'},error:null};
  if(name==='cotironda_piloto_audit_supplier_amounts_mvp103')
   return {data:{state:'balanced'},error:null};
  if(name==='cotironda_piloto_visual_ocr_permission_mvp252'){
   askedPermission=true;
   assert.equal(params.p_message_hmac,h);
   assert.equal(params.p_source_sha256,original.sha256);
   return {data:null,error:{code:'PGRST202'}};
  }
  if(name==='cotironda_piloto_record_supplier_source_check_mvp106')
   return {data:{state:'needs_source_review'},error:null};
  if(name==='cotironda_piloto_publish_source_text_mvp107')
   assert.fail('No puede publicar una foto sin procedencia SQL');
  throw Error('Unexpected RPC '+name);
 };
 const done=await recoverOneStoredDocument({
  enabled:true,triggerChatHmac:chat,apiKey:'sk-'+'x'.repeat(30),
  io:{
   rpc,
   download:async(path)=>{
    assert.equal(path,'media/'+h);
    return {data:new Blob([original.bytes]),error:null};
   }
  },
  read:async()=>structuredClone(quote),
  visualOcr:{
   enabled:true,externalConsent:true,
   serviceAccountJson:await serviceAccount(),
   fetchImpl:async()=>{remote++;throw Error('No network allowed')}
  }
 });
 assert.equal(done,'recovered_private');
 assert.equal(askedPermission,true);
 assert.equal(remote,0);
});
