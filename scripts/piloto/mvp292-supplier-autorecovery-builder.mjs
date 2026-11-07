/** MVP292: isolated cumulative PG17 migration and rollback. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildAutomaticCorrelationSql} from './mvp291-automatic-correlation-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildSupplierAutorecoverySql(){
 const base=buildAutomaticCorrelationSql();
 if(base.split(tail).length!==2)throw Error('MVP292_MISSING_BOUNDARY');
 const out=base.replace(tail,
  '\n\\ir ../../piloto/mvp292_auto_correlacion_texto_proveedor.sql'+
  '\n\\ir ../../piloto/mvp292_recuperacion_interna_archivos.sql'+
  '\n\\ir ./mvp292-auto-recovery-pg17.sql'+tail);
 if(out.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP292_MULTIPLE_ROLLBACK');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const arg=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(arg)||process.argv.length>3)
   throw Error('MVP292_INVALID_OPTION');
  if(arg==='--assert-local'){
   validateIsolation();console.log('MVP292_ISOLATION_OK');
  }else if(arg==='--sql')process.stdout.write(buildSupplierAutorecoverySql());
  else console.log(JSON.stringify({state:'synthetic_only',
   pilot_changed:false,whapi_sends:0,rollback:true}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
