/**
 * MVP-027 / D075. One command on a TRUSTED local POSIX workstation.
 * No Supabase credentials or age keys in CLI arguments, GitHub, Vercel or logs.
 * This creates encrypted SQL pieces and proves they decrypt, NOT restores.
 * Real DEV backup and isolated restore continue to be gate #175.
 */
import {spawn} from 'node:child_process';
import {lstat} from 'node:fs/promises';
import {dirname,parse,resolve,sep,isAbsolute,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {exportDevEncrypted} from './export-encrypted-dev-mvp003.mjs';
import {validateDevDsn} from './check-local-dev-backup-d041.mjs';
import {verifyDecryption} from './check-local-dev-backup-d041.mjs';

const AGE_RECIPIENT=/^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/u;
const fail=(code)=>{throw Error('D075_'+code)};
function forbiddenEnvironment(env){
 return process.platform==='win32'||typeof process.getuid!=='function'||
  env.CI==='true'||Boolean(env.GITHUB_ACTIONS)||Boolean(env.VERCEL)||
  Boolean(env.VERCEL_ENV)||Boolean(env.COTIRONDA_CI_AUTH_SANDBOX)||
  Boolean(env.COTIRONDA_CI_WA_PREVIEW_SANDBOX);
}
async function privateIdentity(rawPath){
 if(typeof rawPath!=='string'||!isAbsolute(rawPath))fail('IDENTITY_PRIVATE_FILE_REQUIRED');
 const full=resolve(rawPath),root=parse(full).root;
 let at=root;
 for(const name of full.slice(root.length).split(sep).filter(Boolean)){
  at=join(at,name);
  const st=await lstat(at).catch(()=>fail('IDENTITY_NOT_FOUND'));
  if(st.isSymbolicLink())fail('IDENTITY_SYMLINK');
 }
 const st=await lstat(full).catch(()=>fail('IDENTITY_NOT_FOUND'));
 if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||
  (st.mode&0o077)!==0)fail('IDENTITY_UNSAFE');
 return full;
}
async function boundedProgram(program,args,env,spawnCommand){
 let child;
 try{child=spawnCommand(program,args,{
  env:{PATH:env.PATH||'/usr/bin:/bin',LANG:'C'},
  stdio:['ignore','pipe','ignore']
 });}catch{fail('TOOL_UNAVAILABLE')}
 if(!child||!child.stdout)fail('TOOL_UNAVAILABLE');
 let output='';
 const finished=new Promise((resolveFinished,rejectFinished)=>{
  let settled=false;
  const finish=(code)=>{if(!settled){settled=true;resolveFinished(code);}};
  const reject=()=>{if(!settled){settled=true;rejectFinished(Error('D075_TOOL_UNAVAILABLE'))}};
  child.once('error',reject);
  child.once('close',finish);
  child.stdout.on('data',chunk=>{
   if(settled)return;
   output+=chunk.toString('utf8');
   if(output.length>256){
    child.kill?.();
    rejectFinished(Error('D075_TOOL_OUTPUT_INVALID'));
    settled=true;
   }
  });
 });
 let code;
 try{code=await finished;}catch(e){
  if(e instanceof Error&&/^D075_[A-Z_]+$/u.test(e.message))throw e;
  fail('TOOL_UNAVAILABLE');
 }
 if(code!==0)fail('TOOL_UNAVAILABLE');
 return output.trim();
}
export async function ejecutarBackupPrivadoD075({
 directory,identityPath,env=process.env,spawnCommand=spawn,
 exportFn=exportDevEncrypted,decryptFn=verifyDecryption
}){
 // Never allow a credential-bearing backup to run in cloud/CI.
 if(forbiddenEnvironment(env))fail('LOCAL_ONLY');
 if(typeof directory!=='string'||!isAbsolute(directory))fail('OUTPUT_ABSOLUTE_REQUIRED');
 const connectionUrl=env.COTIRONDA_DEV_DB_URL;
 try{validateDevDsn(connectionUrl)}catch{fail('DEV_CONNECTION_INVALID')}
 const recipient=env.COTIRONDA_AGE_RECIPIENT;
 if(typeof recipient!=='string'||!AGE_RECIPIENT.test(recipient))
  fail('AGE_RECIPIENT_REQUIRED');
 const identity=await privateIdentity(identityPath);
 for(const program of ['pg_dump','pg_dumpall','psql']){
  const version=await boundedProgram(program,['--version'],env,spawnCommand);
  if(!new RegExp('^'+program+' \\(PostgreSQL\\) 17\\.','u').test(version))
   fail('PG17_TOOLS_REQUIRED');
 }
 const ageVersion=await boundedProgram('age',['--version'],env,spawnCommand);
 if(!/^(?:age )?v?1\\.\\d+/u.test(ageVersion))fail('AGE_VERSION_REQUIRED');
 // This public key must be derived from the operator's actual private file.
 // Prevent a full dump encrypted to an inaccessible or mistyped recipient.
 const derived=await boundedProgram('age-keygen',['-y',identity],env,spawnCommand);
 if(derived!==recipient)fail('AGE_IDENTITY_RECIPIENT_MISMATCH');
 let exported;
 try{
  exported=await exportFn({directory,connectionUrl,recipient});
 }catch{fail('EXPORT_FAILED')}
 if(!exported||exported.project_ref!=='qkercsoqhehbenbbncwk'||
  exported.status!=='ENCRYPTED_DEV_EXPORT_CREATED_NOT_RESTORED'||
  exported.pieces!==5||
  typeof exported.manifest_sha256!=='string'||
  !/^[a-f0-9]{64}$/u.test(exported.manifest_sha256)||
  exported.restore_verified!==false||exported.gate_d024_open!==false)
  fail('EXPORT_UNVERIFIED');
 let verified;
 try{
  verified=await decryptFn(directory,exported.manifest_sha256,identity);
 }catch{fail('DECRYPT_FAILED')}
 if(!verified||verified.status!=='LOCAL_AGE_DECRYPT_CHECK_ONLY'||
  verified.files_decrypted!==5||verified.restore_verified!==false||
  verified.gate_d024_open!==false)fail('DECRYPT_UNVERIFIED');
 return Object.freeze({
  status:'ENCRYPTED_SQL_EXPORT_DECRYPTED_NOT_RESTORED',
  project_ref:'qkercsoqhehbenbbncwk',
  encrypted_sql_files:5,
  manifest_sha256:exported.manifest_sha256,
  sql_plaintext_on_disk:false,
  storage_bytes_included:false,
  auth_edge_configuration_included:false,
  vault_cross_project_restorable:false,
  restore_verified:false,
  gate_d024_open:false
 });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 ejecutarBackupPrivadoD075({
  directory:process.argv[2],identityPath:process.argv[3]
 }).then(x=>console.log(JSON.stringify(x))).catch(e=>{
  const msg=e instanceof Error&&/^D075_[A-Z_]+$/u.test(e.message)?
   e.message:'D075_BACKUP_FAILED';
  console.error(msg);
  process.exitCode=1;
 });
}
