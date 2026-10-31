/**
 * D039: local-only verification of the integrity of encrypted Supabase DEV SQL exports.
 * Does not connect to Supabase, decrypt, prove a successful dump, or authorize a restore.
 * No package dependencies; Node >=22.
 */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { resolve, join, parse, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROJECT_REF = 'qkercsoqhehbenbbncwk';
export const MANIFEST = 'cotironda-dev-backup-d039.manifest.json';
export const PIECES = Object.freeze([
  'roles.sql.age', 'schema.sql.age', 'data.sql.age',
  'history_schema.sql.age', 'history_data.sql.age',
]);
const AGE_HEADER = Buffer.from('age-encryption.org/v1\n', 'ascii');
const HASH_RE = /^[a-f0-9]{64}$/;
const FILES = new Set([...PIECES, MANIFEST]);

function fail(code) { throw new Error('D039_' + code); }
// D040: Fail closed on non-POSIX filesystems where mode/owner cannot be audited.
// The owner must operate on a trusted local machine, never a shared sync folder.
function checkPrivate(st, isDir) {
  if (process.platform === 'win32' || typeof process.getuid !== 'function')
    fail('POSIX_FILESYSTEM_REQUIRED');
  if (st.uid !== process.getuid()) fail('OWNER_MISMATCH');
  if ((st.mode & 0o077) !== 0) fail(isDir ? 'DIRECTORY_PERMISSIONS' : 'FILE_PERMISSIONS');
  if (!isDir && st.nlink !== 1) fail('HARDLINK_REJECTED');
}
function assertSameFile(before, after) {
  if (before.dev !== after.dev || before.ino !== after.ino ||
      before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs || before.mode !== after.mode ||
      before.uid !== after.uid || before.nlink !== after.nlink)
    fail('CONCURRENT_FILE_CHANGE');
}
async function safeDirectory(dir) {
  // A symbolic link in ANY ancestor can redirect backup bytes to a different tree.
  const root = parse(dir).root;
  let at = root;
  for (const component of dir.slice(root.length).split(sep).filter(Boolean)) {
    at = join(at, component);
    const st = await lstat(at).catch(() => fail('DIRECTORY_NOT_FOUND'));
    if (!st.isDirectory() || st.isSymbolicLink()) fail('DIRECTORY_UNSAFE');
  }
  const st = await lstat(dir).catch(() => fail('DIRECTORY_NOT_FOUND'));
  if (!st.isDirectory() || st.isSymbolicLink()) fail('DIRECTORY_UNSAFE');
  checkPrivate(st, true);
  const fileNames = await readdir(dir);
  for (const fileName of fileNames) {
    if (!FILES.has(fileName)) fail('UNEXPECTED_FILE_IN_BACKUP_DIR');
  }
  return dir;
}
async function safeOpenRegular(path) {
  const st = await lstat(path).catch(() => fail('FILE_MISSING'));
  if (!st.isFile() || st.isSymbolicLink()) fail('NOT_REGULAR_FILE');
  checkPrivate(st, false);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    .catch(() => fail('CANNOT_OPEN_REGULAR_FILE'));
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) fail('NOT_REGULAR_FILE');
    checkPrivate(opened, false);
    assertSameFile(st, opened);
  } catch (err) {
    await handle.close();
    throw err;
  }
  return handle;
}
async function inspectAge(dir, name) {
  const handle = await safeOpenRegular(join(dir, name));
  try {
    const st = await handle.stat();
    if (st.size <= 64) fail('ENCRYPTED_FILE_TOO_SMALL');
    const header = Buffer.alloc(AGE_HEADER.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || !header.equals(AGE_HEADER)) fail('INVALID_AGE_HEADER');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false, start: 0 })) {
      hash.update(chunk);
    }
    assertSameFile(st, await handle.stat());
    return { name, bytes: st.size, sha256: hash.digest('hex') };
  } finally { await handle.close(); }
}
function validateManifest(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) ||
    Object.keys(m).sort().join(',') !== 'artifacts,created_at,format,project_ref') fail('MANIFEST_INVALID');
  if (m.format !== 'cotironda-dev-backup-d039-v1' || m.project_ref !== PROJECT_REF ||
    typeof m.created_at !== 'string' || !Number.isFinite(Date.parse(m.created_at)) ||
    !Array.isArray(m.artifacts) || m.artifacts.length !== PIECES.length) fail('MANIFEST_INVALID');
  m.artifacts.forEach((a, i) => {
    if (!a || typeof a !== 'object' || Array.isArray(a) ||
      Object.keys(a).sort().join(',') !== 'bytes,name,sha256' || a.name !== PIECES[i] ||
      !Number.isSafeInteger(a.bytes) || a.bytes <= 64 || typeof a.sha256 !== 'string' ||
      !HASH_RE.test(a.sha256)) fail('MANIFEST_INVALID');
  });
}
export async function checkBundle(operation, directory, expectedManifestSha256) {
  if (!['seal', 'verify'].includes(operation) || typeof directory !== 'string' || directory.length === 0) {
    fail('USAGE');
  }
  const dir = resolve(directory);
  await safeDirectory(dir);
  const manifestPath = join(dir, MANIFEST);
  const artifacts = [];
  for (const name of PIECES) artifacts.push(await inspectAge(dir, name));
  if (operation === 'seal') {
    const m = { format: 'cotironda-dev-backup-d039-v1', project_ref: PROJECT_REF,
      created_at: new Date().toISOString(), artifacts };
    const handle = await open(manifestPath, 'wx', 0o600)
      .catch(() => fail('MANIFEST_ALREADY_EXISTS_OR_CANNOT_CREATE'));
    try { await handle.writeFile(JSON.stringify(m, null, 2) + '\n', 'utf8'); }
    finally { await handle.close(); }
    return { status: 'PACKAGE_SEALED_NOT_RESTORED', artifacts_checked: PIECES.length,
      manifest_sha256: createHash('sha256').update(JSON.stringify(m, null, 2) + '\n').digest('hex'),
      restore_verified: false, gate_d024_open: false };
  }
  if (typeof expectedManifestSha256 !== 'string' || !HASH_RE.test(expectedManifestSha256))
    fail('EXPECTED_MANIFEST_SHA256_REQUIRED');
  const handle = await safeOpenRegular(manifestPath);
  let m;
  try {
    if ((await handle.stat()).size > 65536) fail('MANIFEST_TOO_LARGE');
    const raw = await handle.readFile('utf8');
    if (createHash('sha256').update(raw).digest('hex') !== expectedManifestSha256)
      fail('MANIFEST_SHA256_MISMATCH');
    assertSameFile(await lstat(manifestPath), await handle.stat());
    m = JSON.parse(raw);
  } catch (err) {
    if (err.message?.startsWith('D039_')) throw err;
    fail('MANIFEST_INVALID');
  } finally { await handle.close(); }
  validateManifest(m);
  if (JSON.stringify(artifacts) !== JSON.stringify(m.artifacts)) fail('BACKUP_INTEGRITY_MISMATCH');
  return { status: 'PACKAGE_INTEGRITY_ONLY', artifacts_checked: PIECES.length,
    restore_verified: false, gate_d024_open: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkBundle(process.argv[2], process.argv[3], process.argv[4]).then(v => {
    console.log(JSON.stringify(v));
  }).catch(err => {
    console.error(err instanceof Error && err.message.startsWith('D039_') ? err.message : 'D039_FAILURE');
    process.exitCode = 1;
  });
}
