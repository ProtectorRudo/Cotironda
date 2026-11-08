// MVP308: reutilizar el fixture PostgreSQL17 ya probado de MVP307.
// Se conserva BEGIN y se reemplaza solo el ROLLBACK final por un ensayo
// adicional. Jamás ejecuta WhatsApp o una DB externa.
import './mvp307-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=root+'supabase/tests/ci/.mvp307-generated-pg17.sql';
const destination=root+'supabase/tests/ci/.mvp308-generated-pg17.sql';
const old=readFileSync(source,'utf8');
if(!old.trimEnd().endsWith('ROLLBACK;')||!old.includes('END $mvp307$;'))
 throw Error('MVP307 baseline changed; audit needed');
const cut=old.lastIndexOf('ROLLBACK;');
const include=String.fromCharCode(92)+'ir ./mvp308-consent-all-roles-pg17.sql';
const result=old.slice(0,cut)+include+String.fromCharCode(10)+
 'ROLLBACK;'+String.fromCharCode(10);
writeFileSync(destination,result,'utf8');
console.log('MVP308 PG17 fixture built: synthetic and rolled back.');
