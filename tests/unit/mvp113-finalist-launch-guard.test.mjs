import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../../supabase/piloto/'+p,import.meta.url),'utf8');
const sql=read('mvp110_finalists_whapi_outbox.sql');
const privateBuyer=read('mvp110_buyer_finalists_tracking.sql');
const smoke=read('mvp110_smoke_rollback.sql');
const roundtrip=read('mvp112_roundtrip_e2e_rollback.sql');
const preflight=read('mvp112_readiness_readonly.sql');

test('MVP113: no final WhatsApp messages or contacts from rounds created before pilot activation',()=>{
 assert.match(sql,/create table cotironda_piloto_privado\.finalist_activation_mvp113/);
 assert.match(sql,/enabled boolean not null default false/);
 assert.match(sql,/activated_at timestamptz/);
 assert.match(sql,/check\(not enabled or activated_at is not null\)/);
 assert.match(sql,/values\(true,false,null\)/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on cotironda_piloto_privado\.finalist_activation_mvp113[\s\S]*?from public,anon,authenticated,service_role/);
 assert.equal((sql.match(/state','pilot_finalist_off'/g)||[]).length,4,
  'queue, scheduled planner, claim and last-moment authorization are all protected');
 assert.equal((sql.match(/created_at>=activation\.activated_at/g)||[]).length,4,
  'queue, planner, claim, authorize cannot see old rounds');
 assert.match(privateBuyer,/req\.created_at>=activation\.activated_at/);
 assert.match(privateBuyer,/activation\.enabled/);
 assert.match(preflight,/historic_notice_cutoff/);
});
test('MVP113: integration tests prove no historical backfill and immediate shutdown',()=>{
 for(const phrase of ['mvp113_ungated_queue','mvp113_ungated_scheduler',
  'mvp113_old_round_would_notify','mvp113_old_contacts_visible',
  'mvp113_off_buyer_disclosure','mvp113_off_worker_still_claiming',
  "set enabled=false where only_row"]){
  assert.ok(smoke.includes(phrase),phrase);
 }
 assert.match(smoke,/activated_at=clock_timestamp\(\)-interval '5 days'/);
 assert.match(roundtrip,/mvp113_pilot_gate_was_not_disabled_by_default/);
 assert.match(roundtrip,/activated_at=clock_timestamp\(\)-interval '5 days'/);
 assert.match(roundtrip,/cotironda_piloto_close_due_v1/);
 assert.match(roundtrip,/mvp112_finalist_handoffs_incomplete/);
 assert.match(roundtrip,/rollback;/);
});
test('MVP113: no automatic activation or automatic retries of unknown delivery',()=>{
 const worker=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-finalistas/index.ts',import.meta.url),'utf8');
 assert.match(worker,/COTIRONDA_PILOT_FINALIST_WORKER_ENABLED/);
 assert.match(worker,/COTIRONDA_PILOT_FINALIST_WORKER_SECRET/);
 assert.match(worker,/cotironda_piloto_authorize_finalist_whapi_mvp110/);
 assert.match(worker,/p_state:state/);
 assert.match(worker,/state:'api_accepted'\|'uncertain'/);
 assert.doesNotMatch(worker,/set enabled=true|update.*finalist_activation_mvp113/i);
});
