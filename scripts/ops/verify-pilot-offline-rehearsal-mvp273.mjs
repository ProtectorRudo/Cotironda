/**
 * MVP273 - one offline rehearsal for Cotironda PILOTO mobile backup:
 *  1) verify every Storage TAR object's bytes against its encrypted index
 *  2) replay SQL into a disposable, portless, networkless PostgreSQL17.
 *
 * This is NOT a managed Supabase restore and NEVER sets a publication gate.
 * Requires a trusted local host with Docker image already available.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditPilotMobileStorageBytes}
 from './audit-pilot-mobile-storage-mvp273.mjs';
import {replayPilotSqlInDisposablePg17}
 from './replay-pilot-sql-lab-mvp273.mjs';
import {PILOT_REF} from './package-pilot-mobile-mvp269.mjs';

const fail=code=>{throw Error('MVP273_OFFLINE_'+code)};
export async function verifyPilotOfflineRehearsal({
 zipPath,identityPath,expectedSha256,env=process.env,
 storageFn=auditPilotMobileStorageBytes,
 sqlFn=replayPilotSqlInDisposablePg17
}){
 const storage=await storageFn({zipPath,identityPath,expectedSha256,env});
 if(storage?.status!==
      'PILOT_ENCRYPTED_STORAGE_BYTES_REPLAY_VERIFIED_NOT_RESTORED'||
    storage.project_ref!==PILOT_REF||storage.restore_verified!==false||
    storage.plaintext_written_to_disk!==false||
    storage.storage_service_restored!==false||
    storage.source_zip_sha256!==expectedSha256)
  fail('STORAGE_NOT_VERIFIED');
 const sql=await sqlFn({zipPath,identityPath,expectedSha256,env});
 if(sql?.status!==
      'PILOT_SQL_DISPOSABLE_PG17_REPLAY_VERIFIED_NOT_SUPABASE_RESTORED'||
    sql.project_ref!==PILOT_REF||sql.restore_verified!==false||
    sql.encrypted_sql_streams_replayed!==5||
    sql.host_plaintext_sql_files!==false||
    sql.network_exposed!==false||
    sql.ports_exposed!==false||
    sql.isolated_container_destroyed_after_test!==true)
  fail('SQL_NOT_VERIFIED');
 return Object.freeze({
  status:'PILOT_OFFLINE_STORAGE_AND_SQL_REPLAY_CHECKED_NOT_RECOVERED',
  project_ref:PILOT_REF,
  backup_sha256:expectedSha256,
  storage_objects_checked:storage.storage_objects_replayed,
  storage_bytes_checked:storage.storage_payload_bytes,
  sql_streams_replayed:sql.encrypted_sql_streams_replayed,
  standalone_pg17_replay_verified:true,
  storage_tar_byte_integrity_verified:true,
  customer_files_written_to_host_disk:false,
  live_supabase_touched:false,
  managed_supabase_restore_verified:false,
  original_storage_service_restore_verified:false,
  auth_and_vault_restore_verified:false,
  restore_verified:false,
  pilot_sql_migration_authorized_by_rehearsal:false,
  mobile_delivery_ready:false
 });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 verifyPilotOfflineRehearsal({
  zipPath:process.argv[2],identityPath:process.argv[3],
  expectedSha256:process.argv[4]
 }).then(x=>console.log(JSON.stringify(x)))
  .catch(e=>{
   console.error(e instanceof Error&&/^MVP273_OFFLINE_[A-Z_]+$/u.test(e.message)?
    e.message:'MVP273_OFFLINE_REHEARSAL_FAILED');
   process.exitCode=1;
  });
}
