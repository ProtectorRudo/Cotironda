import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readdir, rm, chmod, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportDevEncrypted } from '../../scripts/ops/export-encrypted-dev-mvp003.mjs';
import { PROJECT_REF, PIECES } from '../../scripts/ops/verify-encrypted-dev-backup-d039.mjs';

// All exports are synthetic: no credentials, SQL server or actual encryption in CI.
const url = 'postgresql://postgres:not-a-real-secret@db.' + PROJECT_REF + '.supabase.co:5432/postgres?sslmode=require';
const recipient = 'age1' + 'q'.repeat(58);
function syntheticTools(calls, { badVersion = false, failDumpIndex = -1 } = {}) {
  let dumps = 0;
  return (binary, args, opts) => {
    calls.push({ binary, args, opts });
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.kill = () => {};
    if (args.includes('--version')) {
      queueMicrotask(() => {
        child.stdout.end(binary + ' (PostgreSQL) ' + (badVersion ? '16.4' : '17.11') + '\n');
        child.emit('close', 0);
      });
    } else if (binary === 'age') {
      void (async () => {
        for await (const _ of child.stdin) { /* drain fake SQL */ }
        child.stdout.end('age-encryption.org/v1\n' + 'X'.repeat(110));
        child.emit('close', 0);
      })();
    } else {
      const index = dumps++;
      queueMicrotask(() => {
        child.stdout.end('-- synthetic content ' + index + '\n' + 'Y'.repeat(120));
        child.emit('close', index === failDumpIndex ? 1 : 0);
      });
    }
    return child;
  };
}
async function fixture(run) {
  const tmp = await mkdtemp(join(tmpdir(), 'cotironda-mvp003-'));
  const dest = join(tmp, 'backup');
  try { await run(dest); }
  finally { await rm(tmp, { recursive: true, force: true }); }
}
test('MVP003 five synthetic export streams, SHA seal, readonly and secret absent from argv', async () => fixture(async dest => {
  const calls = [];
  const r = await exportDevEncrypted({ directory:dest, connectionUrl:url, recipient, spawnCommand:syntheticTools(calls) });
  assert.equal(r.status, 'ENCRYPTED_DEV_EXPORT_CREATED_NOT_RESTORED');
  assert.equal(r.restore_verified, false);
  assert.equal(r.gate_d024_open, false);
  assert.match(r.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.equal((await readdir(dest)).length, PIECES.length + 1);
  assert.equal(calls.filter(x => x.binary === 'age').length, 5);
  assert.equal(calls.filter(x => x.binary === 'pg_dump' && !x.args.includes('--version')).length, 4);
  assert.equal(calls.filter(x => x.binary === 'pg_dumpall' && x.args.includes('--roles-only')).length, 1);
  assert.ok(calls.every(c => !JSON.stringify(c.args).includes('not-a-real-secret')));
  const pg = calls.filter(x => x.binary !== 'age');
  assert.ok(pg.every(c => c.opts.env.PGOPTIONS.includes('default_transaction_read_only=on')));
  assert.ok(pg.every(c => c.opts.env.PGSSLMODE === 'require'));
}));
test('MVP003 rejects wrong Supabase project before disk creation', async () => fixture(async dest => {
  await assert.rejects(exportDevEncrypted({directory:dest, connectionUrl:url.replace(PROJECT_REF, 'unproyectoajeno'), recipient}), /D041_WRONG_PROJECT/);
  await assert.rejects(readdir(dest), /ENOENT/);
}));
test('MVP003 rejects extra connection URL options', async () => fixture(async dest => {
  await assert.rejects(exportDevEncrypted({directory:dest, connectionUrl:url+'&host=otro', recipient}), /MVP003_UNEXPECTED_DSN_OPTIONS/);
}));
test('MVP003 rejects arbitrary age recipient', async () => fixture(async dest => {
  await assert.rejects(exportDevEncrypted({directory:dest, connectionUrl:url, recipient:'ssh-rsa NotAge'}), /MVP003_INVALID_INPUT/);
}));
test('MVP003 rejects PostgreSQL 16 before producing ciphertext', async () => fixture(async dest => {
  await assert.rejects(exportDevEncrypted({directory:dest, connectionUrl:url, recipient, spawnCommand:syntheticTools([], {badVersion:true})}), /MVP003_PG17_TOOLS_REQUIRED/);
  assert.deepEqual(await readdir(dest), []);
}));
test('MVP003 cleans partial exports after pg_dump failure', async () => fixture(async dest => {
  await assert.rejects(exportDevEncrypted({directory:dest, connectionUrl:url, recipient, spawnCommand:syntheticTools([], {failDumpIndex:2})}), /MVP003_DUMP_OR_ENCRYPT_FAILED/);
  assert.deepEqual(await readdir(dest), []);
}));
test('MVP003 never overwrites an occupied output directory', async () => fixture(async dest => {
  await mkdir(dest, {mode:0o700});
  await writeFile(join(dest, 'existing.txt'), 'preserve', {mode:0o600});
  await assert.rejects(exportDevEncrypted({directory:dest, connectionUrl:url, recipient,spawnCommand:syntheticTools([])}), /MVP003_DESTINATION_NOT_EMPTY/);
  assert.deepEqual(await readdir(dest), ['existing.txt']);
}));
test('MVP003 denies output directory that is readable by others', async () => fixture(async dest => {
  await mkdir(dest, {mode:0o700});
  await chmod(dest,0o755);
  await assert.rejects(exportDevEncrypted({directory:dest,connectionUrl:url,recipient,spawnCommand:syntheticTools([])}), /MVP003_DESTINATION_NOT_PRIVATE/);
}));
test('MVP003 requires absolute output directory', async () => {
  await assert.rejects(exportDevEncrypted({directory:'backup',connectionUrl:url,recipient,spawnCommand:syntheticTools([])}), /MVP003_ABSOLUTE_DESTINATION_REQUIRED/);
});
test('MVP003 rejects any destination within repository checkout', async () => {
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  await assert.rejects(exportDevEncrypted({
    directory:join(repo,'backup-should-not-exist'),connectionUrl:url,
    recipient,spawnCommand:syntheticTools([]),
  }), /MVP003_DESTINATION_INSIDE_REPOSITORY/);
});
