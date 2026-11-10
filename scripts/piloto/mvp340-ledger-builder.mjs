/** MVP340: PostgreSQL17 synthetic rollback, no contact with real pilot. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMvp336Sql} from './mvp336-retry-source-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildMvp340Sql(){
 const base=buildMvp336Sql();
 if(base.split(tail).length!==2)throw Error('MVP340_MISSING_ROLLBACK_BOUNDARY');
 const out=base.replace(tail,
  '\n\\ir ../../piloto/mvp340_reserva_ia_lotes_fuente_autenticada.sql'+
  '\n\\ir ./mvp340-reserva-lotes-pg17.sql'+tail);
 if(out.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP340_DOUBLE_ROLLBACK');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(mode)||
     process.argv.length>3)throw Error('MVP340_INVALID_MODE');
  if(mode==='--assert-local'){
   validateIsolation();console.log('MVP340_LOCAL_PG17_ONLY');
  }else if(mode==='--sql')process.stdout.write(buildMvp340Sql());
  else console.log(JSON.stringify({state:'synthetic_only',
   schema_deployed:false,whapi_sends:0,openai_calls:0,
   rollback:true,one_lease_per_source:true}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
