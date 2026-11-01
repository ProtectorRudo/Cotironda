import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Readable} from 'node:stream';
import {restaurarBackupAisladoMvp049 as restore,omitBuiltInPostgresRole}
 from '../../scripts/ops/restore-encrypted-dev-lab-mvp049.mjs';

const SHA='a'.repeat(64),ID='b'.repeat(64);
const D='/home/private/.cotironda-backups/backup-01';
const K='/home/private/.cotironda-keys/identity.txt';
const baseEnv={HOME:'/home/private',PATH:'/usr/bin:/bin',DOCKER_HOST:'unix:///var/run/docker.sock'};
function runner({failPiece=null,failCleanup=false,failReady=false,checkReply='MVP049_OK'}={}){
 const calls=[],streams=[],inFlight=[];
 const spawnCommand=(bin,args,opts)=>{
  calls.push({bin,args,env:opts.env});
  const child=new EventEmitter();child.kill=()=>{};
  const socketMode=opts.stdio?.[0]==='pipe';
  if(socketMode){
   child.stdin=new PassThrough();
   child.stdin.on('data',bytes=>streams.push(bytes.toString('utf8')));
   child.stdin.on('finish',()=>queueMicrotask(()=>child.emit('close',
    failPiece&&args.some(x=>String(x).includes('psql'))&&
      streams.length>=failPiece?1:0)));
  }
  const stdoutMode=opts.stdio?.[1]==='pipe';
  if(stdoutMode){
   child.stdout=new PassThrough();
   queueMicrotask(()=>{
    if(bin==='age')child.stdout.end(
     args.at(-1).endsWith('/roles.sql.age')
      ? 'CREATE ROLE postgres;\nCREATE ROLE sandbox_test;\n'
      : 'SELECT 1;\n'
    );
    else if(bin==='docker'&&args[0]==='run')child.stdout.end(ID+'\n');
    else if(bin==='docker'&&args[0]==='exec'&&args.includes('-c'))
     child.stdout.end(checkReply+'\n');
    else child.stdout.end('');
    if(bin!=='age')queueMicrotask(()=>child.emit('close',0));
    else queueMicrotask(()=>child.emit('close',0));
   });
  }else if(!socketMode){
   queueMicrotask(()=>child.emit('close',
    bin==='docker'&&args.includes('pg_isready')&&failReady?1:
    bin==='docker'&&args[0]==='rm'&&failCleanup?1:0));
  }
  return child;
 };
 return {calls,streams,spawnCommand};
}
const stubs={
 checkArchive:async()=>({status:'PACKAGE_INTEGRITY_ONLY',
  artifacts_checked:5,restore_verified:false}),
 verifyDecrypt:async()=>({status:'LOCAL_AGE_DECRYPT_CHECK_ONLY',
  files_decrypted:5,restore_verified:false}),
 checkDockerSocket:async()=>{}
};
function go(fake,env=baseEnv,extras={}){
 return restore({directory:D,identityPath:K,expectedManifestSha256:SHA,
  env,spawnCommand:fake.spawnCommand,...stubs,...extras});
}
test('MVP049: sandbox nuevo sin red/puertos/volúmenes, 5 SQL cifrados, cleanup',async()=>{
 const fake=runner(),r=await go(fake);
 assert.equal(r.status,'DISPOSABLE_PG17_SQL_REPLAY_VERIFIED');
 assert.equal(r.encrypted_pieces_restored,5);
 assert.equal(r.plaintext_on_host_disk,false);
 assert.equal(r.network_exposed,false);
 assert.equal(r.ports_exposed,false);
 assert.equal(r.database_destroyed_after_check,true);
 assert.equal(r.supabase_platform_restore_verified,false);
 assert.equal(r.gate_d024_open,false);
 const run=fake.calls.find(x=>x.bin==='docker'&&x.args[0]==='run');
 assert.ok(run.args.includes('--network=none'));
 assert.ok(run.args.includes('--pull=never'));
 assert.equal(run.args.includes('-p'),false);
 assert.equal(run.args.includes('--publish'),false);
 assert.equal(run.args.some(x=>String(x).includes(':/mnt/')),false);
 assert.equal(fake.calls.filter(x=>x.bin==='age').length,5);
 assert.equal(fake.calls.filter(x=>x.bin==='docker'&&x.args[0]==='rm').length,1);
 assert.ok(fake.calls.find(x=>x.bin==='docker'&&x.args[0]==='rm').args.includes(ID));
 assert.equal(JSON.stringify(fake.calls).includes('CREATE ROLE sandbox_test'),false);
 assert.equal(fake.streams.join('').includes('CREATE ROLE postgres;'),false);
});
test('MVP049: no permite entorno cloud, URL BD, DOCKER_HOST remoto ni variables PG',async()=>{
 const fake=runner();
 for(const unsafe of [
  {CI:'true'},{GITHUB_ACTIONS:'true'},{VERCEL:'1'},
  {COTIRONDA_DEV_DB_URL:'postgresql://secret'},
  {DATABASE_URL:'postgresql://secret'},
  {PGHOST:'remote.example'}, {DOCKER_HOST:'tcp://localhost:2375'},
  {DOCKER_HOST:'ssh://remote'},{DOCKER_CONTEXT:'remote'}
 ]){
  await assert.rejects(go(fake,{...baseEnv,...unsafe}),/MVP049_LOCAL_ONLY_NO_DB_CREDENTIALS|MVP049_LOCAL_DOCKER_SOCKET_ONLY/u);
 }
 assert.equal(fake.calls.length,0);
});
test('MVP049: no lee ni restaura cuando faltan hash independiente o rutas absolutas',async()=>{
 const fake=runner();
 for(const data of [
  {expectedManifestSha256:'x'},
  {directory:'relative'},
  {identityPath:'secret.age'}
 ]){
  await assert.rejects(go(fake,baseEnv,data),/MVP049_ABSOLUTE_PATHS_AND_TRUSTED_HASH_REQUIRED/u);
 }
 assert.equal(fake.calls.length,0);
});
test('MVP049: hash incorrecto o edad no verificada impiden crear contenedor',async()=>{
 const fake=runner();
 await assert.rejects(go(fake,baseEnv,{
  checkArchive:async()=>{throw Error('D039_MANIFEST_SHA256_MISMATCH')}
 }),/D039_MANIFEST_SHA256_MISMATCH/u);
 await assert.rejects(go(fake,baseEnv,{
  verifyDecrypt:async()=>({status:'LOCAL_AGE_DECRYPT_CHECK_ONLY',
   files_decrypted:4,restore_verified:false})
 }),/MVP049_DECRYPTION_UNVERIFIED/u);
 assert.equal(fake.calls.length,0);
});
test('MVP049: un SQL inválido fuerza destrucción del sandbox y niega éxito',async()=>{
 const fake=runner({failPiece:1});
 await assert.rejects(go(fake),/MVP049_SQL_RESTORE_REJECTED/u);
 assert.equal(fake.calls.filter(x=>x.bin==='docker'&&x.args[0]==='rm').length,1);
});
test('MVP049: falla de comprobación restaurada niega paso de la etapa',async()=>{
 const fake=runner({checkReply:'MVP049_REJECT'});
 await assert.rejects(go(fake),/MVP049_RESTORED_SCHEMA_INVALID/u);
 assert.equal(fake.calls.filter(x=>x.bin==='docker'&&x.args[0]==='rm').length,1);
});
test('MVP049: falla al limpiar contenedor NO deja constancia de restauración',async()=>{
 const fake=runner({failCleanup:true});
 await assert.rejects(go(fake),/MVP049_SANDBOX_CLEANUP_FAILED/u);
});
test('MVP049: filtro de rol postgres reconstituye líneas partidas',async()=>{
 const chunk=Readable.from(['CREA','TE ROLE postgres;\nCRE','ATE ROLE buyer;\n']);
 const output=await (async()=>{
  const arr=[];for await(const buf of chunk.pipe(omitBuiltInPostgresRole()))
   arr.push(buf.toString('utf8'));return arr.join('')
 })();
 assert.doesNotMatch(output,/CREATE ROLE postgres;/u);
 assert.match(output,/CREATE ROLE buyer;/u);
});
