import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/piloto/mvp159_finalists_source_evidence_v9.sql',import.meta.url),'utf8');
const smoke=readFileSync(new URL('../../supabase/piloto/mvp159_smoke_rollback.sql',import.meta.url),'utf8');
test('MVP159: verified PDF evidence v9 and legacy source both qualify only with proper provenance',()=>{
 for(const token of [
  'from cotironda_piloto_privado.anonymous_supplier_docs_mvp107 old',
  'from cotironda_piloto_privado.supplier_evidence_mvp138 ev',
  "ev.state='verified' and ev.reason='covered'",
  'ev.public_text is not null and ev.verifier_version between 2 and 9',
  'ev.ranking_allowed=false and ev.sum_line_cents=ev.declared_total_cents',
  'later.verifier_version>ev.verifier_version',
  'media.source_sha256=d.source_sha256',
  'media.received_at<=req_.closes_at',
  'newer.received_at<=req_.closes_at',
  'newer_text.created_at>=media.received_at',
  'where not exists(',
  'union'
 ])assert.ok(sql.includes(token),token);
});
test('MVP159: strict one-to-one equivalent product, unit, quantity and source amount',()=>{
 for(const token of [
  'lower(btrim(l.description_literal))=',
  'lower(btrim(req.original_description))',
  'unit_code_mvp099(',
  "replace(l.quantity_literal,',','.')::numeric=req.quantity",
  'family_preview_mvp098(',
  'matches_count=distinct_req',
  'matches_count=distinct_line',
  'matches_count=req_count',
  'two_supplier_combination',
  "'price_ranked',false,'contacts_revealed',false",
  "'messages_sent',false,'purchase_awarded',false"
 ])assert.ok(sql.includes(token),token);
 assert.doesNotMatch(sql,/order by.*declared_total_cents|order by.*totalFinal/i);
});
test('MVP159: ACL private, immutable plans and no outbound triggered by planner',()=>{
 assert.match(sql,/revoke all on function public\.cotironda_piloto_plan_coverage_finalists_mvp108\(uuid\)/u);
 assert.match(sql,/from public,anon,authenticated;/u);
 assert.match(sql,/to service_role;/u);
 assert.doesNotMatch(sql,/whapi\.cloud|net\.http_post|update.*finalist_activation_mvp113/iu);
});
test('MVP159: real PG17 smoke must cover v9-only, v10 later blocked, generic non-equivalent and no messages',()=>{
 for(const token of [
  'two_v9','latest_v10_review','generic_uncomparable',
  'two_complete_alternatives','one_complete_alternative',
  'no_complete_alternatives','outbound_messages_were_queued',
  'activation_changed','public_rpc_leak',
  'already_planned'
 ])assert.ok(smoke.includes(token),token);
});
