import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scheduleV2ShadowB4} from
 '../../supabase/functions/cotironda-piloto-auto-recovery/v2-shadow-bridge-b4.ts';
const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_b5n_b4_one_shot_lease_window.sql',import.meta.url),'utf8');

test('B5n B4: migrate only private SQL gates; never create new transport',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_v2_shadow_enabled_b4\(\)/u);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_v2_b5k_only_enabled\(\)/u);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_claim_v2_currency_b5k\(\)/u);
 for(const dangerous of [/CREATE\s+TABLE/iu,/DROP\s+TABLE/iu,/cron\.schedule/iu,
  /net\.http_post/iu,/vault\.decrypted_secrets/iu,/\bwhapi_outbox\b/iu,
  /GRANT\s+EXECUTE[^\n]*TO\s+(?:anon|authenticated)/iu])
  assert.equal(dangerous.test(sql),false,String(dangerous));
});

test('B5n B4: a bounded window guards BOTH the bridge and the Edge mode',()=>{
 const gates=sql.split('CREATE OR REPLACE FUNCTION public.');
 const bridge=gates.find(s=>s.startsWith('cotironda_piloto_v2_shadow_enabled_b4()'));
 const mode=gates.find(s=>s.startsWith('cotironda_piloto_v2_b5k_only_enabled()'));
 assert.ok(bridge&&mode);
 for(const gate of [bridge,mode]){
  assert.match(gate,/interval '8 minutes'/u);
  assert.match(gate,/updated_at <= clock_timestamp\(\)\+interval '15 seconds'/u);
  assert.match(gate,/processor_version='v2_b5n_20261111'/u);
 }
 assert.match(bridge,/NOT s\.b5k_only/u);
 assert.match(mode,/s\.b5k_only/u);
});

test('B5n B4: SQL claim disarms after the SHA/version lease, not before',()=>{
 const i=sql.indexOf("VALUES(v.source_hmac,v.source_sha256,v.supplier_key)");
 const off=sql.indexOf("SET enabled=false,b5k_only=false,updated_at=clock_timestamp()",i);
 const result=sql.indexOf("'processor_version','v2_b5n_20261111'",i);
 assert.ok(i>0&&off>i&&result>off);
 assert.match(sql,/RAISE EXCEPTION 'b5n_gate_changed_during_claim'/u);
 assert.match(sql,/IF NOT FOUND THEN[\s\S]{0,460}SET enabled=false,b5k_only=false/u);
 assert.ok(!sql.includes('UPDATE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k'));
});

test('B5n B4: original internal scheduler makes no HTTP call when SQL gate OFF',async()=>{
 let checks=0,requests=0;
 const state=await scheduleV2ShadowB4({
  enabled:true,pilotUrl:'https://ilggkalaafhtiysyzlmg.supabase.co',
  serviceRoleKey:'sb_secret_'+'x'.repeat(32),
  recoverySecret:'s'.repeat(64),
  checkSqlEnabled:async()=>{checks++;return false},
  post:async()=>{requests++;throw Error('never invoked')},
  schedule:()=>{throw Error('never scheduled')}
 });
 assert.equal(state,'off');
 assert.equal(checks,1);
 assert.equal(requests,0);
});
