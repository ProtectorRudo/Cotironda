import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const candidate=readFileSync(new URL(
 '../../supabase/piloto/v2_original_semantic_unique_portal_CANDIDATE.sql',import.meta.url
),'utf8');
const rollback=readFileSync(new URL(
 '../../supabase/piloto/v2_original_semantic_unique_portal_ROLLBACK_ONLY.sql',import.meta.url
),'utf8');
const value=(s,id)=>{
 const m=s.match(new RegExp('\\$'+id+'\\$([\\s\\S]*?)\\$'+id+'\\$'));
 assert.ok(m,'patch anchor '+id);
 return m[1];
};
test('V2 catálogo admite PDFs asociados semánticamente con prueba de ronda y archivo',()=>{
 const v=value(candidate,'B');
 for(const x of [
  "link.association='semantic_unique_mvp291'",
  'decision.source_hmac=link.message_hmac',
  'decision.supplier_key=link.supplier_key',
  'decision.source_sha256=link.source_sha256',
  'decision.selected_request_id=link.request_id',
  "decision.state='linked'",
  'decision.finished_at IS NOT NULL',
  'u.resolved_request_id=link.request_id',
  "u.state='ambiguous_round'"
 ])assert.ok(v.includes(x),x);
 assert.ok(v.includes("link.association='prior_supplier_preamble'"),
  'mantener asociación anterior');
 assert.ok(v.includes("link.association IN ('quoted_whapi_id','single_active_round')"),
  'mantener vínculo por referencia WhatsApp');
});
test('V2 descarga revalida exactamente la misma evidencia',()=>{
 const v=value(candidate,'F');
 for(const x of [
  "link.association='semantic_unique_mvp291'",
  'decision.source_sha256=link.source_sha256',
  'decision.selected_request_id=link.request_id',
  "decision.state='linked'",
  'u.resolved_request_id=link.request_id',
  "u.state='ambiguous_round'"
 ])assert.ok(v.includes(x),x);
});
test('resolución de ronda quita solo rechazo por ambigüedad ya resuelta',()=>{
 const v=value(candidate,'D');
 assert.ok(v.includes("bad.state='media_context_conflict'"),
  'un conflicto real de medio bloquea');
 assert.ok(v.includes('bad.resolved_request_id IS DISTINCT FROM link.request_id'),
  'un conflicto con otra ronda bloquea');
 assert.ok(v.includes("bad.state='ambiguous_round'"),
  'ambigüedad todavía no resuelta bloquea');
});
test('V2 preserva consentimiento explícito, sesión, aislamiento y original privado',()=>{
 for(const x of [
  "v2_d016_effective_original_consent_private",
  "v2_d016_session_context_private",
  "v2_d016_responders_private",
  "catalog_unresolved_after",
  "source_association_after",
  "v2_portal_access_postcheck_failed",
  "has_function_privilege('anon'",
  "has_function_privilege('authenticated'",
  "source_sha256=link.source_sha256",
  'semantic_unique_mvp291',
  "v2_portal_live_source_drifted"
 ])assert.ok(candidate.includes(x),x);
 assert.doesNotMatch(candidate,/\b(?:DROP|TRUNCATE|DELETE FROM)\s+(?:FUNCTION|TABLE|cotironda_piloto_privado)/iu);
 assert.doesNotMatch(candidate,/\bGRANT\s+(?:ALL|EXECUTE)\b/iu);
 assert.doesNotMatch(candidate,/net\.http|whapi\.cloud|messages\/document/iu);
});
test('V2 release verifica hashes de pre/post SQL; rollback requiere hashes posteriores',()=>{
 const before=[
  '9c89416f5ba4cf43039ff769dc7daebb071615fd11f051c6654bef67b54de9a9',
  '70a964168c5ca9cd284d4e9fdd2ff8bf67827c09f0ec07719669e4c1f2abd87c'
 ];
 const after=[
  '72bf82d597beb16872b7e893d7562b5419180df715050ffd05d7221ad36808cd',
  '21e52c8b1fa968e561573bc103c365c8ac668bd957fe556e1f6fbee48da746c9'
 ];
 for(const h of [...before,...after]){
  assert.ok(candidate.includes(h),'candidate '+h);
  assert.ok(rollback.includes(h),'rollback '+h);
 }
 for(const id of ['A','B','C','D','E','F'])
  assert.equal(value(candidate,id),value(rollback,id),id);
 assert.match(candidate,/v2_portal_post_source_mismatch/);
 assert.match(rollback,/v2_semantic_rollback_live_drift/);
});
test('V2 muestra el original independiente de ofertas económicas y modelos duplicados',()=>{
 assert.doesNotMatch(value(candidate,'B'),
  /supplier_reading_checks|offer_versions|supplier_amount_checks|double_model|model_readings_match/iu);
 assert.doesNotMatch(value(candidate,'F'),
  /supplier_reading_checks|offer_versions|supplier_amount_checks|model_readings_match/iu);
});
