import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm,symlink,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareMobilePilotZip,FILES,META,PILOT_REF}
 from '../../scripts/ops/package-pilot-mobile-mvp269.mjs';

const env={PATH:process.env.PATH||'/usr/bin:/bin',CI:'false',
 GITHUB_ACTIONS:'',VERCEL:'',VERCEL_ENV:''};
const age=Buffer.concat([Buffer.from('age-encryption.org/v1\n','ascii'),
 Buffer.alloc(100,0x41)]);
const possible=spawnSync('zip',['-v'],{stdio:'ignore'}).status===0 &&
 spawnSync('unzip',['-v'],{stdio:'ignore'}).status===0;
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'cotironda-mobile-zip-ci-'));
 const source=join(root,'source'),outputDir=join(root,'download');
 await mkdir(source,{mode:0o700});await mkdir(outputDir,{mode:0o700});
 try{return await fn({root,source,outputDir,output:join(outputDir,'cotironda-piloto-cifrado.zip')})}
 finally{await rm(root,{recursive:true,force:true})}
}
async function pieces(dir){
 for(const name of FILES)await writeFile(join(dir,name),age,{mode:0o600});
}
const seal=(dir,override={})=>prepareMobilePilotZip({
 operation:'seal',sourceDirectory:dir,env:{...env,...override}
});
const pack=(dir,output,override={})=>prepareMobilePilotZip({
 operation:'pack',sourceDirectory:dir,destinationPath:output,
 env:{...env,...override}
});
test('MVP269: 6 ciphertext components including separate Storage are mandatory',
 async()=>fixture(async({source,output})=>{
  await Promise.all(FILES.slice(0,-1).map(x=>writeFile(join(source,x),age,{mode:0o600})));
  await assert.rejects(seal(source),/MVP269_MISSING_ENCRYPTED_COMPONENT/u);
  await writeFile(join(source,FILES.at(-1)),age,{mode:0o600});
  const r=await seal(source);
  assert.equal(r.pieces,6);
  assert.equal(r.restore_verified,false);
  assert.equal(r.source_verified,false);
  assert.equal(r.storage_coverage_verified,false);
  assert.equal(r.no_public_url,true);
  const manifest=JSON.parse(await readFile(join(source,META),'utf8'));
  assert.equal(manifest.project_ref,PILOT_REF);
  assert.deepEqual(manifest.components.map(v=>v.name),FILES);
  assert.equal(manifest.restore_verified,false);
  assert.equal(manifest.storage_coverage_verified,false);
  await assert.rejects(seal(source),/MVP269_ALREADY_SEALED/u);
  await assert.rejects(pack(source,output,{CI:'true'}),/MVP269_TRUSTED_LOCAL_POSIX_ONLY/u);
 }));
test('MVP269: one ZIP can be stored by phone; no plaintext material inside',
 {skip:!possible},async()=>fixture(async({source,output,outputDir})=>{
  await pieces(source);
  await seal(source);
  const r=await pack(source,output);
  assert.equal(r.status,'MOBILE_ZIP_ENCRYPTED_CONTENT_CANDIDATE');
  assert.match(r.sha256,/^[a-f0-9]{64}$/u);
  assert.equal(r.pieces,6);
  assert.equal(r.restore_verified,false);
  assert.equal(r.original_storage_objects_verified,false);
  assert.equal(r.download_link_created,false);
  const listing=spawnSync('unzip',['-Z','-1',output],{encoding:'utf8'});
  assert.equal(listing.status,0);
  const entries=listing.stdout.trim().split('\n').sort();
  assert.deepEqual(entries,[...FILES,META].sort());
  assert.equal((await stat(output)).mode&0o077,0);
  const contents=spawnSync('unzip',['-p',output,'data.sql.age']);
  assert.equal(contents.status,0);
  assert.deepEqual(contents.stdout,age);
  assert.equal((await readdir(outputDir)).length,1);
  await assert.rejects(pack(source,output),/MVP269_OUTPUT_ALREADY_EXISTS/u);
 }));
test('MVP269: wrong metadata or changed encrypted content blocks ZIP',
 {skip:!possible},async()=>fixture(async({source,output})=>{
  await pieces(source);await seal(source);
  const metaPath=join(source,META);
  const data=JSON.parse(await readFile(metaPath,'utf8'));
  data.source_verified=true;
  await writeFile(metaPath,JSON.stringify(data),{mode:0o600});
  await assert.rejects(pack(source,output),/MVP269_MANIFEST_MISMATCH/u);
  data.source_verified=false;
  await writeFile(metaPath,JSON.stringify(data),{mode:0o600});
  await writeFile(join(source,'schema.sql.age'),Buffer.concat([age,Buffer.from('edited')]));
  await assert.rejects(pack(source,output),/MVP269_MANIFEST_MISMATCH/u);
 }));
test('MVP269: symlink, extra file, broad filesystem ACL rejected',
 async()=>fixture(async({source,root})=>{
  await pieces(source);
  await writeFile(join(source,'private-password.txt'),'not allowed',{mode:0o600});
  await assert.rejects(seal(source),/MVP269_UNEXPECTED_FILE/u);
  await rm(join(source,'private-password.txt'));
  await rm(join(source,FILES[0]));
  await symlink(join(source,FILES[1]),join(source,FILES[0]));
  await assert.rejects(seal(source),/MVP269_SYMLINK_FORBIDDEN/u);
  await rm(join(source,FILES[0]));
  await writeFile(join(source,FILES[0]),age,{mode:0o644});
  await assert.rejects(seal(source),/MVP269_UNSAFE_PRIVATE_PERMISSIONS/u);
  await chmod(join(source,FILES[0]),0o600);
  await chmod(source,0o755);
  await assert.rejects(seal(source),/MVP269_UNSAFE_PRIVATE_PERMISSIONS/u);
 }));
test('MVP269: source ZIP and project tree cannot be destination',
 async()=>fixture(async({source,output})=>{
  await pieces(source);await seal(source);
  await assert.rejects(pack(source,join(source,'backup.zip')),
   /MVP269_OUTPUT_INSIDE_SOURCE/u);
  await assert.rejects(pack(source,join(source,'backup.tar')),
   /MVP269_ZIP_ABSOLUTE_PATH_REQUIRED/u);
  await assert.rejects(pack(source,'/not/a/path/backup.zip'),/MVP269_PATH_MISSING/u);
 }));
