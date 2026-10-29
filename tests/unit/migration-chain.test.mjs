import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationDir='supabase/migrations';
const expected=[
 '20261029105736_initial_identity_catalog.sql',
 '20261029111731_backend_role_limited.sql',
 '20261029112947_execute_only_registration.sql',
 '20261029120021_jwt_bound_registration_locked.sql',
 '20261029122708_invoker_verified_email_hook.sql',
 '20261029130907_session_revocation_and_verified_user.sql',
 '20261029140422_registration_attempt_rate_limiter.sql',
 '20261029183835_storage_private_buyer_drafts.sql',
 '20261029202610_storage_session_revocation.sql',
 '20261029211609_storage_upload_fail_closed.sql',
 '20261029224000_private_quarantine_ledger.sql'
];
const actual=readdirSync(migrationDir).filter(p=>p.endsWith('.sql')).sort();

test('el historial de once migraciones de cotironda-dev está versionado completo y en orden',()=>{
 assert.deepEqual(actual,expected,'No agregar, borrar o renombrar migraciones sin revisar DB dev, CI y manifiesto');
 const versions=actual.map(path=>Number(path.slice(0,14)));
 assert.equal(new Set(versions).size,versions.length);
 for(let i=1;i<versions.length;i++)assert.ok(versions[i]>versions[i-1]);
});

test('esquema declarativo y primera migración contienen la misma SQL efectiva',()=>{
 const normalize=s=>s.split('\n')
  .map(line=>line.trim())
  .filter(line=>line.length>0&&!line.startsWith('--'))
  .join('\n');
 const schema=normalize(readFileSync('supabase/schema.sql','utf8'));
 const migration=normalize(readFileSync(join(migrationDir,expected[0]),'utf8'));
 assert.equal(schema,migration,'El esquema y migración histórica inicial divergieron');
});

test('ninguna migración está vacía; registro sigue cerrado y Storage restringido',()=>{
 for(const file of expected){
  const sql=readFileSync(join(migrationDir,file),'utf8');
  assert.ok(sql.length>100, 'Migración vacía: '+file);
 }
 const rate=readFileSync(join(migrationDir,'20261029140422_registration_attempt_rate_limiter.sql'),'utf8');
 assert.match(rate,/registration_settings/);
 assert.match(rate,/enabled/);
 assert.match(rate,/registration_attempt_quotas/);
 const storage=readFileSync(join(migrationDir,'20261029183835_storage_private_buyer_drafts.sql'),'utf8');
 assert.match(storage,/storage\.buckets/);
 assert.match(storage,/storage\.objects/);
 assert.match(storage,/for select to authenticated/);
 assert.match(storage,/for insert to authenticated/);
 const guard=readFileSync(join(migrationDir,'20261029202610_storage_session_revocation.sql'),'utf8');
 assert.match(guard,/storage_session_active/);
 assert.match(guard,/is_session_verified/);
 assert.match(guard,/drop policy cotironda_buyer_drafts/);
 assert.doesNotMatch(guard,/registration_settings\s+set\s+enabled\s*=\s*true/i);
 const final=readFileSync(join(migrationDir,'20261029211609_storage_upload_fail_closed.sql'),'utf8');
 assert.match(final,/drop policy if exists cotironda_buyer_drafts_insert_manager/);
 assert.doesNotMatch(final,/create policy.*insert/si);
 const quarantine=readFileSync(join(migrationDir,expected.at(-1)),'utf8');
 assert.match(quarantine,/cotironda-upload-quarantine/);
 assert.match(quarantine,/document_intake_jobs/);
 assert.match(quarantine,/document_intake_approved_scanned/);
 assert.doesNotMatch(quarantine,/create policy/i);
});
