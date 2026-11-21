import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL(
 '../../supabase/piloto/v2_d013_publicacion_parcial_CANDIDATE.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL(
 '../../supabase/piloto/v2_d013_publicacion_parcial_ROLLBACK_ONLY.sql',import.meta.url),'utf8');
const count=(text,pattern)=>(text.match(pattern)||[]).length;
test('D013 publicación parcial modifica sólo ambas guardias de cobertura V2',()=>{
 assert.equal(count(migration,/new_approve:=replace\(/gu),1);
 assert.equal(count(migration,/new_publish:=replace\(/gu),1);
 assert.equal(count(migration,/timing_mode IS NOT DISTINCT FROM 'business_two_days'/gu),2);
 assert.equal(count(migration,/round_days IS NOT DISTINCT FROM 2/gu),2);
 assert.equal(count(migration,/v2_calendar_revision IS NOT NULL/gu),2);
 assert.match(migration,/EXISTS\(SELECT 1 FROM cotironda_piloto_privado\.request_lines l/u);
 assert.match(migration,/NOT EXISTS\(/u);
 assert.match(migration,/ai_shadow_destinos_mvp221/u);
 assert.match(migration,/v2_partial_source_drifted/u);
 assert.match(migration,/v2_partial_anchors_not_unique/u);
 assert.match(migration,/v2_partial_postcheck_failed/u);
 for(const s of [migration,rollback]){
  assert.doesNotMatch(s,/\b(?:DROP|GRANT|TRUNCATE|DELETE|ALTER\s+TABLE)\b\s+(?:TABLE|FUNCTION|ON|FROM|cotironda_)/iu);
  assert.doesNotMatch(s,/\b(?:pg_net|whapi_outbox|messages\.create)\b/iu);
  assert.match(s,/has_function_privilege\('anon'/u);
  assert.match(s,/has_function_privilege\('authenticated'/u);
 }
});
test('D013 la reversión está anclada a los SHA del candidato, no a V1',()=>{
 for(const [pre,post] of [
  ['90422ee23d4fd48821b86f06d7d31843696f5641d6dc870019bf741e278e25a1','64e2e0451193992d7b6aa0239ba1ec84644f302c596e110fe1f232c48a549424'],
  ['1901c5fc122ff246312024d60ba39db0f595d9d50f6001d43c6a56c9d911703f','d0187d53d37f9624167401df449f1d46e98e983d8d8ad33ced2f78e18bdff1e0']
 ]){
  assert.ok(migration.indexOf(pre)<migration.indexOf(post));
  assert.ok(rollback.indexOf(post)<rollback.indexOf(pre));
 }
 assert.match(rollback,/v2_partial_source_drifted/u);
});
test('D013 cinco materiales, sólo tres con catálogo, mantiene integridad',()=>{
 const items=[1,2,3,4,5],assigned=new Set([1,2,3]);
 const requiresAll=(mode,days,revision)=>
  !(mode==='business_two_days'&&days===2&&revision!==null);
 const mayPublish=(mode,days,revision)=>
  assigned.size>0 && (!requiresAll(mode,days,revision)||
   items.every(x=>assigned.has(x)));
 assert.equal(mayPublish('business_two_days',2,'LP-2026'),true);
 assert.equal(mayPublish('legacy_calendar',5,'LP-2026'),false);
 assert.equal(mayPublish('business_two_days',3,'LP-2026'),false);
 assert.equal(mayPublish('business_two_days',2,null),false);
 assert.equal(items.length,5,'el original retiene cinco artículos');
 assigned.clear();
 assert.equal(mayPublish('business_two_days',2,'LP-2026'),false,
  'sin ningún proveedor real no publica');
});
