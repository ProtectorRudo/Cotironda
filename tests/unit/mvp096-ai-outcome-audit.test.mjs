import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('MVP096: la IA deja evidencia de ejecución sin registrar textos',()=>{
 const edge=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(edge,/cotironda_piloto_reserve_ai_mvp094/);
 assert.match(edge,/cotironda_piloto_finish_ai_mvp096/);
 assert.match(edge,/p_result_state:'completed'/);
 assert.match(edge,/p_result_state:'failed'/);
 assert.match(edge,/p_intent:model.intent/);
 assert.match(edge,/p_decision:decision.action/);
 assert.match(edge,/p_failure_category:category/);
 assert.doesNotMatch(edge,/p_response:\s*(?:body|model)/);
});
test('MVP096: clasificación de fallo acotada y nunca repite el llamado',()=>{
 const edge=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(edge,/code==='pilot_ai_key_missing'\?'auth_config'/);
 assert.match(edge,/code==='pilot_ai_quota'\?'quota'/);
 assert.match(edge,/code==='pilot_ai_transport_error'/);
 assert.match(edge,/ai_audit_reconciliation_required/);
 assert.doesNotMatch(edge,/console\.log\(.*(?:body|model|apiKey)/);
});
test('MVP096: SQL restringe quién puede consultar el resultado y es una sola finalización',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/mvp096_ai_outcome_audit.sql',import.meta.url),'utf8');
 assert.match(sql,/result_state='reserved'/);
 assert.match(sql,/where message_hmac=p_message_hmac and result_state='reserved'/);
 assert.match(sql,/to service_role/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.doesNotMatch(sql,/original_request|original_quote|p_plaintext/);
});
