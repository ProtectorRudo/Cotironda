/**
 * MVP273 — audit a decoded Cotironda PILOTO Storage TAR as a strict stream.
 *
 * This is a deterministic READ-ONLY replay: no extraction, no network, no
 * filesystem writes, no customer paths or hashes in the result.
 * It does NOT restore Supabase Storage or establish backup provenance.
 * Format is produced by export-private-pilot-storage-mvp270.mjs.
 */
import {createHash} from 'node:crypto';
import {PILOT_REF} from './package-pilot-mobile-mvp269.mjs';

const CHUNK=512,MAX_OBJECTS=5000,MAX_BYTES=256*1024*1024;
const INDEX_MAX=2*1024*1024;
const fail=code=>{throw Error('MVP273_TAR_'+code)};
const exactKeys=(o,names)=>o&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).sort().join(',')===names.sort().join(',');
const safePath=s=>typeof s==='string'&&s.length>0&&
 Buffer.byteLength(s,'utf8')<=1024&&
 !/[\\\x00-\x1f\x7f]/u.test(s)&&
 s.split('/').every(part=>part!==''&&part!=='.'&&part!=='..');

class StreamBytes{
 constructor(source){
  if(!source||typeof source[Symbol.asyncIterator]!=='function')
   fail('STREAM_REQUIRED');
  this.it=source[Symbol.asyncIterator]();
  this.remainder=Buffer.alloc(0);
  this.exhausted=false;
 }
 async read(n){
  if(!Number.isSafeInteger(n)||n<0)fail('INVALID_READ');
  while(!this.remainder.length&&!this.exhausted){
   const part=await this.it.next();
   if(part.done){this.exhausted=true;break}
   if(!(part.value instanceof Uint8Array))fail('INVALID_CHUNK');
   if(part.value.length)this.remainder=Buffer.from(part.value);
  }
  if(!this.remainder.length)return null;
  const head=this.remainder.subarray(0,Math.min(this.remainder.length,n));
  this.remainder=this.remainder.subarray(head.length);
  return head;
 }
 async *exactChunks(n){
  while(n>0){
   const part=await this.read(n);
   if(!part?.length)fail('TRUNCATED');
   n-=part.length;yield part;
  }
 }
 async exact(n){
  if(n>INDEX_MAX&&n!==CHUNK)fail('BUFFER_TOO_LARGE');
  const items=[];
  for await(const chunk of this.exactChunks(n))items.push(chunk);
  return Buffer.concat(items,n);
 }
 async eof(){
  return (await this.read(1))===null;
 }
}
function octal(h,start,length){
 const raw=h.toString('ascii',start,start+length);
 if(!/^[0-7 ]*[0-7](?:\0| )*$/u.test(raw))
  fail('OCTAL_INVALID');
 const trimmed=raw.replace(/[\0 ]/gu,'').trim();
 const result=Number.parseInt(trimmed,8);
 if(!Number.isSafeInteger(result)||result<0)fail('OCTAL_INVALID');
 return result;
}
function tarHeader(h){
 if(h.length!==CHUNK||h.every(v=>v===0))fail('HEADER_MISSING');
 if(h.toString('ascii',257,263)!=='ustar\0')fail('UNSUPPORTED_TAR');
 if(h[156]!==48&&h[156]!==0)fail('NON_REGULAR_ENTRY');
 if(h.subarray(345,500).some(v=>v!==0))fail('PREFIX_FORBIDDEN');
 if(h.subarray(157,257).some(v=>v!==0))fail('LINK_FORBIDDEN');
 const stored=octal(h,148,8);
 let sum=0;
 for(let i=0;i<h.length;i++)sum+=i>=148&&i<156?32:h[i];
 if(stored!==sum)fail('HEADER_CHECKSUM');
 const mode=octal(h,100,8);
 if(mode!==0o600)fail('MODE_INVALID');
 const name=h.toString('ascii',0,100).split('\0')[0];
 if(!/^(objects\/[0-9]{6}\.bin|objects\/index\.json)$/u.test(name))
  fail('ENTRY_NAME_FORBIDDEN');
 return {name,size:octal(h,124,12)};
}
function checkIndex(raw,files,totalBytes){
 let index;
 try{index=JSON.parse(raw.toString('utf8'))}catch{fail('INDEX_INVALID')}
 if(!exactKeys(index,['format','project_ref','objects','object_count',
   'declared_total_bytes','inventory_rechecked','restore_verified'])||
   index.format!=='cotironda-pilot-storage-tar-mvp270-v1'||
   index.project_ref!==PILOT_REF||
   index.inventory_rechecked!==true||index.restore_verified!==false||
   index.object_count!==files.length||
   index.declared_total_bytes!==totalBytes||
   !Array.isArray(index.objects)||index.objects.length!==files.length)
  fail('INDEX_MISMATCH');
 const seen=new Set();
 for(let i=0;i<files.length;i++){
  const o=index.objects[i],f=files[i];
  if(!exactKeys(o,['bucket','path','id','size','updated_at',
    'archive_name','sha256'])||
   !safePath(o.bucket)||o.bucket.includes('/')||!safePath(o.path)||
   typeof o.id!=='string'||!o.id||o.id.length>256||
   typeof o.updated_at!=='string'||
   !Number.isFinite(Date.parse(o.updated_at))||
   o.archive_name!==f.name||o.size!==f.size||o.sha256!==f.sha256)
   fail('INDEX_OBJECT_MISMATCH');
  const key=o.bucket+'\0'+o.path;
  if(seen.has(key))fail('DUPLICATE_PATH');
  seen.add(key);
 }
}
export async function inspectPilotStorageTar(source){
 const reader=new StreamBytes(source);
 const files=[];
 let total=0,sawIndex=false;
 for(let i=0;i<MAX_OBJECTS+2;i++){
  const header=await reader.exact(CHUNK);
  if(header.every(x=>x===0)){
   if(!sawIndex)fail('INDEX_MISSING');
   const trailer=await reader.exact(CHUNK);
   if(!trailer.every(x=>x===0)||!(await reader.eof()))
    fail('TRAILER_INVALID');
   return Object.freeze({
    status:'PILOT_STORAGE_TAR_STREAM_REPLAY_CHECKED_NOT_RESTORED',
    project_ref:PILOT_REF,files_replayed:files.length,object_bytes:total,
    checksums_matched:true,tar_structure_valid:true,
    plaintext_written_to_disk:false,storage_service_restore_verified:false,
    postgres_restore_verified:false,managed_supabase_restore_verified:false,
    backup_source_verified:false,restore_verified:false
   });
  }
  if(sawIndex)fail('OBJECT_AFTER_INDEX');
  const {name,size}=tarHeader(header);
  if(name==='objects/index.json'){
   if(size===0||size>INDEX_MAX)fail('INDEX_SIZE_INVALID');
   const body=await reader.exact(size);
   const pad=(CHUNK-size%CHUNK)%CHUNK;
   if(pad&&!(await reader.exact(pad)).every(v=>v===0))
    fail('PADDING_INVALID');
   checkIndex(body,files,total);
   sawIndex=true;
   continue;
  }
  if(files.length>=MAX_OBJECTS||
     name!=='objects/'+String(files.length+1).padStart(6,'0')+'.bin')
   fail('OBJECT_ORDER_OR_LIMIT');
  if(size>MAX_BYTES-total)fail('OBJECT_BYTES_LIMIT');
  const hash=createHash('sha256');
  for await(const chunk of reader.exactChunks(size))hash.update(chunk);
  const pad=(CHUNK-size%CHUNK)%CHUNK;
  if(pad&&!(await reader.exact(pad)).every(v=>v===0))
   fail('PADDING_INVALID');
  total+=size;
  files.push({name,size,sha256:hash.digest('hex')});
 }
 fail('ENTRIES_LIMIT');
}
