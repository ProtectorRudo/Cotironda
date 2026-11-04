import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp102_supplier_dual_reading_gate.sql',
 import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/piloto/mvp102_smoke_rollback.sql',
 import.meta.url),'utf8');
const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',
 import.meta.url),'utf8');

test('MVP102: uses already-paid independent second read of exact original',()=>{
 assert.match(edge,/proposeDocumentAI\(\{\.\.\.args,perspective:'primary'\}\)/);
 assert.match(edge,/proposeDocumentAI\(\{\.\.\.args,perspective:'corroboration'\}\)/);
 assert.match(edge,/proposal\.kind==='supplier_quote'/);
 assert.match(edge,/cotironda_piloto_record_supplier_media_mvp098/);
 assert.match(edge,/receipt\.data\?\.state==='stored_unverified'/);
 assert.match(edge,/cotironda_piloto_compare_supplier_readings_mvp102/);
 assert.match(edge,/readings\[1\]\.status==='fulfilled'/);
 assert.match(edge,/p_second_proposal:corroboration/);
 assert.match(edge,/readings\[0\]\.status==='fulfilled'&&/);
 assert.match(edge,/readings\[1\]\.status==='fulfilled'\s*\?promoteVerifiedSupplierQuote\(readings\[1\]\.value,verifiedSupplier\):null/);
});

test('MVP102: compares every economic line and metadata but does not publish prices',()=>{
 for(const item of [
  'original_description','quantity_literal','unit_literal','unit_price_literal',
  'line_total_literal','ambiguity_literal','evidence_location',
  'declared_total_literal','requested_delivery_note','unanswered'
 ]) assert.ok(sql.includes(item),item);
 assert.match(sql,/jsonb_array_length\(p_second_proposal->'lines'\)<>a\.line_count/);
 assert.match(sql,/v->>'line_total' is distinct from line_\.line_total_literal/);
 assert.match(sql,/v->>'unit_price' is distinct from line_\.unit_price_literal/);
 assert.match(sql,/source_verified',false,'ranking_allowed',false/);
 assert.doesNotMatch(sql,/insert into cotironda_piloto_privado\.offer_versions/);
 assert.doesNotMatch(sql,/update cotironda_piloto_privado\.offer_versions/);
 assert.doesNotMatch(sql,/send|whapi\.cloud|http_post|pg_net/i);
});

test('MVP102: results are private, immutable, idempotent and fail closed',()=>{
 assert.match(sql,/supplier_reading_checks_mvp102\s+enable row level security/);
 assert.match(sql,/before update or delete/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(sql,/grant execute on function\s+public\.cotironda_piloto_compare_supplier_readings_mvp102\(text,jsonb\)\s+to service_role/);
 assert.match(sql,/for update of q/);
 assert.match(sql,/p\.consent_at is not null and p\.opted_out_at is null/);
 assert.match(sql,/m\.content_sha256=q\.source_sha256/);
 assert.match(sql,/second_unavailable/);
 assert.match(sql,/p_second_proposal \?& array\[/);
 assert.match(sql,/v \?& array\[/);
 assert.match(sql,/already_checked/);
 assert.match(smoke,/mvp102_created_unverified_offer/);
 assert.match(smoke,/mvp102_public_access/);
 assert.match(smoke,/mvp102_primary_or_source_modified/);
 assert.match(smoke,/rollback;/);
});
test('MVP102: full cross-section includes source mismatch and extras',()=>{
 for(const scenario of [
 'match','changed_price','changed_discount','changed_total','omitted_pallet',
 'unavailable','wrong_kind','notes','unanswered','ambiguous','no_evidence',
 'malformed','missing_kind','missing_null_field'
 ]) assert.ok(smoke.includes("'"+scenario+"'"),scenario);
 for(const concept of ['Cemento CPC 50 kg','pallets vacíos','bolsones vacíos',
 'Flete a obra','Descuento comercial']) assert.ok(smoke.includes(concept),concept);
 assert.match(smoke,/total_declared.*\$ 211\.000,00/);
});
