import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink, chmod, link, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { checkBundle, MANIFEST, PIECES, PROJECT_REF } from '../../scripts/ops/verify-encrypted-dev-backup-d039.mjs';

async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'cotironda-d039-'));
  try {
    for (const [i, name] of PIECES.entries()) {
      await writeFile(join(dir, name), 'age-encryption.org/v1\n-> X25519 ' + i + '\n--- ' + 'x'.repeat(72), {mode:0o600});
    }
    await fn(dir);
  } finally { await rm(dir, {recursive:true, force:true}); }
}

test('D039 seal y verify dan PASS sólo de integridad; NO habilitan D024', async () => fixture(async dir => {
  const sealed = await checkBundle('seal', dir);
  assert.equal(sealed.status,'PACKAGE_SEALED_NOT_RESTORED');
  assert.equal(sealed.artifacts_checked,5);
  assert.equal(sealed.restore_verified,false);
  assert.equal(sealed.gate_d024_open,false);
  assert.match(sealed.manifest_sha256,/^[a-f0-9]{64}$/);
  const m = JSON.parse(await readFile(join(dir,MANIFEST),'utf8'));
  assert.equal(m.project_ref,PROJECT_REF);
  const r = await checkBundle('verify', dir, sealed.manifest_sha256);
  assert.deepEqual(r,{status:'PACKAGE_INTEGRITY_ONLY',artifacts_checked:5,restore_verified:false,gate_d024_open:false});
}));
test('D039 rechazo de archivo faltante', async () => fixture(async dir => {
  await rm(join(dir,PIECES[2]));
  await assert.rejects(checkBundle('seal',dir),/D039_FILE_MISSING/);
}));
test('D039 rechazo de SQL sin cifrar y contenido inesperado', async () => fixture(async dir => {
  await writeFile(join(dir,'datos.sql'),'secretos', {mode:0o600});
  await assert.rejects(checkBundle('seal',dir),/D039_UNEXPECTED_FILE_IN_BACKUP_DIR/);
}));
test('D039 rechazo de extensión .age falsa', async () => fixture(async dir => {
  await writeFile(join(dir,PIECES[1]),'SELECT * FROM auth.users;'.repeat(5),{mode:0o600});
  await assert.rejects(checkBundle('seal',dir),/D039_INVALID_AGE_HEADER/);
}));
test('D039 rechazo de datos alterados tras sellado', async () => fixture(async dir => {
  const sealed=await checkBundle('seal',dir);
  await writeFile(join(dir,PIECES[0]),'age-encryption.org/v1\n-> X25519 99\n--- '+ 'y'.repeat(72));
  await assert.rejects(checkBundle('verify',dir,sealed.manifest_sha256),/D039_BACKUP_INTEGRITY_MISMATCH/);
}));
test('D039 rechazo de symlink', async () => fixture(async dir => {
  await rm(join(dir,PIECES[3]));
  await symlink(join(dir,PIECES[2]),join(dir,PIECES[3]));
  await assert.rejects(checkBundle('seal',dir),/D039_NOT_REGULAR_FILE/);
}));
test('D039 rechaza manifiesto de otro proyecto', async () => fixture(async dir => {
  const sealed=await checkBundle('seal',dir);
  const p=join(dir,MANIFEST),m=JSON.parse(await readFile(p,'utf8'));
  m.project_ref='OTRO_PROYECTO';
  await writeFile(p,JSON.stringify(m));
  await assert.rejects(checkBundle('verify',dir,sealed.manifest_sha256),/D039_MANIFEST_SHA256_MISMATCH/);
}));
test('D039 no pisa manifiesto preexistente', async () => fixture(async dir => {
  await checkBundle('seal',dir);
  await assert.rejects(checkBundle('seal',dir),/D039_MANIFEST_ALREADY_EXISTS_OR_CANNOT_CREATE/);
}));
test('D039 rechaza carpeta con symlink', async () => fixture(async dir => {
  const link=dir+'-link';
  await symlink(dir,link);
  try { await assert.rejects(checkBundle('seal',link),/D039_DIRECTORY_UNSAFE/); }
  finally { await rm(link); }
}));
test('D039 rechaza faltante de manifiesto', async () => fixture(async dir => {
  await assert.rejects(checkBundle('verify',dir,'1'.repeat(64)),/D039_FILE_MISSING/);
}));
test('D039 rechaza manifiesto corrupto', async () => fixture(async dir => {
  const sealed=await checkBundle('seal',dir);
  await writeFile(join(dir,MANIFEST),'NOT JSON');
  await assert.rejects(checkBundle('verify',dir,sealed.manifest_sha256),/D039_MANIFEST_SHA256_MISMATCH/);
}));
test('D039 exige hash externo confiable para verificar', async () => fixture(async dir => {
  await checkBundle('seal',dir);
  await assert.rejects(checkBundle('verify',dir),/D039_EXPECTED_MANIFEST_SHA256_REQUIRED/);
}));

test('D040 rechaza carpeta backup con permiso group/other', async () => fixture(async dir => {
  await chmod(dir, 0o755);
  await assert.rejects(checkBundle('seal',dir),/D039_DIRECTORY_PERMISSIONS/);
}));
test('D040 rechaza archivo age accesible por grupo u otros', async () => fixture(async dir => {
  await chmod(join(dir, PIECES[1]), 0o644);
  await assert.rejects(checkBundle('seal',dir),/D039_FILE_PERMISSIONS/);
}));
test('D040 rechaza hardlinks del contenido', async () => fixture(async dir => {
  await rm(join(dir, PIECES[0]));
  await link(join(dir, PIECES[1]), join(dir, PIECES[0]));
  await assert.rejects(checkBundle('seal',dir),/D039_HARDLINK_REJECTED/);
}));
test('D040 rechaza symlink en un componente padre de la carpeta', async () => fixture(async dir => {
  const alias=join(dir, 'alias-parent');
  await symlink(dirname(dir),alias);
  await assert.rejects(checkBundle('seal',join(alias,basename(dir))),/D039_DIRECTORY_UNSAFE/);
}));
test('D040 rechaza manifiesto existente con permiso público', async () => fixture(async dir => {
  const sealed=await checkBundle('seal',dir);
  await chmod(join(dir,MANIFEST),0o644);
  await assert.rejects(checkBundle('verify',dir,sealed.manifest_sha256),/D039_FILE_PERMISSIONS/);
}));
test('D040 conserva modo privado de manifiesto creado 0600', async () => fixture(async dir => {
  await checkBundle('seal',dir);
  const metadata=await stat(join(dir,MANIFEST));
  assert.equal(metadata.mode & 0o777,0o600);
}));
