/** MVP285 - 21 migraciones + rondas + autorización operador en UN PG17 aislado. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRoundtripSql} from './mvp284-e2e-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';
const marker='\nROLLBACK;\nSELECT ';
export function buildOperatorGateSql(){
 const src=buildRoundtripSql();
 if(src.split(marker).length!==2)throw Error('MVP285_ROLLBACK_ANCHOR_CHANGED');
 const sql=src.replace(marker,
  '\n\\ir ../../piloto/mvp285_piloto_revision_operador_sql_gate.sql'+
  '\n\\ir ./mvp285-operator-gates-pg17.sql'+marker);
 if(sql.split(/^ROLLBACK;\s*$/gm).length!==2)throw Error('MVP285_BAD_TRANSACTION');
 return sql;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const mode=process.argv[2]||'--check';
  if(!['--sql','--check','--assert-local'].includes(mode)||process.argv.length>3)
   throw Error('MVP285_USAGE');
  if(mode==='--assert-local'){validateIsolation();console.log('MVP285_LOCAL_ONLY_OK')}
  else if(mode==='--sql')process.stdout.write(buildOperatorGateSql());
  else console.log(JSON.stringify({
   status:'synthetic_operator_gate_fixture_ready',
   migrations:21,real_pilot_execution:false,external_whatsapp:false,
   operator_gate_default:false
  }));
 }catch(e){console.error(String(e.message));process.exitCode=1;}
}
