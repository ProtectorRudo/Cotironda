/** MVP303. Extiende la coinstalación de 21 migraciones y el circuito
 * sintético MVP284 con una RPC read-only para TODOS los proveedores.
 * TODO en un PostgreSQL17 local de CI y un único ROLLBACK.
 * Nunca conectar a Supabase real, Whapi, Vercel ni OpenAI.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRoundtripSql} from './mvp284-e2e-builder.mjs';
const root=new URL('../../',import.meta.url);
const migration=new URL('supabase/piloto/mvp303_revelar_todos_los_proveedores_al_cierre.sql',root);
const tests=new URL('supabase/tests/ci/mvp303-proveedores-todos-cierre-pg17.sql',root);
const marker='\nROLLBACK;\nSELECT ';
export function buildMvp303Sql(reader=readFileSync){
 const src=reader(migration,'utf8'),t=reader(tests,'utf8');
 if(!src.startsWith('-- MVP303')||!t.startsWith('-- MVP303')||
    /(^|\n)\s*(?:COMMIT|ROLLBACK|\\!|\\copy|\\connect)\b/iu.test(src+t)||
    /\b(?:net\.http_post|cron\.schedule|vault\.decrypted_secrets|gate\.whapi\.cloud|OPENAI_API_KEY)\b/iu.test(src+t)||
    !src.includes('GRANT EXECUTE ON FUNCTION public.cotironda_piloto_all_suppliers_closed_mvp303')||
    !t.includes('mvp303_before_deadline_leaked'))
   throw Error('MVP303_UNSAFE_SQL');
 const base=buildRoundtripSql();
 if(base.split(marker).length!==2)throw Error('MVP303_ROLLBACK_ANCHOR_CHANGED');
 // The MVP283 synthetic snapshot predates the live display_label column.
 // Reproduce this one CURRENT-pilot schema field ONLY in disposable PG17;
 // not a proposed migration and never a change to remote Supabase.
 const fixtureLabels=[
  'ALTER TABLE cotironda_piloto_privado.participants ADD COLUMN IF NOT EXISTS display_label text;',
  "UPDATE cotironda_piloto_privado.participants SET display_label=CASE key",
  " WHEN 'corralon_ailin' THEN 'Corralón A'",
  " WHEN 'corralon_nahuel' THEN 'Corralón B'",
  " WHEN 'electricidad_gamma' THEN 'Electricidad C'",
  " ELSE 'Comprador de prueba' END;"
 ].join('\n');
 const text=base.replace(marker,
  '\n'+fixtureLabels+
  '\n\\ir ../../piloto/mvp303_revelar_todos_los_proveedores_al_cierre.sql'+
  '\n\\ir ./mvp303-proveedores-todos-cierre-pg17.sql'+marker);
 if(text.split(/^ROLLBACK;\s*$/gm).length!==2)
  throw Error('MVP303_MULTIPLE_ROLLBACKS');
 return text;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const arg=process.argv[2]||'--check';
  if(process.argv.length>3||!['--sql','--check'].includes(arg))
   throw Error('MVP303_USAGE');
  const sql=buildMvp303Sql();
  process.stdout.write(arg==='--sql'?sql:JSON.stringify({
   state:'synthetic_pg17_only',
   bytes:Buffer.byteLength(sql),
   no_external_services:true,
   source_names_revealed_only_after_close:true,
   personal_contacts_revealed:false,
   historical_backfill:false,
   published:false})+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
