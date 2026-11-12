import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=readFileSync(resolve(root,
 'supabase/piloto/mvp356_solo_piloto_despacho_sin_solapamientos.sql'),'utf8');
const fixture=readFileSync(resolve(root,
 'supabase/tests/ci/mvp356-dispatch-overlap-pg17.sql'),'utf8');

test('MVP356: los dos modos de despacho reclaman con MISMA exclusión transaccional',()=>{
 const locks=[...source.matchAll(/PERFORM pg_advisory_xact_lock\(7835634\);/gu)];
 assert.equal(locks.length,2);
 assert.match(source,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_ia_claim_mvp222\(/u);
 assert.match(source,/CREATE OR REPLACE FUNCTION public\.cotironda_piloto_ia_claim_mvp314\(/u);
 assert.match(source,/cotironda_piloto_ia_claim_mvp314\(p_request\)/u);
 assert.match(source,/d\.request_id,d\.supplier_key\)/u);
 assert.match(source,/j0\.request_id,j0\.supplier_key\)/u);
});
test('MVP356: no permite confundir un proveedor de otra ronda, antigua o incierta',()=>{
 assert.match(source,/other_job\.supplier_key=p_supplier/u);
 assert.match(source,/other_job\.request_id<>t\.id/u);
 assert.match(source,/other_job\.state IN \('leased','api_accepted','uncertain'\)/u);
 assert.match(source,/o\.state IN \('leased','api_accepted','uncertain'\)/u);
 assert.match(source,/other_round\.state='prepared'/u);
 assert.match(source,/old_round\.state='prepared'/u);
 assert.match(source,/other_round\.closes_at>clock_timestamp\(\)/u);
 assert.match(source,/old_round\.closes_at>clock_timestamp\(\)/u);
 assert.match(source,/NOT EXISTS \(SELECT 1 FROM target\)/u);
});
test('MVP356: la guarda es PRIVADA, no modifica datos ni envía WhatsApps',()=>{
 assert.match(source,/CREATE OR REPLACE FUNCTION cotironda_piloto_privado\.hay_despacho_solapado_mvp356\(/u);
 assert.match(source,/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC,anon,authenticated;/u);
 const helper=source.split('AS $mvp356$')[1]?.split('$mvp356$;')[0];
 assert(helper);
 assert.doesNotMatch(helper,/\b(?:UPDATE|DELETE|INSERT|TRUNCATE|ALTER|DROP)\b/iu);
 assert.doesNotMatch(source,/https?:\/\//iu);
 assert.doesNotMatch(source,/\b(?:phone|email|contact_nonce|ciphertext_b64)\b/iu);
});
test('MVP356: ensayo PG17 con 2 compradores, 2 proveedores y todas las rutas',()=>{
 for(const needle of [
  'mvp356_old_claim_overlapping_allowed',
  'mvp356_batch_overlapping_allowed',
  'mvp356_legacy_rival_not_blocked',
  'mvp356_uncertain_outbound_not_blocked',
  'mvp356_after_close_should_continue',
  'mvp356_batch_other_supplier_blocked',
  'mvp356_privilege_leak',
  'ROLLBACK;'
 ])assert(fixture.includes(needle));
});
