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
 '20261029140422_registration_attempt_rate_limiter.sql'
];
const actual=readdirSync(migrationDir).filter(p=>p.endsWith('.sql')).sort();

test('el historial de siete migraciones de cotironda-dev está versionado completo y en orden',()=>{
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

test('ninguna migración está vacía y el último SQL conserva el bloqueo de registros',()=>{
 for(const file of expected){
  const sql=readFileSync(join(migrationDir,file),'utf8');
  assert.ok(sql.length>100, 'Migración vacía: '+file);
 }
 const last=readFileSync(join(migrationDir,expected.at(-1)),'utf8');
 assert.match(last,/registration_settings/);
 assert.match(last,/enabled/);
 assert.match(last,/registration_attempt_quotas/);
});
