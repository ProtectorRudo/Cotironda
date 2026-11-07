import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {replayPilotSqlInDisposablePg17}
 from '../../scripts/ops/replay-pilot-sql-lab-mvp273.mjs';
import {PILOT_REF}
 from '../../scripts/ops/package-pilot-mobile-mvp269.mjs';

const SHA='b'.repeat(64),CID='a'.repeat(64);
const ZIP='/home/private/backups/pilot-cifrado.zip';
const KEY='/home/private/keys/identity.txt';
const env={PATH:'/usr/bin:/bin',HOME:'/home/private',
 CI:'false',GITHUB_ACTIONS:'',VERCEL:'',VERCEL_ENV:'',
 COTIRONDA_PILOT_DB_URL:'',COTIRONDA_PILOT_SERVICE_ROLE_KEY:'',
 DATABASE_URL:'',PGHOST:'',PGPORT:'',PGUSER:'',PGPASSWORD:''};
function fakeAudit(){
 return {
  status:'PILOT_MOBILE_ZIP_AGE_DECRYPTION_VERIFIED_NOT_RESTORED',
  project_ref:PILOT_REF,archive_sha256:SHA,
  age_streams_authenticated:6,restore_verified:false
 };
}
function worker({sqlFailAt=0,removeFail=false,checkFail=false,
 earlyFailure=false}={}){
 const calls=[],sqlChunks=[],started=[];
 let count=0;
 const spawnCommand=(binary,args,options)=>{
  calls.push({binary,args,env:options.env});
  const p=new EventEmitter();
  p.kill=()=>p.emit('close',143);
  const hasOutput=options.stdio?.[1]==='pipe';
  const hasInput=options.stdio?.[0]==='pipe';
  if(hasOutput)p.stdout=new PassThrough();
  if(hasInput){
   p.stdin=new PassThrough();
   if(binary==='docker'&&args.includes('-i')){
    count++;
    const pos=count;
    let text='';
    p.stdin.on('data',part=>{
     text+=part.toString('utf8');
     sqlChunks.push(part.toString('utf8'));
    });
    p.stdin.once('finish',()=>queueMicrotask(()=>
     p.emit('close',pos===sqlFailAt?1:0)));
   }
   if(binary==='age'){
    p.stdin.once('finish',()=>queueMicrotask(()=>p.emit('close',0)));
   }
  }
  if(hasOutput){
   queueMicrotask(()=>{
    if(binary==='docker'&&args[0]==='run'){
     p.stdout.end(CID+'\n');p.emit('close',0);
    }else if(binary==='docker'&&args[0]==='exec'&&args.includes('-c')){
     p.stdout.end(checkFail?'MVP273_SQL_LAB_REJECT\n':
      'MVP273_SQL_LAB_OK\n');p.emit('close',0);
    }else if(binary==='unzip'){
     p.stdout.end('SYNTHETIC_CIPHERTEXT\n');
     p.emit('close',0);
    }else if(binary==='age'){
     // Age simulation transforms stdin to synthetic SQL. No secrets or real SQL.
     p.stdout.end(args.includes('--identity')&&count===0?
      'CREATE ROLE postgres;\nCREATE ROLE fake_role;\n':
      'SELECT 1;\n');
    }
   });
  }else if(!hasInput){
   queueMicrotask(()=>p.emit('close',
    binary==='docker'&&args[0]==='rm'&&removeFail?1:
    binary==='docker'&&args.includes('pg_isready')&&earlyFailure?1:0));
  }
  started.push(p);
  return p;
 };
 return {calls,sqlChunks,spawnCommand,started};
}
async function go(f,options={}){
 return replayPilotSqlInDisposablePg17({
  zipPath:ZIP,identityPath:KEY,expectedSha256:SHA,env,
  spawnCommand:f.spawnCommand,auditFn:async()=>fakeAudit(),
  socketCheck:async()=>{},...options
 });
}
test('MVP273: offline sandbox streams 5 SQL age members, no ports or cloud secrets',
 async()=>{
  const f=worker(),r=await go(f);
  assert.equal(r.status,
   'PILOT_SQL_DISPOSABLE_PG17_REPLAY_VERIFIED_NOT_SUPABASE_RESTORED');
  assert.equal(r.project_ref,PILOT_REF);
  assert.equal(r.encrypted_sql_streams_replayed,5);
  assert.equal(r.network_exposed,false);
  assert.equal(r.ports_exposed,false);
  assert.equal(r.host_plaintext_sql_files,false);
  assert.equal(r.managed_supabase_restore_verified,false);
  assert.equal(r.storage_objects_restored,false);
  assert.equal(r.restore_verified,false);
  assert.equal(r.download_link_created,false);
  const run=f.calls.find(x=>x.binary==='docker'&&x.args[0]==='run');
  assert.ok(run.args.includes('--network=none'));
  assert.ok(run.args.includes('--pull=never'));
  assert.ok(run.args.includes('--read-only'));
  assert.ok(run.args.includes('no-new-privileges'));
  assert.ok(!run.args.includes('-p')&&!run.args.includes('--publish'));
  assert.ok(!run.args.includes('-v')&&!run.args.includes('--volume'));
  assert.ok(!run.args.includes('COTIRONDA_PILOT_DB_URL'));
  assert.equal(f.calls.filter(x=>x.binary==='age').length,5);
  assert.equal(f.calls.filter(x=>x.binary==='unzip').length,5);
  assert.equal(f.calls.filter(x=>x.binary==='docker'&&x.args[0]==='rm').length,1);
  assert.equal(f.calls.filter(x=>x.binary==='docker'&&x.args.includes('-i')).length,5);
  assert.ok(f.calls.every(x=>!JSON.stringify(x.args).includes('secret')));
  assert.ok(!f.sqlChunks.join('').includes('CREATE ROLE postgres;'));
 });
