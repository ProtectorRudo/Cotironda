import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeDocumentAI,DOCUMENT_SCHEMA}
 from '../../supabase/functions/cotironda-piloto-whapi/document-ai-draft.ts';
const pdf=new TextEncoder().encode('%PDF-1.4\n TEST PDF SOURCE');
const input={manifest:{
 version:1,origin:'whapi',kind:'document',
 media_id:'pdf-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57',
 mime:'application/pdf',filename:'solicitud.pdf',size:null,
 caption:null,providerSha256:null,state:'awaiting_secure_download'},
 file:{bytes:pdf,sha256:'a'.repeat(64),mime:'application/pdf'},
 apiKey:'sk-test123456789abcdefghijklmnop',enabled:true};
const draft={
 kind:'buyer_request',delivery_city:'La Plata',requested_delivery_note:null,
 lines:[{original_description:'cemento CPC 50 kg',quantity:'20',unit:'bag',
 unit_price:null,line_total:null,evidence_location:'página 1',
 ambiguity:null}],total_declared:null,unanswered:[]
};
const reply=(v,status=200)=>async(url,opts)=>{
 assert.equal(url,'https://api.openai.com/v1/responses');
 const body=JSON.parse(opts.body);
 assert.equal(body.store,false);
 assert.deepEqual(body.tools,[]);
 assert.equal(body.text.format.strict,true);
 assert.match(JSON.stringify(body.input),/input_file/);
 assert.match(JSON.stringify(body.input),/data:application\/pdf;base64,/);
 assert.equal(opts.headers.Authorization,'Bearer '+input.apiKey);
 return new Response(JSON.stringify(v),{status});
};
const remote=x=>({status:'completed',output:[{
 type:'message',role:'assistant',
 content:[{type:'output_text',text:JSON.stringify(x)}]
}]});
test('MVP095: lectura PDF solo como borrador privado, sin ranking ni envío',async()=>{
 const r=await proposeDocumentAI({...input,fetchImpl:reply(remote(draft))});
 assert.deepEqual(r,{status:'review_required',...draft});
 assert.equal(DOCUMENT_SCHEMA.additionalProperties,false);
 assert.equal(DOCUMENT_SCHEMA.properties.lines.items.additionalProperties,false);
});
test('MVP095: fotos se pasan como imagen, nunca como URL pública',async()=>{
 const valid={...input,manifest:{...input.manifest,kind:'image',
    mime:'image/png',filename:'foto.png'},
   file:{...input.file,mime:'image/png'}};
 await proposeDocumentAI({...valid,fetchImpl:async(url,opts)=>{
  const data=JSON.parse(opts.body);
  assert.equal(data.input[1].content[0].type,'input_image');
  assert.match(data.input[1].content[0].image_url,/^data:image\/png;base64,/);
  return new Response(JSON.stringify(remote(draft)),{status:200});
 }});
});
test('MVP095: no ejecuta modelo si no existe clave ni flag',async()=>{
 await assert.rejects(proposeDocumentAI({...input,enabled:false}),/doc_ai_disabled/);
 await assert.rejects(proposeDocumentAI({...input,apiKey:''}),/doc_ai_key_missing/);
});
test('MVP095: no acepta renglones sin evidencia ni campos extraviados',async()=>{
 const bad=[
  {...draft,extra:'telefono'},
  {...draft,lines:[{...draft.lines[0],cantidad_inventada:'200'}]},
  {...draft,lines:[{...draft.lines[0],evidence_location:3}]},
  {...draft,lines:Array.from({length:26},()=>draft.lines[0])},
 ];
 for(const d of bad){
  await assert.rejects(proposeDocumentAI({
   ...input,fetchImpl:reply(remote(d))
  }),/doc_ai_output_invalid|doc_ai_line_invalid/);
 }
});
test('MVP095: 429, rechazo, salida incompleta y transporte fallan cerrado',async()=>{
 for(const [status,code] of [[429,'doc_ai_quota'],[401,'doc_ai_http_unauthorized']]){
  await assert.rejects(proposeDocumentAI({
   ...input,fetchImpl:reply({error:'bad'},status)
  }),new RegExp(code));
 }
 await assert.rejects(proposeDocumentAI({...input,fetchImpl:reply({
  status:'incomplete',output:[]
 })}),/doc_ai_response_incomplete/);
 await assert.rejects(proposeDocumentAI({...input,fetchImpl:async()=>{throw Error('timeout')}}),
  /doc_ai_transport_unavailable/);
});
