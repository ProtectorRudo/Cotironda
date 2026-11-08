import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sql=read('../../supabase/piloto/mvp311_multiidentidad_rutas_activas.sql');
const before=read('../../supabase/tests/ci/mvp311-legacy-rpc-baseline-pg17.sql');
const fixture=read('../../supabase/tests/ci/mvp311-multiidentity-tests-pg17.sql');
const gen=read('../../scripts/piloto/mvp311-generar-fixture-pg17.mjs');
const active=[
 'cotironda_piloto_autolink_unquoted_media_mvp155',
 'cotironda_piloto_curated_families_mvp152',
 'cotironda_piloto_ia_claim_zone_mvp233',
 'cotironda_piloto_ia_link_supplier_mvp225',
 'cotironda_piloto_ia_reserve_review_notice_mvp286',
 'cotironda_piloto_ia_review_launch_mvp285',
 'cotironda_piloto_ia_trial_flags_mvp229',
 'cotironda_piloto_link_quoted_media_mvp151',
 'cotironda_piloto_link_quoted_text_mvp151',
 'cotironda_piloto_prepare_document_mvp099',
 'cotironda_piloto_publish_source_text_mvp107',
 'cotironda_piloto_record_delivery_mvp119',
 'cotironda_piloto_reserve_ai_mvp094',
 'cotironda_piloto_reserve_reply_mvp094'
];
test('MVP311: 14 RPC activas, firmas y privileges service_role preserved',()=>{
 assert.equal(active.length,14);
 const created=sql.match(/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_/g)??[];
 assert.equal(created.length,14);
 for(const name of active){
  assert.match(sql,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\('));
  assert.match(before,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\('));
  assert.match(sql,new RegExp('REVOKE ALL ON FUNCTION public\\.'+name+'\\('));
  assert.match(sql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+name+'\\('));
 }
 assert.equal((sql.match(/REVOKE ALL ON FUNCTION public\./g)??[]).length,14);
 assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION public\./g)??[]).length,14);
});
test('MVP311: no participant names hardcoded in active RPC bodies',()=>{
 assert.doesNotMatch(sql,/'(?:arquitecto|corralon_ailin|corralon_nahuel)'/u);
 for(const name of active){
  assert.match(sql,new RegExp('mvp311_baseline_changed_'+name));
 }
 assert.equal((sql.match(/pg_get_function_identity_arguments\(p\.oid\)/g)??[]).length,14);
 assert.match(sql,/SECURITY DEFINER/u);
 assert.match(sql,/SET search_path TO ''/u);
});
test('MVP311: buyer/supplier verification remains before quote or PDF association',()=>{
 const link=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_link_supplier_mvp225'),
  sql.indexOf('REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_link_supplier_mvp225'));
 assert.match(link,/m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac/u);
 assert.match(link,/p.key=v_source.participant_key AND p.chat_hmac=p_chat_hmac/u);
 assert.match(link,/p.participant_role='supplier'/u);
 assert.match(link,/j.supplier_key=v_supplier.key AND j.state='api_accepted'/u);
 assert.match(link,/p_quoted_whapi_id IS NULL OR j.whapi_message_id=p_quoted_whapi_id/u);
 assert.match(link,/v_count<>1 OR v_request IS NULL/u);
 const early=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_claim_zone_mvp233'),
  sql.indexOf('REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_claim_zone_mvp233'));
 assert.match(early,/p.chat_hmac=p_chat_hmac AND p.participant_role='buyer'/u);
});
test('MVP311: no legacy finalist contact routes reopened and buyer immutable',()=>{
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public.cotironda_piloto_(?:plan_coverage_finalists_mvp108|prepare_finalists_due_mvp110|tracking_finalists_mvp110)/u);
 assert.match(sql,/CREATE OR REPLACE FUNCTION cotironda_piloto_privado.verify_request_buyer_mvp310\(\)/u);
 assert.match(sql,/TG_OP='UPDATE' AND OLD.buyer_key IS DISTINCT FROM NEW.buyer_key/u);
 assert.match(sql,/mvp311_buyer_owner_immutable/u);
 assert.match(fixture,/mvp311_round_reassigned_to_different_buyer/u);
 assert.match(fixture,/mvp311_buyer_contact_leak|mvp311_legacy_bidirectional_contact/u);
});
test('MVP311: fixture validates multiple buyers and suppliers in PG17 transaction',()=>{
 assert.match(fixture,/buyer_extra_311/u);
 assert.match(fixture,/supplier_extra_311/u);
 assert.match(fixture,/supplier_berisso_311/u);
 assert.match(fixture,/mvp311_city_crossover/u);
 assert.match(fixture,/mvp311_supplier_impersonates_buyer_catalogue/u);
 assert.match(fixture,/mvp311_unrecognized_chat_catalogue/u);
 assert.match(fixture,/mvp311_security_or_hardcodes/u);
 assert.match(gen,/mvp310-generar-fixture-pg17/u);
 assert.match(gen,/mvp311-legacy-rpc-baseline-pg17.sql/u);
 assert.match(gen,/mvp311_multiidentidad_rutas_activas.sql/u);
 assert.match(gen,/ROLLBACK;/u);
});
