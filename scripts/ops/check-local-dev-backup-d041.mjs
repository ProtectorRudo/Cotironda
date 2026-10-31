/**
 * D041 — Local-only checks before trusting a Cotironda DEV backup.
 * No network, no SQL restore, no identity contents or decrypted SQL in logs.
 * This module MUST NOT be used on GitHub Actions with real archives/credentials.
 */
import { spawn } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { resolve, join, parse, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkBundle, PIECES, PROJECT_REF } from './verify-encrypted-dev-backup-d039.mjs';

const fail = code => { throw new Error('D041_' + code); };

export function validateDevDsn(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096)
    fail('DEV_CONNECTION_REQUIRED');
  let dsn;
  try { dsn = new URL(raw); } catch { fail('DEV_CONNECTION_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(dsn.protocol) ||
    dsn.password.length === 0 || dsn.hash.length !== 0 ||
    dsn.pathname !== '/postgres' || dsn.port !== '5432')
    fail('DEV_CONNECTION_INVALID');
  const mode = dsn.searchParams.get('sslmode');
  if (mode && !['require','verify-full','verify-ca'].includes(mode))
    fail('TLS_REQUIRED');
  let method;
  if (dsn.hostname === 'db.' + PROJECT_REF + '.supabase.co' &&
      decodeURIComponent(dsn.username) === 'postgres') {
    method = 'direct';
  } else if (/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(dsn.hostname) &&
             decodeURIComponent(dsn.username) === 'postgres.' + PROJECT_REF) {
    method = 'session_pooler';
  } else fail('WRONG_PROJECT');
  // Do not return/log any part of the DSN, host, username or password.
  return Object.freeze({ status:'DEV_TARGET_CHECKED_OFFLINE', project_ref:PROJECT_REF,
    method, network_calls:0, authorization_to_restore:false });
}
async function checkPrivateIdentity(path) {
  const root = parse(path).root;
  let part = root;
  for (const c of path.slice(root.length).split(sep).filter(Boolean)) {
    part = join(part, c);
    const st = await lstat(part).catch(() => fail('IDENTITY_NOT_FOUND'));
    if (st.isSymbolicLink()) fail('IDENTITY_SYMLINK');
  }
  const st = await lstat(path).catch(() => fail('IDENTITY_NOT_FOUND'));
  if (!st.isFile() || st.nlink !== 1) fail('IDENTITY_UNSAFE');
  if (process.platform === 'win32' || typeof process.getuid !== 'function')
    fail('POSIX_REQUIRED');
  if (st.uid !== process.getuid() || (st.mode & 0o077) !== 0)
    fail('IDENTITY_PERMISSIONS');
}

/** Subprocess test seam is private to this module's test invocation; CLI always uses real spawn. */
async function probeAge(archivePath, identityPath, spawnAge) {
  return new Promise((resolveProbe, rejectProbe) => {
    let child;
    try {
      child = spawnAge('age', ['--decrypt', '--identity', identityPath, archivePath], {
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { PATH: process.env.PATH || '/usr/bin:/bin', LANG:'C' },
      });
    } catch { rejectProbe(new Error('D041_AGE_NOT_AVAILABLE')); return; }
    let total = 0;
    let failed = false;
    child.stdout.on('data', chunk => {
      total += chunk.length; // Drain into nowhere, never retain or write plaintext.
      if (!Number.isSafeInteger(total)) {
        failed = true;
        child.kill();
      }
    });
    child.on('error', () => { failed = true; });
    child.on('close', code => {
      if (failed || code !== 0 || total === 0)
        rejectProbe(new Error('D041_AGE_DECRYPT_FAILED'));
      else resolveProbe(total);
    });
  });
}
export async function verifyDecryption(dir, manifestHash, identityFile, spawnAge = spawn) {
  if (typeof identityFile !== 'string' || identityFile.length === 0)
    fail('IDENTITY_REQUIRED');
  const full = resolve(identityFile);
  await checkPrivateIdentity(full);
  const first = await checkBundle('verify', dir, manifestHash);
  if (first.status !== 'PACKAGE_INTEGRITY_ONLY') fail('BUNDLE_INVALID');
  const directory = resolve(dir);
  let checked = 0;
  for (const file of PIECES) {
    await probeAge(join(directory,file), full, spawnAge);
    checked++;
  }
  // Detect archives modified during an external age run; never trust just a prior hash.
  await checkBundle('verify', dir, manifestHash);
  return Object.freeze({ status:'LOCAL_AGE_DECRYPT_CHECK_ONLY', files_decrypted:checked,
    decrypt_streams_discarded:true, restore_verified:false, gate_d024_open:false });
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const operation = process.argv[2];
  const work = operation === 'target'
    ? Promise.resolve().then(() => validateDevDsn(process.env.COTIRONDA_DEV_DB_URL))
    : operation === 'decrypt'
      ? verifyDecryption(process.argv[3], process.argv[4], process.argv[5])
      : Promise.reject(new Error('D041_USAGE'));
  work.then(result => console.log(JSON.stringify(result))).catch(error => {
    const code = error instanceof Error && /^D0(?:39|41)_[A-Z_]+$/.test(error.message)
      ? error.message : 'D041_FAILED';
    console.error(code);
    process.exitCode = 1;
  });
}
