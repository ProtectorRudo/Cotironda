/** MVP284: añadir prueba de circuito a la coinstalación PG17 de MVP283.
 * Mismo PG17 y una única transacción con rollback. No WhatsApp ni red.
 */
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildCumulativeSql} from './mvp283-cumulative-builder.mjs';
import {validateIsolation} from './mvp282-pg17-modular-rehearsal.mjs';

const sqlPath=fileURLToPath(new URL('../../supabase/tests/ci/mvp284-roundtrip-e2e-pg17.sql',import.meta.url));
const marker='\nROLLBACK;\nSELECT ';
export function buildRoundtripSql(read=readFileSync){
 const base=buildCumulativeSql();
 const candidate=read(sqlPath,'utf8');
 if(!candidate.trimStart().startsWith('-- MVP284:')||
    !/DO \$e2e\$/.test(candidate)||
    !/END \$e2e\$;\s*$/.test(candidate)||
    /(^|\n)\s*(COMMIT|ROLLBACK|\\!|\\copy|\\connect)\b/im.test(candidate))
  throw Error('MVP284_UNSAFE_SCENARIO');
 if(base.split(marker).length!==2)throw Error('MVP284_ROLLBACK_ANCHOR_CHANGED');
 const out=base.replace(marker,'\n\\ir ./mvp284-roundtrip-e2e-pg17.sql'+marker);
 if(out.split(/^ROLLBACK;\s*$/gm).length!==2)throw Error('MVP284_MULTIPLE_ROLLBACKS');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const arg=process.argv[2]??'--check';
  if(!['--check','--sql','--assert-local'].includes(arg)||process.argv.length>3)
   throw Error('MVP284_USAGE');
  if(arg==='--assert-local'){
   validateIsolation();process.stdout.write('MVP284_LOCAL_ONLY_OK\n');
  }else if(arg==='--sql')process.stdout.write(buildRoundtripSql());
  else{
   const x=buildRoundtripSql();
   process.stdout.write(JSON.stringify({
    status:'scenario_ready_synthetic_only',
    migrations_consecutive:21,
    e2e_exercised:false,real_whapi:false,real_pilot_unchanged:true,
    deployment_authorized:false,bytes:Buffer.byteLength(x)
   })+'\n');
  }
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
