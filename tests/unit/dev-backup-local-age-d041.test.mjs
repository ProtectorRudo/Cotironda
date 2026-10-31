import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { checkBundle, PIECES, PROJECT_REF } from '../../scripts/ops/verify-encrypted-dev-backup-d039.mjs';
import { validateDevDsn, verifyDecryption } from '../../scripts/ops/check-local-dev-backup-d041.mjs';

const direct = 'postgresql://postgres:example-not-a-real-secret@db.'+PROJECT_REF+'.supabase.co:5432/postgres?sslmode=require';
const pooler = 'postgresql://postgres.'+PROJECT_REF+':example-not-a-real-secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';
async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'cotironda-d041-'));
  try {
    for (const [i, name] of PIECES.entries()) {
      await writeFile(join(dir, name), 'age-encryption.org/v1\n-> X25519 ' + i + '\n--- ' + 'x'.repeat(72), {mode:0o600});
    }
    const keyDir=await mkdtemp(join(tmpdir(),'cotironda-d041-key-'));
    try {
      const key=join(keyDir,'identity.txt');
      await writeFile(key,'FAKE TEST ONLY - NO PRIVATE KEY',{mode:0o600});
      const sealed=await checkBundle('seal',dir);
      await fn(dir,key,sealed.manifest_sha256);
    } finally { await rm(keyDir,{force:true,recursive:true}); }
  } finally { await rm(dir,{force:true,recursive:true}); }
}
function fakeAge({code=0,bytes=22,onInvocation}={}) {
  return (cmd,args,opts) => {
    onInvocation?.(cmd,args,opts);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stdout.once('end',()=>child.emit('close',code));
    queueMicrotask(()=>child.stdout.end(bytes ? Buffer.alloc(bytes,65) : undefined));
    return child;
  };
}
test('D041 destino directo DEV exacto, sin filtrar contraseña',()=>{
  const r=validateDevDsn(direct);
  assert.equal(r.status,'DEV_TARGET_CHECKED_OFFLINE');
  assert.equal(r.method,'direct');
  assert.equal(r.network_calls,0);
  assert.equal(r.authorization_to_restore,false);
  assert.ok(!JSON.stringify(r).includes('example-not'));
});
test('D041 pooler de sesión exacto DEV',()=>assert.equal(validateDevDsn(pooler).method,'session_pooler'));
test('D041 rechaza proyecto ajeno, incluso con password',()=>{
  assert.throws(()=>validateDevDsn('postgresql://postgres:a@db.otro.supabase.co:5432/postgres'),/D041_WRONG_PROJECT/);
});
test('D041 rechaza usuario de otro proyecto en pooler',()=>{
  assert.throws(()=>validateDevDsn(pooler.replace(PROJECT_REF,'otro')),/D041_WRONG_PROJECT/);
});
test('D041 rechaza pooler de transacciones port 6543',()=>{
  assert.throws(()=>validateDevDsn(pooler.replace(':5432',':6543')),/D041_DEV_CONNECTION_INVALID/);
});
test('D041 exige TLS y credenciales',()=>{
  assert.throws(()=>validateDevDsn(direct.replace('sslmode=require','sslmode=disable')),/D041_TLS_REQUIRED/);
  assert.throws(()=>validateDevDsn(direct.replace(':example-not-a-real-secret@',':@')),/D041_DEV_CONNECTION_INVALID/);
});
test('D041 rechaza destino local',()=>{
  assert.throws(()=>validateDevDsn('postgresql://postgres:a@localhost:5432/postgres'),/D041_WRONG_PROJECT/);
});
test('D041 prueba protocolo age sin conservar ni devolver SQL',async()=>fixture(async(dir,key,hash)=>{
  let calls=0;
  const r=await verifyDecryption(dir,hash,key,fakeAge({onInvocation(cmd,args,opts){
    calls++;
    assert.equal(cmd,'age');
    assert.deepEqual(args.slice(0,3),['--decrypt','--identity',key]);
    assert.equal(opts.stdio[1],'pipe');
  }}));
  assert.equal(calls,5);
  assert.deepEqual(r,{status:'LOCAL_AGE_DECRYPT_CHECK_ONLY',files_decrypted:5,
    decrypt_streams_discarded:true,restore_verified:false,gate_d024_open:false});
}));
test('D041 falla con clave incorrecta/age error sin dar PASS',async()=>fixture(async(dir,key,hash)=>{
  await assert.rejects(verifyDecryption(dir,hash,key,fakeAge({code:1})),/D041_AGE_DECRYPT_FAILED/);
}));
test('D041 falla si age no entrega bytes',async()=>fixture(async(dir,key,hash)=>{
  await assert.rejects(verifyDecryption(dir,hash,key,fakeAge({bytes:0})),/D041_AGE_DECRYPT_FAILED/);
}));
test('D041 exige SHA externa anterior a descifrado',async()=>fixture(async(dir,key)=>{
  await assert.rejects(verifyDecryption(dir,'0'.repeat(64),key,fakeAge()),/D039_MANIFEST_SHA256_MISMATCH/);
}));
test('D041 rechaza archivo de clave expuesto',async()=>fixture(async(dir,key,hash)=>{
  await chmod(key,0o644);
  await assert.rejects(verifyDecryption(dir,hash,key,fakeAge()),/D041_IDENTITY_PERMISSIONS/);
}));
test('D041 rechaza identidad inexistente',async()=>fixture(async(dir,key,hash)=>{
  await assert.rejects(verifyDecryption(dir,hash,key+'.missing',fakeAge()),/D041_IDENTITY_NOT_FOUND/);
}));
test('D041 rechaza bundle modificado antes del probe',async()=>fixture(async(dir,key,hash)=>{
  await writeFile(join(dir,PIECES[0]),'age-encryption.org/v1\n'+'y'.repeat(80),{mode:0o600});
  await assert.rejects(verifyDecryption(dir,hash,key,fakeAge()),/D039_BACKUP_INTEGRITY_MISMATCH/);
}));
