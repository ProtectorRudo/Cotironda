import test from 'node:test';
import assert from 'node:assert/strict';
import {crearLectorIALotesMvp339} from
 '../../supabase/functions/cotironda-piloto-whapi/lector-ia-lote-mvp339.ts';

const SHA='a'.repeat(64),DIGEST='f'.repeat(64);
const KEY='sk-'+'k'.repeat(30);
const lines=[
 {position:1,section:'pagina:1',literal:'15 bolsas Cemento CPC 50 kg $ 8.500'},
 {position:2,section:'pagina:1',literal:'Flete a convenir'},
 {position:3,section:'pagina:2',literal:'Descuento -$ 3.500'}
];
const req={sourceSha256:SHA,lotNumber:1,lotDigest:DIGEST,
 perspective:'primary',rows:lines};
function sampleOutput(request=req){
 return {
  sourceSha256:request.sourceSha256,lotNumber:request.lotNumber,
  lotDigest:request.lotDigest,
  readings:request.rows.map(row=>({
   position:row.position,
   kind:row.position===1?'material':row.position===2?'condition':'extra',
   evidence:row.literal,
   description:row.position===1?'Cemento CPC 50 kg':null,
   quantity:row.position===1?'15':null,
   unit:row.position===1?'bolsas':null,
   unitPrice:row.position===1?'$ 8.500':null,
   lineTotal:row.position===3?'-$ 3.500':null
  }))
 };
}
const envelope=payload=>JSON.stringify({
 status:'completed',
 output:[{type:'message',role:'assistant',content:[
  {type:'output_text',text:JSON.stringify(payload)}
 ]}]
});
test('MVP339: Responses API mock no persistencia, schema estricto, sin herramientas',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  const body=JSON.parse(options.body);
  const request=JSON.parse(body.input[1].content[1].text);
  assert.equal(body.store,false);
  assert.equal(body.tools.length,0);
  assert.equal(body.max_output_tokens,5000);
  assert.equal(body.text.format.type,'json_schema');
  assert.equal(body.text.format.strict,true);
  assert.equal(body.input[0].role,'system');
  assert.equal(request.lotNumber,1);
  assert.deepEqual(request.rows,lines);
  return new Response(envelope(sampleOutput()),{status:200});
 };
 const reader=crearLectorIALotesMvp339({
  enabled:true,apiKey:KEY,model:'gpt-6-luna',fetchImpl
 });
 const first=await reader(req);
 const second=await reader({...req,perspective:'corroboration'});
 assert.deepEqual(first,sampleOutput());
 assert.deepEqual(first,second);
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.url==='https://api.openai.com/v1/responses'));
 assert.notEqual(
  JSON.parse(calls[0].options.body).input[1].content[0].text,
  JSON.parse(calls[1].options.body).input[1].content[0].text
 );
 assert.equal(JSON.stringify(first).includes(KEY),false);
});
test('MVP339: IA apagada / credenciales inválidas no hace request',async()=>{
 let called=false;
 const fetchImpl=async()=>{called=true;throw Error('must not execute')};
 for(const options of [
  {enabled:false,apiKey:KEY,model:'gpt-6-luna'},
  {enabled:true,apiKey:'invalid',model:'gpt-6-luna'},
  {enabled:true,apiKey:KEY,model:'not-a-model'}
 ]){
  const read=crearLectorIALotesMvp339({...options,fetchImpl});
  await assert.rejects(read(req),/lot_ai_(disabled|configuration)/);
 }
 assert.equal(called,false);
});
test('MVP339: respuesta incompleta, JSON distinto y códigos HTTP se retienen',async()=>{
 const fixtures=[
  [new Response('',{status:429}), 'lot_ai_quota'],
  [new Response('',{status:502}), 'lot_ai_server_error'],
  [new Response('{}',{status:200}), 'lot_ai_incomplete'],
  [new Response(JSON.stringify({status:'incomplete',output:[]}),
   {status:200}), 'lot_ai_incomplete'],
  [new Response(envelope({...sampleOutput(),lotDigest:'invalid'}),
   {status:200}),'lot_ai_invalid_schema'],
  [new Response(envelope({...sampleOutput(),readings:[{
   ...sampleOutput().readings[0],unitPrice:17
  }]}),{status:200}),'lot_ai_invalid_schema'],
  [new Response(envelope({...sampleOutput(),readings:[]}),
   {status:200}),'lot_ai_invalid_schema']
 ];
 for(const [response,error] of fixtures){
  const reader=crearLectorIALotesMvp339({
   enabled:true,apiKey:KEY,model:'gpt-6-luna',
   fetchImpl:async()=>response
  });
  await assert.rejects(reader(req),new RegExp(error));
 }
});
test('MVP339: un lote de 21 filas es rechazado antes de OpenAI',async()=>{
 let called=false;
 const read=crearLectorIALotesMvp339({
  enabled:true,apiKey:KEY,model:'gpt-6-luna',
  fetchImpl:async()=>{called=true;throw Error('not called')}
 });
 await assert.rejects(read({...req,rows:
  Array.from({length:21},(_,i)=>({
   position:i+1,section:'pagina:1',literal:'Cemento '+i
  }))
 }),/lot_ai_invalid_input/);
 assert.equal(called,false);
});
test('MVP339: no devuelve datos sensibles de la respuesta HTTP en errores',async()=>{
 const read=crearLectorIALotesMvp339({
  enabled:true,apiKey:KEY,model:'gpt-6-luna',
  fetchImpl:async()=>{throw Error('secret and original leak')}
 });
 await assert.rejects(read(req),e=>{
  assert.equal(e.message,'lot_ai_transport_unavailable');
  assert.equal(e.message.includes('secret'),false);
  return true;
 });
});
