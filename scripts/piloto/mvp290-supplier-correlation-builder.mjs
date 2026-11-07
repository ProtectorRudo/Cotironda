/** MVP290: synthetic two-round correlation and recovery in ONE PG17 rollback. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildBuyerTrackingSql} from './mvp289-buyer-tracking-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildSupplierCorrelationSql(){
 const base=buildBuyerTrackingSql();
 if(base.split(tail).length!==2)throw Error('MVP290_MISSING_BOUNDARY');
 const result=base.replace(tail,
  '\n\\ir ../../piloto/mvp290_opciones_correlacion_proveedor.sql'+
  '\n\\ir ../../piloto/mvp290_reprocesar_archivo_asociado.sql'+
  '\n\\ir ./mvp290-round-correlation-pg17.sql'+tail);
 if(result.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP290_MULTIPLE_ROLLBACK');
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const option=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(option)||process.argv.length>3)
   throw Error('MVP290_INVALID_OPTION');
  if(option==='--assert-local'){
   validateIsolation();console.log('MVP290_LOCAL_ONLY_OK');
  }else if(option==='--sql')process.stdout.write(buildSupplierCorrelationSql());
  else console.log(JSON.stringify({state:'synthetic_pg17_only',
   whatsapp:0,pilot_deployed:false,rollback:true}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
