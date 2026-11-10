// Entire MVP315 PG17 test is synthetic, one BEGIN/ROLLBACK from MVP314.
import './mvp314-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=root+'supabase/tests/ci/.mvp314-generated-pg17.sql';
const output=root+'supabase/tests/ci/.mvp315-generated-pg17.sql';
const input=readFileSync(source,'utf8');
if(!input.trimEnd().endsWith('ROLLBACK;')||
 !input.includes('\\ir ./mvp314-batch-dispatch-pg17.sql')||
 !input.includes('BEGIN;'))throw Error('mvp314_fixture_drift');
writeFileSync(output,input.slice(0,input.lastIndexOf('ROLLBACK;'))+
 '\\ir ../../piloto/mvp315_aviso_comprador_post_despacho.sql\n'+
 '\\ir ./mvp315-buyer-notice-pg17.sql\n'+
 'ROLLBACK;\n','utf8');
console.log('MVP315 SQL synthetic 309-315 fixture, ROLLBACK only.');
