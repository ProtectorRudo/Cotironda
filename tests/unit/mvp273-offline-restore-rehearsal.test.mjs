import test from 'node:test';
import assert from 'node:assert/strict';
import {PILOT_REF} from '../../scripts/ops/package-pilot-mobile-mvp269.mjs';
import {verifyPilotOfflineRehearsal}
 from '../../scripts/ops/verify-pilot-offline-rehearsal-mvp273.mjs';

const sha='a'.repeat(64),zip='/synthetic/backup.zip',key='/synthetic/identity.txt';
const args={zipPath:zip,identityPath:key,expectedSha256:sha,env:{}};
const storage=()=>({
 status:'PILOT_ENCRYPTED_STORAGE_BYTES_REPLAY_VERIFIED_NOT_RESTORED',
 project_ref:PILOT_REF,restore_verified:false,
 plaintext_written_to_disk:false,storage_service_restored:false,
 source_zip_sha256:sha,storage_objects_replayed:6,storage_payload_bytes:302406
});
const sql=()=>({
 status:'PILOT_SQL_DISPOSABLE_PG17_REPLAY_VERIFIED_NOT_SUPABASE_RESTORED',
 project_ref:PILOT_REF,restore_verified:false,
 encrypted_sql_streams_replayed:5,host_plaintext_sql_files:false,
 network_exposed:false,ports_exposed:false,
 isolated_container_destroyed_after_test:true
});
test('MVP273: both isolated replay checks pass and never authorize pilot writes',async()=>{
 const calls=[];
 const r=await verifyPilotOfflineRehearsal({...args,
  storageFn:async()=>{calls.push('storage');return storage()},
  sqlFn:async()=>{calls.push('sql');return sql()}
 });
 assert.deepEqual(calls,['storage','sql']);
 assert.equal(r.status,'PILOT_OFFLINE_STORAGE_AND_SQL_REPLAY_CHECKED_NOT_RECOVERED');
 assert.equal(r.storage_objects_checked,6);
 assert.equal(r.storage_bytes_checked,302406);
 assert.equal(r.sql_streams_replayed,5);
 assert.equal(r.standalone_pg17_replay_verified,true);
 assert.equal(r.managed_supabase_restore_verified,false);
 assert.equal(r.original_storage_service_restore_verified,false);
 assert.equal(r.auth_and_vault_restore_verified,false);
 assert.equal(r.restore_verified,false);
 assert.equal(r.pilot_sql_migration_authorized_by_rehearsal,false);
 assert.equal(r.mobile_delivery_ready,false);
});
test('MVP273: storage check failure stops before launching SQL Docker',async()=>{
 let sqlCalls=0;
 await assert.rejects(verifyPilotOfflineRehearsal({...args,
  storageFn:async()=>({...storage(),restore_verified:true}),
  sqlFn:async()=>{sqlCalls++;return sql()}
 }),/MVP273_OFFLINE_STORAGE_NOT_VERIFIED/u);
 assert.equal(sqlCalls,0);
});
test('MVP273: SQL replay error never implies complete recovery',async()=>{
 await assert.rejects(verifyPilotOfflineRehearsal({...args,
  storageFn:async()=>storage(),
  sqlFn:async()=>({...sql(),isolated_container_destroyed_after_test:false})
 }),/MVP273_OFFLINE_SQL_NOT_VERIFIED/u);
});
test('MVP273: rejects a false success / wrong Supabase project',async()=>{
 await assert.rejects(verifyPilotOfflineRehearsal({...args,
  storageFn:async()=>({...storage(),project_ref:'wrong'})
 }),/MVP273_OFFLINE_STORAGE_NOT_VERIFIED/u);
 await assert.rejects(verifyPilotOfflineRehearsal({...args,
  storageFn:async()=>storage(),
  sqlFn:async()=>({...sql(),restore_verified:true})
 }),/MVP273_OFFLINE_SQL_NOT_VERIFIED/u);
});
