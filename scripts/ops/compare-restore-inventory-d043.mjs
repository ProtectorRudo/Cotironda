/**
 * D043 — Offline, no database connections, no credential or PII access.
 * Compares count-only inventories from Supabase DEV and an isolated restored DB.
 * A matching inventory is NOT evidence of full backup or successful recovery.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HISTORIAL_DEV_VALIDADO_D036 } from '../ci/dev-readiness-d036.mjs';

export const COUNT_FIELDS_D043 = Object.freeze([
  'authUsers', 'authIdentities', 'authSessions',
  'storageBuckets', 'storagePublicBuckets', 'storageObjects',
  'vaultRecords', 'cronJobs', 'publicMissingRls',
  'privateMissingRls', 'qualityClaims'
]);
const BOOLEAN_FIELDS = Object.freeze(['iaEnabled', 'registrationEnabled']);
const KEYS = Object.freeze([
  'pgVersionNum','migrations','extensions',
  ...COUNT_FIELDS_D043,...BOOLEAN_FIELDS
]);
const EXPECTED_EXTENSIONS = Object.freeze(['pg_cron','pg_net','supabase_vault']);
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const keysMatch = (x, expected) => isObject(x)
  && Object.keys(x).length === expected.length
  && Object.keys(x).every(k => expected.includes(k));
const result = (errors) => Object.freeze({
  estado: errors.length ? 'BLOQUEADO' : 'INVENTARIOS_COINCIDENTES_SIN_RESTORE_CERTIFICADO',
  errores: Object.freeze(errors),
  backup_real_verificado: false,
  restore_verified: false,
  gate_d024_open: false
});

function validateInventory(inv, prefix, errs) {
  if (!keysMatch(inv, KEYS)) { errs.push(prefix + '_estructura_invalida'); return false; }
  if (!Number.isSafeInteger(inv.pgVersionNum) || inv.pgVersionNum < 170000) {
    errs.push(prefix + '_version_postgres_invalida');
  }
  if (!Array.isArray(inv.migrations) ||
      inv.migrations.length !== HISTORIAL_DEV_VALIDADO_D036.length ||
      inv.migrations.some((m,i) => !keysMatch(m,['version','name']) ||
        m.version !== HISTORIAL_DEV_VALIDADO_D036[i].version ||
        m.name !== HISTORIAL_DEV_VALIDADO_D036[i].name)) {
    errs.push(prefix + '_historial_17_migraciones_invalido');
  }
  if (!Array.isArray(inv.extensions) ||
      JSON.stringify(inv.extensions) !== JSON.stringify(EXPECTED_EXTENSIONS)) {
    errs.push(prefix + '_extensiones_incompletas');
  }
  for (const f of COUNT_FIELDS_D043) {
    if (!Number.isSafeInteger(inv[f]) || inv[f] < 0) errs.push(prefix + '_' + f + '_invalido');
  }
  for (const f of BOOLEAN_FIELDS) {
    if (inv[f] !== false) errs.push(prefix + '_' + f + '_debe_estar_apagado');
  }
  for (const f of ['cronJobs','storagePublicBuckets','publicMissingRls','privateMissingRls']) {
    if (inv[f] !== 0) errs.push(prefix + '_' + f + '_inesperado');
  }
  return errs.length === 0;
}
export function compareRecoveryInventories(source, restored) {
  const errors = [];
  // Both sides MUST pass, even when the erroneous fields match each other.
  const a = validateInventory(source, 'origen', errors);
  const b = validateInventory(restored, 'restaurado', errors);
  if (a && b) {
    if (source.pgVersionNum !== restored.pgVersionNum) errors.push('version_postgresql_distinta');
    // We do not compare migration SQL contents here; hashes require separate proof.
    for (const f of COUNT_FIELDS_D043) {
      if (source[f] !== restored[f]) errors.push('diferencia_' + f);
    }
  }
  return result(errors);
}
async function readInventory(file) {
  if (typeof file !== 'string' || file.length === 0) throw new Error('D043_RUTA_INVALIDA');
  const s = await readFile(resolve(file), 'utf8');
  if (s.length > 30000) throw new Error('D043_ARCHIVO_DEMASIADO_GRANDE');
  let parsed;
  try { parsed = JSON.parse(s); } catch { throw new Error('D043_JSON_INVALIDO'); }
  // Allow the exact single-column envelope output by the SQL console.
  if (keysMatch(parsed, ['inventory'])) parsed = parsed.inventory;
  return parsed;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  Promise.all([readInventory(process.argv[2]), readInventory(process.argv[3])])
    .then(([source,restored]) => {
      const r = compareRecoveryInventories(source,restored);
      console.log(JSON.stringify(r));
      if (r.estado === 'BLOQUEADO') process.exitCode = 1;
    })
    .catch(error => {
      console.error(error instanceof Error && /^D043_[A-Z_]+$/.test(error.message)
        ? error.message : 'D043_COMPARACION_NO_REALIZADA');
      process.exitCode = 1;
    });
}
