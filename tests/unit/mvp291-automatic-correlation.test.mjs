import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 corroborarCantidadMvp291,elegirRondaUnicaMvp291,
 correlacionAutomaticaMvp291
} from '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp291.ts';
const H='a'.repeat(64),E='b'.repeat(64),SHA='c'.repeat(64);
const newId='11111111-1111-4111-8111-111111111111',
 oldId='22222222-2222-4222-8222-222222222222';
const src=[
 {line_no:1,description:'Cemento Avellaneda bolsa 25 kg',quantity:'40',unit:'bolsas'},
 {line_no:2,description:'Arena BIG BAG',quantity:'3',unit:'big bag'}
];
const latest={request_id:newId,lines:[
 {line_no:1,description:'Cemento CPC de 50 kg',quantity:'20',unit:'bag'},
 {line_no:2,description:'Bolsones de arena',quantity:'3',unit:'bag'}
]};
const earlier={request_id:oldId,lines:[
 {line_no:1,description:'Cemento CPC 50 kg',quantity:'10',unit:'bag'},
 {line_no:2,description:'Arena fina',quantity:'4',unit:'m3'},
 {line_no:3,description:'Piedra partida',quantity:'2',unit:'m3'}
]};
const evidence={matches:[
 {candidate:'r1',source_line:1,request_line:1,relation:'equivalent'},
 {candidate:'r1',source_line:2,request_line:2,relation:'equivalent'},
 {candidate:'r2',source_line:1,request_line:1,relation:'equivalent'},
 {candidate:'r2',source_line:2,request_line:2,relation:'uncertain'}
]};
test('correlates 40 bags × 25kg to 20 bags × 50kg, not 10 bags × 50kg',()=>{
 assert.equal(corroborarCantidadMvp291(src[0],latest.lines[0]),'strong');
 assert.equal(corroborarCantidadMvp291(src[0],earlier.lines[0]),'different');
 assert.equal(corroborarCantidadMvp291({line_no:1,description:'Cemento 25 kg',
 quantity:'20',unit:'bag'},latest.lines[0]),'different');
 assert.equal(corroborarCantidadMvp291(src[1],latest.lines[1]),'strong');
});
test('two independent matching interpretations, unique margin, no total price',()=>{
 const r=elegirRondaUnicaMvp291({quote:src,options:[latest,earlier]},
 evidence,{matches:[...evidence.matches].reverse()});
 assert.equal(r.requestId,newId);
 assert.deepEqual(r.scores,[6,0]);
});
test('indistinguishable or model-disagreeing requests are NOT forced into buyer',()=>{
 const identical={...latest,request_id:oldId,lines:[...latest.lines]};
 const amb={quote:src,options:[latest,identical]};
 const data={matches:evidence.matches.slice(0,2).flatMap(x=>[
 x,{...x,candidate:'r2'}])};
 assert.equal(elegirRondaUnicaMvp291(amb,data,data).requestId,null);
 assert.equal(elegirRondaUnicaMvp291({quote:src,options:[latest,earlier]},
 evidence,{matches:[]}).requestId,null);
});
test('partial distinctive offers may link, partial shared or unsupported remain private',()=>{
 const short={quote:[src[0]],options:[latest,
  {request_id:oldId,lines:[{line_no:1,description:'Pintura látex',
    quantity:'5',unit:'l'}]}]};
 const one={matches:[{candidate:'r1',source_line:1,request_line:1,
  relation:'equivalent'}]};
 assert.equal(elegirRondaUnicaMvp291(short,one,one).requestId,newId);
 const shared={quote:[src[0]],options:[latest,
  {...earlier,lines:[{...earlier.lines[0],quantity:'20'},...earlier.lines.slice(1)]}]};
 const both={matches:[...one.matches,{
  candidate:'r2',source_line:1,request_line:1,relation:'equivalent'}]};
 assert.equal(elegirRondaUnicaMvp291(shared,both,both).requestId,null);
 const weak={matches:[{candidate:'r1',source_line:1,request_line:1,relation:'uncertain'}]};
 assert.equal(elegirRondaUnicaMvp291(short,weak,weak).requestId,null);
});
test('MVP336: Ailín PDF with 15/2/1 and no separate units matches current, not older 20/3',()=>{
 const original=[
  {line_no:1,description:'Cemento Avellaneda; Dscto. 22.4%',quantity:'15,00',unit:null},
  {line_no:2,description:'BIG BAG de Arena; Dscto. 22.4%',quantity:'2,00',unit:null},
  {line_no:3,description:'BIG BAG de Piedra; Dscto. 22.4%',quantity:'1,00',unit:null}
 ];
 const present={request_id:newId,lines:[
  {line_no:1,description:'bolsas de cemento CPC de 50 kg',quantity:'15',unit:'bag'},
  {line_no:2,description:'bolsones de arena',quantity:'2',unit:'bag'},
  {line_no:3,description:'bolsón de piedra',quantity:'1',unit:'bag'}
 ]};
 const previous={request_id:oldId,lines:[
  {line_no:1,description:'bolsas de cemento CPC de 50 kg',quantity:'20',unit:'bag'},
  {line_no:2,description:'bolsones de arena',quantity:'3',unit:'bag'}
 ]};
 const draft={matches:[
  {candidate:'r1',source_line:1,request_line:1,relation:'equivalent'},
  {candidate:'r1',source_line:2,request_line:2,relation:'equivalent'},
  {candidate:'r1',source_line:3,request_line:3,relation:'equivalent'},
  {candidate:'r2',source_line:1,request_line:1,relation:'equivalent'},
  {candidate:'r2',source_line:2,request_line:2,relation:'equivalent'}
 ]};
 const res=elegirRondaUnicaMvp291({quote:original,options:[present,previous]},
  draft,{matches:[...draft.matches].reverse()});
 assert.equal(res.requestId,newId);
 assert.deepEqual(res.scores,[6,2]);
 assert.equal(res.reason,'unique_material_evidence');
 // No units were invented: the per-line quantity corroborator stays unknown.
 assert.equal(corroborarCantidadMvp291(original[0],present.lines[0]),'unknown');
});
test('MVP336: unitless count is NOT enough with two items, duplicate rounds or packaging conflicts',()=>{
 const source=[
  {line_no:1,description:'Cemento 25 kg',quantity:'15',unit:null},
  {line_no:2,description:'Arena',quantity:'2',unit:null},
  {line_no:3,description:'Piedra',quantity:'1',unit:null}
 ];
 const target={request_id:newId,lines:[
  {line_no:1,description:'Cemento 50 kg',quantity:'15',unit:'bag'},
  {line_no:2,description:'Arena',quantity:'2',unit:'bag'},
  {line_no:3,description:'Piedra',quantity:'1',unit:'bag'}
 ]};
 const other={request_id:oldId,lines:[
  {line_no:1,description:'Cemento 50 kg',quantity:'20',unit:'bag'},
  {line_no:2,description:'Arena',quantity:'3',unit:'bag'}
 ]};
 const links={matches:[1,2,3].map(i=>({candidate:'r1',source_line:i,
  request_line:i,relation:'equivalent'}))};
 // Conflicting 25kg vs 50kg may not be counted as an exact package-size clue.
 assert.equal(elegirRondaUnicaMvp291({quote:source,options:[target,other]},
  links,links).requestId,null);
 // Without that conflict, 2 identical numeric counts are still inadequate.
 const onlyTwo={quote:source.slice(1),options:[
  {...target,lines:target.lines.slice(1)},{...other,lines:other.lines.slice(1)}]};
 const two={matches:[{candidate:'r1',source_line:2,request_line:2,relation:'same'},
  {candidate:'r1',source_line:3,request_line:3,relation:'same'}]};
 assert.equal(elegirRondaUnicaMvp291(onlyTwo,two,two).requestId,null);
 // 3 matches to two near-identical candidate lists must remain unresolved.
 const identical={...target,request_id:oldId,lines:[...target.lines]};
 const both={matches:links.matches.flatMap(v=>[v,{...v,candidate:'r2'}])};
 const noConflict={...source[0],description:'Cemento'};
 assert.equal(elegirRondaUnicaMvp291({quote:[noConflict,...source.slice(1)],
  options:[target,identical]},both,both).requestId,null);
});
test('SQL is the only binding authority, source and chat HMAC required',async()=>{
 const calls=[];let reads=0;
 const snapshot={state:'reserved',source_sha256:SHA,quote:src,
  candidates:[latest,earlier],note:null};
 const done=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:H,chatHmac:E,
  apiKey:'this-is-a-fake-test-token-not-real',model:'gpt-6-luna',
  rpc:async(name,params)=>{
   calls.push({name,params});
   if(name==='cotironda_piloto_auto_correlation_prepare_mvp291')
    return {data:snapshot,error:null};
   if(name==='cotironda_piloto_auto_correlation_bind_mvp291'){
    assert.equal(params.p_request,newId);
    assert.equal(params.p_source_sha256,SHA);
    assert.equal(params.p_chat_hmac,E);
    return {data:{state:'linked_private'},error:null};
   }
   throw Error('unexpected DB write '+name);
  },
  compare:async input=>{
   reads++;
   assert.equal(JSON.stringify(input).includes('precio'),false);
   return evidence;
  }
 });
 assert.equal(done.state,'linked_private');
 assert.equal(done.outboundMessages,0);
 assert.equal(reads,2);
 assert.deepEqual(calls.map(x=>x.name),[
  'cotironda_piloto_auto_correlation_prepare_mvp291',
  'cotironda_piloto_auto_correlation_bind_mvp291']);
});
test('MVP336: internal retry uses the separate SQL reservation and audits the same source',async()=>{
 const calls=[];const unitless=[
  {line_no:1,description:'Cemento',quantity:'15,00',unit:null},
  {line_no:2,description:'Arena',quantity:'2,00',unit:null},
  {line_no:3,description:'Piedra',quantity:'1,00',unit:null}
 ];
 const newRound={request_id:newId,lines:[
  {line_no:1,description:'Cemento 50kg',quantity:'15',unit:'bag'},
  {line_no:2,description:'Arena',quantity:'2',unit:'bag'},
  {line_no:3,description:'Piedra',quantity:'1',unit:'bag'}
 ]};
 const oldRound={request_id:oldId,lines:[
  {line_no:1,description:'Cemento 50kg',quantity:'20',unit:'bag'},
  {line_no:2,description:'Arena',quantity:'3',unit:'bag'}
 ]};
 const p={matches:[
  ...[1,2,3].map(i=>({candidate:'r1',source_line:i,request_line:i,relation:'same'})),
  ...[1,2].map(i=>({candidate:'r2',source_line:i,request_line:i,relation:'equivalent'}))
 ]};
 const result=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:H,chatHmac:E,
  retryReviewedOnce:true,
  apiKey:'synthetic-credential-12345678',model:'gpt-6-luna',
  rpc:async(name,args)=>{
   calls.push(name);
   if(name==='cotironda_piloto_auto_correlation_retry_prepare_mvp336')
    return {data:{state:'reserved',source_sha256:SHA,
     quote:unitless,candidates:[newRound,oldRound]},error:null};
   if(name==='cotironda_piloto_auto_correlation_bind_mvp291'){
    assert.equal(args.p_request,newId);assert.equal(args.p_source_sha256,SHA);
    return {data:{state:'linked_private'},error:null};
   }
   throw Error('unexpected SQL '+name);
  },
  compare:async()=>p
 });
 assert.equal(result.state,'linked_private');
 assert.equal(result.outboundMessages,0);
 assert.deepEqual(calls,[
  'cotironda_piloto_auto_correlation_retry_prepare_mvp336',
  'cotironda_piloto_auto_correlation_bind_mvp291']);
});
test('no candidate, disabled flag and wrong HMAC fail closed without OpenAI',async()=>{
 let called=0;
 const no=()=>{called++;throw Error('unexpected call')};
 const base={enabled:true,webhookAuthenticated:true,
  sourceHmac:H,chatHmac:E,
  apiKey:'this-is-a-fake-test-token-not-real',model:'gpt-6-luna',
  rpc:no,compare:no};
 assert.equal((await correlacionAutomaticaMvp291({...base,enabled:false})).state,'disabled');
 assert.equal((await correlacionAutomaticaMvp291({...base,chatHmac:'bad'})).state,'not_eligible');
 assert.equal((await correlacionAutomaticaMvp291({...base,webhookAuthenticated:false})).state,'not_eligible');
 assert.equal(called,0);
 const noCandidate=await correlacionAutomaticaMvp291({
  ...base,rpc:async()=>({data:{state:'not_ambiguous_anymore'},error:null})
 });
 assert.equal(noCandidate.state,'not_eligible');assert.equal(called,0);
});
test('uncertain AI or duplicated source never binds, never sends WhatsApp',async()=>{
 const calls=[];
 const v=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:H,chatHmac:E,
  apiKey:'this-is-a-fake-test-token-not-real',model:'gpt-6-luna',
  rpc:async(name,params)=>{
   calls.push(name);
   if(name==='cotironda_piloto_auto_correlation_prepare_mvp291')
    return {data:{state:'reserved',source_sha256:SHA,quote:src,
     candidates:[latest,earlier]},error:null};
   assert.equal(name,'cotironda_piloto_auto_correlation_finish_mvp291');
   assert.equal(params.p_state,'review');
   return {data:{state:'recorded'},error:null};
  },
  compare:async()=>({matches:[]})
 });
 assert.equal(v.state,'unresolved_private');
 assert.equal(v.outboundMessages,0);
 assert.ok(!calls.includes('cotironda_piloto_auto_correlation_bind_mvp291'));
});
test('webhook does not introduce supplier choice codes or require user action',()=>{
 const content=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const archived=content.indexOf("cotironda_piloto_note_media_proposal_mvp095");
 const automatic=content.indexOf('correlacionAutomaticaMvp291({',archived);
 const receipt=content.indexOf("cotironda_piloto_record_supplier_media_mvp098");
 assert.ok(archived>0&&automatic>archived&&receipt>automatic);
 assert.match(content,/COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED/u);
 assert.doesNotMatch(content,/supplierChoiceReply|REVISAR COTI|consultarRondaMvp290/u);
});
