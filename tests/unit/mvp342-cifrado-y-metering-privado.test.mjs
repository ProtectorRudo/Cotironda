import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {armarZip} from '../helpers/xlsx-fixture.mjs';
import {
 prepararClaveLotesMvp342,cifrarLecturaMvp342,descifrarLecturaMvp342
} from '../../src/domain/ia-central/cifrado-lectura-lotes-mvp342.ts';
import {procesarOriginalMedidoMvp342} from
 '../../src/domain/ia-central/worker-lecturas-medidas-mvp342.ts';
import {extraerEvidenciaPrivadaMvp338} from
 '../../src/domain/ia-central/fuente-binaria-privada-mvp338.ts';
import {readOfficeVisibleRows} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-source-office.ts';

const msg='a'.repeat(64),chat='b'.repeat(64),source='d'.repeat(64),
 planSha='e'.repeat(64),digest='f'.repeat(64),receipt='a'.repeat(32);
const keyHex='cd'.repeat(32),model='gpt-6-luna';
const base={sourceSha256:source,planSha256:planSha,
 sourceHmac:msg,chatHmac:chat,
 supplierKey:'corralon_ailin',
 roundId:'aefe169e-7801-4efc-aabf-25cd134744eb',
 receipt,lotNumber:1,lotDigest:digest,perspective:'primary',model};
const reading={sourceSha256:source,lotNumber:1,lotDigest:digest,
 readings:[{position:1,kind:'material',evidence:'Cemento $ 8.500',
  description:'Cemento',quantity:null,unit:null,unitPrice:'$ 8.500',
  lineTotal:null}]};
test('MVP342: AES-256-GCM dos lecturas cifradas y AAD impide cruce de ronda o origen',async()=>{
 const key=await prepararClaveLotesMvp342(keyHex);
 const a=await cifrarLecturaMvp342({key,context:base,reading});
 const b=await cifrarLecturaMvp342({key,context:base,reading});
 assert.match(a.ivB64,/^[A-Za-z0-9+/]{16}$/);
 assert.notEqual(a.ivB64,b.ivB64);
 assert.notEqual(a.ciphertextB64,b.ciphertextB64);
 assert.equal(a.sha256,b.sha256);
 assert.equal(JSON.stringify(a).includes('Cemento'),false);
 assert.deepEqual(await descifrarLecturaMvp342({key,context:base,envelope:a}),reading);
 for(const altered of [
  {...base,roundId:'ddec169e-7801-4efc-aabf-25cd134744eb'},
  {...base,supplierKey:'corralon_nahuel'},
  {...base,sourceHmac:'f'.repeat(64)},
  {...base,chatHmac:'d'.repeat(64)},
  {...base,perspective:'corroboration'},
  {...base,lotNumber:2},
  {...base,receipt:'b'.repeat(32)},
  {...base,model:'gpt-6.1-sol'},
  {...base,lotDigest:'1'.repeat(64)}
 ])await assert.rejects(
  descifrarLecturaMvp342({key,context:altered,envelope:a}));
 await assert.rejects(
  descifrarLecturaMvp342({key,context:base,envelope:{
   ...a,ciphertextB64:'AA'+a.ciphertextB64.slice(2)
  }}));
 await assert.rejects(prepararClaveLotesMvp342('bad-key'),
  /mvp342_key_unconfigured/);
});
const enc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
function docx(lines){
 return armarZip({
  '[Content_Types].xml':'<Types/>',
  'word/document.xml':'<w:document><w:body>'+
  lines.map(x=>'<w:p><w:r><w:t>'+enc(x)+'</w:t></w:r></w:p>')
   .join('')+'</w:body></w:document>'
 });
}
const items=['PRESUPUESTO','Cemento CPC 15 bolsas $ 127500',
 'Arena 2 bolsones $ 73000','Flete a convenir','IVA no incluido',
 'TOTAL $ 200500'];
