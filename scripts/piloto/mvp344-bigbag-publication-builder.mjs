/** MVP344: proof of BIG BAG publication on synthetic PG17, ROLLBACK. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMvp336Sql} from './mvp336-retry-source-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildMvp344Sql(){
 const base=buildMvp336Sql();
 if(base.split(tail).length!==2)throw Error('mvp344_rollback_boundary_missing');
 const out=base.replace(tail,
  '\n\\ir ../../piloto/mvp344_aceptar_big_bag_anonimo_sin_relajar_privacidad.sql'+
  '\n\\ir ./mvp344-bigbag-publicacion-privada-pg17.sql'+tail);
 if(out.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('mvp344_unexpected_rollback_count');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(mode)||process.argv.length>3)
   throw Error('mvp344_mode_invalid');
  if(mode==='--assert-local'){
   validateIsolation();console.log('MVP344_PG17_ISOLATION_OK');
  }else if(mode==='--sql')process.stdout.write(buildMvp344Sql());
  else console.log(JSON.stringify({
   state:'offline_only',sql_deployed:false,rollback:true,
   accepted_prefix:'big_bag',other_prefixes_preserved:true,
   privacy_checks_preserved:true,whatsapp_sends:0,
   cost_optimization_required:false
  }));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
