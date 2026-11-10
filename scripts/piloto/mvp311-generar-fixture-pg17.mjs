// MVP311: replay the full MVP310 synthetic PG17 fixture and then load
// frozen BEFORE/AFTER definitions of the 14 active pilot RPCs. No live DB.
import './mvp310-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const previous=root+'supabase/tests/ci/.mvp310-generated-pg17.sql';
const target=root+'supabase/tests/ci/.mvp311-generated-pg17.sql';
const original=readFileSync(previous,'utf8');
if(!original.trimEnd().endsWith('ROLLBACK;')||
 !original.includes('\\ir ./mvp310-multi-participant-pg17.sql'))
 throw Error('MVP310 fixture drift: refuse unsafe SQL test');
const cut=original.lastIndexOf('ROLLBACK;');
const sql=original.slice(0,cut)+
  '\\ir ./mvp311-legacy-rpc-baseline-pg17.sql\n'+
  '\\ir ../../piloto/mvp311_multiidentidad_rutas_activas.sql\n'+
  '\\ir ./mvp311-multiidentity-tests-pg17.sql\n'+
  'ROLLBACK;\n';
if(!sql.trimEnd().endsWith('ROLLBACK;'))throw Error('missing PG17 ROLLBACK');
writeFileSync(target,sql,'utf8');
console.log('MVP311 PG17 14 frozen RPC baseline and multitenant fixture created (rollback only).');