test('MVP273: wrong project, invalid archive or CI environment rejects before Docker',
 async()=>{
  const f=worker();
  const scenarios=[
   {env:{...env,CI:'true'}},
   {env:{...env,VERCEL_ENV:'preview'}},
   {env:{...env,DATABASE_URL:'postgresql://unsafe'}},
   {env:{...env,COTIRONDA_PILOT_SERVICE_ROLE_KEY:'SECRET'}},
   {env:{...env,DOCKER_HOST:'tcp://external:2375'}},
   {expectedSha256:'wrong'},
   {auditFn:async()=>({...fakeAudit(),project_ref:'another'})}
  ];
  for(const input of scenarios){
   await assert.rejects(go(f,input),/MVP273_SQL_/u);
  }
  assert.equal(f.calls.length,0);
 });
test('MVP273: pg_dump replay rejection triggers sandbox cleanup and no success',
 async()=>{
  const f=worker({sqlFailAt:2});
  await assert.rejects(go(f),/MVP273_SQL_SQL_REPLAY_REJECTED/u);
  assert.equal(f.calls.filter(x=>x.binary==='docker'&&x.args[0]==='rm').length,1);
 });
test('MVP273: missing restored tables stops success and removes sandbox',
 async()=>{
  const f=worker({checkFail:true});
  await assert.rejects(go(f),/MVP273_SQL_RESTORED_TABLES_MISSING/u);
  assert.equal(f.calls.filter(x=>x.binary==='docker'&&x.args[0]==='rm').length,1);
 });
test('MVP273: cleanup failure cannot certify a successful restore',
 async()=>{
  const f=worker({removeFail:true});
  await assert.rejects(go(f),/MVP273_SQL_CONTAINER_CLEANUP_UNVERIFIED/u);
 });
test('MVP273: external socket is rejected independently of mocked local Docker',
 async()=>{
  const f=worker();
  await assert.rejects(go(f,{
   socketCheck:async()=>{throw Error('MVP273_SQL_LOCAL_DOCKER_UNAVAILABLE')}
  }),/MVP273_SQL_LOCAL_DOCKER_UNAVAILABLE/u);
  assert.equal(f.calls.length,0);
 });
