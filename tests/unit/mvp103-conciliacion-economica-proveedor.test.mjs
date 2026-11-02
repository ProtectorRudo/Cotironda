import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp103_supplier_amount_integrity.sql',import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/piloto/mvp103_smoke_rollback.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');

test('MVP103: money parser is deterministic and refuses ambiguous thousand separators',()=>{
 assert.match(sql,/returns bigint language plpgsql immutable/);
 assert.match(sql,/parse_amount_cents_mvp103/);
 assert.match(sql,/\[0-9\]\{3\}/);
 assert.match(sql,/else return null;end if/);
 for(const literal of ["'$ 9.500,00'","'-$ 3.000,00'",
  "'$ 1,250.50'","'$ 7000'","'$ 7.000'","'USD 100.00'"]) {
   assert.ok(smoke.includes(literal),literal);
 }
});
test('MVP103: captures every line and verifies quantity multiplication and sum',()=>{
 assert.match(sql,/l\.line_total_literal/);
 assert.match(sql,/l\.unit_price_literal/);
 assert.match(sql,/l\.quantity_literal/);
 assert.match(sql,/unit_cents::numeric\*qty/);
 assert.match(sql,/sum_:=sum_\+cents/);
 assert.match(sql,/sum_<>total/);
 assert.match(sql,/discount_sign_inconsistent/);
 assert.match(sql,/observed_sum_cents bigint/);
 assert.match(sql,/declared_total_cents bigint/);
 for(const scenario of ['balanced','total_mismatch','ambiguous_total',
  'ambiguous_line','missing_line','invalid_quantity','wrong_multiplication',
  'wrong_discount','no_second_read']) {
   assert.ok(smoke.includes("'"+scenario+"'"),scenario);
 }
});
test('MVP103: no economic promotion, double-read gate and internal-only data',()=>{
 assert.match(sql,/c\.state='model_readings_match'/);
 assert.match(sql,/m\.content_sha256=q\.source_sha256/);
 assert.match(sql,/p\.consent_at is not null/);
 assert.match(sql,/supplier_amount_checks_mvp103\s+enable row level security/);
 assert.match(sql,/before update or delete/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(sql,/grant execute on function public\.cotironda_piloto_audit_supplier_amounts_mvp103\(text\)\s+to service_role/);
 assert.match(sql,/'source_verified',false,'ranking_allowed',false/);
 assert.doesNotMatch(sql,/insert into cotironda_piloto_privado\.offer_versions/);
 assert.doesNotMatch(sql,/update cotironda_piloto_privado\.offer_versions/);
 assert.match(smoke,/mvp103_created_economic_offer/);
 assert.match(smoke,/mvp103_public_access/);
 assert.match(smoke,/rollback;/);
});
test('MVP103: runs after comparison only and never triggers WhatsApp',()=>{
 assert.match(edge,/compared\.data\?\.state==='model_readings_match'/);
 assert.match(edge,/cotironda_piloto_audit_supplier_amounts_mvp103/);
 const quoteBlock=edge.slice(edge.indexOf("}else if(proposal.kind==='supplier_quote')"),
                            edge.indexOf("}else{\n              // The source remains stored;"));
 assert.doesNotMatch(quoteBlock,/sendWhapi|\/messages\/text|\/messages\/document|dispatchTwo/);
 assert.doesNotMatch(sql,/https?:\/\/|http_post|pg_net|Authorization:|sk-proj/);
});
