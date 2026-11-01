/**
 * MVP-037: no recovery identity may be created below an existing shared,
 * attacker-writable or symlinked directory. Pure local POSIX preflight.
 * No passwords, SQL, age keys, networks or filesystem mutations.
 */
import {lstatSync} from 'node:fs';
import {dirname,isAbsolute,join,parse,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const fail=()=>{throw Error('MVP037_PRIVATE_DIRECTORY_UNSAFE')};
function checkedDir(path,uid,privateOnly=false){
 const root=parse(path).root;
 let current=root;
 for(const part of path.slice(root.length).split(sep).filter(Boolean)){
  current=join(current,part);
  let stat;
  try{stat=lstatSync(current)}catch{fail()}
  if(!stat.isDirectory()||stat.isSymbolicLink())fail();
  if(current===path){
   if(stat.uid!==uid)fail();
   if((stat.mode&(privateOnly?0o077:0o022))!==0)fail();
  }
 }
}
export function verificarDirectoriosPrivadosMvp037(home,keydir,backupdir){
 if(process.platform==='win32'||typeof process.getuid!=='function')fail();
 if([home,keydir,backupdir].some(x=>typeof x!=='string'||!isAbsolute(x)))fail();
 const h=resolve(home), k=resolve(keydir), b=resolve(backupdir);
 if(k===b||dirname(k)!==h||dirname(b)!==h)fail();
 const uid=process.getuid();
 checkedDir(h,uid,false);  // home: other users must not be able to WRITE
 checkedDir(k,uid,true);   // keys: 0700 (or stricter)
 checkedDir(b,uid,true);   // backups: 0700 (or stricter)
 return Object.freeze({status:'PRIVATE_LOCAL_DIRECTORIES_VERIFIED',
  backup_verified:false,restore_verified:false,gate_d024_open:false});
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const paths=process.argv.slice(2);
  if(paths.length!==3)fail();
  console.log(JSON.stringify(verificarDirectoriosPrivadosMvp037(...paths)));
 }catch{
  console.error('MVP037_PRIVATE_DIRECTORY_UNSAFE');
  process.exitCode=1;
 }
}
