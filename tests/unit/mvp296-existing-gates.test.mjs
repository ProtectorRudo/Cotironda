import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {procesarTextoVinculadoMvp295} from '../../supabase/functions/cotironda-piloto-whapi/supplier-linked-text-replay-mvp295.ts';

const read=url=>readFileSync(new URL(url,import.meta.url),'utf8');
const edge=read('../../supabase/functions/cotironda-piloto-auto-recovery/index.ts');
const sql=read('../../supabase/piloto/mvp296_quote_recovery_existing_control.sql');

test('existing user-approved triple gate replaces the undocumented extra secret',()=>{
 const commercial=edge.slice(edge.indexOf('// MVP296:'),edge.indexOf('const commercial=await procesarTextoVinculadoMvp295('));
 assert.ok(commercial.includes("Deno.env.get('COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED')==='true'"));
 assert.ok(commercial.includes("Deno.env.get('COTIRONDA_PILOT_AUTO_TEXT_MVP292_ENABLED')==='true'"));
 assert.ok(commercial.includes("Deno.env.get('COTIRONDA_PILOT_AUTO_RECOVERY_MVP292_ENABLED')==='true'"));
 assert.ok(commercial.includes("if(outcome.state==='empty'&&"));
 assert.doesNotMatch(edge,/COTIRONDA_PILOT_AI_CENTRAL_SUPPLIER_QUOTE_ENABLED/u);
 // MVP292's inline quote path did not meter its calls; it is disabled.
 // Only the one-shot MVP295 interpreter may call the commercial model.
 assert.match(edge,/textCommercialEnabled:false/u);
 assert.match(edge,/const commercial=await procesarTextoVinculadoMvp295/u);
});

test('claim checks existing private IA Central activated state as second authorization',()=>{
 assert.match(sql,/ai_central_control_mvp226 central/u);
 assert.match(sql,/central.only_row AND central.enabled AND central.activated_at IS NOT NULL/u);
 assert.match(sql,/whatsapp_inbound_enabled/u);
 assert.match(sql,/recovery.state='linked'/u);
 assert.match(sql,/corr.state='linked' AND corr.selected_request_id=l.request_id/u);
 assert.match(sql,/m.plaintext_sha256=l.source_sha256/u);
 assert.match(sql,/interval '7 days'/u);
 assert.match(sql,/v_count>=6/u);
});

test('economic model not called when source pool is empty',async()=>{
 let invoked=0;
 const result=await procesarTextoVinculadoMvp295({
  enabled:true,trustedInternalWorker:true,
  apiKey:'synthetic-credential-for-tests-123456',model:'gpt-6-luna',
  rpc:async()=>({data:{state:'empty'},error:null}),
  decrypt:async()=>'',shaText:async()=>''.padStart(64,'a'),
  analyze:async()=>{invoked++;throw Error('no')}
 });
 assert.equal(result.state,'empty');
 assert.equal(result.outboundMessages,0);
 assert.equal(invoked,0);
});
