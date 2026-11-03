/** MVP-120: deterministic, rollback-only pilot SQL rehearsal.
 * Never connects to a database, prints credentials or enables WhatsApp.
 * --check prints a digest; --sql emits a single reversible SQL script.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const STAGES=Object.freeze([
 'mvp117_upgrade_document_25.sql',
 'mvp101_supplier_quote_full_line_mirror.sql',
 'mvp102_supplier_dual_reading_gate.sql',
 'mvp103_supplier_amount_integrity.sql',
 'mvp104_supplier_receipt_ack.sql',
 'mvp105_live_approved_anonymous_tracking.sql',
 'mvp106_supplier_source_text_check.sql',
 'mvp107_anonymous_text_projection.sql',
 'mvp107_tracking_source_published.sql',
 'mvp108_finalists_coverage_safe.sql',
 'mvp109_encrypted_contacts_consents.sql',
 'mvp110_finalists_whapi_outbox.sql',
 'mvp110_buyer_finalists_tracking.sql',
 'mvp119_whapi_delivery_receipts.sql',
 'mvp118_release_db_gate.sql'
]);
export const FIXTURES=Object.freeze([
 'mvp112_roundtrip_e2e_rollback.sql',
 'mvp115_joint_supplier_smoke_rollback.sql',
 'mvp117_multi_page_request_smoke_rollback.sql',
 'mvp119_receipts_smoke_rollback.sql'
]);
export function readPilotFile(name){
 if(![...STAGES,...FIXTURES].includes(name))throw Error('mvp120_unapproved_file');
 return readFileSync(join(ROOT,'supabase','piloto',name),'utf8');
}
function assertStage(sql,name){
 if(typeof sql!=='string'||sql.trim().length<200)throw Error('mvp120_missing_stage:'+name);
 if(/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu.test(sql))
  throw Error('mvp120_embedded_transaction:'+name);
 return sql.trim()+'\n';
}
function unwrapFixture(sql,name){
 if(typeof sql!=='string')throw Error('mvp120_missing_fixture:'+name);
 const headless=sql.replace(/^(?:(?:\s*--[^\n]*\n)|(?:\s*\n))*/u,'');
 if(!/^begin\s*;/iu.test(headless)||!/\brollback\s*;\s*$/iu.test(headless))
  throw Error('mvp120_fixture_not_rollback_only:'+name);
 const body=headless.replace(/^begin\s*;\s*/iu,'').replace(/\brollback\s*;\s*$/iu,'').trim();
 if(body.length<200||/\bcommit\s*;/iu.test(body))
  throw Error('mvp120_unsafe_fixture:'+name);
 return body;
}
export function buildRehearsalSql(reader=readPilotFile){
 let out="BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '180s';\n";
 for(const name of STAGES)out+='-- MVP120 STAGE '+name+'\n'+assertStage(reader(name),name)+'\n';
 for(const [i,name] of FIXTURES.entries()){
  const savepoint='mvp120_fixture_'+(i+1);
  out+='SAVEPOINT '+savepoint+';\n'+unwrapFixture(reader(name),name)+'\n';
  out+='ROLLBACK TO SAVEPOINT '+savepoint+';\n';
 }
 out+="ROLLBACK;\n";
 out+="SELECT (to_regclass('cotironda_piloto_privado.supplier_quote_lines_mvp101') IS NULL AND "+
      "to_regclass('cotironda_piloto_privado.delivery_receipts_mvp119') IS NULL) "+
      "AS mvp120_reverted_without_install;\n";
 return out;
}
export function rehearsalSummary(reader=readPilotFile){
 const sql=buildRehearsalSql(reader);
 return {mode:'rollback_only',stages:STAGES.length,fixtures:FIXTURES.length,
  bytes:Buffer.byteLength(sql,'utf8'),
  sha256:createHash('sha256').update(sql).digest('hex'),
  database_connected:false,whatsapp_sent:false,backup_created:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=process.argv[2]??'--check';
 if(process.argv.length>3||!['--check','--sql'].includes(arg)){
  console.error('MVP120_USAGE: --check | --sql (rollback-only; never installs)');
  process.exitCode=2;
 }else try{
  if(arg==='--sql')process.stdout.write(buildRehearsalSql());
  else process.stdout.write(JSON.stringify(rehearsalSummary())+'\n');
 }catch{
  console.error('MVP120_REHEARSAL_NOT_GENERATED');
  process.exitCode=1;
 }
}
