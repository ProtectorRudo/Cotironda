/** MVP302 PG17 only: extends MVP284's real SQL co-installation,
 * before the single ROLLBACK, with private read-only bridge tests.
 * The generated script NEVER touches cotironda-piloto.
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {buildRoundtripSql} from './mvp284-e2e-builder.mjs';

const marker='\nROLLBACK;\nSELECT ';
const src=fileURLToPath(new URL('../../supabase/piloto/mvp302_ia_finalist_sources_service_only.sql',import.meta.url));
const tests=fileURLToPath(new URL('../../supabase/tests/ci/mvp302-puente-ia-finalistas-pg17.sql',import.meta.url));
export function buildBridgeSql(reader=readFileSync){
 const migration=reader(src,'utf8'),test=reader(tests,'utf8');
 if(!migration.startsWith('-- MVP302')||
  !test.startsWith('-- MVP302')||
  /\b(?:net\.http_post|cron\.schedule|vault\.decrypted_secrets|gate\.whapi\.cloud)\b/iu.test(migration+test)||
  /(^|\n)\s*(?:COMMIT|ROLLBACK|\\!|\\copy|\\connect)\b/iu.test(migration+test)||
  !migration.includes('GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_finalist_sources_mvp302')||
  !test.includes('mvp302_outbound_or_award_side_effect'))
  throw new Error('MVP302_UNSAFE_SQL');
 const base=buildRoundtripSql();
 if(base.split(marker).length!==2)throw new Error('MVP302_ANCHOR_MISSING');
 const sql=base.replace(marker,
  '\n\\ir ../../piloto/mvp302_ia_finalist_sources_service_only.sql'+
  '\n\\ir ./mvp302-puente-ia-finalistas-pg17.sql'+marker);
 if(sql.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw new Error('MVP302_MULTIPLE_ROLLBACKS');
 return sql;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const arg=process.argv[2]??'--check';
  if(!['--check','--sql'].includes(arg)||process.argv.length>3)
   throw new Error('MVP302_USAGE');
  const sql=buildBridgeSql();
  process.stdout.write(arg==='--sql'?sql:
   JSON.stringify({state:'pg17_synthetic_sql_ready',
    content_bytes:Buffer.byteLength(sql),real_pilot_touched:false,
    real_whapi:false,automatic_award:false,deploy_authorized:false})+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1}
}
