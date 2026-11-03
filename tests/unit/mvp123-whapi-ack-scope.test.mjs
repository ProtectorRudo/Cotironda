import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const edge=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url
),'utf8');

test('MVP123: supplier acknowledgement remains in the per-message lexical scope',()=>{
 const loop=edge.indexOf('for(const row of event.messages){');
 const section=edge.indexOf('// Acknowledge a supplier ONLY after');
 const dispatch=edge.indexOf('try{await dispatchTwo(sec,db)}');
 assert.ok(loop>0 && section>loop && dispatch>section);
 // Regression: the previous Edge v35 closed the for-loop here, then read
 // supplierAckMode, messageHash, chatHash and row OUTSIDE their block,
 // causing ReferenceError on EVERY accepted incoming webhook.
 assert.doesNotMatch(edge,/\n \}\n \/\/ Acknowledge a supplier ONLY after/u);
 assert.match(edge,/\n  \}\n \/\/ Acknowledge a supplier ONLY after/u);
 assert.match(edge,/\n \}\n \}\n try\{await dispatchTwo\(sec,db\)\}/u);
 assert.match(edge,/\n if\(sec\.outbound&&supplierAckMode\)\{/u);
 assert.match(edge,/\n  const reserved=await db\.rpc\('cotironda_piloto_reserve_supplier_ack_mvp104'/u);
});

test('MVP123: batch dispatch after loop, safe idempotent claim and receipt handling',()=>{
 assert.match(edge,/async function dispatchTwo\(sec:Secrets,db:ReturnType<typeof client>\):Promise<void>\{/u);
 assert.match(edge,/for\(let i=0;i<2;i\+\+\)\{/u);
 assert.match(edge,/const claim=await db\.rpc\('cotironda_piloto_claim_whapi_v1'\)/u);
 assert.match(edge,/const guard=await db\.rpc\('cotironda_piloto_authorize_whapi_v1',args\)/u);
 assert.match(edge,/await finish\(accepted\?'api_accepted':'uncertain',messageId\)/u);
 assert.match(edge,/if\(claim\.error\)throw Error\('claim_failure'\)/u);
 assert.match(edge,/if\(c\.state!=='leased'/u);
 assert.match(edge,/try\{await dispatchTwo\(sec,db\)\}catch\{return json\(503,'dispatch_reconciliation_required'\)\}/u);
});

test('MVP123: Whapi still preserves supplier original/ack before dispatch',()=>{
 assert.match(edge,/if\(outcome\(out\.data\)==='quote_recorded'\)supplierAckMode='text_quote'/u);
 assert.match(edge,/if\(sec\.outbound&&supplierAckMode\)\{/u);
 assert.match(edge,/cotironda_piloto_finish_supplier_ack_mvp104/u);
 assert.match(edge,/cotironda_piloto_record_supplier_ack_id_mvp119/u);
 assert.match(edge,/if\(sec\.outbound&&trackingSourceHmac\)\{/u);
});
