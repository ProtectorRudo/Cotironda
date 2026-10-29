import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../../supabase/migrations/20261029213755_private_quarantine_ledger.sql',import.meta.url),'utf8');
const devTest=readFileSync(new URL('../../supabase/tests/manual/13_quarantine_ledger_dev_rollback.sql',import.meta.url),'utf8');

test('cuarentena nunca se abre a usuarios autenticados/anon en la migración',()=>{
 assert.match(migration,/cotironda-upload-quarantine/);
 assert.match(migration,/values\('cotironda-upload-quarantine','cotironda-upload-quarantine',false,10485760/);
 assert.match(migration,/count\(\*\) from pg_policies/);
 assert.doesNotMatch(migration,/create policy/i);
 assert.doesNotMatch(migration,/grant\s+(insert|select|update|delete|all)\s+on\s+storage\.objects/i);
 assert.doesNotMatch(migration,/createSignedUploadUrl|createSignedUrl/);
});
test('ledger exige scanner para aprobación y no es una tabla pública',()=>{
 assert.match(migration,/create table cotironda_private\.document_intake_jobs/);
 assert.match(migration,/document_intake_approved_scanned/);
 assert.match(migration,/scan_verdict='clean'/);
 assert.match(migration,/scan_completed_at is not null/);
 assert.match(migration,/sha256_hex is not null/);
 assert.match(migration,/unique\(organization_id,idempotency_key\)/);
 assert.match(migration,/revoke all on cotironda_private\.document_intake_jobs from PUBLIC,anon,authenticated/);
 assert.match(migration,/grant select,insert,update on cotironda_private\.document_intake_jobs to service_role/);
 assert.doesNotMatch(migration,/grant delete on cotironda_private\.document_intake_jobs/i);
});
test('trigger bloquea transiciones no autorizadas y cambios de identidad de archivo',()=>{
 assert.match(migration,/document_identity_immutable/);
 assert.match(migration,/document_transition_invalid/);
 assert.match(migration,/document_terminal_immutable/);
 assert.match(migration,/new\.updated_at=now\(\)/);
});
test('ensayo real de dev está blindado por precondiciones y rollback',()=>{
 assert.match(devTest,/^begin;$/m);
 assert.match(devTest,/^rollback;$/m);
 assert.doesNotMatch(devTest,/^\s*commit\s*;/mi);
 assert.doesNotMatch(devTest,/insert\s+into\s+auth\.users/i);
 assert.doesNotMatch(devTest,/\b(drop|alter|create)\s+(table|schema|policy|role)\b/i);
 assert.match(devTest,/registration_enabled/);
 assert.match(devTest,/jobs_after/);
});
