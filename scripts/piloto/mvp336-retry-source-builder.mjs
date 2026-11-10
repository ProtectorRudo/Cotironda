/** MVP336: isolated PG17, a single reviewed-source retry, then rollback. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSupplierAutorecoverySql} from './mvp292-supplier-autorecovery-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildMvp336Sql(){
 const base=buildSupplierAutorecoverySql();
 if(base.split(tail).length!==2)throw Error('MVP336_MISSING_ROLLBACK_BOUNDARY');
 const out=base.replace(tail,
  '\n\\ir ../../piloto/mvp336_recorrelacion_una_vez_sin_unidades.sql'+
  '\n\\ir ./mvp336-retry-source-pg17.sql'+tail);
 if(out.split(/^ROLLBACK;\s*$/gm).length!==2)throw Error('MVP336_MULTIPLE_ROLLBACKS');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(mode)||process.argv.length>3)
   throw Error('MVP336_INVALID_MODE');
  if(mode==='--assert-local'){
   validateIsolation();console.log('MVP336_ISOLATION_OK');
  }else if(mode==='--sql')process.stdout.write(buildMvp336Sql());
  else console.log(JSON.stringify({state:'offline_only',rollback:true,
   pilot_changed:false,whapi_sends:0,retries_per_source:1}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
