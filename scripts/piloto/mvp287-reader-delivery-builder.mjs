/** MVP287 — evidence and delivery status rehearsal; local PG17 rollback.
 * No Whapi, no API token, no real buyer/supplier data.
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildReviewNoticeSql} from './mvp286-review-notice-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const mark='\nROLLBACK;\nSELECT ';
export function buildReaderDeliverySql(){
 const base=buildReviewNoticeSql();
 if(base.split(mark).length!==2)throw Error('MVP287_BAD_ANCHOR');
 const sql=base.replace(mark,
  '\n\\ir ../../piloto/mvp287_receipt_avisos_whapi.sql'+
  '\n\\ir ./mvp287-notice-delivery-pg17.sql'+mark);
 if(sql.split(/^ROLLBACK;\s*$/gm).length!==2)throw Error('MVP287_ROLLBACK_REQUIRED');
 return sql;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const a=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(a)||process.argv.length>3)
   throw Error('MVP287_USAGE');
  if(a==='--assert-local'){
   validateIsolation();console.log('MVP287_LOCAL_ONLY_OK');
  }else if(a==='--sql')process.stdout.write(buildReaderDeliverySql());
  else console.log(JSON.stringify({status:'synthetic_pg17_sql_ready',
   invoices_sent:false,whapi_called:false,rollback:true}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
