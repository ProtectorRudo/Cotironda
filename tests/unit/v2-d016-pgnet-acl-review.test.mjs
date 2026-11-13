import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const retired=read('../../supabase/piloto/v2_d016_pgnet_acl_REVIEW_ONLY.sql');
const cron=read('../../supabase/piloto/v2_d016_cron_ACTIVATE_ONLY_AFTER_PUBLICALO.sql');
const github=read('../../.github/workflows/cotironda-d016-worker-piloto.yml');
const active=retired.split('\n').filter(x=>!x.trimStart().startsWith('--')).join('\n');

test('pg_net D016: ACL incompatible retirada con fallo explícito si se ejecuta',()=>{
 assert.match(retired,/¡NO EJECUTAR!/u);
 assert.match(retired,/CANDIDATO RETIRADO/u);
 assert.match(retired,/supabase\.com\/kb\/troubleshooting\/revoking-access/u);
 assert.match(active,/RAISE EXCEPTION 'D016_UNSUPPORTED_PGNET_ACL_MUTATION_RETIRED'/u);
 assert.doesNotMatch(active,/\b(?:REVOKE|GRANT|ALTER TABLE|DROP TABLE|TRUNCATE|UPDATE|DELETE|INSERT)\b/iu);
});
test('pg_net D016: ni cierre SQL ni workflow worker transportan secretos por cola',()=>{
 const code=cron.split('\n').filter(x=>!x.trimStart().startsWith('--')).join('\n');
 assert.doesNotMatch(code,/\bnet\.http_post\s*\(/u);
 assert.doesNotMatch(code,/cotironda_d016_worker_service_key/u);
 assert.doesNotMatch(code,/x-cotironda-d016-worker-internal/u);
 assert.match(github,/https:\/\/ilggkalaafhtiysyzlmg\.supabase\.co\/functions\/v1\/cotironda-piloto-v2-worker-d016/u);
 assert.match(github,/secrets\.COTIRONDA_D016_WORKER_SERVICE_KEY/u);
 assert.match(github,/secrets\.COTIRONDA_D016_WORKER_SHARED_SECRET/u);
 assert.match(github,/--output \/dev\/null/u);
 assert.doesNotMatch(github,/\bnet\.http_post\b/u);
});
