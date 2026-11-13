import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/piloto/v2_d016_cron_ACTIVATE_ONLY_AFTER_PUBLICALO.sql',import.meta.url),'utf8');

test('D016 cron: no se instala como migración; exige autorización y proyecto piloto',()=>{
 assert.match(sql,/ESTE SCRIPT NO ES MIGRACIÓN/u);
 assert.match(sql,/«Publicalo»/u);
 assert.match(sql,/cotironda_d016_pilot_project_ref/u);
 assert.match(sql,/D016_NOT_PILOT_PROJECT/u);
 assert.match(sql,/D016_SQL_NOT_INSTALLED/u);
 assert.match(sql,/D016_CALENDAR_NOT_APPROVED/u);
});
test('D016 cron: secretos sólo provienen de Vault decrypted_secret, nunca hardcodeados',()=>{
 assert.match(sql,/vault\.decrypted_secrets/u);
 assert.match(sql,/decrypted_secret LIKE 'sb_secret_%'/u);
 assert.match(sql,/length\(decrypted_secret\)>=40/u);
 assert.doesNotMatch(sql,/\bAND secret LIKE\b|length\(secret\)/u);
 assert.doesNotMatch(sql,/sb_secret_[A-Za-z0-9_-]{16,}/u);
 assert.match(sql,/x-cotironda-d016-worker-internal/u);
});
test('D016 cron: ejecuta únicamente worker PILOTO y cierre V2, 5 minutos, reversibles',()=>{
 assert.match(sql,/ilggkalaafhtiysyzlmg\.supabase\.co\/functions\/v1\/cotironda-piloto-v2-worker-d016/u);
 assert.match(sql,/cotironda_piloto_v2_d016_close_due_private\(5\)/u);
 assert.equal((sql.match(/'\*\/5 \* \* \* \*'/gu)||[]).length,2);
 assert.match(sql,/cron\.unschedule\('cotironda-v2-d016-close-piloto'\)/u);
 assert.match(sql,/cron\.unschedule\('cotironda-v2-d016-offline-worker-piloto'\)/u);
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM cotironda_piloto_privado\.requests/u);
});
