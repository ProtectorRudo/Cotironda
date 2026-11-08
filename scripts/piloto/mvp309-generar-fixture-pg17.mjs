// MVP309: compone el fixture PostgreSQL17 de MVP308 sin tocar usuarios reales.
// Todo ocurre dentro de una transacción sintética y finaliza con ROLLBACK.
import './mvp308-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const previous=root+'supabase/tests/ci/.mvp308-generated-pg17.sql';
const target=root+'supabase/tests/ci/.mvp309-generated-pg17.sql';
const source=readFileSync(previous,'utf8');
if(!source.trimEnd().endsWith('ROLLBACK;')||!source.includes('END $mvp308$;'))
 throw Error('MVP308 base changed: manual audit required');
const anchor=source.lastIndexOf('ROLLBACK;');
const slash=String.fromCharCode(92);
const result=source.slice(0,anchor)+slash+'ir ./mvp309-owner-attestation-pg17.sql\nROLLBACK;\n';
writeFileSync(target,result,'utf8');
console.log('MVP309: PostgreSQL17 synthetic fixture with rollback built.');
