import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 corroborarMaterialesTextoMvp292,extraerMaterialesTextoMvp292
} from '../../supabase/functions/cotironda-piloto-whapi/supplier-text-materials-mvp292.ts';
import {correlacionAutomaticaMvp291} from '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp291.ts';
const SHA='a'.repeat(64),H='b'.repeat(64),CHAT='c'.repeat(64);
const newId='11111111-1111-4111-8111-111111111111',
 oldId='22222222-2222-4222-8222-222222222222';
const source='Buenas, te cotizo:\n40 bolsas de cemento Avellaneda 25 kg $100 c/u\n3 bolsones de arena $250 cada uno\nIVA sin informar';
const first={items:[
 {original:'40 bolsas de cemento Avellaneda 25 kg $100 c/u',
  description:'cemento Avellaneda 25 kg',quantity:'40',unit:'bolsas'},
 {original:'3 bolsones de arena $250 cada uno',
  description:'bolsones de arena',quantity:'3',unit:'bolsones'}
]};
const options=[
 {request_id:newId,lines:[
  {line_no:1,description:'Cemento CPC 50 kg',quantity:'20',unit:'bag'},
  {line_no:2,description:'Bolsones de arena',quantity:'3',unit:'bag'}]},
 {request_id:oldId,lines:[
  {line_no:1,description:'Cemento CPC 50 kg',quantity:'10',unit:'bag'},
  {line_no:2,description:'Arena fina',quantity:'4',unit:'m3'}]}
];
const pairs={matches:[
 {candidate:'r1',source_line:1,request_line:1,relation:'equivalent'},
 {candidate:'r1',source_line:2,request_line:2,relation:'equivalent'},
 {candidate:'r2',source_line:1,request_line:1,relation:'equivalent'},
 {candidate:'r2',source_line:2,request_line:2,relation:'uncertain'}
]};
test('MVP292: two independent literal text reads produce noncommercial materials',()=>{
 const items=corroborarMaterialesTextoMvp292(source,first,{
  items:[...first.items]});
 assert.equal(items.length,2);
 assert.deepEqual(items.map(x=>[x.quantity,x.unit]),[['40','bolsas'],['3','bolsones']]);
 assert.ok(items.every(x=>!x.description.includes('$')));
});
test('MVP292: wrong numbers, prices as quantities, invented text, disagreement fail closed',()=>{
 for(const fake of [
  {items:[{...first.items[0],quantity:'100'},first.items[1]]},
  {items:[{...first.items[0],description:'cemento mágico'},first.items[1]]},
  {items:[{...first.items[0],description:'cemento Avellaneda 25 kg $100'},first.items[1]]},
  {items:[{...first.items[0],unit:'toneladas'},first.items[1]]},
  {items:[first.items[1],first.items[0]]}
 ])assert.equal(corroborarMaterialesTextoMvp292(source,first,fake),null);
});
test('MVP292: two calls only, no business quote or recipient output',async()=>{
 let reads=0;
 const extracted=await extraerMaterialesTextoMvp292({
  source,apiKey:'not-a-real-testing-key-12345678',model:'gpt-6-luna',
  read:async(text)=>{reads++;assert.equal(text,source);return first}
 });
 assert.equal(reads,2);assert.equal(extracted.length,2);
});
test('MVP292: source-hash staging then legacy+central candidate pool, then atomic bind',async()=>{
 const calls=[];
 const data={state:'reserved',source_sha256:SHA,
  quote:[{line_no:1,description:'cemento Avellaneda 25 kg',quantity:'40',unit:'bolsas'},
   {line_no:2,description:'bolsones de arena',quantity:'3',unit:'bolsones'}],
  candidates:options,note:null};
 const out=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:H,chatHmac:CHAT,
  textSha256:SHA,textQuote:data.quote,
  apiKey:'not-a-real-testing-key-12345678',model:'gpt-6-luna',
  compare:async()=>pairs,
  rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='cotironda_piloto_stage_supplier_text_mvp292')
    return {data:{state:'staged'},error:null};
   if(name==='cotironda_piloto_auto_correlation_prepare_mvp291')
    return {data,error:null};
   if(name==='cotironda_piloto_auto_correlation_bind_mvp291'){
    assert.equal(args.p_request,newId);
    assert.equal(args.p_source_sha256,SHA);
    return {data:{state:'linked_private'},error:null};
   }
   throw Error('unexpected operation: '+name);
  }
 });
 assert.equal(out.state,'linked_private');
 assert.equal(out.outboundMessages,0);
 assert.deepEqual(calls.map(x=>x[0]),[
  'cotironda_piloto_stage_supplier_text_mvp292',
  'cotironda_piloto_auto_correlation_prepare_mvp291',
  'cotironda_piloto_auto_correlation_bind_mvp291'
 ]);
});
test('MVP292: replay after a source has been staged never calls the model again',async()=>{
 let calls=0,reads=0;
 const out=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:H,chatHmac:CHAT,
  textSha256:SHA,textQuote:[{line_no:1,description:'cemento',quantity:'40',unit:'bolsas'}],
  apiKey:'not-a-real-testing-key-12345678',model:'gpt-6-luna',
  compare:async()=>{reads++;throw Error('should not run')},
  rpc:async(name)=>{
   calls++;
   if(name==='cotironda_piloto_stage_supplier_text_mvp292')
    return {data:{state:'already_staged'},error:null};
   return {data:{state:'already_reserved'},error:null};
  }
 });
 assert.equal(out.state,'not_eligible');assert.equal(reads,0);
 assert.equal(calls,2);
});
test('MVP292: webhook links text without asking supplier to choose source',()=>{
 const code=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(code,/extraerMaterialesTextoMvp292\(/u);
 assert.match(code,/textQuote:textMaterials,textSha256:textHash/u);
 assert.match(code,/supplier_text_auto_correlation_reconciliation_required/u);
 assert.match(code,/COTIRONDA_PILOT_AUTO_TEXT_MVP292_ENABLED/u);
 assert.ok(code.indexOf('correlacionAutomaticaMvp291({')<code.indexOf('supplier_media_reconciliation_required'));
});
