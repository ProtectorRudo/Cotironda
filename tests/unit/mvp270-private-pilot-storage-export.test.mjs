import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {exportPilotStorageEncrypted,inventoryPilotStorage,
 tarHeader,PILOT_STORAGE_ORIGIN,PILOT_REF}
 from '../../scripts/ops/export-private-pilot-storage-mvp270.mjs';

const recipient='age1'+'q'.repeat(58);
const secret='s'.repeat(64);
const env={CI:'false',GITHUB_ACTIONS:'',VERCEL:'',
 VERCEL_ENV:'',COTIRONDA_PILOT_SERVICE_ROLE_KEY:secret,
 COTIRONDA_AGE_RECIPIENT:recipient,COTIRONDA_AGE_IDENTITY_FILE:'/fake/test'};
const time='2026-11-06T12:00:00Z';
function json(value,status=200){
 return new Response(JSON.stringify(value),{
  status,headers:{'Content-Type':'application/json'}
 });
}
const bytes=new Map([['docs/quote.pdf',Buffer.from('p-d-f')],
 ['readme.txt',Buffer.from('hey')]]);
function fakeStorage({mutate=false,redirect=false,truncated=false,
 publicBucket=false,invalidPath=false}={}){
 const calls=[];
 let folderCalls=0;
 const fetchFn=async(url,init)=>{
  assert.ok(url.startsWith(PILOT_STORAGE_ORIGIN+'/storage/v1/'));
  assert.equal(init.redirect,'manual');
  assert.equal(init.headers.apikey,secret);
  assert.equal(init.headers.Authorization,'Bearer '+secret);
  calls.push({url,method:init.method});
  if(url.endsWith('/storage/v1/bucket'))
   return json([{id:'private-documents',name:'private-documents',public:publicBucket}]);
  if(url.includes('/storage/v1/object/list/')){
   const params=JSON.parse(init.body);
   assert.equal(params.limit,100);
   if(params.prefix===''){
    return json([
     {name:invalidPath?'..':'docs',id:null},
     {name:'readme.txt',id:'file-1',metadata:{size:3},updated_at:time}
    ]);
   }
   if(params.prefix==='docs/'){
    folderCalls++;
    return json([{
     name:'quote.pdf',id:'file-2',metadata:{size:mutate&&folderCalls>1?6:5},
     updated_at:time
    }]);
   }
   throw Error('unexpected folder path');
  }
  if(url.includes('/storage/v1/object/authenticated/')){
   if(redirect)return new Response(null,{status:302,headers:{Location:'https://evil.invalid'}});
   const suffix=url.split('/private-documents/').at(-1);
   const body=bytes.get(decodeURIComponent(suffix));
   assert.ok(body);
   const payload=truncated?body.subarray(0,body.length-1):body;
   return new Response(payload,{status:200,
    headers:{'content-length':String(body.length)}});
  }
  throw Error('Unexpected API path');
 };
 return {fetchFn,calls};
}
function syntheticAgeSpawner(){
 return (program,args,options)=>{
  assert.equal(program,'age');
  assert.deepEqual(args,['--encrypt','--recipient',recipient]);
  assert.ok(!JSON.stringify(options.env).includes(secret));
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stdout=new PassThrough();
  child.kill=()=>{child.stdin.destroy();child.stdout.destroy()};
  // This is NOT encryption: tests can inspect the TAR. Never used with real data.
  child.stdout.write(Buffer.from('age-encryption.org/v1\n'));
  child.stdin.pipe(child.stdout);
  child.stdin.once('end',()=>setImmediate(()=>child.emit('close',0)));
  return child;
 };
}
async function fixture(run){
 const root=await mkdtemp(join(tmpdir(),'cotironda-pilot-storage-mvp270-'));
 const dir=join(root,'backup');
 await mkdir(dir,{mode:0o700});
 try{return await run(dir)}
 finally{await rm(root,{recursive:true,force:true})}
}
function args(dir,extras={}){
 return {sourceDirectory:dir,env,checkIdentity:async()=>true,
  spawnCommand:syntheticAgeSpawner(),...extras};
}
function tarEntries(file){
 let offset=Buffer.from('age-encryption.org/v1\n').length;
 const result=[];
 while(offset+512<=file.length){
  const header=file.subarray(offset,offset+512);
  if(header.every(v=>v===0))break;
  const name=header.toString('utf8',0,100).replace(/\0.*$/u,'');
  const oct=header.toString('ascii',124,136).replace(/\0.*$/u,'').trim();
  const size=Number.parseInt(oct,8);
  assert.ok(Number.isFinite(size)&&size>=0);
  const data=file.subarray(offset+512,offset+512+size);
  result.push({name,data});
  offset+=512+Math.ceil(size/512)*512;
 }
 return result;
}
test('MVP270: discovers nested private files and confirms size before export',async()=>{
 const client=fakeStorage();
 const inv=await inventoryPilotStorage({secret,fetchFn:client.fetchFn});
 assert.deepEqual(inv.buckets,['private-documents']);
 assert.deepEqual(inv.objects.map(x=>x.path),['docs/quote.pdf','readme.txt']);
 assert.equal(inv.bytes,8);
 assert.ok(client.calls.every(x=>x.url.startsWith(PILOT_STORAGE_ORIGIN)));
});
test('MVP270: real bytes stream to TAR with verified SHA and private archive path',
 async()=>fixture(async dir=>{
  const client=fakeStorage();
  const res=await exportPilotStorageEncrypted(args(dir,{fetchFn:client.fetchFn}));
  assert.equal(res.status,'PILOT_STORAGE_CIPHERTEXT_CREATED_NOT_RESTORED');
  assert.equal(res.project_ref,PILOT_REF);
  assert.equal(res.storage_objects_downloaded,2);
  assert.equal(res.storage_bytes_verified,8);
  assert.equal(res.object_inventory_rechecked,true);
  assert.equal(res.restore_verified,false);
  assert.equal(res.mobile_zip_created,false);
  const entries=tarEntries(await readFile(join(dir,'storage_objects.tar.age')));
  assert.deepEqual(entries.map(x=>x.name),
   ['objects/000001.bin','objects/000002.bin','objects/index.json']);
  assert.deepEqual(entries[0].data,bytes.get('docs/quote.pdf'));
  assert.deepEqual(entries[1].data,bytes.get('readme.txt'));
  const index=JSON.parse(entries[2].data.toString());
  assert.equal(index.project_ref,PILOT_REF);
  assert.equal(index.object_count,2);
  assert.equal(index.inventory_rechecked,true);
  assert.equal(index.restore_verified,false);
  assert.deepEqual(index.objects.map(x=>x.path),['docs/quote.pdf','readme.txt']);
  assert.ok(index.objects.every(x=>/^[a-f0-9]{64}$/u.test(x.sha256)));
  assert.equal((await stat(join(dir,'storage_objects.tar.age'))).mode&0o077,0);
  assert.ok(client.calls.some(x=>x.url.includes('/object/authenticated/')));
 }));
