import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRoundtripSql} from '../../scripts/piloto/mvp284-e2e-builder.mjs';

test('MVP284 se inserta después de las 21 migraciones, antes del ROLLBACK único',()=>{
 const s=buildRoundtripSql();
 const index=s.indexOf('\\ir ./mvp284-roundtrip-e2e-pg17.sql');
 const last=s.indexOf('\\ir ../../piloto/mvp280_confirmacion_unificada_comprador.sql');
 const rollback=s.indexOf('\nROLLBACK;\nSELECT');
 assert.ok(last>0&&index>last&&rollback>index);
 assert.equal(s.split(/^ROLLBACK;\s*$/gm).length,2);
 assert.doesNotMatch(s,/(?:https:\/\/gate\.whapi\.cloud|https:\/\/api\.openai\.com)/);
});
test('no permite comando externo, commit ni fuera de transacción',()=>{
 for(const bad of ['-- MVP284:\nDO $e2e$ BEGIN END $e2e$;\nCOMMIT;',
 '-- MVP284:\nDO $e2e$ BEGIN END $e2e$;\n\\! echo secret',
 'DO $e2e$ BEGIN END $e2e$;']){
  assert.throws(()=>buildRoundtripSql(()=>bad),/MVP284_UNSAFE_SCENARIO/);
 }
});
test('escenario cubre todo el flujo y explícitamente descarta ranking global',()=>{
 const s=readFileSync(new URL('../../supabase/tests/ci/mvp284-roundtrip-e2e-pg17.sql',import.meta.url),'utf8');
 for(const symbol of [
  'cotironda_piloto_ia_trial_flags_mvp229',
  'cotironda_piloto_ia_review_issue_mvp279',
  'cotironda_piloto_ia_review_confirm_mvp279',
  'cotironda_piloto_ia_publish_mvp222',
  'cotironda_piloto_ia_claim_mvp222',
  'cotironda_piloto_ia_pdf_snapshot_mvp222',
  'cotironda_piloto_ia_link_supplier_mvp225',
  'cotironda_piloto_ia_reserve_quote_mvp227',
  'cotironda_piloto_ia_finish_quote_mvp227',
  'cotironda_piloto_ia_buyer_rubros_mvp227',
  'ranking_global_permitido','contactos_revelados'
 ])assert.ok(s.includes(symbol),symbol+' ausente');
 assert.doesNotMatch(s,/^\s*(COMMIT|ROLLBACK|CREATE EXTENSION)\b/im);
});
