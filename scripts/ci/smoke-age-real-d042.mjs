/**
 * D042 — Real age encryption/decryption integration on synthetic CI data ONLY.
 *
 * Uses distro-signed age/age-keygen binaries. All identities, ciphertext,
 * manifest and short synthetic SQL exist only in a disposable temp folder.
 * No production keys, no Supabase, no API credentials, no SQL restore.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkBundle, PIECES } from '../ops/verify-encrypted-dev-backup-d039.mjs';
import { verifyDecryption } from '../ops/check-local-dev-backup-d041.mjs';

function fail(code) { throw new Error('D042_' + code); }
function checkedCommand(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    ...options,
  });
  // Do not print command output. age-keygen stderr can contain recipient keys.
  if (result.error || result.status !== 0) fail('CRYPTO_COMMAND_FAILED');
  return result.stdout;
}
function expectAgeError(promise) {
  return assert.rejects(promise, err =>
    err instanceof Error && err.message === 'D041_AGE_DECRYPT_FAILED');
}
function expectHashError(promise) {
  return assert.rejects(promise, err =>
    err instanceof Error && err.message === 'D039_BACKUP_INTEGRITY_MISMATCH');
}
async function testRealAge() {
  if (process.env.CI !== 'true' || process.env.COTIRONDA_CI_REAL_AGE_SYNTHETIC !== 'true')
    fail('CI_SYNTHETIC_ONLY');
  // These checks reject accidental execution in a real backup environment.
  if (process.env.COTIRONDA_DEV_DB_URL || process.env.SUPABASE_DB_URL ||
      process.env.SUPABASE_ACCESS_TOKEN || process.env.OPENAI_API_KEY)
    fail('REAL_CREDENTIAL_ENV_PRESENT');
  const temp = await mkdtemp(join(tmpdir(), 'cotironda-d042-synthetic-'));
  await chmod(temp, 0o700);
  try {
    const bundle = join(temp, 'bundle');
    const invalidBundle = join(temp, 'invalid-bundle');
    await mkdir(bundle, { mode: 0o700 });
    await mkdir(invalidBundle, { mode: 0o700 });
    const identity = join(temp, 'age-identity.txt');
    const wrongIdentity = join(temp, 'wrong-age-identity.txt');
    checkedCommand('age-keygen', ['-o', identity]);
    checkedCommand('age-keygen', ['-o', wrongIdentity]);
    await chmod(identity, 0o600);
    await chmod(wrongIdentity, 0o600);
    const recipient = checkedCommand('age-keygen', ['-y', identity]).trim();
    if (!/^age1[ac-hj-np-z02-9]{20,}$/.test(recipient)) fail('RECIPIENT_NOT_VALID');
    for (let index = 0; index < PIECES.length; index++) {
      const syntheticSql = '-- SYNTHETIC D042 ONLY; NEVER REAL USER DATA\n' +
        'SELECT ' + (index + 1) + ' AS synthetic_backup_probe;\n';
      checkedCommand('age', ['--encrypt', '--recipient', recipient,
        '--output', join(bundle, PIECES[index])], { input: syntheticSql });
      await chmod(join(bundle, PIECES[index]), 0o600);
      await copyFile(join(bundle, PIECES[index]), join(invalidBundle, PIECES[index]));
      await chmod(join(invalidBundle, PIECES[index]), 0o600);
    }

    const sealed = await checkBundle('seal', bundle);
    assert.equal(sealed.restore_verified, false);
    assert.equal(sealed.gate_d024_open, false);
    const checked = await checkBundle('verify', bundle, sealed.manifest_sha256);
    assert.equal(checked.status, 'PACKAGE_INTEGRITY_ONLY');

    const valid = await verifyDecryption(bundle, sealed.manifest_sha256, identity);
    assert.equal(valid.status, 'LOCAL_AGE_DECRYPT_CHECK_ONLY');
    assert.equal(valid.files_decrypted, PIECES.length);
    assert.equal(valid.decrypt_streams_discarded, true);
    assert.equal(valid.restore_verified, false);
    assert.equal(valid.gate_d024_open, false);

    // All five ciphertexts are genuine, but the key is different.
    await expectAgeError(verifyDecryption(bundle, sealed.manifest_sha256, wrongIdentity));

    // Forge a plausible age header. It passes D039 header/hash if newly
    // sealed, but must FAIL real cryptographic decryption with age CLI.
    const forged = Buffer.from('age-encryption.org/v1\n' +
      '-> X25519 deliberately-malformed-stanza\n' + 'f'.repeat(180));
    await writeFile(join(invalidBundle, PIECES[2]), forged, { mode: 0o600 });
    const bogusSeal = await checkBundle('seal', invalidBundle);
    await expectAgeError(verifyDecryption(invalidBundle, bogusSeal.manifest_sha256, identity));

    // Any alteration after sealing must fail before invoking age.
    const modified = Buffer.from(await readFile(join(bundle, PIECES[0])));
    modified[modified.length - 1] ^= 0x01;
    await writeFile(join(bundle, PIECES[0]), modified, { mode: 0o600 });
    await expectHashError(verifyDecryption(bundle, sealed.manifest_sha256, identity));
    return Object.freeze({
      status: 'D042_REAL_AGE_SYNTHETIC_PASS',
      encrypted_files: PIECES.length,
      real_age_cli: true,
      wrong_identity_rejected: true,
      forged_header_rejected: true,
      tamper_rejected: true,
      real_dev_backup: false,
      restore_verified: false,
      gate_d024_open: false,
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
testRealAge().then(result => console.log(JSON.stringify(result))).catch(error => {
  // All errors are sanitized; never include paths, environment, ciphertext or keys.
  console.error(error instanceof Error && /^D042_[A-Z_]+$/.test(error.message)
    ? error.message : 'D042_SYNTHETIC_AGE_TEST_FAILED');
  process.exitCode = 1;
});
