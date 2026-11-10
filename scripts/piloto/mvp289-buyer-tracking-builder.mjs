/** MVP289 — PG17 replay using the established MVP288 fixture, all rolled back. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFidelityCorrectionSql} from './mvp288-fidelity-correction-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildBuyerTrackingSql(){
 const base=buildFidelityCorrectionSql();
 if(base.split(tail).length!==2)throw Error('MVP289_MISSING_BOUNDARY');
 const result=base.replace(tail,
  '\n\\ir ../../piloto/mvp289_seguimiento_confirmacion_privado.sql'+
  '\n\\ir ./mvp289-buyer-confirmation-tracking-pg17.sql'+tail);
 if(result.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP289_MULTIPLE_ROLLBACK');
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const option=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(option)||process.argv.length>3)
   throw Error('MVP289_INVALID_OPTION');
  if(option==='--assert-local'){
   validateIsolation();console.log('MVP289_LOCAL_ONLY_OK');
  }else if(option==='--sql')process.stdout.write(buildBuyerTrackingSql());
  else console.log(JSON.stringify({state:'synthetic_pg17_only',
   whapi_sends:0,pilot_deployed:false,rollback:true}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
