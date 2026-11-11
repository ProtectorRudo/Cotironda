import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {evaluarMaterialesRecuperadosMvp348} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-material-fidelity-mvp348.ts';
import {procesarPendienteAutomaticoMvp292} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-recovery-worker-mvp292.ts';
import {invokeAutoRecoveryMvp293} from
 '../../supabase/functions/cotironda-piloto-document-recovery/auto-recovery-tick-mvp293.ts';

const SOURCE='a'.repeat(64),CHAT='b'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const SHA=createHash('sha256').update(bytes).digest('hex');
const line=(description,quantity,unit)=>({
 original_description:description,quantity,unit,
 unit_price:'$ 100,00',line_total:'$ 200,00',
 evidence_location:'pagina 1',ambiguity:null
});
const draft=(rows=[line('Cemento CPC 50 kg','2,00',null),
 line('BIG BAG de Arena','1,00',null)])=>({
 kind:'supplier_quote',status:'review_required',
 delivery_city:null,requested_delivery_note:null,
 lines:rows,total_declared:'$ 400,00',unanswered:[]
});
const verdict=(first,second)=>evaluarMaterialesRecuperadosMvp348(first,second);

test('MVP348: literally equal materials are unchanged and retain exact literal evidence',()=>{
 const a=draft(),r=verdict(a,structuredClone(a));
 assert.deepEqual(r,{matched:true,mode:'literal',reason:'material_scope_literal'});
 assert.equal(a.lines[0].original_description,'Cemento CPC 50 kg');
});
test('MVP348: case, NFC, repeated whitespace and unambiguous 2 decimal punctuation only',()=>{
 const a=draft(),b=draft([
  line('  cemento  CPC  50 kg ','2.0',null),
  line('big bag   DE Arena','1',null)
 ]);
 assert.deepEqual(verdict(a,b),{
  matched:true,mode:'format_only',reason:'material_scope_format_only'
 });
 const accented=draft([line('Cal hidratada','1,50','BOLSAS')]);
 const same=draft([line(' CAL  HIDRATADA ','1.5',' bolsas ')]);
 assert.equal(verdict(accented,same).matched,true);
 const decomposed=draft([line('Bolso\u0301n de arena','2,00',null)]);
 const composed=draft([line('Bolsón de arena','2.00',null)]);
 assert.equal(verdict(decomposed,composed).matched,true);
});
test('MVP348: changed material, brand and presentation never correlate',()=>{
 const a=draft();
 for(const b of [
  draft([line('Cemento CPC 25 kg','2,00',null),a.lines[1]]),
  draft([line('Cemento CP40 50 kg','2,00',null),a.lines[1]]),
  draft([a.lines[0],line('BIG BAG de Piedra','1,00',null)])
 ]){
  const r=verdict(a,b);
  assert.equal(r.matched,false);
  assert.equal(r.reason,'archived_material_description_mismatch');
 }
});
test('MVP348: three uniquely described materials may change ORDER, never contents',()=>{
 const a=draft([
  line('Cemento CPC 50 kg','15',null),
  line('Arena fina Big Bag','2',null),
  line('Piedra partida 6/20','1',null)
 ]);
 const b=draft([
  line('Piedra partida 6/20','1.00',null),
  line(' CEMENTO  CPC 50 kg ','15,00',null),
  line('arena fina big bag','2.0',null)
 ]);
 const proof=verdict(a,b);
 assert.deepEqual(proof,{matched:true,mode:'reordered_unique',
  reason:'material_scope_unique_reorder'});
 // No row is ever moved or rewritten; never swap unit prices/evidence.
 assert.equal(a.lines[0].original_description,'Cemento CPC 50 kg');
 assert.equal(b.lines[0].original_description,'Piedra partida 6/20');
 assert.equal(a.lines[0].unit_price,'$ 100,00');
 assert.equal(b.lines[0].unit_price,'$ 100,00');
 assert.equal(JSON.stringify(proof).includes('Cemento'),false);
});
test('MVP348: reordered brands, packaging, quantities or missing units remain BLOCKED',()=>{
 const a=draft([
  line('Cemento CPC 50 kg','15','bolsas'),
  line('Arena fina Big Bag','2',null),
  line('Piedra partida 6/20','1',null)
 ]);
 const other=[
  draft([line('Arena fina Big Bag','2',null),
   line('Cemento CPC 25 kg','15','bolsas'),a.lines[2]]),
  draft([a.lines[1],line('Cemento CP40 50 kg','15','bolsas'),a.lines[2]]),
  draft([a.lines[1],line('Cemento CPC 50 kg','16','bolsas'),a.lines[2]]),
  draft([a.lines[1],line('Cemento CPC 50 kg','15',null),a.lines[2]]),
  draft([a.lines[1],line('Cemento CPC 50 kg','15','bag'),a.lines[2]]),
  draft([a.lines[1],line('Cemento CPC 50 kg','1.000','bolsas'),a.lines[2]]),
  draft([a.lines[0],a.lines[1]])
 ];
 for(const b of other){
  const v=verdict(a,b);
  assert.equal(v.matched,false,JSON.stringify(v));
  assert.equal(v.mode,'review');
 }
});
test('MVP348: duplicate indistinguishable materials cannot be permuted',()=>{
 const duplicated=draft([
  line('Cemento CPC 50 kg','2',null),
  line('Cemento CPC 50 kg','2.00',null),
  line('Arena fina','1',null)
 ]);
 const shuffled=draft([duplicated.lines[2],
  duplicated.lines[1],duplicated.lines[0]]);
 const v=verdict(duplicated,shuffled);
 assert.equal(v.matched,false);
 assert.equal(v.reason,'archived_material_description_mismatch');
});
test('MVP348: same descriptions with different quantities remain unique when reordered',()=>{
 const a=draft([line('Arena fina','1',null),line('Arena fina','2',null),
  line('Cemento CPC','5',null)]);
 const b=draft([a.lines[2],a.lines[1],a.lines[0]]);
 const v=verdict(a,b);
 assert.equal(v.matched,true);
 assert.equal(v.mode,'reordered_unique');
});
test('MVP348: reordered rows never promote a private source directly to an offer',async()=>{
 const first=draft(),second=draft([draft().lines[1],draft().lines[0]]);
 assert.equal(verdict(first,second).mode,'reordered_unique');
 const calls=[];
 const actual=await procesarPendienteAutomaticoMvp292({
  enabled:true,trustedWorker:true,apiKey:'synthetic-credential-not-real-12345',
  model:'gpt-6-luna',documentSemanticEnabled:false,textCommercialEnabled:false,
  shaText:async()=>SHA,decrypt:async()=>{throw Error('no text')},
  download:async()=>({data:new Blob([bytes]),error:null}),
  readDocument:async()=>second,
  rpc:async(name,params)=>{
   calls.push(name);
   if(name==='cotironda_piloto_claim_auto_recovery_mvp292')
    return {data:{state:'claimed',source_hmac:SOURCE,chat_hmac:CHAT,
     source_sha256:SHA,kind:'document',mime:'application/pdf',
     size_bytes:bytes.length,draft:first},error:null};
   if(name==='cotironda_piloto_finish_auto_recovery_mvp292'){
    assert.equal(params.p_state,'linked');
    assert.equal(params.p_reason,'archive_quote_economic_or_source_review_required');
    return {data:{state:'recorded'},error:null};
   }
   throw Error('unexpected '+name);
  },
  correlate:async()=>({state:'linked_private',reason:'source_unique',outboundMessages:0}),
  replay:async()=>({state:'review_required',reason:'not_certified',
   outboundMessages:0})
 });
 assert.equal(actual.state,'review_required');
 assert.equal(actual.reason,'archive_quote_economic_or_source_review_required');
 assert.equal(actual.outboundMessages,0);
 assert.deepEqual(calls,[
  'cotironda_piloto_claim_auto_recovery_mvp292',
  'cotironda_piloto_finish_auto_recovery_mvp292'
 ]);
});
test('MVP348: missing, altered or invented units NEVER become equivalents',()=>{
 const a=draft();
 for(const unit of ['bolsa','bag','bolsón','m3','50 kg']){
  assert.equal(verdict(a,draft([line('Cemento CPC 50 kg','2,00',unit),a.lines[1]])).reason,
   'archived_unit_mismatch');
 }
 assert.equal(verdict(draft([line('Arena','2','bolsón')]),
   draft([line('ARENA','2','bolsones')])).matched,false);
});
test('MVP348: quantities and ambiguous thousands/decimal formats fail closed',()=>{
 const a=draft([line('Arena','1',null)]);
 for(const qty of ['2','10','1.000','1,000','1000','1/2','una','',null]){
  assert.deepEqual(verdict(a,draft([line('Arena',qty,null)])),{
   matched:false,mode:'review',reason:'archived_quantity_mismatch'
  });
 }
 assert.equal(verdict(draft([line('Arena','1.000',null)]),
  draft([line('Arena','1,000',null)])).matched,false);
 // A literal spelling is not reinterpreted or silently changed.
 assert.equal(verdict(draft([line('Arena','1.000',null)]),
  draft([line('Arena','1.000',null)])).mode,'literal');
 assert.equal(verdict(draft([line('Arena','0,50',null)]),
  draft([line('Arena','0.5',null)])).matched,true);
});
test('MVP348: line count, empty/invalid drafts and malformed fields are explicit review',()=>{
 const a=draft();
 assert.equal(verdict(a,draft([a.lines[0]])).reason,'archived_line_count_mismatch');
 assert.equal(verdict(a,draft([])).reason,'archived_draft_shape_invalid');
 assert.equal(verdict(a,draft([{...a.lines[0],original_description:17}])).matched,false);
 assert.equal(verdict(a,{...a,kind:'buyer_request'}).matched,false);
 assert.equal(verdict(a,{...a,lines:[{...a.lines[0],unit:undefined}]}).matched,false);
});
async function recover(second){
 const calls=[],readDigest=async(v)=>createHash('sha256').update(v).digest('hex');
 const result=await procesarPendienteAutomaticoMvp292({
  enabled:true,trustedWorker:true,apiKey:'synthetic-credential-not-real-12345',
  model:'gpt-6-luna',documentSemanticEnabled:false,textCommercialEnabled:false,
  shaText:readDigest,decrypt:async()=>{throw Error('no text')},
  download:async(path)=>{
   assert.equal(path,'media/'+SOURCE);
   return {data:new Blob([bytes]),error:null};
  },
  readDocument:async()=>second,
  rpc:async(name,params)=>{
   calls.push({name,params});
   if(name==='cotironda_piloto_claim_auto_recovery_mvp292')
    return {data:{state:'claimed',source_hmac:SOURCE,chat_hmac:CHAT,
     source_sha256:SHA,kind:'document',mime:'application/pdf',
     size_bytes:bytes.length,draft:draft()},error:null};
   if(name==='cotironda_piloto_finish_auto_recovery_mvp292')
    return {data:{state:'recorded'},error:null};
   throw Error('unexpected RPC '+name);
  },
  correlate:async()=>{throw Error('no correlation without material match')},
  replay:async()=>{throw Error('no economic publication without correlation')}
 });
 return {result,calls};
}
test('MVP348: exact mismatch reason recorded privately, no extra SQL or WhatsApp',async()=>{
 for(const [second,reason] of [
  [draft([line('Cemento CPC 25 kg','2,00',null),draft().lines[1]]),
   'archived_material_description_mismatch'],
  [draft([line('Cemento CPC 50 kg','9',null),draft().lines[1]]),
   'archived_quantity_mismatch'],
  [draft([line('Cemento CPC 50 kg','2,00','bolsas'),draft().lines[1]]),
   'archived_unit_mismatch'],
  [draft([draft().lines[0]]),'archived_line_count_mismatch'],
  [{kind:'buyer_request',status:'review_required',lines:[],unanswered:[]},
   'archived_second_draft_invalid']
 ]){
  const {result,calls}=await recover(second);
  assert.equal(result.state,'review_required');
  assert.equal(result.reason,reason);
  assert.equal(result.outboundMessages,0);
  assert.deepEqual(calls.map(c=>c.name),[
   'cotironda_piloto_claim_auto_recovery_mvp292',
   'cotironda_piloto_finish_auto_recovery_mvp292'
  ]);
  assert.equal(calls[1].params.p_reason,reason);
  assert.match(reason,/^[a-z_]{3,60}$/u);
  assert.ok(!reason.includes('Cemento'));
 }
});
test('MVP348: formatting-only correlation NEVER implies economic publication',async()=>{
 const calls=[];let replayed=0;
 const result=await procesarPendienteAutomaticoMvp292({
  enabled:true,trustedWorker:true,apiKey:'synthetic-credential-not-real-12345',
  model:'gpt-6-luna',documentSemanticEnabled:false,textCommercialEnabled:false,
  shaText:async()=>SHA,decrypt:async()=>{throw Error('no text')},
  download:async()=>({data:new Blob([bytes]),error:null}),
  readDocument:async()=>draft([
   line('cemento   CPC 50 kg ','2.0',null),
   line('BIG bag DE Arena','1',null)
  ]),
  rpc:async(name,params)=>{
   calls.push(name);
   if(name==='cotironda_piloto_claim_auto_recovery_mvp292')
    return {data:{state:'claimed',source_hmac:SOURCE,chat_hmac:CHAT,
     source_sha256:SHA,kind:'document',mime:'application/pdf',
     size_bytes:bytes.length,draft:draft()},error:null};
   if(name==='cotironda_piloto_finish_auto_recovery_mvp292'){
    assert.equal(params.p_state,'linked');
    return {data:{state:'recorded'},error:null};
   }
   throw Error('unexpected '+name);
  },
  correlate:async()=>({state:'linked_private',reason:'unique',outboundMessages:0}),
  replay:async()=>{replayed++;return{
   state:'review_required',reason:'unit_price_source_recheck_required',
   outboundMessages:0
  }}
 });
 assert.equal(replayed,1);
 assert.equal(result.state,'review_required');
 assert.equal(result.reason,'archive_quote_unit_price_source_recheck_required');
 assert.equal(result.outboundMessages,0);
 assert.deepEqual(calls,[
  'cotironda_piloto_claim_auto_recovery_mvp292',
  'cotironda_piloto_finish_auto_recovery_mvp292'
 ]);
});
test('MVP348: recovery cron already bridges to worker, never rotate secret from app',async()=>{
 const source=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-document-recovery/index.ts',
  import.meta.url),'utf8');
 assert.match(source,/invokeAutoRecoveryMvp293/u);
 assert.match(source,/const tick=await invokeAutoRecoveryMvp293\(\{/u);
 assert.match(source,/cotironda_mvp293_internal_tick/u);
 assert.match(source,/COTIRONDA_PILOT_AUTO_RECOVERY_SECRET/u);
 const jwt=['a'.repeat(32),'b'.repeat(32),'c'.repeat(32)].join('.');
 let invoked=0;
 const result=await invokeAutoRecoveryMvp293({
  enabled:true,pilotUrl:'https://ilggkalaafhtiysyzlmg.supabase.co',
  serviceRoleJwt:jwt,recoverySecret:'s'.repeat(64),
  post:async(url,init)=>{
   invoked++;
   assert.match(url,/\/cotironda-piloto-auto-recovery$/u);
   assert.equal(init.headers['x-cotironda-recovery-secret'],'s'.repeat(64));
   return {ok:true,status:200};
  }
 });
 assert.equal(result,'accepted');
 assert.equal(invoked,1);
});
