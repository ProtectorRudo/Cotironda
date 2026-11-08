// Append MVP314 after the complete synthetic MVP313 stack. ROLLBACK only.
import './mvp313-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const previous=root+'supabase/tests/ci/.mvp313-generated-pg17.sql';
const dest=root+'supabase/tests/ci/.mvp314-generated-pg17.sql';
const base=readFileSync(previous,'utf8');
if(!base.trimEnd().endsWith('ROLLBACK;')||
 !base.includes('\\ir ./mvp313-recipient-lease-pg17.sql')||
 !base.includes('BEGIN;'))throw Error('mvp313_fixture_changed_audit_required');
const cut=base.lastIndexOf('ROLLBACK;');
writeFileSync(dest,base.slice(0,cut)+
 '\\ir ../../piloto/mvp314_ia_despacho_lotes_cupo_seguro.sql\n'+
 '\\ir ./mvp314-batch-dispatch-pg17.sql\n'+
 'ROLLBACK;\n','utf8');
console.log('MVP314: synthetic SQL fixture prepared, all changes in PostgreSQL17 ROLLBACK.');
