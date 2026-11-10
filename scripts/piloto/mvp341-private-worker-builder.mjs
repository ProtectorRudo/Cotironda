/** MVP341 PG17 cumulative private-source checks + ROLLBACK. No pilot. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMvp340Sql} from './mvp340-ledger-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildMvp341Sql(){
 const base=buildMvp340Sql();
 if(base.split(tail).length!==2)throw Error('MVP341_MISSING_ROLLBACK');
 const out=base.replace(tail,
  '\n\\ir ../../piloto/mvp341_candidato_lectura_privada.sql'+
  '\n\\ir ./mvp341-source-preflight-pg17.sql'+tail);
 if(out.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP341_MULTIPLE_ROLLBACKS');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(mode)||
     process.argv.length>3)throw Error('MVP341_INVALID_MODE');
  if(mode==='--assert-local'){
   validateIsolation();console.log('MVP341_LOCAL_PG17_ONLY');
  }else if(mode==='--sql')process.stdout.write(buildMvp341Sql());
  else console.log(JSON.stringify({
   state:'offline_only',rollback:true,pilot_schema_changed:false,
   whapi_sends:0,openai_paid_calls:0,quotes_published:0
  }));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
