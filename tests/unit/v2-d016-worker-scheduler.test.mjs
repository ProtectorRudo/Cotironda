import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const yaml=readFileSync(new URL(
 '../../.github/workflows/cotironda-d016-worker-piloto.yml',import.meta.url
),'utf8');
const nonComments=yaml.split('\n')
 .filter(line=>!line.trimStart().startsWith('#')).join('\n');

test('D016 IA offline: no ejecuta en PR, default branch y variables OFF de base',()=>{
 assert.match(nonComments,/\bon:\s*\n\s+schedule:\s*\n\s+- cron: '13,43 \* \* \* \*'/u);
 assert.match(nonComments,/workflow_dispatch:/u);
 assert.doesNotMatch(nonComments,/\bpull_request:|\bpush:/u);
 assert.match(nonComments,/github\.repository == 'ProtectorRudo\/Cotironda'/u);
 assert.match(nonComments,/vars\.COTIRONDA_D016_PILOTO_WORKER_ENABLED == 'true'/u);
 assert.match(nonComments,/vars\.COTIRONDA_D016_PILOT_REF == 'ilggkalaafhtiysyzlmg'/u);
 assert.match(nonComments,/permissions: \{\}/u);
 assert.match(nonComments,/cancel-in-progress: false/u);
 assert.match(nonComments,/timeout-minutes: 3/u);
});
test('D016 IA offline: dos secretos de GitHub, no se registran ni se devuelven contenidos',()=>{
 assert.match(nonComments,/secrets\.COTIRONDA_D016_WORKER_SERVICE_KEY/u);
 assert.match(nonComments,/secrets\.COTIRONDA_D016_WORKER_SHARED_SECRET/u);
 assert.match(nonComments,/set \+x/u);
 assert.match(nonComments,/--proto '=https'/u);
 assert.match(nonComments,/--max-time 65/u);
 assert.match(nonComments,/--retry 0/u);
 assert.match(nonComments,/--output \/dev\/null/u);
 assert.match(nonComments,/--write-out '%\{http_code\}'/u);
 assert.match(nonComments,/\$\{WORKER_SECRET\}.*\$\{SERVICE_KEY\}/u);
 assert.doesNotMatch(nonComments,/echo ['"]?\$\{?(?:SERVICE_KEY|WORKER_SECRET)/u);
 assert.doesNotMatch(nonComments,/\bnet\.http_post\b|\bvault\.decrypted_secrets\b/u);
});
test('D016 IA offline: sólo Edge PILOTO, una ejecución sin selector de ronda desde GHA',()=>{
 assert.match(nonComments,/https:\/\/ilggkalaafhtiysyzlmg\.supabase\.co\/functions\/v1\/cotironda-piloto-v2-worker-d016/u);
 assert.match(nonComments,/--data '\{\}'/u);
 assert.doesNotMatch(nonComments,/\brequestId\b|\bbuyerKey\b|\bdocumentId\b/iu);
 assert.doesNotMatch(nonComments,/\b(?:npm|pnpm|yarn|npx)\s+install/u);
});
