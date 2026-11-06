/**
 * MVP271: one-command, *private-host-only* PILOT ciphertext bundle builder.
 * Sequentially exports five consistent encrypted SQL pieces and one encrypted
 * TAR of Storage; then creates the already-tested one-file mobile ZIP (MVP269).
 * This NEVER publishes a URL, sends WhatsApp, provisions a host or tests restore.
 */
import {lstat,rm} from 'node:fs/promises';
import {isAbsolute,resolve,dirname,sep,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {exportPilotSqlEncrypted} from './export-encrypted-pilot-sql-mvp271.mjs';
import {exportPilotStorageEncrypted} from './export-private-pilot-storage-mvp270.mjs';
import {prepareMobilePilotZip,PILOT_REF} from './package-pilot-mobile-mvp269.mjs';

const fail=code=>{throw Error('MVP271_BUNDLE_'+code)};
function localGuard(env){
 if(process.platform==='win32'||typeof process.getuid!=='function'||
   (Boolean(env.CI)&&env.CI!=='false')||Boolean(env.GITHUB_ACTIONS)||
   Boolean(env.VERCEL)||Boolean(env.VERCEL_ENV)||
   Boolean(env.COTIRONDA_CI_AUTH_SANDBOX)||
   Boolean(env.COTIRONDA_CI_WA_PREVIEW_SANDBOX))
  fail('TRUSTED_LOCAL_ONLY');
}
async function mustNotExist(path){
 try{await lstat(path)}catch(e){
  if(e.code==='ENOENT')return;
  fail('UNSAFE_OUTPUT_PATH');
 }
 fail('OUTPUT_ALREADY_EXISTS');
}
export async function createPrivatePilotMobileBackup({
 sourceDirectory,destinationZip,env=process.env,
 sqlFn=exportPilotSqlEncrypted,
 storageFn=exportPilotStorageEncrypted,
 zipFn=prepareMobilePilotZip
}){
 localGuard(env);
 if(typeof sourceDirectory!=='string'||typeof destinationZip!=='string'||
    !isAbsolute(sourceDirectory)||!isAbsolute(destinationZip)||
    !destinationZip.endsWith('.zip'))fail('ABSOLUTE_PRIVATE_PATHS_REQUIRED');
 const source=resolve(sourceDirectory),zip=resolve(destinationZip);
 if(zip===source||zip.startsWith(source+sep))fail('ZIP_INSIDE_SOURCE');
 if(source===zip||source.startsWith(dirname(zip)+sep))
  fail('SOURCE_INSIDE_ARCHIVE_PARENT');
 // Never overwrite source or existing archive. Private directories and
 // symlink ancestors are independently checked by the component executors.
 await mustNotExist(source);
 await mustNotExist(zip);
 const connectionUrl=env.COTIRONDA_PILOT_DB_URL;
 const recipient=env.COTIRONDA_AGE_RECIPIENT;
 let sql,storage,bundle;
 try{
  sql=await sqlFn({directory:source,connectionUrl,recipient,rawEnv:env});
  if(sql?.status!=='PILOT_SQL_CIPHERTEXT_CREATED_NOT_RESTORED'||
     sql.project_ref!==PILOT_REF||sql.pieces!==5||
     sql.restore_verified!==false||sql.sql_plaintext_on_disk!==false)
   fail('SQL_NOT_VERIFIED');
  storage=await storageFn({sourceDirectory:source,env});
  if(storage?.status!=='PILOT_STORAGE_CIPHERTEXT_CREATED_NOT_RESTORED'||
     storage.project_ref!==PILOT_REF||storage.restore_verified!==false||
     storage.object_inventory_rechecked!==true||
     storage.no_plaintext_written!==true)
   fail('STORAGE_NOT_VERIFIED');
  const sealed=await zipFn({operation:'seal',sourceDirectory:source,env});
  if(sealed?.status!=='SEALED_CIPHERTEXT_ONLY_NOT_VERIFIED_BACKUP'||
     sealed.pieces!==6||sealed.restore_verified!==false)
   fail('SEAL_NOT_VERIFIED');
  bundle=await zipFn({operation:'pack',sourceDirectory:source,
   destinationPath:zip,env});
  if(bundle?.status!=='MOBILE_ZIP_ENCRYPTED_CONTENT_CANDIDATE'||
     bundle.pieces!==6||bundle.restore_verified!==false||
     bundle.public_upload!==false||bundle.download_link_created!==false||
     !/^[a-f0-9]{64}$/u.test(bundle.sha256)||
     !Number.isSafeInteger(bundle.bytes)||bundle.bytes<1)
   fail('ZIP_NOT_VERIFIED');
 }catch(e){
  // Source was absent at entry and belongs solely to this execution.
  // Do not leave incomplete "backups" that could be mistaken as valid.
  await rm(source,{recursive:true,force:true}).catch(()=>{});
  await rm(zip,{force:true}).catch(()=>{});
  if(e instanceof Error&&/^MVP271_BUNDLE_[A-Z_]+$/u.test(e.message))
   throw e;
  fail('CREATION_FAILED');
 }
 return Object.freeze({
  status:'PILOT_MOBILE_ENCRYPTED_ZIP_CANDIDATE_NOT_RESTORED',
  project_ref:PILOT_REF,filename:bundle.filename,sha256:bundle.sha256,
  bytes:bundle.bytes,sql_pieces:5,
  storage_objects_downloaded:storage.storage_objects_downloaded,
  storage_bytes_verified:storage.storage_bytes_verified,
  restore_verified:false,backup_offsite:false,
  mobile_download_url_created:false,pilot_modified:false,
  production_modified:false
 });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 createPrivatePilotMobileBackup({
  sourceDirectory:process.argv[2],destinationZip:process.argv[3]
 }).then(v=>console.log(JSON.stringify(v)))
  .catch(e=>{
   console.error(e instanceof Error&&/^MVP271_BUNDLE_/u.test(e.message)?
    e.message:'MVP271_BUNDLE_FAILED');
   process.exitCode=1;
  });
}
