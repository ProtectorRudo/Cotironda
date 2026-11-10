/** MVP295: append private linked-text replay after all MVP292 fixtures. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSupplierAutorecoverySql} from './mvp292-supplier-autorecovery-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const tail='\nROLLBACK;\nSELECT ';
export function buildLinkedCommercialSqlMvp295(){
 const base=buildSupplierAutorecoverySql();
 if(base.split(tail).length!==2)throw Error('MVP295_MISSING_BOUNDARY');
 const out=base.replace(tail,
  '\n\\ir ../../piloto/mvp295_continuidad_comercial_textos_vinculados.sql'+
  '\n\\ir ./mvp295-linked-text-commercial-pg17.sql'+tail);
 if(out.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP295_MULTIPLE_ROLLBACK');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const arg=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(arg)||process.argv.length>3)
   throw Error('MVP295_INVALID_OPTION');
  if(arg==='--assert-local'){
   validateIsolation();console.log('MVP295_ISOLATION_OK');
  }else if(arg==='--sql')process.stdout.write(buildLinkedCommercialSqlMvp295());
  else console.log(JSON.stringify({state:'synthetic_only',
   pilot_changed:false,whapi_sends:0,rollback:true}));
 }catch(e){console.error(String(e.message));process.exitCode=1}
}
