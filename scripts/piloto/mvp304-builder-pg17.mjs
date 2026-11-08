/** MVP304: SQL coinstalación real de MVP284 + MVP303 + contactos consentidos.
 * One disposable PG17 runner. ONE transaction, ONE ROLLBACK.
 * No pilot, no network, no third-party service.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {buildMvp303Sql} from './mvp303-all-suppliers-builder.mjs';
const src=new URL('../../supabase/piloto/mvp304_contactos_consensuados_todos_cierre.sql',import.meta.url);
const test=new URL('../../supabase/tests/ci/mvp304-contactos-consentidos-postcierre-pg17.sql',import.meta.url);
const marker='\nROLLBACK;\nSELECT ';
export function buildMvp304Sql(read=readFileSync){
 const migration=read(src,'utf8'),testcase=read(test,'utf8');
 if(!migration.startsWith('-- MVP304')||!testcase.startsWith('-- MVP304')||
    !migration.includes('GRANT EXECUTE ON FUNCTION')||
    !testcase.includes('mvp304_revoked_buyer_bearer')||
    /(^|\n)\s*(?:COMMIT|ROLLBACK|\\!|\\copy|\\connect)\b/iu.test(migration+testcase)||
    /\b(?:net\.http_post|cron\.schedule|vault\.decrypted_secrets|gate\.whapi\.cloud)\b/iu.test(migration+testcase))
    throw Error('MVP304_UNSAFE_SQL');
 // MVP283's narrow fixture omits the immutability trigger function
 // required by ORIGINAL MVP109. Extract its exact production definition
 // from MVP101 rather than inventing a permissive stub.
 const mvp101=read(new URL('../../supabase/piloto/mvp101_supplier_quote_full_line_mirror.sql',import.meta.url),'utf8');
 const fnStart=mvp101.indexOf('create function cotironda_piloto_privado.reject_supplier_line_mutation_mvp101()');
 const fnEnd=mvp101.indexOf('create trigger supplier_quote_lines_immutable_mvp101',fnStart);
 if(fnStart<0||fnEnd<=fnStart)
  throw Error('MVP304_ORIGINAL_TRIGGER_MISSING');
 const immutableTrigger=mvp101.slice(fnStart,fnEnd);
 if(!immutableTrigger.includes('supplier_quote_transcription_immutable_mvp101')||
    !immutableTrigger.includes('revoke all on function'))
  throw Error('MVP304_TRIGGER_NOT_IMMUTABLE');
 const baseline=buildMvp303Sql();
 if(baseline.split(marker).length!==2)throw Error('MVP304_ROLLBACK_ANCHOR');
 const joined=baseline.replace(marker,
   '\n'+immutableTrigger+
   '\n\\ir ../../piloto/mvp109_encrypted_contacts_consents.sql'+
   '\n\\ir ../../piloto/mvp304_contactos_consensuados_todos_cierre.sql'+
   '\n\\ir ./mvp304-contactos-consentidos-postcierre-pg17.sql'+marker);
 if(joined.split(/^ROLLBACK;\s*$/gm).length!==2)
   throw Error('MVP304_MULTIPLE_ROLLBACKS');
 return joined;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const arg=process.argv[2]??'--check';
  if(process.argv.length>3||!['--sql','--check'].includes(arg))
   throw Error('MVP304_USAGE');
  const sql=buildMvp304Sql();
  process.stdout.write(arg==='--sql'?sql:JSON.stringify({
   status:'pg17_synthetic_ready',
   bytes:Buffer.byteLength(sql),
   deployed:false,
   whapi_used:false,
   external_calls:false,
   production_touched:false})+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
