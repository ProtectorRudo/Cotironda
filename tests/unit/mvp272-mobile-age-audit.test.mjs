import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareMobilePilotZip,FILES,META,PILOT_REF}
 from '../../scripts/ops/package-pilot-mobile-mvp269.mjs';
import {auditMobilePilotZip}
 from '../../scripts/ops/audit-pilot-mobile-ciphertext-mvp272.mjs';

function available(name){
 return spawnSync('which',[name],{stdio:'ignore'}).status===0;
}
const cryptoReady=['age','age-keygen','zip','unzip'].every(available);
const testEnv={PATH:process.env.PATH||'/usr/bin:/bin',
 CI:'false',GITHUB_ACTIONS:'',VERCEL:'',VERCEL_ENV:'',
 COTIRONDA_PILOT_DB_URL:'',COTIRONDA_PILOT_SERVICE_ROLE_KEY:'',
 DATABASE_URL:'',PGHOST:'',PGPORT:'',PGUSER:'',PGPASSWORD:''};
function run(name,args,options={}){
 const result=spawnSync(name,args,{...options,encoding:'utf8'});
 if(result.status!==0)
  throw Error('FIXTURE_TOOL_FAILED_'+name);
 return result.stdout.trim();
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'cotironda-mvp272-'));
 const source=join(root,'ciphertext'),delivery=join(root,'downloads'),
  keys=join(root,'keys');
 await mkdir(source,{mode:0o700});
 await mkdir(delivery,{mode:0o700});
 await mkdir(keys,{mode:0o700});
 const key=join(keys,'identity.txt');
 try{
  run('age-keygen',['-o',key]);await chmod(key,0o600);
  const recipient=run('age-keygen',['-y',key]);
  for(let i=0;i<FILES.length;i++){
   const plaintext=Buffer.from('SYNTHETIC-NON-PRIVATE-TEST-'+i+'-'.repeat(20));
   const path=join(source,FILES[i]);
   const r=spawnSync('age',['--encrypt','--recipient',recipient,
    '--output',path],{input:plaintext});
   assert.equal(r.status,0,'fixture age encryption must succeed');
   await chmod(path,0o600);
  }
  const sealed=await prepareMobilePilotZip({
   operation:'seal',sourceDirectory:source,env:testEnv
  });
  assert.equal(sealed.pieces,6);
  const zip=join(delivery,'cotironda-piloto-cifrado.zip');
  const packed=await prepareMobilePilotZip({
   operation:'pack',sourceDirectory:source,destinationPath:zip,
   env:testEnv
  });
  await fn({root,source,keys,zip,key,packed});
 }finally{await rm(root,{recursive:true,force:true})}
}
test('MVP272 crypto tools installed for dedicated CI (synthetic only)',()=>{
 if(process.env.COTIRONDA_MVP272_REQUIRE_REAL_AGE==='true')
  assert.equal(cryptoReady,true,
   'CI must install real age, age-keygen, zip and unzip before tests');
});
test('MVP272 six real age encryptions decrypt and match original ZIP SHA',
 {skip:!cryptoReady},async()=>fixture(async({zip,key,packed})=>{
  const r=await auditMobilePilotZip({
   zipPath:zip,identityPath:key,expectedSha256:packed.sha256,
   env:testEnv
  });
  assert.equal(r.status,'PILOT_MOBILE_ZIP_AGE_DECRYPTION_VERIFIED_NOT_RESTORED');
  assert.equal(r.project_ref,PILOT_REF);
  assert.equal(r.encrypted_components_checked,6);
  assert.equal(r.age_streams_authenticated,6);
  assert.equal(r.plaintext_written_to_disk,false);
  assert.equal(r.credentialed_network_connections,0);
  assert.equal(r.postgres_replay_verified,false);
  assert.equal(r.storage_objects_restored,false);
  assert.equal(r.managed_supabase_restore_verified,false);
  assert.equal(r.restore_verified,false);
  assert.equal(r.source_verified,false);
  assert.equal(r.mobile_download_url_created,false);
  assert.equal((await stat(zip)).mode&0o077,0);
 }));
test('MVP272 rejects wrong independent ZIP hash before any decryption',
 {skip:!cryptoReady},async()=>fixture(async({zip,key})=>{
  await assert.rejects(auditMobilePilotZip({
   zipPath:zip,identityPath:key,expectedSha256:'0'.repeat(64),
   env:testEnv
  }),/MVP272_INDEPENDENT_ZIP_SHA_MISMATCH/u);
 }));
