import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,writeFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ejecutarBackupPrivadoD075}
 from '../../scripts/ops/cotironda-private-backup-d075.mjs';

const ref='qkercsoqhehbenbbncwk';
const recipient='age1'+'q'.repeat(58);
const connection='postgresql://postgres:fake-secret@db.'+ref+
 '.supabase.co:5432/postgres?sslmode=require';
const manifest='a'.repeat(64);
const baseEnv={
 PATH:'/usr/bin:/bin',COTIRONDA_DEV_DB_URL:connection,
 COTIRONDA_AGE_RECIPIENT:recipient
};
const okayExport={
 status:'ENCRYPTED_DEV_EXPORT_CREATED_NOT_RESTORED',
 project_ref:ref,pieces:5,manifest_sha256:manifest,
 restore_verified:false,gate_d024_open:false
};
const okayDecryption={
 status:'LOCAL_AGE_DECRYPT_CHECK_ONLY',files_decrypted:5,
 restore_verified:false,gate_d024_open:false
};
function fakeTools(calls,{ageRecipient=recipient,oldPostgres=false,missingAge=false}={}){
 return (binary,args,opts)=>{
  calls.push({binary,args,opts});
  const child=new EventEmitter();
  child.stdout=new PassThrough();
  child.kill=()=>{};
  queueMicrotask(()=>{
   const response=binary==='age-keygen'?ageRecipient+'\n':
    binary==='age'?'v1.2.1\n':
    binary==='pg_dump'||binary==='pg_dumpall'||binary==='psql'?
      binary+' (PostgreSQL) '+(oldPostgres?'16.4':'17.11')+'\n':'';
   child.stdout.write(response);
   child.stdout.end();
   queueMicrotask(()=>child.emit('close',binary==='age'&&missingAge?1:0));
  });
  return child;
 };
}
async function fixture(run){
 const root=await mkdtemp(join(tmpdir(),'cotironda-private-backup-ci-'));
 const identity=join(root,'identity.txt');
 await writeFile(identity,'AGE-SECRET-KEY-THIS-IS-NOT-A-REAL-KEY\n',{mode:0o600});
 try{return await run({root,identity,output:join(root,'sql-private')})}
 finally{await rm(root,{recursive:true,force:true})}
}
test('D075 one command: versions, recipient key, export and decrypt in exact order',async()=>fixture(async({identity,output})=>{
 const calls=[],steps=[];
 const r=await ejecutarBackupPrivadoD075({
  directory:output,identityPath:identity,env:baseEnv,
  spawnCommand:fakeTools(calls),
  exportFn:async({directory,connectionUrl,recipient:recipientIn})=>{
   steps.push('export');
   assert.equal(directory,output);
   assert.equal(connectionUrl,connection);
   assert.equal(recipientIn,recipient);
   return okayExport;
  },
  decryptFn:async(dir,sha,id)=>{
   steps.push('decrypt');
   assert.equal(dir,output);
   assert.equal(sha,manifest);
   assert.equal(id,identity);
   return okayDecryption;
  }
 });
 assert.equal(r.status,'ENCRYPTED_SQL_EXPORT_DECRYPTED_NOT_RESTORED');
 assert.equal(r.gate_d024_open,false);
 assert.equal(r.restore_verified,false);
 assert.equal(r.storage_bytes_included,false);
 assert.equal(r.auth_edge_configuration_included,false);
 assert.deepEqual(steps,['export','decrypt']);
 assert.deepEqual(calls.map(c=>c.binary),[
  'pg_dump','pg_dumpall','psql','age','age-keygen']);
 assert.equal(calls[4].args[0],'-y');
 assert.equal(calls[4].args[1],identity);
 assert.ok(calls.every(c=>!JSON.stringify(c.args).includes('fake-secret')));
 assert.ok(!JSON.stringify(r).includes('fake-secret'));
}));
test('D075 wrong recipient aborts BEFORE export, no SQL or network',async()=>fixture(async({identity,output})=>{
 let called=0;
 await assert.rejects(ejecutarBackupPrivadoD075({
  directory:output,identityPath:identity,env:baseEnv,
  spawnCommand:fakeTools([],{ageRecipient:'age1'+'p'.repeat(58)}),
  exportFn:async()=>{called++;return okayExport}
 }),/D075_AGE_IDENTITY_RECIPIENT_MISMATCH/);
 assert.equal(called,0);
}));
test('D075 refuses GitHub, Vercel, CI and simulated Preview before tools',async()=>fixture(async({identity,output})=>{
 for(const envChange of [
  {GITHUB_ACTIONS:'true'},{CI:'true'},{VERCEL:'1'},{VERCEL_ENV:'preview'},
  {COTIRONDA_CI_AUTH_SANDBOX:'enabled_for_tests_only'},
  {COTIRONDA_CI_WA_PREVIEW_SANDBOX:'enabled_for_tests_only'}
 ]){
  const calls=[];
  await assert.rejects(ejecutarBackupPrivadoD075({
   directory:output,identityPath:identity,env:{...baseEnv,...envChange},
   spawnCommand:fakeTools(calls)
  }),/D075_LOCAL_ONLY/);
  assert.equal(calls.length,0);
 }
}));
test('D075 rejects wrong DEV URL and age recipient before checking tools',async()=>fixture(async({identity,output})=>{
 for(const envChange of [
  {COTIRONDA_DEV_DB_URL:connection.replace(ref,'anotherproject')},
  {COTIRONDA_DEV_DB_URL:connection.replace('sslmode=require','sslmode=disable')},
  {COTIRONDA_AGE_RECIPIENT:'not-an-age-key'}
 ]){
  const calls=[];
  await assert.rejects(ejecutarBackupPrivadoD075({
   directory:output,identityPath:identity,env:{...baseEnv,...envChange},
   spawnCommand:fakeTools(calls)
  }),/D075_(?:DEV_CONNECTION_INVALID|AGE_RECIPIENT_REQUIRED)/);
  assert.equal(calls.length,0);
 }
}));
test('D075 rejects PG16 and unavailable age before export',async()=>fixture(async({identity,output})=>{
 for(const scenario of [{oldPostgres:true},{missingAge:true}]){
  const calls=[];
  let exported=false;
  await assert.rejects(ejecutarBackupPrivadoD075({
   directory:output,identityPath:identity,env:baseEnv,
   spawnCommand:fakeTools(calls,scenario),
   exportFn:async()=>{exported=true;return okayExport}
  }),/D075_(?:PG17_TOOLS_REQUIRED|TOOL_UNAVAILABLE)/);
  assert.equal(exported,false);
 }
}));
test('D075 rejects world-readable identity and symlink identity',async()=>fixture(async({root,identity,output})=>{
 await chmod(identity,0o644);
 const calls=[];
 await assert.rejects(ejecutarBackupPrivadoD075({
  directory:output,identityPath:identity,env:baseEnv,
  spawnCommand:fakeTools(calls)
 }),/D075_IDENTITY_UNSAFE/);
 assert.equal(calls.length,0);
}));
test('D075 never reports success if export or local decrypt fails',async()=>fixture(async({identity,output})=>{
 for(const opts of [
  {exportFn:async()=>{throw Error('private database password')}},
  {exportFn:async()=>({...okayExport,restore_verified:true})},
  {exportFn:async()=>okayExport,decryptFn:async()=>{throw Error('secret age key')}},
  {exportFn:async()=>okayExport,decryptFn:async()=>({...okayDecryption,files_decrypted:4})}
 ]){
  await assert.rejects(ejecutarBackupPrivadoD075({
   directory:output,identityPath:identity,env:baseEnv,
   spawnCommand:fakeTools([]),
   decryptFn:async()=>okayDecryption,...opts
  }),/D075_(?:EXPORT_FAILED|EXPORT_UNVERIFIED|DECRYPT_FAILED|DECRYPT_UNVERIFIED)/);
 }
}));
