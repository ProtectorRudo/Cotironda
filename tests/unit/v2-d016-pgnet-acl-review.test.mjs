import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const candidate=read('../../supabase/piloto/v2_d016_pgnet_acl_REVIEW_ONLY.sql');
const activation=read('../../supabase/piloto/v2_d016_cron_ACTIVATE_ONLY_AFTER_PUBLICALO.sql');
const preflight=read('../../supabase/piloto/v2_d016_preflight_SOLO_LECTURA.sql');
const activeSql=candidate.split('\n')
 .filter(line=>!line.trimStart().startsWith('--')).join('\n');

test('pg_net D016: mitigación no se ejecuta sola y exige ref Vault del piloto',()=>{
 assert.match(candidate,/¡NO EJECUTAR!/u);
 assert.match(candidate,/«Publicalo»/u);
 assert.match(activeSql,/BEGIN;/u);
 assert.match(activeSql,/COMMIT;/u);
 assert.match(activeSql,/cotironda_d016_pilot_project_ref/u);
 assert.match(activeSql,/D016_NOT_PILOT_PROJECT/u);
 assert.match(activeSql,/D016_WORKER_NOT_INSTALLED/u);
});
test('pg_net D016: remediación limitada a SELECT, sin perder INSERT de net.http_post',()=>{
 assert.match(activeSql,/REVOKE SELECT ON TABLE net\.http_request_queue\s+FROM PUBLIC, anon, authenticated;/u);
 assert.doesNotMatch(activeSql,/\bREVOKE ALL\b|\bGRANT\b|\bALTER TABLE\b|\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b|\bUPDATE\b/iu);
 assert.match(activeSql,/D016_PGNET_QUEUE_STILL_PUBLIC/u);
 assert.match(activeSql,/has_schema_privilege\('anon','net','USAGE'\)/u);
 assert.match(activeSql,/has_table_privilege\('authenticated','net\.http_request_queue','SELECT'\)/u);
});
test('pg_net D016: Cron sigue bloqueado hasta verificar permisos y preflight reporta la fuga',()=>{
 assert.match(activation,/D016_PGNET_QUEUE_EXPOSED_TO_CLIENT_ROLES/u);
 assert.match(preflight,/cola_pgnet_expone_headers_a_roles_cliente/u);
 assert.match(preflight,/cola_pgnet_sin_lectura_publica/u);
 assert.match(preflight,/cola_pgnet_rls_habilitada/u);
 assert.doesNotMatch(preflight,/\bREVOKE\s+SELECT\b/iu);
});
