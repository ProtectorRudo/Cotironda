/** MVP291: automatic attribution rehearsal with synthetic PG17 and ROLLBACK. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildBuyerTrackingSql} from './mvp289-buyer-tracking-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildAutomaticCorrelationSql(){
 const base=buildBuyerTrackingSql();
 if(base.split(tail).length!==2)throw Error('MVP291_MISSING_ROLLBACK');
 const sql=base.replace(tail,
  '\n\\ir ./mvp291-prerequisites-synthetic.sql'+
  '\n\\ir ../../piloto/mvp291_correlacion_automatica_fuentes_privadas.sql'+
  '\n\\ir ./mvp291-automatic-correlation-pg17.sql'+tail);
 if(sql.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP291_MULTIPLE_ROLLBACK');
 return sql;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const arg=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(arg)||process.argv.length>3)
   throw Error('MVP291_BAD_ARGS');
  if(arg==='--assert-local'){validateIsolation();console.log('MVP291_LOCAL_ONLY_OK')}
  else if(arg==='--sql')process.stdout.write(buildAutomaticCorrelationSql());
  else console.log(JSON.stringify({state:'synthetic_only',outbound:0,
   pilot_deployed:false,rollback:true}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
