/**
 * MVP-049: replay an encrypted DEV export inside a NEW disposable PG17 Docker
 * container with NO NETWORK, NO PORTS, NO HOST VOLUMES and NO plaintext SQL
 * files. Never connect to Supabase or user-supplied destination DSN.
 *
 * This validates SQL replay in plain PostgreSQL17. A green result is NOT
 * evidence of full Supabase restore (Auth/Storage files/extensions/secrets).
 */
import {spawn} from 'node:child_process';
import {lstat,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';
import {checkBundle,PIECES,PROJECT_REF} from './verify-encrypted-dev-backup-d039.mjs';
import {verifyDecryption} from './check-local-dev-backup-d041.mjs';

const SHA=/^[a-f0-9]{64}$/u;
const HEX_ID=/^[a-f0-9]{64}$/u;
const IMAGE='postgres:17-alpine';
const DB='cotironda_restore_lab';
const SOCKET='/var/run/docker.sock';
const forbidden=e=>process.platform==='win32'||typeof process.getuid!=='function'||
 e.CI==='true'||Boolean(e.GITHUB_ACTIONS)||Boolean(e.VERCEL)||
 Boolean(e.VERCEL_ENV)||Boolean(e.COTIRONDA_CI_AUTH_SANDBOX)||
 Boolean(e.COTIRONDA_CI_WA_PREVIEW_SANDBOX)||
 Boolean(e.COTIRONDA_DEV_DB_URL)||Boolean(e.DATABASE_URL)||
 Boolean(e.PGHOST)||Boolean(e.PGPORT)||Boolean(e.PGUSER)||Boolean(e.PGPASSWORD)||
 Boolean(e.DOCKER_CONTEXT);
const fail=code=>{throw Error('MVP049_'+code)};
function safeEnv(env){
 if(forbidden(env))fail('LOCAL_ONLY_NO_DB_CREDENTIALS');
 const host=env.DOCKER_HOST??'unix://'+SOCKET;
 if(typeof host!=='string'||!host.startsWith('unix:///')||
    host.includes('\0')||host.includes('?')||host.includes('#'))
  fail('LOCAL_DOCKER_SOCKET_ONLY');
 return {PATH:env.PATH||'/usr/local/bin:/usr/bin:/bin',LANG:'C',
  HOME:env.HOME??'/nonexistent',DOCKER_HOST:host};
}
async function checkSocket(host){
 const path=host.slice('unix://'.length);
 const s=await lstat(path).catch(()=>fail('LOCAL_DOCKER_UNAVAILABLE'));
 if(!s.isSocket()&&!s.isSymbolicLink())fail('LOCAL_DOCKER_UNAVAILABLE');
 const target=await stat(path).catch(()=>fail('LOCAL_DOCKER_UNAVAILABLE'));
 if(!target.isSocket())fail('LOCAL_DOCKER_UNAVAILABLE');
}
function settled(child){
 return new Promise((ok,notOk)=>{
  let done=false;
  child.once('error',()=>{
   if(!done){done=true;notOk(Error('MVP049_SUBPROCESS_UNAVAILABLE'))}
  });
  child.once('close',code=>{
   if(!done){done=true;ok(code)}
  });
 });
}
function launch(program,args,env,options={},spawnCommand=spawn){
 let child;
 try{child=spawnCommand(program,args,{
  env,stdio:['ignore','ignore','ignore'],...options
 })}catch{fail('SUBPROCESS_UNAVAILABLE')}
 if(!child||typeof child.once!=='function')fail('SUBPROCESS_UNAVAILABLE');
 return child;
}
async function command(program,args,env,spawnCommand=spawn){
 const child=launch(program,args,env,{},spawnCommand);
 if((await settled(child))!==0)fail('SANDBOX_COMMAND_FAILED');
}
async function output(program,args,env,spawnCommand=spawn){
 const child=launch(program,args,env,{stdio:['ignore','pipe','ignore']},spawnCommand);
 if(!child.stdout)fail('SUBPROCESS_UNAVAILABLE');
 let data='';
 child.stdout.on('data',chunk=>{
  data+=chunk.toString('ascii');
  if(data.length>128){child.kill?.();data=''}
 });
 if((await settled(child))!==0||!data)fail('SANDBOX_COMMAND_FAILED');
 return data.trim();
}
/** Only suppress the already-present superuser CREATE ROLE postgres; */
export function omitBuiltInPostgresRole(){
 let carry='';
 return new Transform({
  transform(bytes,_enc,cb){
   carry+=bytes.toString('utf8');
   const at=carry.lastIndexOf('\n');
   if(at>=0){
    const lines=carry.slice(0,at+1).split('\n');
    carry=carry.slice(at+1);
    const result=lines.map(line=>
     /^CREATE ROLE postgres;\r?$/u.test(line)?'-- existing postgres role':line
    ).join('\n');
    cb(null,Buffer.from(result,'utf8'));
   }else if(carry.length>16384)cb(Error('MVP049_ROLES_LINE_TOO_LONG'));
   else cb();
  },
  flush(cb){
   if(carry.length>16384){cb(Error('MVP049_ROLES_LINE_TOO_LONG'));return}
   this.push(/^CREATE ROLE postgres;\r?$/u.test(carry)?
    '-- existing postgres role':carry);
   cb();
  }
 });
}
async function streamPiece(file,identity,container,env,spawnCommand=spawn){
 const age=launch('age',['--decrypt','--identity',identity,file],env,
  {stdio:['ignore','pipe','ignore']},spawnCommand);
 const docker=launch('docker',['exec','-i',container,'psql',
  '-X','-q','--no-psqlrc','-v','ON_ERROR_STOP=1',
  '-U','postgres','-d',DB],env,{stdio:['pipe','ignore','ignore']},spawnCommand);
 if(!age.stdout||!docker.stdin)fail('SUBPROCESS_UNAVAILABLE');
 const endAge=settled(age),endDocker=settled(docker);
 try{
  const transformed=file.endsWith('/roles.sql.age')?
   pipeline(age.stdout,omitBuiltInPostgresRole(),docker.stdin):
   pipeline(age.stdout,docker.stdin);
  const [_,ageCode,dockerCode]=await Promise.all([transformed,endAge,endDocker]);
  if(ageCode!==0||dockerCode!==0)fail('SQL_RESTORE_REJECTED');
 }catch{
  age.kill?.();docker.kill?.();
  fail('SQL_RESTORE_REJECTED');
 }
}
/**
 * Real CLI uses real spawn; CI invokes injectable functions with synthetic
 * inputs only to prove ordering, isolation, cleanup and negative controls.
 */
export async function restaurarBackupAisladoMvp049({
 directory,identityPath,expectedManifestSha256,env=process.env,
 spawnCommand=spawn,checkArchive=checkBundle,
 verifyDecrypt=verifyDecryption,checkDockerSocket=checkSocket
}){
 const dockerEnv=safeEnv(env);
 if(typeof directory!=='string'||!directory.startsWith('/')||
  typeof identityPath!=='string'||!identityPath.startsWith('/')||
  typeof expectedManifestSha256!=='string'||!SHA.test(expectedManifestSha256))
  fail('ABSOLUTE_PATHS_AND_TRUSTED_HASH_REQUIRED');
 const dir=resolve(directory),identity=resolve(identityPath);
 // D039 checks 0700 dir/0600 files + SHA in caller's INDEPENDENT record.
 const verified=await checkArchive('verify',dir,expectedManifestSha256);
 if(!verified||verified.status!=='PACKAGE_INTEGRITY_ONLY'||
  verified.artifacts_checked!==5||verified.restore_verified!==false)
  fail('ARCHIVE_INTEGRITY_FAILED');
 // D041 verifies file owner, no symlink and decryption of each age stream
 // BEFORE container is created. Never retain SQL, password or key material.
 const decryption=await verifyDecrypt(dir,expectedManifestSha256,identity);
 if(!decryption||decryption.status!=='LOCAL_AGE_DECRYPT_CHECK_ONLY'||
   decryption.files_decrypted!==5||decryption.restore_verified!==false)
   fail('DECRYPTION_UNVERIFIED');
 await checkDockerSocket(dockerEnv.DOCKER_HOST);
 let container=null,restored=0;
 try{
  const id=await output('docker',[
   'run','--detach','--rm','--pull=never','--network=none',
   '--memory=1536m','--pids-limit=160',
   '--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=768m',
   '--tmpfs','/var/run/postgresql:rw,nosuid,nodev,size=16m',
   '-e','POSTGRES_HOST_AUTH_METHOD=trust',
   '-e','POSTGRES_DB='+DB,
   IMAGE
  ],dockerEnv,spawnCommand);
  if(!HEX_ID.test(id))fail('DOCKER_CONTAINER_ID_INVALID');
  container=id;
  let ready=false;
  for(let i=0;i<30;i++){
   const child=launch('docker',['exec',container,'pg_isready',
    '-q','-U','postgres','-d',DB],dockerEnv,{},spawnCommand);
   if(await settled(child)===0){ready=true;break}
   await new Promise(r=>setTimeout(r,500));
  }
  if(!ready)fail('SANDBOX_DATABASE_NOT_READY');
  // Exactly five D039 pieces: roles, schema, data, migrations schema+data.
  for(const piece of PIECES){
   await streamPiece(dir+'/'+piece,identity,container,dockerEnv,spawnCommand);
   restored++;
  }
  const check=await output('docker',['exec',container,'psql','-X',
   '-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',DB,
   '-c',"select case when current_setting('server_version_num')::int/10000=17 and to_regclass('public.organizations') is not null then 'MVP049_OK' else 'MVP049_REJECT' end"
  ],dockerEnv,spawnCommand);
  if(check!=='MVP049_OK')fail('RESTORED_SCHEMA_INVALID');
  // A clean SQL replay in vanilla PG17 is NOT a Supabase backup restore.
  return Object.freeze({
   status:'DISPOSABLE_PG17_SQL_REPLAY_VERIFIED',
   project_ref:PROJECT_REF,encrypted_pieces_restored:restored,
   plaintext_on_host_disk:false,network_exposed:false,ports_exposed:false,
   database_destroyed_after_check:true,
   supabase_platform_restore_verified:false,gate_d024_open:false
  });
 }catch(e){
  if(e instanceof Error&&/^MVP049_[A-Z0-9_]+$/u.test(e.message))throw e;
  fail('RESTORE_FAILED');
 }finally{
  // Never leave a database full of real DEV data running after inspection.
  if(container){
   const child=launch('docker',['rm','-f',container],dockerEnv,{},spawnCommand);
   if(await settled(child)!==0)fail('SANDBOX_CLEANUP_FAILED');
  }
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 restaurarBackupAisladoMvp049({
  directory:process.argv[2],identityPath:process.argv[3],
  expectedManifestSha256:process.argv[4]
 }).then(v=>console.log(JSON.stringify(v))).catch(e=>{
  console.error(e instanceof Error&&/^MVP049_[A-Z0-9_]+$/u.test(e.message)?
   e.message:'MVP049_PRIVATE_RESTORE_FAILED');
  process.exitCode=1;
 });
}
