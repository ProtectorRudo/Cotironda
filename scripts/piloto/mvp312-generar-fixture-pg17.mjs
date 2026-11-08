// MVP312: pg17 SQL synthesized on top of the entire MVP311 fixture.
// No remote SQL, no WhatsApp, no persistent data, guaranteed ROLLBACK.
import './mvp311-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=root+'supabase/tests/ci/.mvp311-generated-pg17.sql';
const destination=root+'supabase/tests/ci/.mvp312-generated-pg17.sql';
const old=readFileSync(source,'utf8');
if(!old.trimEnd().endsWith('ROLLBACK;')||
 !old.includes('\\ir ./mvp311-multiidentity-tests-pg17.sql'))
 throw Error('mvp311_fixture_changed_audit_required');
const pos=old.lastIndexOf('ROLLBACK;');
writeFileSync(destination,old.slice(0,pos)+
 '\\ir ../../piloto/mvp312_alta_canal_administrada_cifrada.sql\n'+
 '\\ir ../../piloto/mvp312b_proveedor_contacto_admin.sql\n'+
 '\\ir ../../piloto/mvp312c_contactos_postcierre_admin.sql\n'+
 '\\ir ./mvp312-admin-encrypted-channels-pg17.sql\n'+
 'ROLLBACK;\n','utf8');
console.log('MVP312 synthetic encrypted-admin-channel fixture built with rollback.');
