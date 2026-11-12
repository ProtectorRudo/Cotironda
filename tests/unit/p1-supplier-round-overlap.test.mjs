import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL(
 '../../supabase/piloto/p1_evitar_rondas_solapadas_proveedor.sql',
 import.meta.url),'utf8');
const pg17=readFileSync(new URL(
 '../../supabase/tests/ci/mvp222-ia-despacho-pg17-rollback.sql',
 import.meta.url),'utf8');
const mvp280=readFileSync(new URL(
 '../../supabase/piloto/mvp280_confirmacion_unificada_comprador.sql',
 import.meta.url),'utf8');
test('P1: supplier locks serialize overlapping publication before any invitation',()=>{
 const lock=migration.indexOf('ORDER BY p.key FOR UPDATE OF p');
 const collision=migration.indexOf("RETURN jsonb_build_object('state','supplier_active_round_conflict')");
 const insert=migration.indexOf('INSERT INTO cotironda_piloto_privado.invitations');
 const jobs=migration.indexOf('INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222');
 assert(lock>0&&collision>lock&&insert>collision&&jobs>insert);
 assert.match(migration,/prev\.supplier_key=selected\.supplier_key/u);
 assert.match(migration,/prev\.request_id<>v_round\.id/u);
 assert.match(migration,/prev\.state='prepared'/u);
 assert.match(migration,/previous\.state='prepared'/u);
 assert.match(migration,/previous\.closes_at>clock_timestamp\(\)/u);
 assert(!migration.includes('FOR UPDATE OF previous'));
});
test('P1: existing source, gates and transactional return preserved',()=>{
 assert.match(migration,/cotironda_piloto_ia_publish_mvp222\(\s*p_request uuid/u);
 assert.match(migration,/SELECT m\.message_hmac,m\.chat_hmac,m\.participant_key,m\.plaintext_sha256/u);
 assert.match(migration,/v_round\.state='prepared'.*'already_published'/u);
 assert.match(migration,/THEN RETURN jsonb_build_object\('state','dispatch_disabled'\)/u);
 assert.match(migration,/THEN RETURN jsonb_build_object\('state','transport_disabled'\)/u);
 assert.match(migration,/RETURN jsonb_build_object\('state','ready_for_delivery'/u);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.cotironda_piloto_ia_publish_mvp222\(uuid\)/u);
 assert.match(migration,/TO service_role;/u);
 assert.doesNotMatch(migration,/CREATE (?:TABLE|TRIGGER)|INSERT INTO\s+cotironda_piloto_privado\.whapi_outbox/iu);
});
test('P1: PostgreSQL17 exercise has no outbound and always rolls back',()=>{
 assert(pg17.includes('\\ir ../../piloto/p1_evitar_rondas_solapadas_proveedor.sql'));
 for(const x of [
  'p1_unrelated_supplier_blocked','p1_overlap_not_blocked',
  'p1_overlap_left_partial_side_effect',
  'p1_closed_prior_blocks_new','p1_release_acl_regression',
  'P1 ONE ACTIVE ROUND PER SUPPLIER PASS'
 ])assert(pg17.includes(x),x);
 assert.equal(pg17.trimEnd().split('\n').at(-1),'ROLLBACK;');
});

test('P1: preserve EVERY MVP280 live buyer approval and original-source guard',()=>{
 for(const marker of [
  'confirmada_comprador_mvp280(v_round.id)',
  "'buyer_review_required'",
  'fuente_original_documental_mvp276',
  'fuente_binaria_comprador_mvp278',
  'source_not_verified'
 ])assert(migration.includes(marker),marker);
 const functionStart='CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_publish_mvp222(';
 const baseStart=mvp280.indexOf(functionStart);
 const baseEnd=mvp280.indexOf('\n$publish$;',baseStart);
 assert(baseStart>=0&&baseEnd>baseStart);
 const original=mvp280.slice(baseStart,baseEnd+11);
 const guardStart=migration.indexOf(' -- P1: suppliers are already locked');
 const guardEnd=migration.indexOf(
  ' IF EXISTS(\n  SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d',
  guardStart
 );
 assert(guardStart>0&&guardEnd>guardStart);
 const restored=migration.slice(
  migration.indexOf(functionStart),
  migration.indexOf('\n$publish$;',migration.indexOf(functionStart))+11
 ).replace(migration.slice(guardStart,guardEnd),'');
 assert.equal(restored,original,
  'P1 must change ONLY the supplier overlap guard; no security downgrade');
 assert(pg17.includes('p1_buyer_review_guard_lost'));
 assert(pg17.includes('ci_buyer_review_mvp280'));
});
