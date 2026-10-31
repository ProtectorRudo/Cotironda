/**
 * MVP-003 / #175: one-way, encrypted, read-only export of exact Cotironda DEV.
 * Local POSIX operator only. NO SQL restore, DB mutation, uploads or cloud artifacts.
 * Plaintext travels pg_dump -> age through pipes, never files or logs.
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, lstat, readdir, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { checkBundle, PIECES, PROJECT_REF } from './verify-encrypted-dev-backup-d039.mjs';
import { validateDevDsn } from './check-local-dev-backup-d041.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AGE_RECIPIENT = /^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/;
const fail = code => { throw new Error('MVP003_' + code); };
const EXPORTS = Object.freeze([
  ['pg_dumpall', ['--roles-only', '--no-role-passwords', '--no-password']],
  ['pg_dump', ['--schema-only', '--exclude-schema=supabase_migrations', '--no-password']],
  ['pg_dump', ['--data-only', '--exclude-schema=supabase_migrations', '--no-password']],
  ['pg_dump', ['--schema-only', '--schema=supabase_migrations', '--no-password']],
  ['pg_dump', ['--data-only', '--schema=supabase_migrations', '--no-password']],
]);

function processClosed(child) {
  return new Promise((resolveProcess, rejectProcess) => {
    child.once('error', () => rejectProcess(new Error('MVP003_COMMAND_UNAVAILABLE')));
    child.once('close', code => resolveProcess(code));
  });
}
async function programVersion(name, env, spawnCommand) {
  const child = spawnCommand(name, ['--version'], { env, stdio: ['ignore', 'pipe', 'ignore'] });
  const result = [];
  child.stdout.on('data', chunk => {
    if (result.reduce((n, x) => n + x.length, 0) < 1024) result.push(chunk);
  });
  const code = await processClosed(child);
  if (code !== 0 || !new RegExp('^' + name + ' \\(PostgreSQL\\) 17\\.', 'm').test(Buffer.concat(result).toString()))
    fail('PG17_TOOLS_REQUIRED');
}

function checkedConnection(raw) {
  validateDevDsn(raw); // D041 validates exact project, database, username, port and TLS.
  const parsed = new URL(raw);
  // No arbitrary URI options forwarded to libpq; otherwise host may be overridden.
  if ([...parsed.searchParams.keys()].some(key => key !== 'sslmode')) fail('UNEXPECTED_DSN_OPTIONS');
  let username, password;
  try { username = decodeURIComponent(parsed.username); password = decodeURIComponent(parsed.password); }
  catch { fail('INVALID_CREDENTIAL_ENCODING'); }
  if (!username || !password || username.includes('\0') || password.includes('\0')) fail('INVALID_CREDENTIAL_ENCODING');
  return {
    PGHOST: parsed.hostname, PGPORT: '5432', PGDATABASE: 'postgres',
    PGUSER: username, PGPASSWORD: password,
    PGSSLMODE: parsed.searchParams.get('sslmode'),
    PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c default_transaction_read_only=on',
  };
}
async function safeNewDestination(destination) {
  if (process.platform === 'win32' || typeof process.getuid !== 'function') fail('POSIX_REQUIRED');
  if (!isAbsolute(destination)) fail('ABSOLUTE_DESTINATION_REQUIRED');
  const full = resolve(destination);
  const rel = relative(REPO_ROOT, full);
  if (!rel.startsWith('..' + sep) && rel !== '..') fail('DESTINATION_INSIDE_REPOSITORY');
  const ancestors = [];
  let here = full;
  while (here !== parse(here).root) { ancestors.unshift(here); here = dirname(here); }
  for (const path of ancestors.slice(0, -1)) {
    const st = await lstat(path).catch(() => fail('PARENT_NOT_FOUND'));
    if (!st.isDirectory() || st.isSymbolicLink()) fail('UNSAFE_PARENT');
  }
  try { await mkdir(full, { mode: 0o700 }); }
  catch (e) { if (e.code !== 'EEXIST') fail('DESTINATION_CREATE_FAILED'); }
  const st = await lstat(full).catch(() => fail('DESTINATION_NOT_FOUND'));
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077) !== 0)
    fail('DESTINATION_NOT_PRIVATE');
  if ((await readdir(full)).length !== 0) fail('DESTINATION_NOT_EMPTY');
  return full;
}
async function encryptPiece(command, args, filename, destination, env, recipient, spawnCommand) {
  const producer = spawnCommand(command, args, { env, stdio: ['ignore', 'pipe', 'ignore'] });
  const cipher = spawnCommand('age', ['--encrypt', '--recipient', recipient], {
    env: { PATH: env.PATH, LANG: 'C' }, stdio: ['pipe', 'pipe', 'ignore'],
  });
  const sourceExit = processClosed(producer);
  const cipherExit = processClosed(cipher);
  const output = createWriteStream(join(destination, filename), { flags: 'wx', mode: 0o600 });
  try {
    const [_, __, sourceCode, cipherCode] = await Promise.all([
      pipeline(producer.stdout, cipher.stdin), pipeline(cipher.stdout, output),
      sourceExit, cipherExit,
    ]);
    if (sourceCode !== 0 || cipherCode !== 0) fail('DUMP_OR_ENCRYPT_FAILED');
  } catch {
    producer.kill?.(); cipher.kill?.(); output.destroy();
    fail('DUMP_OR_ENCRYPT_FAILED');
  }
}

/** Synthetic spawn may be injected by unit tests only. CLI always uses real spawn. */
export async function exportDevEncrypted({ directory, connectionUrl, recipient, spawnCommand = spawn }) {
  if (typeof directory !== 'string' || !directory || typeof recipient !== 'string' ||
      !AGE_RECIPIENT.test(recipient)) fail('INVALID_INPUT');
  const pg = checkedConnection(connectionUrl);
  const env = { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C', ...pg };
  const previousMask = process.umask(0o077);
  const created = [];
  let destination;
  try {
    destination = await safeNewDestination(directory);
    for (const exe of ['pg_dump', 'pg_dumpall']) await programVersion(exe, env, spawnCommand);
    for (let i = 0; i < PIECES.length; i++) {
      created.push(PIECES[i]);
      await encryptPiece(EXPORTS[i][0], EXPORTS[i][1], PIECES[i], destination, env, recipient, spawnCommand);
    }
    const sealed = await checkBundle('seal', destination);
    created.push('cotironda-dev-backup-d039.manifest.json');
    await checkBundle('verify', destination, sealed.manifest_sha256);
    return Object.freeze({
      status: 'ENCRYPTED_DEV_EXPORT_CREATED_NOT_RESTORED',
      pieces: PIECES.length, project_ref: PROJECT_REF,
      manifest_sha256: sealed.manifest_sha256,
      sql_plaintext_on_disk: false, restore_verified: false, gate_d024_open: false,
    });
  } catch (error) {
    // Do not leave incomplete data that could be mistaken for a recoverable backup.
    if (destination) await Promise.all(created.map(name => unlink(join(destination, name)).catch(() => {})));
    if (error instanceof Error && /^MVP003_[A-Z0-9_]+$/.test(error.message)) throw error;
    fail('EXPORT_FAILED');
  } finally { process.umask(previousMask); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  exportDevEncrypted({
    directory: process.argv[2], connectionUrl: process.env.COTIRONDA_DEV_DB_URL,
    recipient: process.env.COTIRONDA_AGE_RECIPIENT,
  }).then(result => console.log(JSON.stringify(result))).catch(err => {
    const safe = err instanceof Error && /^MVP003_[A-Z0-9_]+$/.test(err.message);
    console.error(safe ? err.message : 'MVP003_EXPORT_FAILED');
    process.exitCode = 1;
  });
}