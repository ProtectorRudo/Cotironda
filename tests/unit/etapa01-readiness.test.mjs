import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/tests/manual/14_etapa01_guardrails_readonly.sql',import.meta.url),'utf8');
const clean=sql.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''").trim();

test('auditoría Etapa 01 es una sola consulta SELECT sin cambios ni transacciones',()=>{
 assert.match(clean,/^with\s+controles\s+as\s*\(/i);
 assert.match(clean,/\)\s*select\s+control\s*,\s*case\s+when\s+cumple/i);
 assert.equal((clean.match(/;/g)||[]).length,1,'Sin múltiples sentencias');
 assert.ok(clean.endsWith(';'));
 assert.doesNotMatch(clean,/\b(insert|update|delete|truncate|create|alter|drop|grant|revoke|commit|rollback|do|call|execute|set|copy|vacuum)\b/i);
});

test('contrato contiene exactamente 17 controles explícitos y fail-closed',()=>{
 assert.equal((clean.match(/\bunion\s+all\s+select\b/gi)||[]).length,16);
 assert.match(sql,/registration_settings\s+where\s+singleton=true/);
 assert.match(sql,/enabled is false/);
 assert.match(sql,/not exists\(select 1 from pg_policies[\s\S]*?cmd in \('INSERT','UPDATE','DELETE','ALL'\)/);
 assert.match(sql,/cotironda-upload-quarantine/);
 assert.match(sql,/storage_session_active/);
 assert.match(sql,/not has_function_privilege\('anon'/);
 assert.match(sql,/not has_function_privilege\('authenticated',[\s\S]*?is_session_verified/);
 assert.match(sql,/not p\.prosecdef/);
 assert.match(sql,/then 'PASS' else 'FAIL'/);
});

test('la auditoría no pretende certificar usuarios HTTP ni antivirus',()=>{
 assert.match(sql,/no demuestra E2E HTTP/);
 assert.match(sql,/project_id=qkercsoqhehbenbbncwk/);
 assert.doesNotMatch(sql,/sb_secret_|service_role\s*=/i);
});
