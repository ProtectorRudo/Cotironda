import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL(
 '../../supabase/piloto/mvp101_supplier_quote_full_line_mirror.sql',
 import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/piloto/mvp101_smoke_rollback.sql',
 import.meta.url),'utf8');
const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',
 import.meta.url),'utf8');

test('MVP101: reception route remains the authenticated supplier media gate',()=>{
 assert.match(edge,/cotironda_piloto_record_supplier_media_mvp098/);
 assert.match(migration,/p\.participant_role='supplier'/);
 assert.match(migration,/p\.consent_at is not null and p\.opted_out_at is null/);
 assert.match(migration,/m\.request_id is not null/);
 assert.match(migration,/i\.supplier_key=m\.participant_key/);
 assert.match(migration,/r\.closes_at>clock_timestamp\(\)/);
});

test('MVP101: all quote lines atomically mirrored, including additional charges',()=>{
 assert.match(migration,/jsonb_array_length\(a\.proposal->'lines'\)/);
 assert.match(migration,/nr not between 1 and 25/);
 assert.match(migration,/jsonb_array_elements\(a\.proposal->'lines'\) with ordinality/);
 assert.match(migration,/get diagnostics written=row_count/);
 assert.match(migration,/if written<>nr then/);
 for(const column of [
  'description_literal','quantity_literal','unit_literal','unit_price_literal',
  'line_total_literal','evidence_literal','ambiguity_literal'
 ]) assert.match(migration,new RegExp(column));
 for(const concept of [
  'pallets vacíos','bolsones vacíos','Flete a obra','Descuento comercial'
 ]) assert.ok(smoke.includes(concept),concept);
 assert.match(smoke,/\$ 216\.500,00/);
 assert.match(smoke,/<>src/);
 assert.match(smoke,/lost_or_added_lines/);
 assert.match(smoke,/original_or_total_modified/);
});

test('MVP101: receipt is private, immutable and strictly unverified',()=>{
 assert.match(migration,/supplier_quote_lines_mvp101\s+enable row level security/);
 assert.match(migration,/from public,anon,authenticated,service_role/);
 assert.match(migration,/before update or delete/);
 assert.match(migration,/security definer set search_path=''/);
 assert.match(migration,/grant execute on function public\.cotironda_piloto_record_supplier_media_mvp098\(text\)\s+to service_role/);
 assert.match(migration,/'source_verified',false,'ranking_allowed',false/);
 assert.doesNotMatch(migration,/insert into cotironda_piloto_privado\.offer_versions/i);
 assert.doesNotMatch(migration,/update cotironda_piloto_privado\.offer_versions/i);
 assert.doesNotMatch(migration,/whapi\.cloud|http_post|pg_net|Authorization:|sk-proj/iu);
 assert.match(smoke,/mvp101_private_data_exposed/);
 assert.match(smoke,/mvp101_snapshot_mutated/);
 assert.match(smoke,/mvp101_duplicate_changed/);
 assert.match(smoke,/rollback;/);
});
