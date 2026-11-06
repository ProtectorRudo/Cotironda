/**
 * MVP273 — local, disposable PostgreSQL 17 SQL replay from PILOTO ZIP.
 *
 * Never connects to a remote database. Source is a verified age ZIP.
 * All decrypted SQL flows through pipes into isolated Docker PG17.
 * A successful REPLAY IS NOT a managed Supabase restore (Auth, Storage,
 * Vault, Edge, extensions, and external configs still need their own checks).
 */
import {spawn} from 'node:child_process';
import {lstat,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';
import {auditMobilePilotZip} from './audit-pilot-mobile-ciphertext-mvp272.mjs';
import {PILOT_REF,FILES} from './package-pilot-mobile-mvp269.mjs';
import {omitBuiltInPostgresRole} from './restore-encrypted-dev-lab-mvp049.mjs';

const SHA=/^[a-f0-9]{64}$/u;
const ID=/^[a-f0-9]{64}$/u;
const SOCKET='/var/run/docker.sock';
const IMAGE='postgres:17-alpine';
const DB='cotironda_pilot_replay_lab';
const fail=code=>{throw Error('MVP273_SQL_'+code)};
function safeEnv(env){
 if(process.platform==='win32'||typeof process.getuid!=='function'||
   (Boolean(env.CI)&&env.CI!=='false')||Boolean(env.GITHUB_ACTIONS)||
   Boolean(env.VERCEL)||Boolean(env.VERCEL_ENV)||
   Boolean(env.COTIRONDA_CI_AUTH_SANDBOX)||
   Boolean(env.COTIRONDA_CI_WA_PREVIEW_SANDBOX))
  fail('TRUSTED_LOCAL_ONLY');
 for(const k of ['COTIRONDA_PILOT_DB_URL','COTIRONDA_PILOT_SERVICE_ROLE_KEY',
    'COTIRONDA_DEV_DB_URL','DATABASE_URL','PGHOST','PGPORT','PGUSER',
    'PGPASSWORD','PGSERVICE','DOCKER_CONTEXT'])
  if(env[k])fail('DB_CREDENTIALS_FORBIDDEN');
 const host=env.DOCKER_HOST??'unix://'+SOCKET;
 if(host!=='unix://'+SOCKET)fail('ONLY_LOCAL_DOCKER_SOCKET');
 return {PATH:env.PATH||'/usr/local/bin:/usr/bin:/bin',LANG:'C',
  DOCKER_HOST:host,HOME:env.HOME??'/nonexistent'};
}
async function checkSocket(host){
 const target=host.slice('unix://'.length);
 const original=await lstat(target).catch(()=>fail('LOCAL_DOCKER_UNAVAILABLE'));
 const real=await stat(target).catch(()=>fail('LOCAL_DOCKER_UNAVAILABLE'));
 if(!original.isSocket()&&!original.isSymbolicLink())
  fail('LOCAL_DOCKER_UNAVAILABLE');
 if(!real.isSocket())fail('LOCAL_DOCKER_UNAVAILABLE');
}
function start(spawnFn,name,args,env,stdio){
 let p;
 try{p=spawnFn(name,args,{env,stdio})}catch{fail('PROGRAM_UNAVAILABLE')}
 if(!p||typeof p.once!=='function'||typeof p.kill!=='function')
  fail('PROGRAM_UNAVAILABLE');
 return p;
}
function wait(p){
 return new Promise((resolve,reject)=>{
  p.once('close',code=>resolve(code));
  p.once('error',()=>reject(Error('MVP273_SQL_PROGRAM_UNAVAILABLE')));
 });
}
async function quiet(spawnFn,name,args,env){
 const p=start(spawnFn,name,args,env,['ignore','ignore','ignore']);
 if(await wait(p)!==0)fail('SANDBOX_COMMAND_FAILED');
}
async function shortOutput(spawnFn,name,args,env){
 const p=start(spawnFn,name,args,env,['ignore','pipe','ignore']);
 if(!p.stdout)fail('PROGRAM_UNAVAILABLE');
 const done=wait(p);
 let content='';
 for await(const chunk of p.stdout){
  content+=chunk.toString('ascii');
  if(content.length>128){p.kill();fail('PROGRAM_OUTPUT_OVERSIZED')}
 }
 if(await done!==0||!content.trim())fail('SANDBOX_COMMAND_FAILED');
 return content.trim();
}
async function replayPiece(spawnFn,piece,zipPath,identityPath,container,env){
 const unzip=start(spawnFn,'unzip',['-p',zipPath,piece],env,
  ['ignore','pipe','ignore']);
 const age=start(spawnFn,'age',['--decrypt','--identity',identityPath],env,
  ['pipe','pipe','ignore']);
 const psql=start(spawnFn,'docker',['exec','-i',container,'psql',
  '-X','-q','--no-psqlrc','-v','ON_ERROR_STOP=1',
  '-U','postgres','-d',DB],env,['pipe','ignore','ignore']);
 if(!unzip.stdout||!age.stdin||!age.stdout||!psql.stdin)
  fail('PROGRAM_UNAVAILABLE');
 const closes=[wait(unzip),wait(age),wait(psql)];
 try{
  const tasks=[
   pipeline(unzip.stdout,age.stdin),
   piece==='roles.sql.age'
    ?pipeline(age.stdout,omitBuiltInPostgresRole(),psql.stdin)
    :pipeline(age.stdout,psql.stdin),
   ...closes
  ];
  const [,,unzipCode,ageCode,sqlCode]=await Promise.all(tasks);
  if(unzipCode!==0||ageCode!==0||sqlCode!==0)
   fail('SQL_REPLAY_REJECTED');
 }catch(e){
  unzip.kill();age.kill();psql.kill();
  if(e instanceof Error&&/^MVP273_SQL_/u.test(e.message))throw e;
  fail('SQL_REPLAY_REJECTED');
 }
}
export async function replayPilotSqlInDisposablePg17({
 zipPath,identityPath,expectedSha256,env=process.env,
 spawnCommand=spawn,auditFn=auditMobilePilotZip,
 socketCheck=checkSocket
}){
 const dockerEnv=safeEnv(env);
 if(typeof zipPath!=='string'||!zipPath.startsWith('/')||
    typeof identityPath!=='string'||!identityPath.startsWith('/')||
    typeof expectedSha256!=='string'||!SHA.test(expectedSha256))
  fail('ABSOLUTE_PATHS_AND_SHA_REQUIRED');
 // MVP272 audits exact ZIP entries, age and key before Docker starts.
 const audited=await auditFn({zipPath,identityPath,expectedSha256,env,
  spawnCommand});
 if(!audited||
   audited.status!=='PILOT_MOBILE_ZIP_AGE_DECRYPTION_VERIFIED_NOT_RESTORED'||
   audited.project_ref!==PILOT_REF||
   audited.age_streams_authenticated!==6||
   audited.archive_sha256!==expectedSha256||
   audited.restore_verified!==false)
  fail('CRYPTO_PREFLIGHT_REJECTED');
 await socketCheck(dockerEnv.DOCKER_HOST);
 let container=null,count=0;
 try{
  const cid=await shortOutput(spawnCommand,'docker',[
   'run','--detach','--rm','--pull=never','--network=none',
   '--read-only','--cap-drop=NET_RAW','--security-opt','no-new-privileges',
   '--memory=1536m','--memory-swap=1536m','--pids-limit=160','--cpus=1',
   '--log-driver=none',
   '--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=768m',
   '--tmpfs','/var/run/postgresql:rw,nosuid,nodev,size=16m',
   '--tmpfs','/tmp:rw,nosuid,nodev,size=32m',
   '-e','POSTGRES_HOST_AUTH_METHOD=trust',
   '-e','POSTGRES_DB='+DB,IMAGE
  ],dockerEnv);
  if(!ID.test(cid))fail('CONTAINER_ID_INVALID');
  container=cid;
  let ready=false;
  for(let n=0;n<30;n++){
   const p=start(spawnCommand,'docker',['exec',cid,'pg_isready','-q',
    '-U','postgres','-d',DB],dockerEnv,['ignore','ignore','ignore']);
   if(await wait(p)===0){ready=true;break}
   await new Promise(yes=>setTimeout(yes,500));
  }
  if(!ready)fail('DISPOSABLE_DATABASE_NOT_READY');
  // All five SQL pieces replay in order, never extracting SQL to host.
  for(const piece of FILES.slice(0,5)){
   await replayPiece(spawnCommand,piece,resolve(zipPath),resolve(identityPath),
    cid,dockerEnv);
   count++;
  }
  // The SQL dump should contain Cotironda domain data and Storage metadata.
  // Checking PG version alone could pass with an empty restore.
  const check=await shortOutput(spawnCommand,'docker',[
   'exec',cid,'psql','-X','-q','-A','-t',
   '-v','ON_ERROR_STOP=1','-U','postgres','-d',DB,
   '-c',"SELECT CASE WHEN current_setting('server_version_num')::int/10000=17"+
     " AND to_regclass('cotironda_piloto_privado.requests') IS NOT NULL"+
     " AND to_regclass('storage.objects') IS NOT NULL"+
     " THEN 'MVP273_SQL_LAB_OK' ELSE 'MVP273_SQL_LAB_REJECT' END"
  ],dockerEnv);
  if(check!=='MVP273_SQL_LAB_OK')fail('RESTORED_TABLES_MISSING');
  return Object.freeze({
   status:'PILOT_SQL_DISPOSABLE_PG17_REPLAY_VERIFIED_NOT_SUPABASE_RESTORED',
   project_ref:PILOT_REF,encrypted_sql_streams_replayed:count,
   local_postgres_version:17,network_exposed:false,ports_exposed:false,
   host_plaintext_sql_files:false,
   isolated_container_destroyed_after_test:true,
   managed_supabase_restore_verified:false,
   storage_objects_restored:false,restore_verified:false,
   download_link_created:false
  });
 }catch(e){
  if(e instanceof Error&&/^MVP273_SQL_/u.test(e.message))throw e;
  fail('REPLAY_FAILED');
 }finally{
  if(container){
   // Clean even when replay failed; a cleanup failure blocks success.
   await quiet(spawnCommand,'docker',['rm','-f',container],dockerEnv)
    .catch(()=>fail('CONTAINER_CLEANUP_UNVERIFIED'));
  }
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 replayPilotSqlInDisposablePg17({
  zipPath:process.argv[2],identityPath:process.argv[3],
  expectedSha256:process.argv[4]
 }).then(result=>console.log(JSON.stringify(result)))
  .catch(e=>{
   console.error(e instanceof Error&&/^MVP273_SQL_[A-Z_]+$/u.test(e.message)?
    e.message:'MVP273_SQL_LAB_FAILED');
   process.exitCode=1;
  });
}
