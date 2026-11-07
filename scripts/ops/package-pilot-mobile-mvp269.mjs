/**
 * MVP269 — Prepare ONE mobile-transferable ZIP of ALREADY ENCRYPTED files.
 *
 * The ZIP envelope is NOT encrypted; each payload is encrypted by age.
 * This script does not export a database, download Storage, upload, create
 * public URLs, read secrets, certify provenance, or certify restorability.
 * STRICT local-only for a trusted operator, never CI with genuine data.
 */
import {createHash} from 'node:crypto';
import {constants,createReadStream,createWriteStream} from 'node:fs';
import {lstat,mkdir,open,readFile,readdir,rm,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {dirname,join,parse,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const PILOT_REF='ilggkalaafhtiysyzlmg';
export const FILES=Object.freeze([
 'roles.sql.age','schema.sql.age','data.sql.age',
 'history_schema.sql.age','history_data.sql.age',
 'storage_objects.tar.age'
]);
export const META='mobile-manifest.json';
const INPUTS=Object.freeze([...FILES,META]);
const AGE_HEADER=Buffer.from('age-encryption.org/v1\n','ascii');
const SHA=/^[a-f0-9]{64}$/u;
const fail=(s)=>{throw Error('MVP269_'+s)};
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');

function environmentGuard(env){
 if(process.platform==='win32'||typeof process.getuid!=='function'||
    env.CI==='true'||Boolean(env.GITHUB_ACTIONS)||Boolean(env.VERCEL)||
    Boolean(env.VERCEL_ENV)||Boolean(env.COTIRONDA_CI_AUTH_SANDBOX)||
    Boolean(env.COTIRONDA_CI_WA_PREVIEW_SANDBOX))
  fail('TRUSTED_LOCAL_POSIX_ONLY');
}
function outsideRepository(path){
 const rel=relative(ROOT,path);
 if(rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'))
  fail('REPOSITORY_PATH_FORBIDDEN');
}
async function noSymlinks(path){
 const root=parse(path).root;
 let at=root;
 for(const item of path.slice(root.length).split(sep).filter(Boolean)){
  at=join(at,item);
  const s=await lstat(at).catch(()=>fail('PATH_MISSING'));
  if(s.isSymbolicLink())fail('SYMLINK_FORBIDDEN');
 }
}
function ownerAndMode(st,dir){
 if(st.uid!==process.getuid()||(st.mode&0o077)!==0||
   (dir?!st.isDirectory():!st.isFile()||st.nlink!==1))
  fail('UNSAFE_PRIVATE_PERMISSIONS');
}
async function privateDirectory(directory){
 if(typeof directory!=='string'||!directory.startsWith('/'))
  fail('ABSOLUTE_DIRECTORY_REQUIRED');
 const full=resolve(directory);
 outsideRepository(full);
 await noSymlinks(full);
 ownerAndMode(await lstat(full),true);
 return full;
}
async function privateFile(path){
 await noSymlinks(path);
 const before=await lstat(path);
 ownerAndMode(before,false);
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0))
  .catch(()=>fail('FILE_OPEN_FAILED'));
 try{
  const after=await handle.stat();
  ownerAndMode(after,false);
  if(before.dev!==after.dev||before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||
     before.ctimeMs!==after.ctimeMs||before.size!==after.size)fail('FILE_CHANGED');
  return handle;
 }catch(e){await handle.close();throw e}
}
async function shaFile(path,{encrypted}={}){
 const handle=await privateFile(path);
 try{
  const before=await handle.stat();
  if(before.size<64||!Number.isSafeInteger(before.size))
   fail('FILE_EMPTY_OR_INVALID');
  if(encrypted){
   const header=Buffer.alloc(AGE_HEADER.length);
   const {bytesRead}=await handle.read(header,0,header.length,0);
   if(bytesRead!==header.length||!header.equals(AGE_HEADER))
    fail('AGE_HEADER_INVALID');
  }
  const hash=createHash('sha256');
  for await(const part of handle.createReadStream({autoClose:false,start:0}))
   hash.update(part);
  const after=await handle.stat();
  if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||
     after.ctimeMs!==before.ctimeMs||after.ino!==before.ino)
   fail('FILE_CHANGED');
  return {bytes:before.size,sha256:hash.digest('hex')};
 }finally{await handle.close()}
}
async function inspectFiles(folder){
 const entries=(await readdir(folder)).sort();
 const admissible=new Set(INPUTS);
 if(entries.some(name=>!admissible.has(name)))fail('UNEXPECTED_FILE');
 if(FILES.some(name=>!entries.includes(name)))fail('MISSING_ENCRYPTED_COMPONENT');
 const components=[];
 for(const name of FILES){
  const proof=await shaFile(join(folder,name),{encrypted:true});
  components.push({name,...proof});
 }
 return components;
}
function checkManifest(m,components){
 if(!m||typeof m!=='object'||Array.isArray(m)||
    Object.keys(m).sort().join(',')!=='components,created_at,format,project_ref,restore_verified,source_verified,storage_coverage_verified')
  fail('MANIFEST_UNTRUSTED');
 if(m.format!=='cotironda-pilot-mobile-backup-mvp269-v1'||
    m.project_ref!==PILOT_REF||
    typeof m.created_at!=='string'||!Number.isFinite(Date.parse(m.created_at))||
    m.restore_verified!==false||m.source_verified!==false||
    m.storage_coverage_verified!==false||
    JSON.stringify(m.components)!==JSON.stringify(components))
  fail('MANIFEST_MISMATCH');
}
async function existingManifest(folder,components){
 const raw=await readFile(join(folder,META),'utf8');
 if(Buffer.byteLength(raw)>65536)fail('MANIFEST_TOO_LARGE');
 let parsed;
 try{parsed=JSON.parse(raw)}catch{fail('MANIFEST_INVALID')}
 checkManifest(parsed,components);
 return shaFile(join(folder,META));
}
async function command(program,args,{cwd,env},outputLimit=8192){
 const child=spawn(program,args,{cwd,env:{PATH:env.PATH||'/usr/bin:/bin',LANG:'C'},stdio:['ignore','pipe','ignore']});
 let buf='';let failed=false;
 child.stdout.on('data',bytes=>{
  buf+=bytes.toString('utf8');
  if(buf.length>outputLimit){failed=true;child.kill()}
 });
 const exit=await new Promise((ok,reject)=>{
  child.once('close',ok);child.once('error',reject);
 }).catch(()=>fail('ARCHIVER_UNAVAILABLE'));
 if(exit!==0||failed)fail('ARCHIVE_CHECK_FAILED');
 return buf.trim();
}
async function verifyZip(dest,expected,env){
 const names=(await command('unzip',['-Z','-1',dest],{env})).split(/\r?\n/u);
 if(JSON.stringify(names.slice().sort())!==JSON.stringify(INPUTS.slice().sort()))
  fail('ZIP_UNEXPECTED_ENTRIES');
 for(const item of expected){
  const child=spawn('unzip',['-p',dest,item.name],{
   env:{PATH:env.PATH||'/usr/bin:/bin',LANG:'C'},stdio:['ignore','pipe','ignore']});
  const hash=createHash('sha256');let size=0;
  child.stdout.on('data',chunk=>{size+=chunk.length;hash.update(chunk)});
  const exit=await new Promise((ok,reject)=>{
   child.once('close',ok);child.once('error',reject);
  }).catch(()=>fail('ZIP_READ_FAILED'));
  if(exit!==0||size!==item.bytes||hash.digest('hex')!==item.sha256)
   fail('ZIP_INTEGRITY_FAILED');
 }
}
export async function prepareMobilePilotZip({
 operation,sourceDirectory,destinationPath,env=process.env
}){
 environmentGuard(env);
 const folder=await privateDirectory(sourceDirectory);
 const pieces=await inspectFiles(folder);
 if(operation==='seal'){
  if((await readdir(folder)).includes(META))fail('ALREADY_SEALED');
  const manifest={
   format:'cotironda-pilot-mobile-backup-mvp269-v1',
   project_ref:PILOT_REF,created_at:new Date().toISOString(),
   components:pieces,source_verified:false,
   storage_coverage_verified:false,restore_verified:false
  };
  const file=await open(join(folder,META),'wx',0o600)
   .catch(()=>fail('MANIFEST_CREATE_FAILED'));
  try{await file.writeFile(JSON.stringify(manifest,null,2)+'\n','utf8')}
  finally{await file.close()}
  return Object.freeze({status:'SEALED_CIPHERTEXT_ONLY_NOT_VERIFIED_BACKUP',
   pieces:FILES.length,restore_verified:false,source_verified:false,
   storage_coverage_verified:false,no_public_url:true});
 }
 if(operation!=='pack')fail('OPERATION_INVALID');
 if(typeof destinationPath!=='string'||!destinationPath.startsWith('/')||
    !destinationPath.endsWith('.zip'))fail('ZIP_ABSOLUTE_PATH_REQUIRED');
 const output=resolve(destinationPath);
 outsideRepository(output);
 if(output===folder||output.startsWith(folder+sep))fail('OUTPUT_INSIDE_SOURCE');
 const parent=await privateDirectory(dirname(output));
 if(parent===folder)fail('OUTPUT_INSIDE_SOURCE');
 const meta=await existingManifest(folder,pieces);
 const expected=[...pieces,{name:META,...meta}];
 // Exclusive handle stays open: never reopen the path with flags:'w'.
 // This also prevents a competing process from inserting its own ZIP between
 // an initial O_EXCL check and the bytes being written.
 const file=await open(output,'wx',0o600).catch(()=>fail('OUTPUT_ALREADY_EXISTS'));
 const owned=await file.stat();
 let openHandle=true;
 try{
  const zip=spawn('zip',['-q','-0','-X','-D','-',...INPUTS],{
   cwd:folder,env:{PATH:env.PATH||'/usr/bin:/bin',LANG:'C'},
   stdio:['ignore','pipe','ignore']});
  const exited=new Promise((ok,reject)=>{
   zip.once('close',ok);zip.once('error',reject);
  });
  const [,zipExit]=await Promise.all([
   pipeline(zip.stdout,file.createWriteStream({autoClose:true})),
   exited
  ]);
  if(zipExit!==0)fail('ZIP_WRITE_FAILED');
  // With autoClose:true the pipeline waits for the original FD to close.
  // No path-based reopen, and no pending FileHandle close promise.
  openHandle=false;
  const stillOurs=async()=>{
   const now=await lstat(output).catch(()=>fail('OUTPUT_REPLACED'));
   if(!now.isFile()||now.dev!==owned.dev||now.ino!==owned.ino)
    fail('OUTPUT_REPLACED');
  };
  await stillOurs();
  // Validate every member against the independently hashed source, then
  // compare inventory again. The ZIP file must still be OUR inode.
  await verifyZip(output,expected,env);
  const again=await inspectFiles(folder);
  const metaAgain=await existingManifest(folder,again);
  if(JSON.stringify(again)!==JSON.stringify(pieces)||
     JSON.stringify(metaAgain)!==JSON.stringify(meta))
   fail('SOURCE_CHANGED_DURING_PACKAGING');
  const zipped=await shaFile(output);
  await stillOurs();
  return Object.freeze({status:'MOBILE_ZIP_ENCRYPTED_CONTENT_CANDIDATE',
   filename:output.split(sep).at(-1),sha256:zipped.sha256,
   bytes:zipped.bytes,pieces:FILES.length,
   original_storage_objects_verified:false,restore_verified:false,
   source_verified:false,storage_coverage_verified:false,
   download_link_created:false,public_upload:false});
 }catch(e){
  if(openHandle)await file.close().catch(()=>{});
  // NEVER remove another process's ZIP if the path has been replaced.
  const now=await lstat(output).catch(()=>null);
  if(now?.dev===owned.dev&&now?.ino===owned.ino)
   await rm(output,{force:true}).catch(()=>{});
  if(e instanceof Error&&/^MVP269_/.test(e.message))throw e;
  fail('ARCHIVE_FAILED');
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 prepareMobilePilotZip({operation:process.argv[2],sourceDirectory:process.argv[3],
  destinationPath:process.argv[4]})
  .then(value=>console.log(JSON.stringify(value)))
  .catch(e=>{console.error(e instanceof Error&&/^MVP269_/.test(e.message)?
   e.message:'MVP269_FAILED');process.exitCode=1});
}
