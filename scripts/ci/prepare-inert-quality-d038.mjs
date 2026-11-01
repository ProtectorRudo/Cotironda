/**
 * D038 — generate D020 INERT schema rehearsal SQL from exact historic DEV text.
 *
 * STRICTLY CI ONLY. This does NOT execute any SQL and is NOT an installer.
 * It removes exactly the two CREATE EXTENSION declarations from D020 so the
 * rest of the historical SQL can be exercised in disposable plain PostgreSQL17.
 * pg_net / pg_cron, Vault and external connections are NOT simulated or tested.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const VERSION='20261030192011';
const EXPECTED_FILE='supabase/recovery/dev_quality_20261030/20261030192011_dev_quality_auto_dispatch_d020.sql';
const HEADER_NET='create extension if not exists pg_net;';
const HEADER_CRON='create extension if not exists pg_cron;';

export function prepararD020InerteD038(sql, expectedHash) {
 if(typeof sql!=='string'||typeof expectedHash!=='string'||
    !/^[0-9a-f]{64}$/.test(expectedHash)||
    createHash('sha256').update(sql,'utf8').digest('hex')!==expectedHash)
    throw Error('D038_ORIGINAL_HASH_MISMATCH');
 const count=(part)=>sql.split(part).length-1;
 if(count(HEADER_NET)!==1||count(HEADER_CRON)!==1)
    throw Error('D038_UNEXPECTED_EXTENSION_DECLARATION');
 const idxNet=sql.indexOf(HEADER_NET);
 const idxCron=sql.indexOf(HEADER_CRON);
 const idxTable=sql.indexOf('create table if not exists cotironda_private.dev_quality_auto_control');
 if(idxNet<0||idxCron<0||idxTable<0||idxNet>idxCron||idxCron>idxTable)
    throw Error('D038_UNEXPECTED_SQL_ORDER');
 const inert=sql.replace(HEADER_NET,
    '-- D038 CI ONLY: skipped CREATE EXTENSION pg_net (no network extension installed)')
   .replace(HEADER_CRON,
    '-- D038 CI ONLY: skipped CREATE EXTENSION pg_cron (no background jobs installed)');
 // Any other executable extension manipulation fails closed. Comment-only
 // handling is intentionally limited to full-line SQL comments in this archive.
 const withoutComments=inert.split('\n')
   .filter(line=>!/^\s*--/.test(line)).join('\n');
 if(/\b(?:create|drop|alter)\s+extension\b/i.test(withoutComments)||
    /\bcron\.schedule\s*\(/i.test(withoutComments)||
    /\b(?:select|perform)\s+cotironda_private\.dev_quality_dispatch_next\s*\(/i.test(withoutComments))
    throw Error('D038_UNSAFE_D020_SQL');
 if(!inert.includes('enabled boolean not null default false')||
    !inert.includes('if v_enabled is distinct from true then')||
    !inert.includes("return 'disabled';")||
    !inert.includes('create or replace function cotironda_private.dev_quality_dispatch_next()'))
    throw Error('D038_REQUIRED_FAIL_CLOSED_GUARD_MISSING');
 return inert;
}
export async function generarEnsayoD038(outputPath) {
 if(process.env.COTIRONDA_CI_INERT_RESTORE!=='true'||
    process.env.PGHOST!=='127.0.0.1'||
    process.env.PGDATABASE!=='cotironda_ci_fresh'||
    outputPath!=='/tmp/cotironda_d038_inert.sql')
    throw Error('D038_CI_ONLY_GUARD');
 const manifest=JSON.parse(await readFile(join(ROOT,
   'supabase/recovery/dev_quality_20261030/manifest.json'),'utf8'));
 const entry=manifest.migrations?.find(x=>x.version===VERSION);
 if(manifest.safeToAutoExecute!==false||!entry||entry.path!==EXPECTED_FILE)
    throw Error('D038_UNEXPECTED_MANIFEST');
 const sql=await readFile(join(ROOT,EXPECTED_FILE),'utf8');
 const inert=prepararD020InerteD038(sql,entry.sha256);
 await writeFile(outputPath,inert,{encoding:'utf8',mode:0o600,flag:'wx'});
 return {generated:true,applied:false,extensionsSkipped:2,externalCalls:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const r=await generarEnsayoD038(process.argv[2]);
  console.log('D038_INERT_SQL_PREPARED: extensions_skipped=2; SQL_not_executed_by_generator');
 }catch(err){
  console.error(err instanceof Error?err.message:'D038_PREPARATION_FAILED');
  process.exitCode=1;
 }
}
