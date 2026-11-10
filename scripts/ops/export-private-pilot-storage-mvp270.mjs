/**
 * MVP270: stream private PILOT Storage objects into an age-encrypted TAR.
 * Run ONLY on a trusted POSIX host. NEVER in Vercel, CI or a browser.
 * No plaintext objects on disk. No user-specific paths in the TAR headers:
 * its encrypted index maps opaque numeric entries to bucket/object paths.
 * A stable before/after inventory is evidence of coverage, NOT full restore.
 */
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {lstat,open,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {dirname,join,parse,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const PILOT_REF='ilggkalaafhtiysyzlmg';
export const PILOT_STORAGE_ORIGIN='https://'+PILOT_REF+'.supabase.co';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const AGE_RECIPIENT=/^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/u;
const AGE_HEADER=Buffer.from('age-encryption.org/v1\n','ascii');
const MAX_OBJECTS=5000;
const MAX_BYTES=256*1024*1024;
const PAGE=100;
const fail=reason=>{throw Error('MVP270_'+reason)};

function guardEnvironment(env){
 if(process.platform==='win32'||typeof process.getuid!=='function'||
   (Boolean(env.CI)&&env.CI!=='false')||Boolean(env.GITHUB_ACTIONS)||
   Boolean(env.VERCEL)||Boolean(env.VERCEL_ENV)||
   Boolean(env.COTIRONDA_CI_AUTH_SANDBOX)||
   Boolean(env.COTIRONDA_CI_WA_PREVIEW_SANDBOX))
  fail('LOCAL_TRUSTED_HOST_REQUIRED');
}
function privateOutsideRepo(path){
 const rel=relative(ROOT,path);
 if(rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'))
  fail('REPOSITORY_PATH_FORBIDDEN');
}
async function checkedPath(path,dir){
 if(typeof path!=='string'||!path.startsWith('/'))fail('ABSOLUTE_PATH_REQUIRED');
 const full=resolve(path),root=parse(full).root;
 privateOutsideRepo(full);
 let at=root;
 for(const part of full.slice(root.length).split(sep).filter(Boolean)){
  at=join(at,part);
  const st=await lstat(at).catch(()=>fail('PATH_NOT_FOUND'));
  if(st.isSymbolicLink())fail('SYMLINK_FORBIDDEN');
 }
 const st=await lstat(full);
 if(st.uid!==process.getuid()||(st.mode&0o077)!==0||
    (dir?!st.isDirectory():!st.isFile()||st.nlink!==1))
  fail('PRIVATE_PERMISSIONS_REQUIRED');
 return full;
}
async function verifyRecipient(identityPath,recipient,env,spawnCommand){
 const identity=await checkedPath(identityPath,false);
 const child=spawnCommand('age-keygen',['-y',identity],{
  env:{PATH:env.PATH||'/usr/bin:/bin',LANG:'C'},
  stdio:['ignore','pipe','ignore']
 });
 let s='';
 child.stdout.on('data',v=>{
  s+=v.toString('utf8');
  if(s.length>128)child.kill();
 });
 const code=await new Promise((yes,no)=>{
  child.once('error',no);child.once('close',yes);
 }).catch(()=>fail('AGE_IDENTITY_INVALID'));
 if(code!==0||s.trim()!==recipient)fail('AGE_RECIPIENT_NOT_RECOVERABLE');
}
function validateCredentials(key,recipient){
 if(typeof key!=='string'||key.length<32||key.length>4096||
   /[\s\x00-\x1f]/u.test(key)||typeof recipient!=='string'||
   !AGE_RECIPIENT.test(recipient))fail('CREDENTIALS_INVALID');
}
function nameOk(name){
 return typeof name==='string'&&name.length>0&&
  Buffer.byteLength(name,'utf8')<=1024&&!/[\\\x00-\x1f\x7f]/u.test(name)&&
  name.split('/').every(x=>x!==''&&x!=='.'&&x!=='..');
}
function requestHeaders(secret,json=false){
 return {apikey:secret,Authorization:'Bearer '+secret,
  ...(json?{'Content-Type':'application/json'}:{})};
}
async function jsonRequest(fetchFn,url,secret,{method='GET',body}={}){
 let r;
 try{
  r=await fetchFn(url,{
   method,headers:requestHeaders(secret,body!==undefined),
   body:body===undefined?undefined:JSON.stringify(body),
   redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)
  });
 }catch{fail('STORAGE_API_UNAVAILABLE')}
 if(r.status!==200)fail('STORAGE_API_REJECTED');
 const len=Number(r.headers?.get?.('content-length')||0);
 if(len>2*1024*1024)fail('INVENTORY_TOO_LARGE');
 let obj;
 try{obj=await r.json()}catch{fail('INVALID_API_JSON')}
 return obj;
}
async function discoverBuckets(fetchFn,secret){
 const result=await jsonRequest(fetchFn,PILOT_STORAGE_ORIGIN+'/storage/v1/bucket',secret);
 if(!Array.isArray(result)||result.length>100)fail('BUCKET_DISCOVERY_INCOMPLETE');
 const seen=new Set(),buckets=[];
 for(const b of result){
  if(!b||!nameOk(b.id)||typeof b.public!=='boolean'||
      seen.has(b.id))fail('BUCKET_INVENTORY_INVALID');
  if(b.public)fail('PUBLIC_BUCKET_REQUIRES_SEPARATE_POLICY');
  seen.add(b.id);buckets.push(b.id);
 }
 buckets.sort();
 return buckets;
}
async function listObjects(fetchFn,secret,bucket,prefix,acc,folders){
 if(folders.size>MAX_OBJECTS||acc.length>MAX_OBJECTS)
  fail('OBJECT_COUNT_LIMIT');
 if(folders.has(bucket+'\0'+prefix))fail('FOLDER_CYCLE');
 folders.add(bucket+'\0'+prefix);
 let offset=0;
 for(;;){
  const url=PILOT_STORAGE_ORIGIN+'/storage/v1/object/list/'+encodeURIComponent(bucket);
  const page=await jsonRequest(fetchFn,url,secret,{
   method:'POST',body:{prefix,limit:PAGE,offset,
    sortBy:{column:'name',order:'asc'}}
  });
  if(!Array.isArray(page)||page.length>PAGE)fail('PAGE_INVALID');
  for(const item of page){
   if(!item||typeof item.name!=='string'||!nameOk(item.name)||
      item.name.includes('/'))fail('OBJECT_PATH_INVALID');
   const full=prefix+item.name;
   if(!nameOk(full))fail('OBJECT_PATH_INVALID');
   if(item.id===null){
    await listObjects(fetchFn,secret,bucket,full+'/',acc,folders);
    continue;
   }
   if(typeof item.id!=='string'||!item.id||
      !item.metadata||!Number.isSafeInteger(Number(item.metadata.size))||
      Number(item.metadata.size)<0||
      typeof item.updated_at!=='string'||!Number.isFinite(Date.parse(item.updated_at)))
    fail('OBJECT_METADATA_INCOMPLETE');
   acc.push({bucket,path:full,id:item.id,size:Number(item.metadata.size),
    updated_at:item.updated_at});
   if(acc.length>MAX_OBJECTS)fail('OBJECT_COUNT_LIMIT');
  }
  if(page.length<PAGE)break;
  offset+=PAGE;
  if(offset>MAX_OBJECTS+PAGE)fail('PAGINATION_LIMIT');
 }
}
export async function inventoryPilotStorage({secret,fetchFn=fetch}){
 const buckets=await discoverBuckets(fetchFn,secret);
 const objects=[];
 for(const bucket of buckets)
  await listObjects(fetchFn,secret,bucket,'',objects,new Set());
 objects.sort((a,b)=>
  a.bucket.localeCompare(b.bucket)||a.path.localeCompare(b.path));
 const seen=new Set();let bytes=0;
 for(const o of objects){
  const id=o.bucket+'\0'+o.path;
  if(seen.has(id))fail('DUPLICATE_OBJECT');
  seen.add(id);bytes+=o.size;
  if(bytes>MAX_BYTES)fail('OBJECT_BYTES_LIMIT');
 }
 return {buckets,objects,bytes};
}
function octal(buf,offset,length,number){
 const value=number.toString(8).padStart(length-1,'0');
 if(value.length>length-1)fail('TAR_SIZE_UNSUPPORTED');
 buf.write(value+'\0',offset,length,'ascii');
}
export function tarHeader(name,size){
 if(!/^[a-z0-9._/-]+$/u.test(name)||name.length>100||
    name.split('/').some(x=>!x||x==='.'||x==='..')||
    !Number.isSafeInteger(size)||size<0)fail('TAR_HEADER_INVALID');
 const h=Buffer.alloc(512);
 h.write(name,0,100,'ascii');
 octal(h,100,8,0o600);
 octal(h,108,8,0);
 octal(h,116,8,0);
 octal(h,124,12,size);
 octal(h,136,12,0);
 h.fill(32,148,156);
 h.write('0',156,1,'ascii');
 h.write('ustar\0',257,6,'ascii');
 h.write('00',263,2,'ascii');
 const sum=h.reduce((n,v)=>n+v,0);
 const sumText=sum.toString(8).padStart(6,'0');
 h.write(sumText+'\0 ',148,8,'ascii');
 return h;
}
const pad=size=>(512-(size%512))%512;
async function* archive({objects,buckets,secret,fetchFn}){
 const verified=[];
 for(let i=0;i<objects.length;i++){
  const o=objects[i];
  const name='objects/'+String(i+1).padStart(6,'0')+'.bin';
  const encoded=o.path.split('/').map(encodeURIComponent).join('/');
  const endpoint=PILOT_STORAGE_ORIGIN+'/storage/v1/object/authenticated/'+
   encodeURIComponent(o.bucket)+'/'+encoded;
  let response;
  try{
   response=await fetchFn(endpoint,{method:'GET',
    headers:requestHeaders(secret),redirect:'manual',
    cache:'no-store',signal:AbortSignal.timeout(60000)});
  }catch{fail('OBJECT_DOWNLOAD_FAILED')}
  if(response.status!==200||!response.body)fail('OBJECT_DOWNLOAD_REJECTED');
  const len=response.headers?.get?.('content-length');
  if(len!==null&&len!==undefined&&len!==''&&Number(len)!==o.size)
   fail('OBJECT_SIZE_CONFLICT');
  yield tarHeader(name,o.size);
  let actual=0;
  const digest=createHash('sha256');
  try{
   for await(const chunk of response.body){
    const bytes=Buffer.from(chunk);
    actual+=bytes.length;
    if(actual>o.size)fail('OBJECT_EXCEEDS_DECLARED_SIZE');
    digest.update(bytes);
    yield bytes;
   }
  }catch(e){
   if(e instanceof Error&&/^MVP270_/u.test(e.message))throw e;
   fail('OBJECT_STREAM_INTERRUPTED');
  }
  if(actual!==o.size)fail('OBJECT_TRUNCATED');
  if(pad(actual))yield Buffer.alloc(pad(actual));
  verified.push({...o,archive_name:name,sha256:digest.digest('hex')});
 }
 const after=await inventoryPilotStorage({secret,fetchFn});
 if(JSON.stringify(after.buckets)!==JSON.stringify(buckets)||
    JSON.stringify(after.objects)!==JSON.stringify(objects))
  fail('STORAGE_CHANGED_DURING_EXPORT');
 const index=Buffer.from(JSON.stringify({
  format:'cotironda-pilot-storage-tar-mvp270-v1',project_ref:PILOT_REF,
  objects:verified,object_count:verified.length,declared_total_bytes:after.bytes,
  inventory_rechecked:true,restore_verified:false
 })+'\n','utf8');
 if(index.length>2*1024*1024)fail('INDEX_TOO_LARGE');
 yield tarHeader('objects/index.json',index.length);
 yield index;
 if(pad(index.length))yield Buffer.alloc(pad(index.length));
 yield Buffer.alloc(1024);
}
export async function exportPilotStorageEncrypted({
 sourceDirectory,env=process.env,fetchFn=fetch,
 spawnCommand=spawn,checkIdentity=verifyRecipient
}){
 guardEnvironment(env);
 const secret=env.COTIRONDA_PILOT_SERVICE_ROLE_KEY;
 const recipient=env.COTIRONDA_AGE_RECIPIENT;
 validateCredentials(secret,recipient);
 const folder=await checkedPath(sourceDirectory,true);
 await checkIdentity(env.COTIRONDA_AGE_IDENTITY_FILE,recipient,env,spawnCommand);
 const output=join(folder,'storage_objects.tar.age');
 // Baseline inventory before writing any sensitive bytes.
 const baseline=await inventoryPilotStorage({secret,fetchFn});
 const file=await open(output,'wx',0o600).catch(()=>fail('OUTPUT_EXISTS'));
 await file.close();
 let child;
 try{
  child=spawnCommand('age',['--encrypt','--recipient',recipient],{
   env:{PATH:env.PATH||'/usr/bin:/bin',LANG:'C'},
   stdio:['pipe','pipe','ignore']});
  if(!child.stdin||!child.stdout)fail('AGE_UNAVAILABLE');
  const closed=new Promise((yes,no)=>{
   child.once('close',yes);child.once('error',no);
  });
  const producers=pipeline(Readable.from(archive({
   ...baseline,secret,fetchFn
  })),child.stdin);
  const consumer=pipeline(child.stdout,createWriteStream(output,{
   flags:'w',mode:0o600
  }));
  const [,,exitCode]=await Promise.all([producers,consumer,closed]);
  if(exitCode!==0)fail('AGE_ENCRYPTION_FAILED');
  const handle=await open(output,'r');
  let length=0;
  try{
   const st=await handle.stat();length=st.size;
   const header=Buffer.alloc(AGE_HEADER.length);
   const {bytesRead}=await handle.read(header,0,header.length,0);
   if(st.size<=64||bytesRead!==header.length||
       !header.equals(AGE_HEADER))fail('AGE_OUTPUT_INVALID');
  }finally{await handle.close()}
  return Object.freeze({
   status:'PILOT_STORAGE_CIPHERTEXT_CREATED_NOT_RESTORED',
   project_ref:PILOT_REF,encrypted_storage_archive:true,
   storage_objects_downloaded:baseline.objects.length,
   storage_bytes_verified:baseline.bytes,
   object_inventory_rechecked:true,restore_verified:false,
   sql_included:false,mobile_zip_created:false,
   no_plaintext_written:true
  });
 }catch(e){
  child?.kill?.();
  await rm(output,{force:true}).catch(()=>{});
  if(e instanceof Error&&/^MVP270_/u.test(e.message))throw e;
  fail('EXPORT_FAILED');
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 exportPilotStorageEncrypted({sourceDirectory:process.argv[2]})
  .then(result=>console.log(JSON.stringify(result)))
  .catch(e=>{
   console.error(e instanceof Error&&/^MVP270_/u.test(e.message)?
    e.message:'MVP270_EXPORT_FAILED');
   process.exitCode=1;
  });
}