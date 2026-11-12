import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const sql=readFileSync(resolve(root,
 'supabase/tests/preflight/mvp363-originales-alta-readiness-readonly.sql'),'utf8');
const executable=sql.replace(/--[^\n]*/gu,'').trim();

test('MVP363: preflight is one read-only SELECT, never enables policy or inserts consent',()=>{
 assert.match(executable,/^WITH estado AS\s*\(/u);
 assert.equal((executable.match(/;/gu)||[]).length,1);
 assert.match(executable,/FROM estado;$/u);
 assert.doesNotMatch(executable,/\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|EXECUTE|CALL|PERFORM|COPY|SET|DO)\b/iu);
 assert.doesNotMatch(executable,/SELECT\s+\*/iu);
});

test('MVP363: operator MFA, consent policy, ledger and no overlapping round required',()=>{
 for(const required of [
  'auth.users','supervisor_operators_mvp265',
  'original_share_consents_mvp178','original_share_policy_mvp178',
  'operator_session_mvp267()','original_terms_policy_mvp362',
  "state='prepared'","closes_at>clock_timestamp()",
  'rondas_preparadas_vigentes>0','NO_CREAR_RONDA_SUPERPUESTA',
  'funcion_mfa_instalada','ledger_mvp362_instalado',
  'operadores_activos=0','auth_usuarios=0','politicas_originales_activas=0'
 ])assert(sql.includes(required),required);
});

test('MVP363: even a partial green preflight is not consent nor approval',()=>{
 assert.match(sql,/NO_APTO_PARA_ALTA_REAL/u);
 assert.match(sql,/PRECONDICIONES_PARCIALES_PENDIENTE_EVIDENCIA_Y_REVISION/u);
 assert.match(sql,/NINGUN_RESULTADO_AUTORIZA_REGISTRAR_CONSENTIMIENTO/u);
});
