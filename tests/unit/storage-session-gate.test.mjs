import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const manual=readFileSync(new URL('../../supabase/tests/manual/11_storage_revoked_session_rollback.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../../supabase/migrations/20261029202610_storage_session_revocation.sql',import.meta.url),'utf8');

test('ensayo de sesión revocada real tiene ROLLBACK y no cambia registro ni usuarios',()=>{
 assert.match(manual,/^begin;$/m);
 assert.match(manual,/^rollback;$/m);
 assert.doesNotMatch(manual,/^\s*commit\s*;/mi);
 assert.doesNotMatch(manual,/insert\s+into\s+auth\.users\b/i);
 assert.doesNotMatch(manual,/\b(update|delete)\s+(?:cotironda_private\.registration_settings|storage\.buckets)\b/i);
 assert.doesNotMatch(manual,/\b(create|alter|drop)\s+(?:table|policy|function|schema|role)\b/i);
 assert.match(manual,/select\s+id\s+into\s+a\s+from\s+auth\.users/i);
 assert.match(manual,/delete from auth\.sessions/i);
 assert.match(manual,/sessions_after/);
 assert.match(manual,/registration_enabled/);
});

test('helper Storage no recibe parámetros arbitrarios y exige sesión de Auth',()=>{
 assert.match(migration,/create function cotironda_private\.storage_session_active\(\)/);
 assert.match(migration,/security definer set search_path = ''/);
 assert.match(migration,/auth\.jwt\(\)/);
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/is_session_verified\(v_uid,v_session::uuid\)/);
 assert.match(migration,/grant execute on function cotironda_private\.storage_session_active\(\) to authenticated/);
 assert.doesNotMatch(migration,/grant execute on function cotironda_private\.storage_session_active\(\) to (anon|public|service_role)/i);
 assert.equal((migration.match(/drop policy cotironda_buyer_drafts_/g)||[]).length,2);
 assert.equal((migration.match(/and \(select cotironda_private\.storage_session_active\(\)\)/g)||[]).length,2);
 assert.doesNotMatch(migration,/registration_settings\s+set\s+enabled\s*=\s*true/i);
});

test('migración no toca políticas de otros buckets ni propiedad de Storage',()=>{
 assert.doesNotMatch(migration,/alter table storage\.objects/i);
 assert.doesNotMatch(migration,/alter role|grant all on|grant.*service_role/i);
 assert.doesNotMatch(migration,/delete from storage\./i);
 assert.match(migration,/cotironda-buyer-drafts/);
});
