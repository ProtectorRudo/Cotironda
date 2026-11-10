/**
 * MVP273 isolated PostgreSQL 17 REAL CI smoke with exclusively invented SQL.
 * Never uses customer data, credentials, volumes, published ports or artifacts.
 * Only executed by the dedicated workflow after pulling postgres:17-alpine.
 */
import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareMobilePilotZip,FILES}
 from '../../scripts/ops/package-pilot-mobile-mvp269.mjs';
import {replayPilotSqlInDisposablePg17}
 from '../../scripts/ops/replay-pilot-sql-lab-mvp273.mjs';
import {tarHeader} from '../../scripts/ops/export-private-pilot-storage-mvp270.mjs';

const env={PATH:process.env.PATH||'/usr/bin:/bin',HOME:'/nonexistent',
 CI:'false',GITHUB_ACTIONS:'',VERCEL:'',VERCEL_ENV:'',
 DATABASE_URL:'',PGHOST:'',PGPORT:'',PGUSER:'',PGPASSWORD:'',
 COTIRONDA_PILOT_DB_URL:'',COTIRONDA_PILOT_SERVICE_ROLE_KEY:''};
function run(program,args,options={}){
 const result=spawnSync(program,args,{...options});
 assert.equal(result.status,0,'SYNTHETIC_CI_COMMAND_FAILED_'+program);
 return String(result.stdout||'').trim();
}
const fakeSql=[
 '-- Nothing to create in synthetic roles fixture\n',
 [
  'CREATE SCHEMA cotironda_piloto_privado;',
  'CREATE TABLE cotironda_piloto_privado.requests(id bigint PRIMARY KEY);',
  'CREATE SCHEMA storage;',
  'CREATE TABLE storage.objects(id bigint PRIMARY KEY);'
 ].join('\n')+'\n',
 'INSERT INTO cotironda_piloto_privado.requests VALUES (101);\n'+
  'INSERT INTO storage.objects VALUES (7);\n',
 'CREATE SCHEMA supabase_migrations;\n'+
  'CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);\n',
 "INSERT INTO supabase_migrations.schema_migrations VALUES ('synthetic');\n"
];
function fakeStorageTar(){
 const item=Buffer.from('FAKE PDF, NOT USER CONTENT');
 const info={
  format:'cotironda-pilot-storage-tar-mvp270-v1',
  project_ref:'ilggkalaafhtiysyzlmg',
  objects:[{
   bucket:'synthetic',path:'dummy/test.txt',id:'fake',
   size:item.length,updated_at:'2026-11-06T13:00:00Z',
   archive_name:'objects/000001.bin',
   sha256:createHash('sha256').update(item).digest('hex')
  }],
  object_count:1,declared_total_bytes:item.length,
  inventory_rechecked:true,restore_verified:false
 };
 const idx=Buffer.from(JSON.stringify(info)+'\n');
 function entry(name,body){
  return Buffer.concat([tarHeader(name,body.length),body,
   Buffer.alloc((512-body.length%512)%512)]);
 }
 return Buffer.concat([entry('objects/000001.bin',item),
  entry('objects/index.json',idx),Buffer.alloc(1024)]);
}
test('MVP273: real ephemeral PG17 replays age SQL streams, never publishes ports',
 {skip:process.env.COTIRONDA_MVP273_REAL_DOCKER!=='true'},async()=>{
  const root=await mkdtemp(join(tmpdir(),'cotironda-mvp273-real-pg17-'));
  const source=join(root,'source'),keys=join(root,'keys'),deliver=join(root,'deliver');
  for(const d of [source,keys,deliver])await mkdir(d,{mode:0o700});
  try{
   const identity=join(keys,'age-identity.txt');
   run('age-keygen',['-o',identity]);
   await chmod(identity,0o600);
   const pub=run('age-keygen',['-y',identity]);
   for(let i=0;i<FILES.length;i++){
    const plaintext=i===5?fakeStorageTar():Buffer.from(fakeSql[i]);
    const output=join(source,FILES[i]);
    run('age',['-e','-r',pub,'-o',output],{input:plaintext});
    await chmod(output,0o600);
   }
   await prepareMobilePilotZip({operation:'seal',sourceDirectory:source,env});
   const zip=join(deliver,'fake-pilot.zip');
   const sealed=await prepareMobilePilotZip({
    operation:'pack',sourceDirectory:source,destinationPath:zip,env
   });
   const result=await replayPilotSqlInDisposablePg17({
    zipPath:zip,identityPath:identity,expectedSha256:sealed.sha256,
    env
   });
   assert.equal(result.encrypted_sql_streams_replayed,5);
   assert.equal(result.isolated_container_destroyed_after_test,true);
   assert.equal(result.network_exposed,false);
   assert.equal(result.ports_exposed,false);
   assert.equal(result.restore_verified,false);
   assert.equal(result.managed_supabase_restore_verified,false);
  }finally{await rm(root,{recursive:true,force:true})}
});