const bytes=new Uint8Array(docx(items));
const sha=createHash('sha256').update(bytes).digest('hex');
const id='resp_aaaaaaaaaa';
function interpret(req){
 return {
  sourceSha256:req.sourceSha256,lotNumber:req.lotNumber,
  lotDigest:req.lotDigest,readings:req.rows.map(r=>{
   const kind=/^TOTAL /u.test(r.literal)?'total':
    /IVA|Flete/u.test(r.literal)?'condition':
    /^PRESUPUESTO/u.test(r.literal)?'header':'material';
   const cash=r.literal.match(/\$ \d+/u)?.[0]??null;
   return {position:r.position,kind,evidence:r.literal,
    description:null,quantity:null,unit:null,
    unitPrice:kind==='material'?cash:null,
    lineTotal:kind==='total'?cash:null};
  })
 };
}
function setup(opts={}){
 const states=[],events=[],calls=new Map();let aggregate='new';
 const candidate={
  state:'candidate',messageHmac:msg,chatHmac:chat,
  supplierKey:base.supplierKey,roundId:base.roundId,
  sourceSha256:sha,mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  sizeBytes:bytes.length,storagePath:'media/'+msg
 };
 const rpc=async(name,params)=>{
  events.push({name,params});
  if(name==='cotironda_piloto_source_for_lots_mvp341')
   return {data:aggregate==='new'?candidate:{state:'already_processed'},error:null};
  if(name==='cotironda_piloto_reserve_supplier_lots_mvp340'){
   aggregate='leased';
   return {data:{state:'reserved',receipt,
    roundId:base.roundId,supplierKey:base.supplierKey,
    messageHmac:msg,chatHmac:chat,sourceSha256:sha},error:null};
  }
  if(name==='cotironda_piloto_begin_lot_call_mvp342'){
   const n=(params.p_lot_number-1)*2+
    (params.p_perspective==='corroboration'?2:1);
   if(n!==calls.size+1||[...calls.values()].some(x=>x.state!=='observed'))
    return {data:{state:'already_reserved_or_out_of_order'},error:null};
   calls.set(n,{state:'reserved',...params});
   return {data:{state:'reserved'},error:null};
  }
  if(name==='cotironda_piloto_finish_lot_call_mvp342'){
   const n=(params.p_lot_number-1)*2+
    (params.p_perspective==='corroboration'?2:1);
   const c=calls.get(n);
   assert.equal(c.state,'reserved');
   c.state=params.p_state;c.result=params;
   assert.equal(params.p_message_hmac,msg);
   assert.equal(params.p_receipt,receipt);
   assert.equal(params.p_plan_sha256,events.find(x=>x.name==='cotironda_piloto_reserve_supplier_lots_mvp340').params.p_plan_sha256);
   if(params.p_state==='observed'){
    assert.equal(params.p_input_tokens,120);
    assert.equal(params.p_output_tokens,40);
    assert.equal(params.p_total_tokens,160);
    assert.equal(JSON.stringify(params).includes('Cemento'),false);
   }else{
    assert.equal(params.p_nonce_b64,null);
    assert.equal(params.p_total_tokens,null);
   }
   return {data:{state:'recorded'},error:null};
  }
  if(name==='cotironda_piloto_observed_lots_mvp342'){
   return {data:{state:calls.size===2&&[...calls.values()].every(x=>x.state==='observed')?
    'observed_complete':'pending_or_unmetered'},error:null};
  }
  if(name==='cotironda_piloto_finish_supplier_lots_mvp340'){
   aggregate=params.p_state==='analysis_ready_private'?'complete':'review';
   return {data:{state:'recorded'},error:null};
  }
  throw Error('unexpected SQL '+name);
 };
 let modelCount=0,downloadCount=0;
 const readModel=async req=>{
  modelCount++;
  if(opts.networkFail&&modelCount===1)throw Error('external price and secret');
  if(opts.usageMissing&&modelCount===1)
   return {reading:interpret(req),usage:{...opts.usageMissing}};
  return {reading:interpret(req),usage:{
   inputTokens:120,outputTokens:40,totalTokens:160,
   responseId:id
  }};
 };
 return {
  events,calls,get modelCount(){return modelCount},
  get downloadCount(){return downloadCount},
  args:{enabled:true,trustedInternal:true,sourceHmac:msg,
   maxModelCalls:4,model,encryptionHex:keyHex,rpc,
   download:async path=>{
    assert.equal(path,'media/'+msg);downloadCount++;
    return {data:new Blob([bytes]),error:null};
   },
   readBinary:file=>extraerEvidenciaPrivadaMvp338(file,{
    readOfficeVisibleRows
   }),readModel
  }
 };
}
test('MVP342: archivo binario -> reserva -> 2 llamadas medidas -> 2 sobrecifrados -> gate observado',async()=>{
 const state=setup();
 const result=await procesarOriginalMedidoMvp342(state.args);
 assert.equal(result.state,'analysis_ready_private',result.reason);
 assert.equal(result.rows,items.length);
 assert.equal(result.modelCalls,2);
 assert.equal(state.modelCount,2);
 assert.equal(state.downloadCount,1);
 assert.equal(result.economicPublicationAllowed,false);
 assert.equal(result.quotesPublished,0);
 assert.equal(result.whatsappMessages,0);
 const results=[...state.calls.values()];
 assert.equal(results.length,2);
 const k=await prepararClaveLotesMvp342(keyHex);
 const plan=state.events.find(x=>x.name==='cotironda_piloto_reserve_supplier_lots_mvp340').params.p_plan_sha256;
 for(const x of results){
  assert.equal(x.state,'observed');
  const context={sourceSha256:sha,sourceHmac:msg,chatHmac:chat,
   supplierKey:base.supplierKey,roundId:base.roundId,receipt,
   planSha256:plan,lotNumber:x.p_lot_number,lotDigest:x.p_lot_digest,
   perspective:x.p_perspective,model};
  const decrypted=await descifrarLecturaMvp342({key:k,context,envelope:{
   version:1,ivB64:x.result.p_nonce_b64,
   ciphertextB64:x.result.p_ciphertext_b64,
   sha256:x.result.p_cleartext_sha256
  }});
  assert.equal(decrypted.readings.length,items.length);
 }
 assert.ok(state.events.findIndex(x=>x.name==='cotironda_piloto_begin_lot_call_mvp342')>
  state.events.findIndex(x=>x.name==='cotironda_piloto_reserve_supplier_lots_mvp340'));
 assert.ok(state.events.findIndex(x=>x.name==='cotironda_piloto_observed_lots_mvp342')>
  state.events.findIndex(x=>x.name==='cotironda_piloto_finish_lot_call_mvp342'));
 const again=await procesarOriginalMedidoMvp342(state.args);
 assert.equal(again.state,'already_processed');
 assert.equal(state.modelCount,2);
 assert.equal(state.downloadCount,1);
});
test('MVP342: si la red falla, registra consumo desconocido y no repite ni publica',async()=>{
 const state=setup({networkFail:true});
 const result=await procesarOriginalMedidoMvp342(state.args);
 assert.equal(result.state,'review_required',result.reason);
 assert.equal(result.modelCalls,1);
 assert.equal(state.calls.get(1).state,'unmetered');
 assert.equal(state.calls.get(1).result.p_reason,'network_uncertain');
 assert.equal(state.modelCount,1);
 assert.equal(result.quotesPublished,0);
});
test('MVP342: uso inexistente o incoherente queda bloqueado, sin tratarse como $0',async()=>{
 for(const usageMissing of [
  {inputTokens:20,outputTokens:5,totalTokens:99,responseId:id},
  {inputTokens:20,outputTokens:5,totalTokens:25,responseId:'fake'}
 ]){
  const state=setup({usageMissing});
  const result=await procesarOriginalMedidoMvp342(state.args);
  assert.equal(result.state,'review_required');
  assert.equal(state.calls.get(1).state,'unmetered');
  assert.equal(state.calls.get(1).result.p_reason,'invalid_usage');
  assert.equal(state.modelCount,1);
 }
});
test('MVP342: sin secreto AES válido no consulta base, storage ni modelo',async()=>{
 const state=setup();
 const result=await procesarOriginalMedidoMvp342({
  ...state.args,encryptionHex:'not-a-key'
 });
 assert.equal(result.state,'disabled');
 assert.equal(state.events.length,0);
 assert.equal(state.modelCount,0);
});
test('MVP342: gate de uso no confirmado impide finalizar aunque las dos lecturas coincidan',async()=>{
 const state=setup();
 const rpc=async(name,params)=>{
  if(name==='cotironda_piloto_observed_lots_mvp342')
   return {data:{state:'pending_or_unmetered'},error:null};
  return state.args.rpc(name,params);
 };
 const result=await procesarOriginalMedidoMvp342({...state.args,rpc});
 assert.equal(result.state,'reconciliation_required');
 assert.equal(result.quotesPublished,0);
 assert.equal(state.modelCount,2);
});
