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
// pg_dump's separate invocations use DIFFERENT snapshots by default.
 // Hold one exporter transaction open until all four database pieces finish.
 // No SQL/credentials pass through argv. The snapshot ID is an opaque PG
 // transaction handle, not a phone, token or customer datum.
const SNAPSHOT_ID = /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9]+$/i;
const SNAPSHOT_TIMEOUT_MS = 20000;
async function openConsistentSnapshot(env, spawnCommand) {
  const child = spawnCommand('psql',
    ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '--no-password'],
    { env, stdio: ['pipe', 'pipe', 'ignore'] });
  // Observe process exit immediately, even if the server disconnects early.
  const exited = processClosed(child).catch(() => -1);
  let timeout;
  let closedBeforeReady = false;
  let text = '';
  const ready = new Promise((resolveReady, rejectReady) => {
    const reject = () => rejectReady(new Error('MVP003_SNAPSHOT_UNAVAILABLE'));
    timeout = setTimeout(reject, SNAPSHOT_TIMEOUT_MS);
    child.once('error', reject);
    child.once('close', () => { closedBeforeReady = true; reject(); });
    child.stdout.on('data', bytes => {
      text += bytes.toString('utf8');
      if (text.length > 256) { reject(); return; }
      const pos = text.indexOf('\n');
      if (pos === -1) return;
      const first = text.slice(0, pos).trim();
      if (!SNAPSHOT_ID.test(first) || text.slice(pos + 1).trim() !== '') {
        reject(); return;
      }
      resolveReady(first);
    });
  });
  try {
    child.stdin.write(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n' +
      'SELECT pg_export_snapshot();\n');
    const snapshot = await ready;
    if (closedBeforeReady) fail('SNAPSHOT_UNAVAILABLE');
    // On success the caller MUST call close() in finally.
    return Object.freeze({
      snapshot,
      close: async () => {
        try { child.stdin.end('ROLLBACK;\n'); }
        catch { child.kill?.(); fail('SNAPSHOT_CLOSE_FAILED'); }
        if (await exited !== 0) fail('SNAPSHOT_CLOSE_FAILED');
      }
    });
  } catch {
    child.kill?.();
    fail('SNAPSHOT_UNAVAILABLE');
  } finally { clearTimeout(timeout); }
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
    for (const exe of ['pg_dump', 'pg_dumpall', 'psql']) await programVersion(exe, env, spawnCommand);
    // Export global roles separately. Global roles have no PostgreSQL DB snapshot.
    created.push(PIECES[0]);
    await encryptPiece(EXPORTS[0][0], EXPORTS[0][1], PIECES[0],
      destination, env, recipient, spawnCommand);
    const session = await openConsistentSnapshot(env, spawnCommand);
    try {
      for (let i = 1; i < PIECES.length; i++) {
        created.push(PIECES[i]);
        await encryptPiece(EXPORTS[i][0],
          [...EXPORTS[i][1], '--snapshot=' + session.snapshot],
          PIECES[i], destination, env, recipient, spawnCommand);
      }
    } finally {
      // A broken snapshot session invalidates the entire backup.
      await session.close();
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