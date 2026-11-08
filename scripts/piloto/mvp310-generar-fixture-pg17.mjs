// MVP310: reuse the complete MVP309 pg17 synthetic stack (BEGIN...ROLLBACK).
// No real WhatsApp, no remote SQL and no persistent records.
import './mvp309-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=root+'supabase/tests/ci/.mvp309-generated-pg17.sql';
const target=root+'supabase/tests/ci/.mvp310-generated-pg17.sql';
const old=readFileSync(source,'utf8');
if(!old.trimEnd().endsWith('ROLLBACK;')||
 !old.includes('\\ir ./mvp309-owner-attestation-pg17.sql'))
 throw Error('MVP309 fixture changed; audit new design before composing');
const idx=old.lastIndexOf('ROLLBACK;');
const result=old.slice(0,idx)+'\\ir ./mvp310-multi-participant-pg17.sql\nROLLBACK;\n';
if(!result.trimEnd().endsWith('ROLLBACK;'))throw Error('MVP310 fixture missing ROLLBACK');
writeFileSync(target,result,'utf8');
console.log('MVP310 PG17 full synthetic fixture prepared (rollback only).');
