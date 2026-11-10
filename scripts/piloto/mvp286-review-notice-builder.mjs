/** MVP286: SQL aviso único después de las 21 migraciones y MVP285.
 * Solo PG17 local y ROLLBACK; NUNCA conecta a Supabase remoto.
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildOperatorGateSql} from './mvp285-operator-gate-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const mark='\nROLLBACK;\nSELECT ';
export function buildReviewNoticeSql(){
 const base=buildOperatorGateSql();
 if(base.split(mark).length!==2)throw Error('MVP286_TRANSACTION_ANCHOR');
 const result=base.replace(mark,
  '\n\\ir ../../piloto/mvp286_notificacion_revision_semantica_sin_reenvio.sql'+
  '\n\\ir ./mvp286-review-notice-pg17.sql'+mark);
 if(result.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP286_MULTIPLE_ROLLBACKS');
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const a=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(a)||process.argv.length>3)
   throw Error('MVP286_USAGE');
  if(a==='--assert-local'){
   validateIsolation();console.log('MVP286_LOCAL_ONLY_OK');
  }else if(a==='--sql')process.stdout.write(buildReviewNoticeSql());
  else console.log(JSON.stringify({
   status:'synthetic_only_not_production',
   notice_ledger:'new_migration_not_applied',
   ai_calls:0,whapi_calls:0,rollback:true
  }));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
