// This script is CI-only. Converts the already verified full synthetic
// MVP315 BEGIN/ROLLBACK fixture to a COMMIT *in an ephemeral PG17 database*,
// then creates two pending jobs. NEVER pass this output to the real pilot.
import './mvp315-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=root+'supabase/tests/ci/.mvp315-generated-pg17.sql';
const output=root+'supabase/tests/ci/.mvp316-concurrency-generated-pg17.sql';
const original=readFileSync(source,'utf8');
if(!original.includes('\\ir ./mvp315-buyer-notice-pg17.sql')||
 !original.includes('BEGIN;')||
 !/ROLLBACK;\s*$/u.test(original))throw Error('mvp315_fixture_drift');
const localOnly=original.replace(/ROLLBACK;\s*$/u,'COMMIT;\n')+
 '\\ir ./mvp316-concurrent-fixture-pg17.sql\n';
writeFileSync(output,localOnly,'utf8');
console.log('MVP316: PG17 synthetic fixture, ephemeral DB only; no pilot data.');
