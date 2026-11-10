/**
 * MVP273 — replay encrypted PILOTO Storage TAR from ZIP through age and strict
 * streaming validator. Never persists plaintext or calls Supabase.
 *
 * This is NOT a restored Storage service. For actual recovery, an approved
 * isolated destination must also accept/re-read every object byte-for-byte.
 */
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditMobilePilotZip} from './audit-pilot-mobile-ciphertext-mvp272.mjs';
import {inspectPilotStorageTar} from './inspect-pilot-storage-tar-mvp273.mjs';
import {PILOT_REF} from './package-pilot-mobile-mvp269.mjs';

const fail=code=>{throw Error('MVP273_'+code)};
function child(spawnCommand,program,args,env,stdio){
 let p;
 try{p=spawnCommand(program,args,{
  env:{PATH:env.PATH||'/usr/bin:/bin',LANG:'C'},
  stdio
 });}catch{fail('OFFLINE_PROGRAM_UNAVAILABLE')}
 if(!p||!p.stdout||!p.kill)fail('OFFLINE_PROGRAM_UNAVAILABLE');
 return p;
}
function close(p){
 return new Promise((yes,no)=>{
  p.once('close',code=>yes(code));
  p.once('error',()=>no(Error('MVP273_OFFLINE_PROGRAM_UNAVAILABLE')));
 });
}
export async function auditPilotMobileStorageBytes({
 zipPath,identityPath,expectedSha256,env=process.env,
 spawnCommand=spawn,auditFn=auditMobilePilotZip
}){
 // The existing MVP272 verifier checks private POSIX permissions, 7 exact
 // members, independent SHA and actual age auth of ALL six components.
 const first=await auditFn({zipPath,identityPath,expectedSha256,env,
  spawnCommand});
 if(!first||first.status!=='PILOT_MOBILE_ZIP_AGE_DECRYPTION_VERIFIED_NOT_RESTORED'||
    first.project_ref!==PILOT_REF||first.age_streams_authenticated!==6||
    first.restore_verified!==false)
  fail('PREREQUISITE_CRYPTO_AUDIT_FAILED');
 const unzip=child(spawnCommand,'unzip',['-p',resolve(zipPath),
  'storage_objects.tar.age'],env,['ignore','pipe','ignore']);
 const age=child(spawnCommand,'age',['--decrypt','--identity',
  resolve(identityPath)],env,['pipe','pipe','ignore']);
 if(!age.stdin)fail('OFFLINE_PROGRAM_UNAVAILABLE');
 const zipClose=close(unzip),ageClose=close(age);
 try{
  const [_,result,zipExit,ageExit]=await Promise.all([
   pipeline(unzip.stdout,age.stdin),
   inspectPilotStorageTar(age.stdout),
   zipClose,ageClose
  ]);
  if(zipExit!==0||ageExit!==0||
     result.status!=='PILOT_STORAGE_TAR_STREAM_REPLAY_CHECKED_NOT_RESTORED'||
     result.project_ref!==PILOT_REF||result.restore_verified!==false)
   fail('STORAGE_TAR_DECRYPTION_OR_REPLAY_FAILED');
  // Rehash ZIP once more to detect changes during byte-level replay.
  const last=await auditFn({zipPath,identityPath,expectedSha256,env,
   spawnCommand});
  if(last?.archive_sha256!==expectedSha256||last?.restore_verified!==false)
   fail('ARCHIVE_CHANGED_DURING_REPLAY');
  return Object.freeze({
   status:'PILOT_ENCRYPTED_STORAGE_BYTES_REPLAY_VERIFIED_NOT_RESTORED',
   project_ref:PILOT_REF,source_zip_sha256:expectedSha256,
   storage_objects_replayed:result.files_replayed,
   storage_payload_bytes:result.object_bytes,
   index_hashes_and_timestamps_consistent:true,
   plaintext_written_to_disk:false,
   database_credentials_used:false,network_access_used:false,
   postgres_sql_replay_verified:false,storage_service_restored:false,
   supabase_managed_restore_verified:false,restore_verified:false,
   download_link_created:false
  });
 }catch(e){
  unzip.kill?.();age.kill?.();
  if(e instanceof Error&&/^MVP273_/u.test(e.message))throw e;
  fail('STORAGE_TAR_DECRYPTION_OR_REPLAY_FAILED');
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 auditPilotMobileStorageBytes({
  zipPath:process.argv[2],identityPath:process.argv[3],
  expectedSha256:process.argv[4]
 }).then(result=>console.log(JSON.stringify(result)))
  .catch(e=>{
   console.error(e instanceof Error&&/^MVP273_/u.test(e.message)?
    e.message:'MVP273_STORAGE_REPLAY_FAILED');
   process.exitCode=1;
  });
}
