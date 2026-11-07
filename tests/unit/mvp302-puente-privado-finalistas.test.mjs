import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBridgeSql} from '../../scripts/piloto/mvp302-bridge-builder.mjs';

const bridge=readFileSync(new URL(
 '../../supabase/piloto/mvp302_ia_finalist_sources_service_only.sql',
 import.meta.url),'utf8');
const synthetic=readFileSync(new URL(
 '../../supabase/tests/ci/mvp302-puente-ia-finalistas-pg17.sql',
 import.meta.url),'utf8');

test('MVP302: PG17 coinstalación enlaza ronda completa y nuevo RPC antes de rollback',()=>{
 const s=buildBridgeSql();
 const i=s.indexOf('\\ir ./mvp284-roundtrip-e2e-pg17.sql');
 const j=s.indexOf('\\ir ../../piloto/mvp302_ia_finalist_sources_service_only.sql');
 const k=s.indexOf('\\ir ./mvp302-puente-ia-finalistas-pg17.sql');
 assert.ok(i>0&&j>i&&k>j&&s.indexOf('\nROLLBACK;\nSELECT ')>k);
 assert.equal(s.split(/^ROLLBACK;\s*$/gm).length,2);
});
test('MVP302: no permisos públicos, fuente vigente, consentimiento y despacho anterior',()=>{
 for(const value of [
  'REVOKE ALL ON FUNCTION',
  'FROM PUBLIC,anon,authenticated,service_role',
  'TO service_role',
  "br.state='confirmed'",
  "r.state='closed'",
  "rev.state AS review_state",
  "source_.review_state<>'verified'",
  "source_.reason_code<>'source_and_math_checked'",
  'source_.source_sha256',
  "job.state='api_accepted'",
  'job.finished_at<=l.received_at',
  'supplier_source_versions_mvp261',
  'm.plaintext_sha256',
  "supplier.opted_out_at IS NULL",
  'dest.supplier_key=source_.supplier_key',
  'v_q<>(price_->>\'cantidad\')::numeric',
  "'manual_award_required',true",
  "'automatic_award',false",
  "'contacts_revealed',false",
  "'whatsapp_sent',false"
 ])assert.ok(bridge.includes(value),value);
 assert.doesNotMatch(bridge.replace(/^--.*$/gm,''),/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|COPY|NOTIFY|PERFORM|net\.http_post|cron\.schedule)\b/iu);
 assert.doesNotMatch(bridge.replace(/^--.*$/gm,''),/SELECT\s+\*/iu);
});
test('MVP302: caso sintético no implica envío ni altera la base tras rollback',()=>{
 assert.match(synthetic,/mvp302_pre_close_not_blocked/u);
 assert.match(synthetic,/mvp302_private_source_bridge_failed/u);
 assert.match(synthetic,/mvp302_source_revision_mismatch_not_blocked/u);
 assert.match(synthetic,/mvp302_buyer_optout_not_guarded/u);
 assert.match(synthetic,/mvp302_rpc_acl_leak/u);
 assert.match(synthetic,/mvp302_outbound_or_award_side_effect/u);
 assert.doesNotMatch(synthetic,/\b(?:https?:\/\/|\\!|\\copy|\\connect|COMMIT)\b/iu);
});
test('MVP302: builders rechazan borrado de la política de seguridad',()=>{
 assert.throws(()=>buildBridgeSql(path=>{
  if(path.endsWith('mvp302_ia_finalist_sources_service_only.sql'))
   return bridge.replace('GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_finalist_sources_mvp302','-- no grant');
  return synthetic;
 }),/MVP302_UNSAFE_SQL/);
});