test('MVP272 rejects incorrect recovery key even when SHA is correct',
 {skip:!cryptoReady},async()=>fixture(async({zip,keys,packed})=>{
  const wrong=join(keys,'incorrect-age.txt');
  run('age-keygen',['-o',wrong]);await chmod(wrong,0o600);
  await assert.rejects(auditMobilePilotZip({
   zipPath:zip,identityPath:wrong,expectedSha256:packed.sha256,
   env:testEnv
  }),/MVP272_CIPHERTEXT_OR_DECRYPTION_INVALID/u);
 }));
test('MVP272 rejects extra ZIP member and altered semantic manifest',
 {skip:!cryptoReady},async()=>fixture(async({zip,source,key})=>{
  const extra=join(source,'secrets.txt');
  await writeFile(extra,'FAKE TEST CONTENT',{mode:0o600});
  run('zip',['-q','-0','-X','-D',zip,'secrets.txt'],{cwd:source});
  await assert.rejects(auditMobilePilotZip({
   zipPath:zip,identityPath:key,expectedSha256:digest(await readFile(zip)),
   env:testEnv
  }),/MVP272_ZIP_MEMBERS_INVALID/u);
  run('zip',['-d',zip,'secrets.txt']);
  const m=JSON.parse(await readFile(join(source,META),'utf8'));
  m.restore_verified=true;
  await writeFile(join(source,META),JSON.stringify(m),{mode:0o600});
  await rm(zip);
  run('zip',['-q','-0','-X','-D',zip,...FILES,META],{cwd:source});
  await chmod(zip,0o600);
  await assert.rejects(auditMobilePilotZip({
   zipPath:zip,identityPath:key,expectedSha256:digest(await readFile(zip)),
   env:testEnv
  }),/MVP272_MANIFEST_INVALID/u);
 }));
test('MVP272 detects corrupted age authenticity after hashes are updated',
 {skip:!cryptoReady},async()=>fixture(async({zip,source,key})=>{
  const path=join(source,FILES[0]);
  const b=await readFile(path);
  b[b.length-2]^=0x40;
  await writeFile(path,b,{mode:0o600});
  const manifest=JSON.parse(await readFile(join(source,META),'utf8'));
  manifest.components[0].sha256=digest(b);
  await writeFile(join(source,META),JSON.stringify(manifest),{mode:0o600});
  await rm(zip);
  run('zip',['-q','-0','-X','-D',zip,...FILES,META],{cwd:source});
  await chmod(zip,0o600);
  await assert.rejects(auditMobilePilotZip({
   zipPath:zip,identityPath:key,expectedSha256:digest(await readFile(zip)),
   env:testEnv
  }),/MVP272_CIPHERTEXT_OR_DECRYPTION_INVALID/u);
 }));
test('MVP272 rejects cloud environments and database secrets before reading',
 {skip:!cryptoReady},async()=>fixture(async({zip,key,packed})=>{
  for(const extra of [{CI:'true'},{GITHUB_ACTIONS:'true'},
   {VERCEL_ENV:'preview'},{COTIRONDA_PILOT_DB_URL:'postgresql://FAKE'},
   {COTIRONDA_PILOT_SERVICE_ROLE_KEY:'secret'},
   {PGHOST:'some-database'}]){
   await assert.rejects(auditMobilePilotZip({
    zipPath:zip,identityPath:key,expectedSha256:packed.sha256,
    env:{...testEnv,...extra}
   }),/MVP272_(?:TRUSTED_LOCAL_ONLY|DATABASE_CREDENTIALS_PRESENT)/u);
  }
 }));
test('MVP272 requires locked-down permissions for ZIP and recovery key',
 {skip:!cryptoReady},async()=>fixture(async({zip,key,packed})=>{
  await chmod(key,0o644);
  await assert.rejects(auditMobilePilotZip({
   zipPath:zip,identityPath:key,expectedSha256:packed.sha256,
   env:testEnv
  }),/MVP272_FILE_NOT_PRIVATE/u);
  await chmod(key,0o600);await chmod(zip,0o644);
  await assert.rejects(auditMobilePilotZip({
   zipPath:zip,identityPath:key,expectedSha256:packed.sha256,
   env:testEnv
  }),/MVP272_FILE_NOT_PRIVATE/u);
 }));
