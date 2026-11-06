import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,stat,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivatePilotMobileBackup}
 from '../../scripts/ops/create-private-pilot-mobile-backup-mvp271.mjs';
import {PILOT_REF,FILES,META}
 from '../../scripts/ops/package-pilot-mobile-mvp269.mjs';

const env={PATH:process.env.PATH||'/usr/bin:/bin',CI:'false',
 GITHUB_ACTIONS:'',VERCEL:'',VERCEL_ENV:'',
 COTIRONDA_PILOT_DB_URL:'postgresql://postgres:FAKE@db.'+PILOT_REF+
 '.supabase.co:5432/postgres?sslmode=require',
 COTIRONDA_AGE_RECIPIENT:'age1'+'q'.repeat(58),
 COTIRONDA_PILOT_SERVICE_ROLE_KEY:'q'.repeat(64),
 COTIRONDA_AGE_IDENTITY_FILE:'/fake/for-tests'};
const fakeCipher=Buffer.concat([Buffer.from('age-encryption.org/v1\n'),
 Buffer.alloc(120,77)]);
const toolsAvailable=spawnSync('zip',['-v'],{stdio:'ignore'}).status===0&&
 spawnSync('unzip',['-v'],{stdio:'ignore'}).status===0;
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'cotironda-private-mobile-mvp271-'));
 const source=join(root,'source');
 const outdir=join(root,'downloads');
 await mkdir(outdir,{mode:0o700});
 const destinationZip=join(outdir,'cotironda-piloto-cifrado.zip');
 try{return await fn({root,source,outdir,destinationZip})}
 finally{await rm(root,{recursive:true,force:true})}
}
const fakeSql=async({directory,connectionUrl,recipient,rawEnv})=>{
 assert.equal(connectionUrl,env.COTIRONDA_PILOT_DB_URL);
 assert.equal(recipient,env.COTIRONDA_AGE_RECIPIENT);
 assert.equal(rawEnv.CI,'false');
 for(const file of FILES.slice(0,5))
  await writeFile(join(directory,file),fakeCipher,{mode:0o600});
 return {status:'PILOT_SQL_CIPHERTEXT_CREATED_NOT_RESTORED',
  project_ref:PILOT_REF,pieces:5,restore_verified:false,
  sql_plaintext_on_disk:false};
};
const fakeStorage=async({sourceDirectory})=>{
 await writeFile(join(sourceDirectory,'storage_objects.tar.age'),fakeCipher,{mode:0o600});
 return {status:'PILOT_STORAGE_CIPHERTEXT_CREATED_NOT_RESTORED',
  project_ref:PILOT_REF,restore_verified:false,
  object_inventory_rechecked:true,no_plaintext_written:true,
  storage_objects_downloaded:2,storage_bytes_verified:8};
};
const opts=(p,x={})=>({...p,env,sqlFn:fakeSql,storageFn:fakeStorage,...x});
test('MVP271 one command: real ZIP with 5 SQL + Storage cipher blocks, no plaintext',
 {skip:!toolsAvailable},async()=>fixture(async p=>{
  const r=await createPrivatePilotMobileBackup(opts({
   sourceDirectory:p.source,destinationZip:p.destinationZip
  }));
  assert.equal(r.status,'PILOT_MOBILE_ENCRYPTED_ZIP_CANDIDATE_NOT_RESTORED');
  assert.equal(r.project_ref,PILOT_REF);
  assert.equal(r.sql_pieces,5);
  assert.equal(r.storage_objects_downloaded,2);
  assert.equal(r.mobile_download_url_created,false);
  assert.equal(r.restore_verified,false);
  assert.ok(/^[a-f0-9]{64}$/u.test(r.sha256));
  assert.ok(r.bytes>6*100);
  assert.equal((await stat(p.destinationZip)).mode&0o077,0);
  const listing=spawnSync('unzip',['-Z','-1',p.destinationZip],{encoding:'utf8'});
  assert.equal(listing.status,0);
  assert.deepEqual(listing.stdout.trim().split('\n').sort(),[...FILES,META].sort());
  assert.equal((await readdir(p.source)).length,7);
  assert.equal((await readdir(p.outdir)).length,1);
 }));
test('MVP271 rejects CI, missing or unexpected paths BEFORE any network or write',
 async()=>fixture(async p=>{
  for(const delta of [{CI:'true'},{GITHUB_ACTIONS:'true'},{VERCEL_ENV:'preview'}]){
   let steps=0;
   await assert.rejects(createPrivatePilotMobileBackup(opts({
    sourceDirectory:p.source,destinationZip:p.destinationZip
   },{env:{...env,...delta},sqlFn:async()=>{steps++}})),
   /MVP271_BUNDLE_TRUSTED_LOCAL_ONLY/u);
   assert.equal(steps,0);
  }
  assert.deepEqual(await readdir(p.root),['downloads']);
 }));
test('MVP271 refuses reuse and never modifies preexisting archive',
 {skip:!toolsAvailable},async()=>fixture(async p=>{
  const sourceDirectory=p.source,destinationZip=p.destinationZip;
  await createPrivatePilotMobileBackup(opts({sourceDirectory,destinationZip}));
  const before=await readFile(destinationZip);
  await assert.rejects(createPrivatePilotMobileBackup(opts({sourceDirectory,destinationZip})),
   /MVP271_BUNDLE_OUTPUT_ALREADY_EXISTS/u);
  assert.deepEqual(await readFile(destinationZip),before);
 }));
test('MVP271 removes partial SQL directory when Storage or seal fails',
 async()=>fixture(async p=>{
  await assert.rejects(createPrivatePilotMobileBackup(opts({
   sourceDirectory:p.source,destinationZip:p.destinationZip
  },{storageFn:async()=>{throw Error('simulated source not available')}})),
  /MVP271_BUNDLE_CREATION_FAILED/u);
  assert.deepEqual(await readdir(p.root),['downloads']);
 }));
test('MVP271 never deletes a ZIP created by competing process',async()=>fixture(async p=>{
 const text=Buffer.from('OTHER-OWNER-FILE');
 await assert.rejects(createPrivatePilotMobileBackup(opts({
  sourceDirectory:p.source,destinationZip:p.destinationZip
 },{
  storageFn:async(args)=>{
   const r=await fakeStorage(args);
   await writeFile(p.destinationZip,text,{flag:'wx',mode:0o600});
   return r;
  }
 })),/MVP271_BUNDLE_CREATION_FAILED/u);
 assert.deepEqual(await readFile(p.destinationZip),text);
 assert.deepEqual(await readdir(p.root),['downloads']);
}));
test('MVP271 does not accept fake successful backup or restore certification',
 async()=>fixture(async p=>{
  await assert.rejects(createPrivatePilotMobileBackup(opts({
   sourceDirectory:p.source,destinationZip:p.destinationZip
  },{sqlFn:async x=>({...await fakeSql(x),restore_verified:true})})),
  /MVP271_BUNDLE_SQL_NOT_VERIFIED/u);
  assert.deepEqual(await readdir(p.root),['downloads']);
 }));

test('MVP271: ZIP keeps exclusive file handle, no reopened overwrite or competitor deletion',()=>{
 const source=readFileSync(new URL(
  '../../scripts/ops/package-pilot-mobile-mvp269.mjs',import.meta.url),'utf8');
 assert.match(source,/file\.createWriteStream\(\{autoClose:true\}\)/u);
 assert.doesNotMatch(source,/createWriteStream\(output,\{flags:'w'/u);
 assert.match(source,/now\?\.dev===owned\.dev&&now\?\.ino===owned\.ino/u);
 assert.match(source,/await stillOurs\(\)/u);
});
