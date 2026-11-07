/**
 * MVP272: offline audit of the seven-member Cotironda PILOTO mobile ZIP.
 * ZIP is NOT encrypted, but all six components MUST be valid age ciphertext.
 * No extraction to disk: unzip -> (SHA-256) -> age -> /dev/null equivalent.
 *
 * This proves encryption/decryption, package integrity and exact membership.
 * It DOES NOT prove a successful PostgreSQL/Storage restore or backup origin.
 * NEVER run against genuine data in CI, Vercel or a shared cloud shell.
 */
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {dirname,join,parse,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PILOT_REF,FILES,META} from './package-pilot-mobile-mvp269.mjs';

const SHA=/^[a-f0-9]{64}$/u;
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const MAX_MANIFEST=65536;
const MAX_DECRYPTED_COMPONENT=2*1024*1024*1024;
const fail=s=>{throw Error('MVP272_'+s)};

function guard(env){
 if(process.platform==='win32'||typeof process.getuid!=='function'||
    (Boolean(env.CI)&&env.CI!=='false')||Boolean(env.GITHUB_ACTIONS)||
    Boolean(env.VERCEL)||Boolean(env.VERCEL_ENV)||
    Boolean(env.COTIRONDA_CI_AUTH_SANDBOX)||
    Boolean(env.COTIRONDA_CI_WA_PREVIEW_SANDBOX))
  fail('TRUSTED_LOCAL_ONLY');
 // The audit must not carry any live DB or Storage credentials.
 for(const name of ['COTIRONDA_PILOT_DB_URL','COTIRONDA_PILOT_SERVICE_ROLE_KEY',
     'DATABASE_URL','PGHOST','PGPORT','PGUSER','PGPASSWORD','PGSERVICE'])
  if(env[name])fail('DATABASE_CREDENTIALS_PRESENT');
}
async function trustedPrivateFile(raw){
 if(typeof raw!=='string'||!raw.startsWith('/'))fail('ABSOLUTE_FILE_REQUIRED');
 const path=resolve(raw);
 const rel=relative(ROOT,path);
 if(rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'))
  fail('REPOSITORY_PATH_REJECTED');
 const root=parse(path).root;
 let at=root;
 for(const part of path.slice(root.length).split(sep).filter(Boolean)){
  at=join(at,part);
  const st=await lstat(at).catch(()=>fail('FILE_NOT_FOUND'));
  if(st.isSymbolicLink())fail('SYMLINK_REJECTED');
 }
 const dir=await lstat(dirname(path));
 if(!dir.isDirectory()||dir.uid!==process.getuid()||(dir.mode&0o077)!==0)
  fail('PARENT_DIRECTORY_NOT_PRIVATE');
 const stat=await lstat(path);
 if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid()||
    (stat.mode&0o077)!==0)fail('FILE_NOT_PRIVATE');
 return {path,stat};
}
function sameFile(a,b){
 return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&
  a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&a.mode===b.mode;
}
async function hashZip(info){
 const handle=await open(info.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const st=await handle.stat();
  if(!sameFile(st,info.stat))fail('ARCHIVE_CHANGED');
  const sha=createHash('sha256');
  for await(const part of handle.createReadStream({start:0,autoClose:false}))
   sha.update(part);
  if(!sameFile(st,await handle.stat()))fail('ARCHIVE_CHANGED');
  return sha.digest('hex');
 }finally{await handle.close()}
}
function invoke(spawnCommand,exe,args,env,stdio){
 let child;
 try{
  child=spawnCommand(exe,args,{
   env:{PATH:env.PATH||'/usr/bin:/bin',LANG:'C'},
   stdio
  });
 }catch{fail('PROGRAM_UNAVAILABLE')}
 if(!child||!child.stdout||typeof child.kill!=='function')
  fail('PROGRAM_UNAVAILABLE');
 return child;
}
function exited(child){
 return new Promise((yes,no)=>{
  child.once('error',()=>no(Error('MVP272_PROGRAM_UNAVAILABLE')));
  child.once('close',code=>yes(code));
 });
}
async function captureZipCommand(spawnCommand,args,env,limit){
 const child=invoke(spawnCommand,'unzip',args,env,['ignore','pipe','ignore']);
 const done=exited(child);
 let data=Buffer.alloc(0);
 try{
  for await(const chunk of child.stdout){
   if(data.length+chunk.length>limit)fail('ZIP_METADATA_TOO_LARGE');
   data=Buffer.concat([data,chunk]);
  }
  if(await done!==0)fail('ZIP_READ_FAILED');
  return data;
 }catch(e){child.kill();throw e}
}
function inspectManifest(raw){
 let m;
 try{m=JSON.parse(raw.toString('utf8'))}catch{fail('MANIFEST_INVALID')}
 if(!m||typeof m!=='object'||Array.isArray(m)||
   Object.keys(m).sort().join(',')!==
    'components,created_at,format,project_ref,restore_verified,source_verified,storage_coverage_verified'||
   m.format!=='cotironda-pilot-mobile-backup-mvp269-v1'||
   m.project_ref!==PILOT_REF||typeof m.created_at!=='string'||
   !Number.isFinite(Date.parse(m.created_at))||
   m.restore_verified!==false||m.source_verified!==false||
   m.storage_coverage_verified!==false||!Array.isArray(m.components)||
   m.components.length!==FILES.length)
  fail('MANIFEST_INVALID');
 for(let i=0;i<FILES.length;i++){
  const a=m.components[i];
  if(!a||typeof a!=='object'||Array.isArray(a)||
     Object.keys(a).sort().join(',')!=='bytes,name,sha256'||
     a.name!==FILES[i]||!Number.isSafeInteger(a.bytes)||a.bytes<=64||
     !SHA.test(a.sha256))fail('MANIFEST_INVALID');
 }
 return m.components;
}
async function verifyCipherMember(zipPath,identityPath,component,env,spawnCommand){
 const unzip=invoke(spawnCommand,'unzip',['-p',zipPath,component.name],
  env,['ignore','pipe','ignore']);
 const age=invoke(spawnCommand,'age',['--decrypt','--identity',identityPath],
  env,['pipe','pipe','ignore']);
 if(!age.stdin)fail('PROGRAM_UNAVAILABLE');
 const unzipDone=exited(unzip),ageDone=exited(age);
 const sha=createHash('sha256');
 let ciphertextBytes=0,decryptedBytes=0;
 const meter=new Transform({
  transform(chunk,_enc,cb){
   ciphertextBytes+=chunk.length;
   if(ciphertextBytes>component.bytes){cb(Error('MVP272_CIPHERTEXT_OVERSIZED'));return}
   sha.update(chunk);cb(null,chunk);
  }
 });
 const drain=(async()=>{
  for await(const chunk of age.stdout){
   decryptedBytes+=chunk.length;
   if(decryptedBytes>MAX_DECRYPTED_COMPONENT)fail('PLAINTEXT_CAP_EXCEEDED');
  }
 })();
 try{
  const [,plain,unzipCode,ageCode]=await Promise.all([
   pipeline(unzip.stdout,meter,age.stdin),
   drain,
   unzipDone,
   ageDone
  ]);
  if(unzipCode!==0||ageCode!==0||decryptedBytes<1||
     ciphertextBytes!==component.bytes||
     sha.digest('hex')!==component.sha256)
   fail('CIPHERTEXT_OR_DECRYPTION_INVALID');
  return {plaintext_bytes_read_and_discarded:decryptedBytes};
 }catch(e){
  unzip.kill();age.kill();
  if(e instanceof Error&&/^MVP272_/u.test(e.message))throw e;
  fail('CIPHERTEXT_OR_DECRYPTION_INVALID');
 }
}
export async function auditMobilePilotZip({
 zipPath,identityPath,expectedSha256,env=process.env,spawnCommand=spawn
}){
 guard(env);
 if(typeof expectedSha256!=='string'||!SHA.test(expectedSha256))
  fail('INDEPENDENT_ZIP_SHA_REQUIRED');
 const zip=await trustedPrivateFile(zipPath);
 const identity=await trustedPrivateFile(identityPath);
 if(zip.path===identity.path)fail('ARCHIVE_IS_IDENTITY');
 if((await hashZip(zip))!==expectedSha256)fail('INDEPENDENT_ZIP_SHA_MISMATCH');
 const rawNames=await captureZipCommand(spawnCommand,['-Z','-1',zip.path],
  env,4096);
 const names=rawNames.toString('utf8').trimEnd().split(/\r?\n/u);
 const expected=[...FILES,META];
 if(names.length!==expected.length||
    JSON.stringify([...names].sort())!==JSON.stringify([...expected].sort()))
  fail('ZIP_MEMBERS_INVALID');
 const rawManifest=await captureZipCommand(spawnCommand,
  ['-p',zip.path,META],env,MAX_MANIFEST);
 const components=inspectManifest(rawManifest);
 let streams=0;
 for(const component of components){
  await verifyCipherMember(zip.path,identity.path,component,env,spawnCommand);
  streams++;
 }
 const after=await trustedPrivateFile(zip.path);
 if(!sameFile(zip.stat,after.stat)||
   (await hashZip(after))!==expectedSha256)
  fail('ARCHIVE_CHANGED_DURING_AUDIT');
 return Object.freeze({
  status:'PILOT_MOBILE_ZIP_AGE_DECRYPTION_VERIFIED_NOT_RESTORED',
  project_ref:PILOT_REF,
  archive_sha256:expectedSha256,
  encrypted_components_checked:components.length,
  age_streams_authenticated:streams,
  plaintext_written_to_disk:false,
  credentialed_network_connections:0,
  postgres_replay_verified:false,
  storage_objects_restored:false,
  managed_supabase_restore_verified:false,
  restore_verified:false,
  source_verified:false,
  storage_coverage_verified:false,
  mobile_download_url_created:false,
  production_touched:false
 });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 auditMobilePilotZip({zipPath:process.argv[2],
  identityPath:process.argv[3],expectedSha256:process.argv[4]})
 .then(result=>console.log(JSON.stringify(result)))
 .catch(e=>{
  console.error(e instanceof Error&&/^MVP272_[A-Z_]+$/u.test(e.message)?
   e.message:'MVP272_AUDIT_FAILED');
  process.exitCode=1;
 });
}
