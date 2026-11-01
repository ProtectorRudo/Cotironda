import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,chmod,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {verificarDirectoriosPrivadosMvp037 as check}
 from '../../scripts/ops/check-private-backup-dirs-mvp037.mjs';

async function fixture(run){
 const home=await mkdtemp(join(tmpdir(),'cotironda-mvp037-'));
 const keys=join(home,'.cotironda-keys');
 const backups=join(home,'.cotironda-backups');
 await mkdir(keys,{mode:0o700});
 await mkdir(backups,{mode:0o700});
 try{return await run({home,keys,backups})}
 finally{await rm(home,{recursive:true,force:true})}
}
test('MVP037: carpetas 0700 del mismo dueño permiten solo preflight local',()=>fixture(
 async({home,keys,backups})=>{
  const r=check(home,keys,backups);
  assert.equal(r.status,'PRIVATE_LOCAL_DIRECTORIES_VERIFIED');
  assert.equal(r.backup_verified,false);
  assert.equal(r.restore_verified,false);
  assert.equal(r.gate_d024_open,false);
 }));
for(const mode of [0o755,0o777,0o770,0o711]){
 test('MVP037: carpeta preexistente '+mode.toString(8)+' bloqueada',()=>fixture(
  async({home,keys,backups})=>{
   await chmod(keys,mode);
   assert.throws(()=>check(home,keys,backups),/MVP037_PRIVATE_DIRECTORY_UNSAFE/u);
   await chmod(keys,0o700);
   await chmod(backups,mode);
   assert.throws(()=>check(home,keys,backups),/MVP037_PRIVATE_DIRECTORY_UNSAFE/u);
  }));
}
test('MVP037: HOME manipulable por grupo u otros se rechaza',()=>fixture(
 async({home,keys,backups})=>{
  await chmod(home,0o777);
  assert.throws(()=>check(home,keys,backups),/MVP037_PRIVATE_DIRECTORY_UNSAFE/u);
 }));
test('MVP037: alias simbólico de keydir nunca pasa aunque apunte a 0700',()=>fixture(
 async({home,keys,backups})=>{
  const alias=join(home,'alias');
  await symlink(keys,alias);
  assert.throws(()=>check(home,alias,backups),/MVP037_PRIVATE_DIRECTORY_UNSAFE/u);
 }));
test('MVP037: HOME enlazado simbólicamente es rechazado antes de clave/URL',()=>fixture(
 async({home,keys,backups})=>{
  const alias=home+'-alias';
  await symlink(home,alias);
  try{
   assert.throws(
    ()=>check(alias,join(alias,'.cotironda-keys'),join(alias,'.cotironda-backups')),
    /MVP037_PRIVATE_DIRECTORY_UNSAFE/u
   );
  }finally{await rm(alias,{force:true})}
 }));
test('MVP037: no admite rutas arbitrarias, relativas ni fuera del HOME',()=>fixture(
 async({home,keys,backups})=>{
  for(const vals of [
   [home,resolve('/tmp'),backups],
   [home,'relative',backups],
   [home,keys,keys],
   ['',keys,backups]
  ])assert.throws(()=>check(...vals),/MVP037_PRIVATE_DIRECTORY_UNSAFE/u);
 }));
test('MVP037: CLI niega argumentos sin listar rutas privadas',()=>fixture(
 async({home,keys,backups})=>{
  await chmod(keys,0o777);
  const r=spawnSync(process.execPath,[
   resolve('scripts/ops/check-private-backup-dirs-mvp037.mjs'),
   home,keys,backups
  ],{encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/MVP037_PRIVATE_DIRECTORY_UNSAFE/u);
  assert.equal(r.stderr.includes(home),false);
  assert.equal(r.stdout,'');
 }));
