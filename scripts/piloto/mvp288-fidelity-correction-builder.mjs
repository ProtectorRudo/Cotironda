/** MVP288: buyer material fidelity and immutable review replacement,
 * synthetic PG17 only, single transaction/rollback, no real WhatsApp.
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildReaderDeliverySql} from './mvp287-reader-delivery-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const end='\nROLLBACK;\nSELECT ';
export function buildFidelityCorrectionSql(){
 const base=buildReaderDeliverySql();
 if(base.split(end).length!==2)throw Error('MVP288_MISSING_ROLLBACK_BOUNDARY');
 const result=base.replace(end,
  '\n\\ir ../../piloto/mvp288_correccion_segura_con_revision_vinculada.sql'+
  '\n\\ir ./mvp288-material-correction-pg17.sql'+end);
 if(result.split(/^ROLLBACK;\s*$/gm).length!==2)throw Error('MVP288_DUPLICATE_ROLLBACK');
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const option=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(option)||process.argv.length>3)
   throw Error('MVP288_WRONG_OPTION');
  if(option==='--assert-local'){
   validateIsolation();console.log('MVP288_LOCAL_ONLY_OK');
  }else if(option==='--sql')process.stdout.write(buildFidelityCorrectionSql());
  else console.log(JSON.stringify({state:'synthetic_pg17_fixture_only',
    pilot_deployed:false,whapi_sent:0,rollback:true}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
