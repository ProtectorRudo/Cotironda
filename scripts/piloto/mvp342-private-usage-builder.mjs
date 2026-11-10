/** MVP342: synthetic PostgreSQL17 receipt/usage/crypto metadata with ROLLBACK. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMvp341Sql} from './mvp341-private-worker-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildMvp342Sql(){
 const base=buildMvp341Sql();
 if(base.split(tail).length!==2)throw Error('MVP342_MISSING_ROLLBACK');
 const out=base.replace(tail,
  '\n\\ir ../../piloto/mvp342_lecturas_lotes_cifradas_usage.sql'+
  '\n\\ir ./mvp342-encrypted-usage-pg17.sql'+tail);
 if(out.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP342_MULTIPLE_ROLLBACKS');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(mode)||
     process.argv.length>3)throw Error('MVP342_INVALID_MODE');
  if(mode==='--assert-local'){
   validateIsolation();console.log('MVP342_LOCAL_PG17_ONLY');
  }else if(mode==='--sql')process.stdout.write(buildMvp342Sql());
  else console.log(JSON.stringify({
   state:'synthetic_only',rollback:true,webhook_changed:false,
   pilot_deployed:false,openai_paid_calls:0
  }));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
