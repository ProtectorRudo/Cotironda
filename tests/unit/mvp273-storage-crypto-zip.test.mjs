import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {tarHeader} from '../../scripts/ops/export-private-pilot-storage-mvp270.mjs';
import {prepareMobilePilotZip,FILES,PILOT_REF}
 from '../../scripts/ops/package-pilot-mobile-mvp269.mjs';
import {auditPilotMobileStorageBytes}
 from '../../scripts/ops/audit-pilot-mobile-storage-mvp273.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const ready=['age','age-keygen','zip','unzip'].every(name=>
 spawnSync('which',[name],{stdio:'ignore'}).status===0);
const env={PATH:process.env.PATH||'/usr/bin:/bin',
 CI:'false',GITHUB_ACTIONS:'',VERCEL:'',VERCEL_ENV:'',
 COTIRONDA_PILOT_DB_URL:'',COTIRONDA_PILOT_SERVICE_ROLE_KEY:'',
 DATABASE_URL:'',PGHOST:'',PGPORT:'',PGUSER:'',PGPASSWORD:''};
const files=[Buffer.from('invoice sheet example'),Buffer.from('PDF fake 2')];
const records=files.map((item,i)=>({
 bucket:'materials',path:'subdir/test-'+i+'.txt',id:'synthetic-id-'+i,
 size:item.length,updated_at:'2026-11-06T12:00:00Z',
 archive_name:'objects/'+String(i+1).padStart(6,'0')+'.bin',
 sha256:sha(item)
}));
function member(name,body){
 const pad=Buffer.alloc((512-body.length%512)%512);
 return Buffer.concat([tarHeader(name,body.length),body,pad]);
}
function sampleTar({wrongHash=false}={}){
 const items=records.map((r,i)=>member(r.archive_name,files[i]));
 const idx={
  format:'cotironda-pilot-storage-tar-mvp270-v1',
  project_ref:PILOT_REF,
  objects:records.map((r,i)=>({...r,sha256:wrongHash&&i===0?'a'.repeat(64):r.sha256})),
  object_count:records.length,
  declared_total_bytes:files.reduce((n,item)=>n+item.length,0),
  inventory_rechecked:true,restore_verified:false
 };
 items.push(member('objects/index.json',Buffer.from(JSON.stringify(idx)+'\n')));
 items.push(Buffer.alloc(1024));
 return Buffer.concat(items);
}
function call(program,args,options={}){
 const result=spawnSync(program,args,{
  encoding:'utf8',stdio:options.input?undefined:'pipe',...options
 });
 assert.equal(result.status,0,'fixture command failed: '+program);
 return String(result.stdout||'').trim();
}
async function fixture(task,{wrongHash=false}={}){
 const root=await mkdtemp(join(tmpdir(),'cotironda-mvp273-age-'));
 const src=join(root,'src'),keys=join(root,'keys'),dst=join(root,'dst');
 for(const d of [src,keys,dst])await mkdir(d,{mode:0o700});
 const key=join(keys,'key.txt');
 try{
  call('age-keygen',['-o',key]);await chmod(key,0o600);
  const recipient=call('age-keygen',['-y',key]);
  for(let i=0;i<FILES.length;i++){
   const path=join(src,FILES[i]);
   const plain=i===5?sampleTar({wrongHash}):Buffer.from('FAKE SQL '+i+';');
   call('age',['--encrypt','--recipient',recipient,'-o',path],{input:plain});
   await chmod(path,0o600);
  }
  await prepareMobilePilotZip({operation:'seal',sourceDirectory:src,env});
  const zip=join(dst,'pilot-test.zip');
  const packed=await prepareMobilePilotZip({
   operation:'pack',sourceDirectory:src,destinationPath:zip,env
  });
  await task({zip,key,packed});
 }finally{await rm(root,{recursive:true,force:true})}
}
test('MVP273 dedicated CI installs real crypto programs',()=>{
 if(process.env.COTIRONDA_MVP273_REQUIRE_REAL_AGE==='true')
  assert.equal(ready,true,'age, age-keygen, zip, unzip required');
});
test('MVP273 genuine age ZIP decrypts and replays Storage bytes with exact hashes',
 {skip:!ready},async()=>fixture(async({zip,key,packed})=>{
  const r=await auditPilotMobileStorageBytes({
   zipPath:zip,identityPath:key,expectedSha256:packed.sha256,env
  });
  assert.equal(r.status,'PILOT_ENCRYPTED_STORAGE_BYTES_REPLAY_VERIFIED_NOT_RESTORED');
  assert.equal(r.storage_objects_replayed,2);
  assert.equal(r.storage_payload_bytes,files[0].length+files[1].length);
  assert.equal(r.index_hashes_and_timestamps_consistent,true);
  assert.equal(r.restore_verified,false);
  assert.equal(r.storage_service_restored,false);
  assert.equal(r.postgres_sql_replay_verified,false);
  assert.equal(r.plaintext_written_to_disk,false);
  assert.equal(r.network_access_used,false);
  assert.equal(r.download_link_created,false);
 }));
test('MVP273 encrypted content can be authentic but index malicious: fail closed',
 {skip:!ready},async()=>fixture(async({zip,key,packed})=>{
  await assert.rejects(auditPilotMobileStorageBytes({
   zipPath:zip,identityPath:key,expectedSha256:packed.sha256,env
  }),/MVP273_TAR_INDEX_OBJECT_MISMATCH/u);
 },{wrongHash:true}));
test('MVP273 invalid external SHA is rejected before reading Storage',
 {skip:!ready},async()=>fixture(async({zip,key})=>{
  await assert.rejects(auditPilotMobileStorageBytes({
   zipPath:zip,identityPath:key,expectedSha256:'0'.repeat(64),env
  }),/MVP272_INDEPENDENT_ZIP_SHA_MISMATCH/u);
 }));
test('MVP273 stop if pre-audit fabricated or fails closed',async()=>{
 await assert.rejects(auditPilotMobileStorageBytes({
  zipPath:'/fake.zip',identityPath:'/fake.key',expectedSha256:'a'.repeat(64),env,
  auditFn:async()=>({status:'PILOT_MOBILE_ZIP_AGE_DECRYPTION_VERIFIED_NOT_RESTORED',
   project_ref:PILOT_REF,age_streams_authenticated:5,restore_verified:false})
 }),/MVP273_PREREQUISITE_CRYPTO_AUDIT_FAILED/u);
});
