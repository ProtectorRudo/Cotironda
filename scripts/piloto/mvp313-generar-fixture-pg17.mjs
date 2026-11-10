// Replays full synthetic MVP312 stack, then tests SQL recipient binding.
// Everything happens inside ONE PostgreSQL17 BEGIN/ROLLBACK.
import './mvp312-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const s=readFileSync(root+'supabase/tests/ci/.mvp312-generated-pg17.sql','utf8');
if(!s.trimEnd().endsWith('ROLLBACK;')||
 !s.includes('\\ir ./mvp312-admin-encrypted-channels-pg17.sql'))
 throw Error('MVP312 synthetic fixture changed; audit required');
const result=s.slice(0,s.lastIndexOf('ROLLBACK;'))+
 '\\ir ../../piloto/mvp313_destinatarios_dinamicos_cifrados.sql\n'+
 '\\ir ./mvp313-recipient-lease-pg17.sql\n'+
 'ROLLBACK;\n';
writeFileSync(root+'supabase/tests/ci/.mvp313-generated-pg17.sql',result,'utf8');
console.log('MVP313 PostgreSQL17 synthetic lease and encrypted contacts prepared (ROLLBACK).');
