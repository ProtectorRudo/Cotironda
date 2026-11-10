import test from 'node:test';
import assert from 'node:assert/strict';
import {crearLectorUsoMvp342} from
 '../../supabase/functions/cotironda-piloto-whapi/lector-uso-lotes-mvp342.ts';
const sha='a'.repeat(64),digest='b'.repeat(64),KEY='sk-'+'m'.repeat(30);
const req={
 sourceSha256:sha,lotNumber:1,lotDigest:digest,perspective:'primary',
 rows:[
  {position:1,section:'pagina:1',literal:'15 bolsas Cemento CPC $ 8500'},
  {position:2,section:'pagina:1',literal:'IVA no incluido'}
 ]
};
const reading={
 sourceSha256:sha,lotNumber:1,lotDigest:digest,
 readings:[
  {position:1,kind:'material',evidence:'15 bolsas Cemento CPC $ 8500',
   description:'Cemento CPC',quantity:'15',unit:'bolsas',
   unitPrice:'$ 8500',lineTotal:null},
  {position:2,kind:'condition',evidence:'IVA no incluido',
   description:null,quantity:null,unit:null,unitPrice:null,lineTotal:null}
 ]
};
function result(usage={
 input_tokens:421,output_tokens:89,total_tokens:510
 }){
 return {id:'resp_123456789abc',status:'completed',usage,
  output:[{type:'message',role:'assistant',content:[
   {type:'output_text',text:JSON.stringify(reading)}
  ]}]};
}
const reader=fetchImpl=>crearLectorUsoMvp342({
 enabled:true,apiKey:KEY,model:'gpt-6-luna',fetchImpl
});
test('MVP342 Responses mock: strict source content and real usage metadata',async()=>{
 const calls=[];
 const got=await reader(async(url,init)=>{
  calls.push({url,body:JSON.parse(init.body)});
  return new Response(JSON.stringify(result()),{status:200});
 })(req);
 assert.deepEqual(got.reading,reading);
 assert.deepEqual(got.usage,{inputTokens:421,outputTokens:89,
  totalTokens:510,responseId:'resp_123456789abc'});
 assert.equal(calls[0].url,'https://api.openai.com/v1/responses');
 assert.equal(calls[0].body.store,false);
 assert.deepEqual(calls[0].body.tools,[]);
 assert.equal(calls[0].body.text.format.strict,true);
});
test('MVP342: missing/fabricated OpenAI usage is never zero',async()=>{
 for(const broken of [
  result(undefined),result({
   input_tokens:500,output_tokens:60,total_tokens:500
  }),result({input_tokens:-1,output_tokens:20,total_tokens:19}),
  {...result(),id:'invalid'},
  {...result(),usage:null}
 ]){
  // For undefined, JS defaults the parameter; explicit null tests below.
  if(broken.usage?.total_tokens===510&&broken.id.startsWith('resp_'))continue;
  const read=reader(async()=>new Response(JSON.stringify(broken),{status:200}));
  await assert.rejects(read(req),/mvp342_usage_missing_or_invalid/);
 }
});
test('MVP342: 429, timeout or malformed strict response cannot yield metered quote',async()=>{
 const http=reader(async()=>new Response('',{status:429}));
 await assert.rejects(http(req),/lot_ai_quota/);
 const broken=reader(async()=>new Response('{}',{status:200}));
 await assert.rejects(broken(req),/lot_ai_incomplete/);
 const network=reader(async()=>{throw Error('private price and token')});
 await assert.rejects(network(req),/lot_ai_transport_unavailable/);
});
