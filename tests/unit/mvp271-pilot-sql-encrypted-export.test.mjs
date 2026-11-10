import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readdir, rm, chmod, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { exportPilotSqlEncrypted } from '../../scripts/ops/export-encrypted-pilot-sql-mvp271.mjs';
import {validatePilotDsn} from '../../scripts/ops/validate-pilot-dsn-mvp271.mjs';
import {PILOT_REF as PROJECT_REF} from '../../scripts/ops/package-pilot-mobile-mvp269.mjs';
const PIECES=['roles.sql.age','schema.sql.age','data.sql.age',
 'history_schema.sql.age','history_data.sql.age'];

// All exports are synthetic: no credentials, SQL server or actual encryption in CI.
function runExport(opts){
 return exportPilotSqlEncrypted({...opts,rawEnv:{PATH:process.env.PATH||'/usr/bin:/bin',CI:'false',
  GITHUB_ACTIONS:'',VERCEL:'',VERCEL_ENV:'',
  COTIRONDA_AGE_IDENTITY_FILE:join(dirname(opts.directory),'identity.txt')
 }});
}
const url = 'postgresql://postgres:not-a-real-secret@db.' + PROJECT_REF + '.supabase.co:5432/postgres?sslmode=require';
const recipient = 'age1' + 'q'.repeat(58);
function syntheticTools(calls, { badVersion = false, failDumpIndex = -1,
    invalidSnapshot = false, snapshotDisconnect = false } = {}) {
  let dumps = 0;
  return (binary, args, opts) => {
    calls.push({ binary, args, opts });
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.kill = () => {};
    if (binary === 'age-keygen') {
      queueMicrotask(() => {
        child.stdout.end(recipient+'\n');
        child.emit('close',0);
      });
    } else if (args.includes('--version')) {
      queueMicrotask(() => {
        child.stdout.end(binary + ' (PostgreSQL) ' + (badVersion ? '16.4' : '17.11') + '\n');
        child.emit('close', 0);
      });
    } else if (binary === 'psql') {
      let sql = '';
      child.stdin.on('data', chunk => {
        sql += chunk.toString();
        if (sql.includes('SELECT pg_export_snapshot();') &&
            !child.snapshotEmitted) {
          child.snapshotEmitted = true;
          queueMicrotask(() => {
            if (snapshotDisconnect) {
              child.stdout.end();
              child.emit('close', 1);
            } else {
              child.stdout.write(invalidSnapshot
                ? 'invalid_response_from_psql\n'
                : '00000003-0000001B-1\n');
            }
          });
        }
      });
      child.stdin.on('end', () => {
        if (!snapshotDisconnect) queueMicrotask(() => {
          child.stdout.end();
          child.emit('close', 0);
        });
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
  await writeFile(join(tmp,'identity.txt'),'FAKE-TEST-ONLY', {mode:0o600});
  try { await run(dest); }
  finally { await rm(tmp, { recursive: true, force: true }); }
}
test('MVP271 five synthetic pilot export streams, shared snapshot, no plaintext', async () => fixture(async dest => {
  const calls = [];
  const r = await runExport({ directory:dest, connectionUrl:url, recipient, spawnCommand:syntheticTools(calls) });
  assert.equal(r.status, 'PILOT_SQL_CIPHERTEXT_CREATED_NOT_RESTORED');
  assert.equal(r.restore_verified, false);
  assert.equal(r.mobile_zip_created, false);
  assert.equal(r.project_ref,PROJECT_REF);
  assert.equal((await readdir(dest)).length, PIECES.length);
  assert.equal(calls.filter(x => x.binary === 'age').length, 5);
  assert.equal(calls.filter(x => x.binary === 'pg_dump' && !x.args.includes('--version')).length, 4);
  assert.equal(calls.filter(x => x.binary === 'pg_dumpall' && x.args.includes('--roles-only')).length, 1);
  assert.equal(calls.filter(x => x.binary === 'psql' && x.args.includes('-X')).length, 1);
  const databaseDumps = calls.filter(x =>
    x.binary === 'pg_dump' && !x.args.includes('--version'));
  assert.equal(databaseDumps.length, 4);
  assert.ok(databaseDumps.every(x =>
    x.args.filter(arg => arg.startsWith('--snapshot='))
      .join('') === '--snapshot=00000003-0000001B-1'));
  assert.ok(calls.some(x =>
    x.binary === 'psql' && x.args.includes('ON_ERROR_STOP=1')));
  assert.ok(calls.every(x => !JSON.stringify(x.args).includes('pg_export_snapshot')));
  assert.ok(calls.every(c => !JSON.stringify(c.args).includes('not-a-real-secret')));
  const pg = calls.filter(x => !['age','age-keygen'].includes(x.binary));
  assert.ok(pg.every(c => c.opts.env.PGOPTIONS.includes('default_transaction_read_only=on')));
  assert.ok(pg.every(c => c.opts.env.PGSSLMODE === 'require'));
}));
test('MVP271 rejects wrong Supabase project before disk creation', async () => fixture(async dest => {
  await assert.rejects(runExport({directory:dest, connectionUrl:url.replace(PROJECT_REF, 'unproyectoajeno'), recipient}), /MVP271_WRONG_PROJECT/);
  await assert.rejects(readdir(dest), /ENOENT/);
}));
test('MVP271 rejects extra connection URL options', async () => fixture(async dest => {
  await assert.rejects(runExport({directory:dest, connectionUrl:url+'&host=otro', recipient}), /MVP271_PILOT_CONNECTION_INVALID/);
}));
test('MVP271 rejects arbitrary age recipient', async () => fixture(async dest => {
  await assert.rejects(runExport({directory:dest, connectionUrl:url, recipient:'ssh-rsa NotAge'}), /MVP271_INVALID_INPUT/);
}));
test('MVP271 rejects PostgreSQL 16 before producing ciphertext', async () => fixture(async dest => {
  await assert.rejects(runExport({directory:dest, connectionUrl:url, recipient, spawnCommand:syntheticTools([], {badVersion:true})}), /MVP271_PG17_TOOLS_REQUIRED/);
  assert.deepEqual(await readdir(dest), []);
}));
test('MVP271 cleans partial exports after pg_dump failure', async () => fixture(async dest => {
  await assert.rejects(runExport({directory:dest, connectionUrl:url, recipient, spawnCommand:syntheticTools([], {failDumpIndex:2})}), /MVP271_DUMP_OR_ENCRYPT_FAILED/);
  assert.deepEqual(await readdir(dest), []);
}));
test('MVP271 never overwrites an occupied output directory', async () => fixture(async dest => {
  await mkdir(dest, {mode:0o700});
  await writeFile(join(dest, 'existing.txt'), 'preserve', {mode:0o600});
  await assert.rejects(runExport({directory:dest, connectionUrl:url, recipient,spawnCommand:syntheticTools([])}), /MVP271_DESTINATION_NOT_EMPTY/);
  assert.deepEqual(await readdir(dest), ['existing.txt']);
}));
test('MVP271 denies output directory that is readable by others', async () => fixture(async dest => {
  await mkdir(dest, {mode:0o700});
  await chmod(dest,0o755);
  await assert.rejects(runExport({directory:dest,connectionUrl:url,recipient,spawnCommand:syntheticTools([])}), /MVP271_DESTINATION_NOT_PRIVATE/);
}));
test('MVP271 requires absolute output directory', async () => {
  await assert.rejects(runExport({directory:'backup',connectionUrl:url,recipient,spawnCommand:syntheticTools([])}), /MVP271_ABSOLUTE_DESTINATION_REQUIRED/);
});
test('MVP271 rejects any destination within repository checkout', async () => {
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  await assert.rejects(runExport({
    directory:join(repo,'backup-should-not-exist'),connectionUrl:url,
    recipient,spawnCommand:syntheticTools([]),
  }), /MVP271_DESTINATION_INSIDE_REPOSITORY/);
});

test('MVP022 aborts before database dump if snapshot protocol is corrupt', async () =>
  fixture(async dest => {
    const calls=[];
    await assert.rejects(runExport({
      directory:dest,connectionUrl:url,recipient,
      spawnCommand:syntheticTools(calls,{invalidSnapshot:true}),
    }),/MVP271_SNAPSHOT_UNAVAILABLE/);
    assert.equal(calls.filter(x => x.binary==='pg_dump' &&
      !x.args.includes('--version')).length,0);
    assert.deepEqual(await readdir(dest),[]);
  }));
test('MVP022 rejects psql connection loss before snapshot', async () =>
  fixture(async dest => {
    const calls=[];
    await assert.rejects(runExport({
      directory:dest,connectionUrl:url,recipient,
      spawnCommand:syntheticTools(calls,{snapshotDisconnect:true}),
    }),/MVP271_SNAPSHOT_UNAVAILABLE/);
    assert.deepEqual(await readdir(dest),[]);
  }));
test('MVP022 rejects old psql version before exporting any bytes', async () =>
  fixture(async dest => {
    await assert.rejects(runExport({
      directory:dest,connectionUrl:url,recipient,
      spawnCommand:syntheticTools([],{badVersion:true}),
    }),/MVP271_PG17_TOOLS_REQUIRED/);
    assert.deepEqual(await readdir(dest),[]);
  }));

test('MVP271 project and TLS boundaries reject wrong DB silently',()=>{
 const good='postgresql://postgres:fake-secret@db.'+PROJECT_REF+
  '.supabase.co:5432/postgres?sslmode=require';
 assert.equal(validatePilotDsn(good).project_ref,PROJECT_REF);
 const pool='postgresql://postgres.'+PROJECT_REF+
  ':secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require';
 assert.equal(validatePilotDsn(pool).method,'session_pooler');
 for(const bad of [good.replace(PROJECT_REF,'qkercsoqhehbenbbncwk'),
  good.replace('sslmode=require','sslmode=disable'),
  good+'&host=localhost',good.replace('5432','6543'),
  good.replace('/postgres?','/other?')]){
  assert.throws(()=>validatePilotDsn(bad),/MVP271_/u);
 }
});
test('MVP271 must fail in CI or Vercel BEFORE exporting any SQL',async()=>fixture(async dest=>{
 for(const envChange of [{CI:'true'},{GITHUB_ACTIONS:'true'},{VERCEL_ENV:'preview'}]){
  const calls=[];
  await assert.rejects(exportPilotSqlEncrypted({
   directory:dest,connectionUrl:url,recipient,
   rawEnv:{PATH:process.env.PATH||'/usr/bin:/bin',...envChange},
   spawnCommand:syntheticTools(calls)
  }),/MVP271_TRUSTED_LOCAL_ONLY/u);
  assert.equal(calls.length,0);
 }
}));
