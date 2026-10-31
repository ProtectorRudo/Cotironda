/**
 * D037: auditoría de integridad del SQL original de 5 migraciones IA DEV.
 * Nunca ejecuta SQL, nunca conecta a Supabase, pg_net, cron u OpenAI.
 * No es una herramienta de migración. Sin --deploy, no hay operaciones remotas.
 */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname,join} from 'node:path';

const REPO_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const MANIFEST='supabase/recovery/dev_quality_20261030/manifest.json';
const SHA=/^[0-9a-f]{64}$/;
const NAME=/^[a-z][a-z0-9_]{2,70}$/;
const VERSION=/^20261030[0-9]{6}$/;

export async function verificarFuentesIAD037(read=readFile){
 const raw=await read(join(REPO_ROOT,MANIFEST),'utf8');
 const data=JSON.parse(raw);
 if(data.version!==1||data.safeToAutoExecute!==false||
    data.expectedBaseMigrations!==12||data.devTotalMigrations!==17||
    !Array.isArray(data.migrations)||data.migrations.length!==5)
   throw new Error('D037_MANIFEST_INVALID');
 const versions=new Set();
 const digestEntries=[];
 for(const [i,item] of data.migrations.entries()){
   if(!item||!VERSION.test(item.version)||!NAME.test(item.name)||
     !SHA.test(item.sha256)||!Number.isSafeInteger(item.characters)||
     item.characters<1||versions.has(item.version)||
     item.path!==`supabase/recovery/dev_quality_20261030/${item.version}_${item.name}.sql`)
      throw new Error('D037_MANIFEST_ENTRY_INVALID');
   versions.add(item.version);
   const sql=await read(join(REPO_ROOT,item.path),'utf8');
   const hash=createHash('sha256').update(sql,'utf8').digest('hex');
   if(hash!==item.sha256||sql.length!==item.characters)
     throw new Error('D037_SOURCE_HASH_MISMATCH_'+item.version);
   // Pistas de material sensible pegado por error; no prometen análisis DLP.
   if(/\b(?:sk-[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9._-]{28,})\b/.test(sql))
     throw new Error('D037_SUSPECT_LITERAL');
   digestEntries.push({version:item.version,sha256:hash});
   if(i>0&&item.version<=data.migrations[i-1].version)
     throw new Error('D037_VERSION_ORDER');
 }
 return Object.freeze({
   status:'FUENTES_EXACTAS_VERIFICADAS',
   count:digestEntries.length,
   readyForRestore:false,
   readyForDeploy:false,
   hashes:Object.freeze(digestEntries)
 });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
   const r=await verificarFuentesIAD037();
   // Nunca imprimir SQL recuperado; solo una etiqueta de éxito.
   console.log('D037_ARCHIVE_SHA256_PASS: '+r.count+'/5; no_restore_no_deploy');
 }catch(e){
   console.error(e instanceof Error?e.message:'D037_VERIFICATION_FAILED');
   process.exitCode=1;
 }
}
