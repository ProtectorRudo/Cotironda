import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/tests/manual/10_storage_rls_dev_rollback.sql',import.meta.url),'utf8');

test('ensayo real de Storage usa transacción única y rollback incondicional',()=>{
 assert.match(sql,/^begin;$/m);
 assert.match(sql,/^rollback;$/m);
 assert.doesNotMatch(sql,/^\s*commit\s*;/mi);
 assert.doesNotMatch(sql,/^\s*delete\s+from\s+auth\.users\b/mi);
 assert.match(sql,/storage\.protect_delete\(\)/);
 assert.match(sql,/Direct deletion from storage tables is not allowed/);
 assert.doesNotMatch(sql,/^\s*(create|alter|drop)\s+(table|policy|schema|role|function)\b/mi);
 const rollback=sql.lastIndexOf('rollback;');
 assert.ok(rollback>sql.lastIndexOf('set local role anon'));
 assert.match(sql.slice(rollback),/organizations_after/);
 assert.match(sql.slice(rollback),/files_after/);
});
test('no crea ni elimina cuentas reales, ni modifica flags, planes o buckets',()=>{
 assert.doesNotMatch(sql,/insert\s+into\s+auth\.users\b/i);
 assert.doesNotMatch(sql,/update\s+(?:cotironda_private\.registration_settings|storage\.buckets)\b/i);
 assert.doesNotMatch(sql,/insert\s+into\s+storage\.buckets\b/i);
 assert.doesNotMatch(sql,/\bservice_role\b/i);
 assert.match(sql,/registration_settings where singleton=true/);
 assert.match(sql,/registration_enabled/);
});
test('RLS es evaluado como authenticated y anon, nunca como postgres en las verificaciones',()=>{
 assert.match(sql,/set local role authenticated;/);
 assert.match(sql,/set local role anon;/);
 assert.match(sql,/request\.jwt\.claim\.sub/);
 assert.match(sql,/from auth\.users/);
 assert.match(sql,/insert into storage\.objects/);
 assert.match(sql,/when insufficient_privilege then null/);
 assert.match(sql,/membres|member/);
});
