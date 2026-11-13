import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const query=readFileSync(new URL(
 '../../supabase/piloto/v2_d016_preflight_SOLO_LECTURA.sql',import.meta.url
),'utf8');
const active=query.split('\n')
 .filter(line=>!line.trimStart().startsWith('--')).join('\n').trim();

test('D016 preflight es un SELECT de solo lectura, sin cambios de permisos ni datos',()=>{
 assert.match(active,/^WITH\s+policies\s+AS\s*\(/u);
 assert.match(active,/SELECT jsonb_build_object\(/u);
 assert.match(active,/AS preflight;$/u);
 assert.equal((active.match(/;/gu)??[]).length,1);
 assert.doesNotMatch(active,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|REVOKE|GRANT|CALL|EXECUTE|COPY|PERFORM|SET|RESET|DO)\b/iu);
 assert.doesNotMatch(active,/vault\.decrypted_secrets|pg_read_file|pg_ls_dir|pg_read_binary_file/iu);
});
test('D016 preflight exige aprobaciones prospectivas, no reactiva funciones',()=>{
 for(const term of [
  'v2_business_policy','v2_original_share_policy','v2_auto_release_policy',
  'v2_business_calendar','approved_at','la plata','year=2026',
  'v2_supplier_original_consents','accepted_at','revoked_at',
  'v2_d016_worker_due_private','v2_d016_close_due_private',
  'v2_d016_final_status_private','requests_exact_duration_check',
  'business_two_days','18:00:00',
  'politica_negocio_off','originales_off','cierre_automatico_off'
 ])assert.ok(active.includes(term),term);
});
test('D016 preflight no revela secretos, identidad ni detalles de proveedores',()=>{
 assert.match(active,/count\(DISTINCT supplier_key\)/u);
 assert.match(active,/count\(DISTINCT buyer\.key\)/u);
 assert.match(active,/sin_verificar_en_sql/u);
 assert.match(active,/credenciales_en_vault_y_edge/u);
 assert.match(active,/limites_y_costos_api/u);
 assert.match(active,/proteccion_sso/u);
 assert.match(active,/entrega_whapi_real_y_e2e/u);
 assert.doesNotMatch(active,/SELECT\s+(?:\*|buyer\.key|supplier_key|secret|phone|contact_sha256)\s+(?:FROM|AS)/iu);
 assert.doesNotMatch(active,/\bdecrypted_secret\b|\bsecret_key\b|\bciphertext_b64\b/iu);
});