test('MVP270: any changing catalog forces failure, deletes partial ciphertext',
 async()=>fixture(async dir=>{
  await assert.rejects(
   exportPilotStorageEncrypted(args(dir,{fetchFn:fakeStorage({mutate:true}).fetchFn})),
   /MVP270_STORAGE_CHANGED_DURING_EXPORT/u);
  assert.deepEqual(await readdir(dir),[]);
 }));
test('MVP270: refuses unsafe folder names, public buckets, redirects and truncated files',
 async()=>{
  for(const scenario of [
   {invalidPath:true},{publicBucket:true},{redirect:true},{truncated:true}
  ])await fixture(async dir=>{
   await assert.rejects(exportPilotStorageEncrypted(args(dir,{
    fetchFn:fakeStorage(scenario).fetchFn
   })),/MVP270_/u);
   assert.deepEqual(await readdir(dir),[]);
  });
 });
test('MVP270: no real traffic in CI, Vercel or with incorrect credential',
 async()=>fixture(async dir=>{
  const fetchFn=()=>{throw Error('network must never be invoked')};
  for(const delta of [{CI:'true'},{GITHUB_ACTIONS:'true'},
    {VERCEL_ENV:'preview'},{COTIRONDA_PILOT_SERVICE_ROLE_KEY:'short'}]){
   await assert.rejects(exportPilotStorageEncrypted(args(dir,{
    env:{...env,...delta},fetchFn
   })),/MVP270_/u);
  }
  assert.deepEqual(await readdir(dir),[]);
 }));
test('MVP270: exact TAR header, read-only semantics, empty names rejected',()=>{
 const h=tarHeader('objects/000001.bin',8);
 assert.equal(h.length,512);
 assert.equal(h.toString('ascii',257,262),'ustar');
 assert.equal(h.toString('ascii',0,18),'objects/000001.bin');
 assert.throws(()=>tarHeader('../unsafe',4),/MVP270_TAR_HEADER_INVALID/u);
 assert.throws(()=>tarHeader('safe',-1),/MVP270_TAR_HEADER_INVALID/u);
});
