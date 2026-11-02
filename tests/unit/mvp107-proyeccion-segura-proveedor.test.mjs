import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const publication=readFileSync(new URL(
 '../../supabase/piloto/mvp107_anonymous_text_projection.sql',
 import.meta.url),'utf8');
const tracking=readFileSync(new URL(
 '../../supabase/piloto/mvp107_tracking_source_published.sql',
 import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/piloto/mvp107_smoke_rollback.sql',
 import.meta.url),'utf8');
const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',
 import.meta.url),'utf8');

test('MVP107: private publication depends on original bytes, twice-read agreement and exact sum',()=>{
 assert.match(publication,/s\.state='source_text_covered'/);
 assert.match(publication,/s\.reason='covered'/);
 assert.match(publication,/dual\.state='model_readings_match'/);
 assert.match(publication,/amounts\.state='balanced'/);
 assert.match(publication,/m\.content_sha256=q\.source_sha256/);
 assert.match(publication,/m\.mime in \('text\/plain','text\/csv'\)/);
 assert.match(publication,/supplier\.consent_at is not null/);
 assert.match(publication,/buyer\.consent_at is not null/);
 assert.match(publication,/r\.closes_at>clock_timestamp\(\)/);
 assert.match(publication,/supplier\.key in \('corralon_ailin','corralon_nahuel'\)/);
 assert.match(publication,/r\.delivery_city='La Plata'/);
});
test('MVP107: quote rendered from all ordered original-price literal lines, never recomputed',()=>{
 for(const field of ['description_literal','quantity_literal','unit_literal',
  'unit_price_literal','line_total_literal','declared_total_literal',
  'source_sha256','line_count','public_text']){
  assert.ok(publication.includes(field),field);
 }
 assert.match(publication,/string_agg\(/);
 assert.match(publication,/order by l\.line_no/);
 assert.match(publication,/TOTAL DECLARADO:/);
 assert.match(publication,/privacy_or_quality_review/);
 assert.match(publication,/anonymous_supplier_docs_mvp107\s+enable row level security/);
 assert.match(publication,/before update or delete/);
 assert.match(publication,/from public,anon,authenticated,service_role/);
 assert.doesNotMatch(publication,/insert into cotironda_piloto_privado\.offer_versions/);
 assert.doesNotMatch(publication,/update cotironda_piloto_privado\.offer_versions/);
 assert.doesNotMatch(publication,/http_post|pg_net|https?:\/\/gate\.whapi\.cloud/);
});
test('MVP107: tracking returns source-covered projections only if latest, with private token',()=>{
 assert.match(tracking,/t\.token_hash=p_token_hash/);
 assert.match(tracking,/p\.consent_at is not null/);
 assert.match(tracking,/t\.revoked_at is null/);
 assert.match(tracking,/anonymous_supplier_docs_mvp107/);
 assert.match(tracking,/anonymous_offers_mvp091/);
 assert.match(tracking,/select distinct on \(supplier_key\)/);
 assert.match(tracking,/order by supplier_key,created desc,hmac desc/);
 assert.match(tracking,/a\.revision_no=s\.revision_no/);
 assert.match(tracking,/d\.message_hmac=s\.hmac/);
 assert.match(tracking,/status='cancelled'/);
 assert.doesNotMatch(tracking,/jsonb_build_object\([^;]*supplier_key\s*,/);
});
test('MVP107: edge only publishes after verified source and precise amounts',()=>{
 assert.match(edge,/savedCheck\.data\?\.state==='source_text_covered'/);
 assert.match(edge,/amounts\.data\?\.state==='balanced'/);
 assert.match(edge,/cotironda_piloto_publish_source_text_mvp107/);
});
test('MVP107: PG17 smoke covers all extras, no contact and stale newer PDF',()=>{
 for(const x of ['Cemento CPC 50 kg','pallets vacíos','bolsones vacíos',
  'Flete a obra','Descuento comercial','-$ 3.000,00','TOTAL DECLARADO',
  'mvp107_unverified_source_was_published','mvp107_buyer_projection_not_visible',
  'mvp107_old_price_leaked_after_revision','mvp107_public_access','rollback;']){
  assert.ok(smoke.includes(x),x);
 }
});
