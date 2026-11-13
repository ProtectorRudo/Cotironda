import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_d016_cron_ACTIVATE_ONLY_AFTER_PUBLICALO.sql',import.meta.url
),'utf8');
const active=sql.split('\n').filter(x=>!x.trimStart().startsWith('--')).join('\n');

test('D016 cierre por pg_cron: sólo SQL, proyecto PILOTO y calendario aprobado',()=>{
 assert.match(sql,/NO MIGRACIÓN/u);
 assert.match(sql,/«Publicalo»/u);
 assert.match(active,/cotironda_d016_pilot_project_ref/u);
 assert.match(active,/D016_NOT_PILOT_PROJECT/u);
 assert.match(active,/D016_SQL_NOT_INSTALLED/u);
 assert.match(active,/D016_POLICIES_NOT_APPROVED/u);
 assert.match(active,/D016_CALENDAR_NOT_APPROVED/u);
 assert.match(active,/D016_CRON_ALREADY_PRESENT_OR_UNSAFE/u);
 assert.match(active,/cotironda_piloto_v2_d016_close_due_private\(5\)/u);
});
test('D016 cierre SQL nunca transmite secretos por pg_net',()=>{
 assert.equal((active.match(/\bcron\.schedule\s*\(/gu)??[]).length,1);
 assert.equal((active.match(/'\*\/5 \* \* \* \*'/gu)??[]).length,1);
 assert.doesNotMatch(active,/net\.http_(?:post|get|delete)|http_request_queue|http[s]?:\/\/|\bheaders\s*:?=|\bapikey\s*:?=|x-cotironda-d016-worker-internal/iu);
 assert.doesNotMatch(active,/sb_secret_[A-Za-z0-9_-]{16,}/u);
 assert.doesNotMatch(active,/cotironda_d016_worker_service_key|cotironda_d016_worker_shared_secret/u);
 assert.match(active,/cron\.job/u);
 assert.match(active,/COMMIT;/u);
 assert.match(sql,/cron\.unschedule\('cotironda-v2-d016-close-piloto'\)/u);
});
test('D016 cierre no programa worker interno ni interfiere con datos existentes',()=>{
 assert.match(active,/D016_CRON_ALREADY_PRESENT_OR_UNSAFE/u);
 assert.doesNotMatch(active,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b\s+(?:TABLE\s+)?cotironda_piloto_privado\./iu);
 assert.doesNotMatch(active,/cron\.schedule\(\s*'cotironda-v2-d016-offline-worker-piloto'/u);
});
