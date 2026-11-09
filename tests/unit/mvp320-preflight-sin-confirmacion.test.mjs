import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluarPreflightMvp320} from '../../scripts/piloto/mvp320-preflight-gate.mjs';

// Literal sanitized results from a read-only query, never a database connection.
const baseline={
 audited_at_utc:'2026-11-09 00:27:08',
 execution:'MVP320_READ_ONLY_NO_OUTBOUND',
 postgres17:true,mvp309_installed:false,mvp310_installed:false,
 mvp312_installed:false,mvp313_installed:false,
 mvp314_installed:false,mvp315_installed:false,
 auto_release_enabled:false,legacy_dispatch_enabled:true,
 inbound_enabled:true,outbound_enabled:true,
 auto_released_rounds:0,original_files:7,
 external_whapi_transport_verified:false,real_e2e_certified:false
};
const copy=()=>({...baseline});
test('MVP320: real sanitized pilot correctly reports missing release chain',()=>{
 const r=evaluarPreflightMvp320(copy());
 assert.equal(r.state,'pilot_code_not_deployed');
 assert.equal(r.database_blockers.length,7); // 6 release parts + auto flag
 assert.ok(r.database_blockers.includes('automatic_release_without_buyer_confirmation_off'));
 assert.equal(r.observations.legacy_dispatch_enabled,true);
 assert.equal(r.observations.original_files,7);
 assert.equal(r.real_e2e_certified,false);
 assert.equal(r.eligible_for_real_outbound,false);
});
test('MVP320: even installed migrations and opened gate do not certify WhatsApp E2E',()=>{
 const v=copy();
 for(const k of Object.keys(v))
  if(/^mvp3(?:09|10|12|13|14|15)_installed$/u.test(k))v[k]=true;
 v.auto_release_enabled=true;
 const r=evaluarPreflightMvp320(v);
 assert.equal(r.state,'pilot_deployment_requires_external_checks');
 assert.equal(r.database_blockers.length,0);
 assert.equal(r.real_e2e_certified,false);
 assert.equal(r.eligible_for_real_outbound,false);
 assert.ok(r.external_checks.includes('mvp311_live_rpc_hash_validation'));
 assert.ok(r.external_checks.includes('whapi_credential_rotation_required'));
 assert.ok(r.external_checks.includes('sandbox_chat_participants_and_limits_validation'));
});
test('MVP320: missing documents and disabled inbound/outbound are separate blockers',()=>{
 const r=evaluarPreflightMvp320({...copy(),
  original_files:6,inbound_enabled:false,outbound_enabled:false});
 assert.ok(r.database_blockers.includes('original_documents_below_known_baseline'));
 assert.ok(r.database_blockers.includes('whatsapp_inbound_off'));
 assert.ok(r.database_blockers.includes('whatsapp_outbound_off'));
});
test('MVP320: reject extra sensitive fields, metadata or missing keys',()=>{
 for(const v of [
  {...copy(),token:'never'},
  {...copy(),chat_hmac:'a'.repeat(64)},
  {...copy(),buyer_phone:'1111111111'},
  {...copy(),round_id:'random-id'},
  {...copy(),request_id:'random-id'},
  {...copy(),audit_tag:true}
 ])assert.equal(evaluarPreflightMvp320(v),null);
 const missing=copy();delete missing.original_files;
 assert.equal(evaluarPreflightMvp320(missing),null);
 assert.doesNotMatch(JSON.stringify(evaluarPreflightMvp320(copy())),
  /token|chat_hmac|buyer_phone|round_id|request_id|\d{8,}/iu);
});
test('MVP320: reject forged evidence, impossible counts and unknown enums',()=>{
 for(const patch of [
  {execution:'MVP320_ALLOW_OUTBOUND'}, {real_e2e_certified:true},
  {external_whapi_transport_verified:true}, {postgres17:'true'},
  {mvp309_installed:null},{auto_release_enabled:1},
  {auto_released_rounds:-1},{auto_released_rounds:1.5},
  {original_files:-3},{original_files:1e30},
  {audited_at_utc:'invalid'}
 ])assert.equal(evaluarPreflightMvp320({...copy(),...patch}),null,
  JSON.stringify(patch));
});
test('MVP320: SQL is only a sanitized SELECT with no side effects',()=>{
 const sql=readFileSync(new URL(
  '../../scripts/piloto/mvp320-preflight-sin-confirmacion-readonly.sql',
  import.meta.url),'utf8');
 const code=sql.replace(/^--.*$/gmu,'');
 assert.match(code,/^\s*SELECT\s+/iu);
 assert.match(code,/MVP320_READ_ONLY_NO_OUTBOUND/u);
 assert.match(code,/\bfalse AS real_e2e_certified\b/u);
 assert.doesNotMatch(code,/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE|CALL|DO|COMMIT|BEGIN|PERFORM|COPY|NOTIFY)\b/iu);
 assert.doesNotMatch(code,/\b(pg_net|http_post|pg_read_file|dblink|curl|pg_sleep)\b/iu);
 assert.doesNotMatch(code,/\bAS\s+(phone|token|chat_hmac|request_id|supplier_key)\b/iu);
 assert.doesNotMatch(code,/\bSELECT\s+\*/iu);
});
