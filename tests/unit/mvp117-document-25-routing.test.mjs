import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const agree=read('supabase/piloto/mvp099b_dual_agreement_and_promotion.sql');
const dispatch=read('supabase/piloto/mvp099_document_partial_invites.sql');
const clarify=read('supabase/piloto/mvp100_contextual_missing_materials.sql');
const coverage=read('supabase/piloto/mvp108_finalists_coverage_safe.sql');
const upgrade=read('supabase/piloto/mvp117_upgrade_document_25.sql');
const smoke=read('supabase/piloto/mvp117_multi_page_request_smoke_rollback.sql');

test('MVP117: multi-page generator does not silently slice a request to first eight',()=>{
 const pdf=read('supabase/functions/cotironda-piloto-whapi/request-pdf.ts');
 assert.match(pdf,/input\.items\.length>25/u);
 assert.match(pdf,/const pageCount=Math\.ceil\(lines\.length\/8\)/u);
 assert.match(pdf,/lines\.slice\(page\*8,\(page\+1\)\*8\)/u);
 assert.match(pdf,/\/Pages \/Kids \[/u);
 assert.match(pdf,/\/Count '\+pageCount/u);
 assert.match(pdf,/\/Length '\+data\.length/u);
 assert.match(pdf,/if\(id!==offsets\.length\)fail\(\)/u);
 assert.doesNotMatch(pdf,/input\.items\.length>8/u);
});
test('MVP117: source, supplier subset, clarification and finalist caps match schema',()=>{
 assert.match(agree,/line_count between 1 and 25/u);
 assert.match(agree,/if total not between 1 and 25/u);
 assert.match(dispatch,/n<1 or n>25 or full_n<1 or full_n>25/u);
 assert.equal((dispatch.match(/between 1 and 25/gu)??[]).length>=2,true);
 assert.match(dispatch,/Lista completa y cantidades en el PDF adjunto/u);
 assert.match(dispatch,/where il\.request_id=r\.id and il\.supplier_key=s\.key/u);
 assert.match(clarify,/jsonb_array_length\(p_changes\)>25/u);
 assert.match(clarify,/line_no'\) !~ '\^\(\[1-9\]\|1\[0-9\]\|2\[0-5\]\)\$'/u);
 assert.match(coverage,/if req_count not between 1 and 25/u);
 for(const s of [agree,dispatch,clarify,coverage])
  assert.doesNotMatch(s,/between 1 and 8|n>8|full_n>8|p_changes\)>8/u);
});
test('MVP117: upgrade of installed 8-item SQL is gated and private',()=>{
 assert.match(upgrade,/mvp117_wrong_pilot_baseline/u);
 assert.match(upgrade,/drop constraint document_agreements_mvp099_line_count_check/u);
 assert.match(upgrade,/check\(line_count between 1 and 25\)/u);
 assert.match(upgrade,/create or replace function public\.cotironda_piloto_record_agreement_mvp099/u);
 assert.match(upgrade,/create or replace function cotironda_piloto_privado\.refresh_partial_invite_mvp099/u);
 assert.match(upgrade,/create or replace function cotironda_piloto_privado\.allow_document_send_mvp099/u);
 assert.match(upgrade,/create or replace function public\.cotironda_piloto_apply_clarification_mvp100/u);
 assert.doesNotMatch(upgrade,/whatsapp_outbound_enabled\s*=\s*true|http_post|pg_net/iu);
});
test('MVP117: integration smoke verifies 9/25 full PDF snapshots and ROLLBACK',()=>{
 for(const term of ['(values(9),(25))','mvp117_original_lines_missing',
  'mvp117_supplier_subset_lost_articles','mvp117_pdf_snapshot_truncated',
  'mvp117_authorization_lost','mvp117_public_leak','rollback;'])
  assert.ok(smoke.includes(term),term);
 assert.doesNotMatch(smoke,/https?:\/\/gate\.whapi\.cloud|supabase\.functions\.invoke/iu);
});
