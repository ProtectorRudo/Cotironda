import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {STAGES,FIXTURES,readPilotFile,buildRehearsalSql,rehearsalSummary}
 from '../../scripts/ops/mvp120-pilot-rehearsal.mjs';

test('MVP120: build includes all 15 ordered migrations and four synthetic fixtures',()=>{
 const sql=buildRehearsalSql();
 assert.equal(STAGES.length,15);
 assert.equal(FIXTURES.length,4);
 let previous=-1;
 for(const stage of STAGES){
  const index=sql.indexOf('MVP120 STAGE '+stage);
  assert.ok(index>previous,'out of order or missing: '+stage);
  previous=index;
 }
 assert.match(sql,/mvp118_release_db_gate/);
 assert.equal((sql.match(/^SAVEPOINT mvp120_fixture_\d+;$/gmu)||[]).length,4);
 assert.equal((sql.match(/ROLLBACK TO SAVEPOINT mvp120_fixture_\d+;/gu)||[]).length,4);
 assert.ok(sql.startsWith('BEGIN;\nSET LOCAL lock_timeout'));
 assert.match(sql,/\nROLLBACK;\nSELECT .*AS mvp120_reverted_without_install;\n$/u);
 assert.doesNotMatch(sql,/COTIRONDA_PILOT_WHAPI_TOKEN|DATABASE_URL=.*https?:/u);
});

test('MVP120: dry run metadata agrees with exact SQL bytes and never claims backup or delivery',()=>{
 const summary=rehearsalSummary();
 const sql=buildRehearsalSql();
 assert.equal(summary.mode,'rollback_only');
 assert.equal(summary.bytes,Buffer.byteLength(sql,'utf8'));
 assert.equal(summary.sha256,createHash('sha256').update(sql).digest('hex'));
 assert.equal(summary.database_connected,false);
 assert.equal(summary.whatsapp_sent,false);
 assert.equal(summary.backup_created,false);
});

test('MVP120: missing file or out-of-allowlist read fails closed',()=>{
 assert.throws(()=>readPilotFile('../secret.env'),/mvp120_unapproved_file/u);
 assert.throws(()=>buildRehearsalSql(name=>
  name===STAGES[3]?'':readPilotFile(name)),/mvp120_missing_stage/u);
});

test('MVP120: reject an embedded transaction that could escape outer rollback',()=>{
 assert.throws(()=>buildRehearsalSql(name=>
  name===STAGES[0]?'COMMIT; '+readPilotFile(name):readPilotFile(name)),
  /mvp120_embedded_transaction/u);
});

test('MVP120: reject fixture without explicit rollback or with COMMIT',()=>{
 assert.throws(()=>buildRehearsalSql(name=>
  name===FIXTURES[0]?readPilotFile(name).replace(/\brollback;\s*$/iu,''):
   readPilotFile(name)),/mvp120_fixture_not_rollback_only/u);
 assert.throws(()=>buildRehearsalSql(name=>
  name===FIXTURES[0]?readPilotFile(name).replace(/\brollback;\s*$/iu,'COMMIT; rollback;'):
   readPilotFile(name)),/mvp120_unsafe_fixture/u);
});
