/** MVP296: cumulative MVP295 + gated SQL PG17 regression. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildLinkedCommercialSqlMvp295} from './mvp295-linked-commercial-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildExistingControlSqlMvp296(){
 const base=buildLinkedCommercialSqlMvp295();
 if(base.split(tail).length!==2)throw Error('MVP296_MISSING_BOUNDARY');
 const out=base.replace(tail,
  '\n\\ir ../../piloto/mvp296_quote_recovery_existing_control.sql'+
  '\n\\ir ./mvp296-existing-control-replay-pg17.sql'+tail);
 if(out.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP296_MULTIPLE_ROLLBACK');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const arg=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(arg)||process.argv.length>3)
   throw Error('MVP296_INVALID_OPTION');
  if(arg==='--assert-local'){
   validateIsolation();console.log('MVP296_ISOLATION_OK');
  }else if(arg==='--sql')process.stdout.write(buildExistingControlSqlMvp296());
  else console.log(JSON.stringify({state:'synthetic_only',
   pilot_changed:false,whapi_sends:0,rollback:true}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
