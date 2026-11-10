// MVP317: fixture for transactional migration rehearsal (CI only).
// Bootstrap OLD synthetic pilot schema and frozen live-compatible RPC code
// in a disposable PG17 instance, then allow a separate 9-file transaction.
import './mvp308-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const original=readFileSync(
  root+'supabase/tests/ci/.mvp308-generated-pg17.sql','utf8');
if (!original.includes('BEGIN;') ||
    !original.includes('\\ir ./mvp308-consent-all-roles-pg17.sql') ||
    !/ROLLBACK;\s*$/u.test(original) ||
    original.includes('mvp309_declaracion_admin_autorizacion_previa.sql')) {
  throw Error('mvp317_old_fixture_drift');
}
const compiled=original.replace(/ROLLBACK;\s*$/u,
 '\\ir ./mvp311-legacy-rpc-baseline-pg17.sql\n'+
 '\\ir ./mvp317-legacy-constraints-pg17.sql\nCOMMIT;\n');
if (compiled.includes('ROLLBACK;')) {
  throw Error('mvp317_unexpected_rollback_or_nested_transaction');
}
const target=root+'supabase/tests/ci/.mvp317-baseline-pg17.sql';
writeFileSync(target,compiled,'utf8');
console.log('MVP317 baseline PG17 synthetic only. No real clients or WhatsApp.');
