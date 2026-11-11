/** MVP351: PG17 synthetic review retry with closed historical negative control. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMvp336Sql} from './mvp336-retry-source-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildMvp351Sql(){
 const base=buildMvp336Sql();
 if(base.split(tail).length!==2)throw Error('MVP351_MISSING_ROLLBACK');
 const out=base.replace(tail,
  '\n\\ir ../../piloto/mvp351_reintento_fidelidad_y_rivales_historicos.sql'+
  '\n\\ir ./mvp351-historical-rival-recovery-pg17.sql'+tail);
 if(out.split(/^ROLLBACK;\s*$/gm).length!==2)throw Error('MVP351_MULTIPLE_ROLLBACKS');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(mode)||process.argv.length>3)
   throw Error('MVP351_INVALID_MODE');
  if(mode==='--assert-local')validateIsolation();
  if(mode==='--sql')process.stdout.write(buildMvp351Sql());
  else console.log(JSON.stringify({state:'synthetic_only',rollback:true,
   pilot_changed:false,whapi_sends:0,second_attempt_per_source:1}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
