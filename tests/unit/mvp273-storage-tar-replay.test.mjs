import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {tarHeader} from '../../scripts/ops/export-private-pilot-storage-mvp270.mjs';
import {inspectPilotStorageTar} from '../../scripts/ops/inspect-pilot-storage-tar-mvp273.mjs';
import {PILOT_REF} from '../../scripts/ops/package-pilot-mobile-mvp269.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const bytes=[Buffer.from('hola\u00f1andPDF'),Buffer.from([0,1,2,255])];
const objects=[
 {bucket:'presupuestos',path:'arquitectos/archivo.pdf',id:'uuid-1',size:bytes[0].length,
  updated_at:'2026-11-06T00:00:00Z'},
 {bucket:'presupuestos',path:'proveedores/datos.xlsx',id:'uuid-2',size:bytes[1].length,
  updated_at:'2026-11-06T00:00:01Z'}
];
function entry(name,body,type='0'){
 const header=tarHeader(name,body.length);
 if(type==='2'){
  header[156]=50;header.fill(32,148,156);
  const sum=header.reduce((n,v)=>n+v,0);
  header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');
 }
 const padding=Buffer.alloc((512-body.length%512)%512);
 return Buffer.concat([header,body,padding]);
}
function sample({overrideIndex={},badBytes=null,empty=false}={}){
 const source=empty?[]:objects.map((o,i)=>({...o,archive_name:
  'objects/'+String(i+1).padStart(6,'0')+'.bin',sha256:hash(bytes[i])}));
 const all=source.map((o,i)=>entry(o.archive_name,
  badBytes?.[i]??bytes[i]));
 const index={format:'cotironda-pilot-storage-tar-mvp270-v1',
  project_ref:PILOT_REF,objects:source,object_count:source.length,
  declared_total_bytes:source.reduce((n,o)=>n+o.size,0),
  inventory_rechecked:true,restore_verified:false,...overrideIndex};
 all.push(entry('objects/index.json',Buffer.from(JSON.stringify(index)+'\n')));
 all.push(Buffer.alloc(1024));
 return Buffer.concat(all);
}
function chunks(buffer,size=17){
 return (async function*(){
  for(let i=0;i<buffer.length;i+=size)yield buffer.subarray(i,i+size);
 })();
}
test('MVP273: Tar streamer validates real physical bytes, strict index, no disk',async()=>{
 for(const size of [1,17,512,4096]){
  const r=await inspectPilotStorageTar(chunks(sample(),size));
  assert.equal(r.project_ref,PILOT_REF);
  assert.equal(r.files_replayed,2);
  assert.equal(r.object_bytes,bytes[0].length+bytes[1].length);
  assert.equal(r.checksums_matched,true);
  assert.equal(r.tar_structure_valid,true);
  assert.equal(r.plaintext_written_to_disk,false);
  assert.equal(r.restore_verified,false);
  assert.equal(r.storage_service_restore_verified,false);
 }
});
test('MVP273: legitimate empty bucket still has auditable indexed TAR',async()=>{
 const r=await inspectPilotStorageTar(chunks(sample({empty:true})));
 assert.equal(r.files_replayed,0);
 assert.equal(r.object_bytes,0);
 assert.equal(r.restore_verified,false);
});
test('MVP273: rejects altered content even if metadata size unchanged',async()=>{
 const changed=Buffer.from(bytes[0]);changed[0]^=4;
 await assert.rejects(inspectPilotStorageTar(chunks(sample({
  badBytes:[changed,bytes[1]]
 }))),/MVP273_TAR_INDEX_OBJECT_MISMATCH/u);
});
test('MVP273: rejects missing or lying source metadata, duplicate object name',async()=>{
 for(const x of [
  {restore_verified:true},{project_ref:'wrong-project'},
  {object_count:1},{inventory_rechecked:false},
  {declared_total_bytes:1}
 ]){
  await assert.rejects(inspectPilotStorageTar(chunks(sample({
   overrideIndex:x
  }))),/MVP273_TAR_INDEX_MISMATCH/u);
 }
});
test('MVP273: rejects truncation, nonzero trailer and extra data',async()=>{
 const valid=sample();
 await assert.rejects(inspectPilotStorageTar(chunks(valid.subarray(0,valid.length-15))),
  /MVP273_TAR_TRUNCATED/u);
 const footer=Buffer.from(valid);
 footer[footer.length-2]=1;
 await assert.rejects(inspectPilotStorageTar(chunks(footer)),
  /MVP273_TAR_TRAILER_INVALID/u);
 await assert.rejects(inspectPilotStorageTar(chunks(Buffer.concat([valid,Buffer.from('EXTRA')]))),
  /MVP273_TAR_TRAILER_INVALID/u);
});
test('MVP273: rejects forbidden tar header, symlink and invalid checksum',async()=>{
 const valid=sample();
 const header=Buffer.from(valid);header[0]=46;
 await assert.rejects(inspectPilotStorageTar(chunks(header)),
  /MVP273_TAR_HEADER_CHECKSUM/u);
 const link=Buffer.concat([entry('objects/000001.bin',bytes[0],'2'),
  valid.subarray(1024)]);
 await assert.rejects(inspectPilotStorageTar(chunks(link)),
  /MVP273_TAR_NON_REGULAR_ENTRY/u);
});
test('MVP273: reject nonzero TAR padding and impossible file ordering',async()=>{
 const valid=sample();
 const corrupted=Buffer.from(valid);
 corrupted[512+bytes[0].length]=1;
 await assert.rejects(inspectPilotStorageTar(chunks(corrupted)),
  /MVP273_TAR_PADDING_INVALID/u);
 const newFirst=entry('objects/999999.bin',bytes[0]);
 const order=Buffer.concat([newFirst,valid.subarray(1024)]);
 await assert.rejects(inspectPilotStorageTar(chunks(order)),
  /MVP273_TAR_OBJECT_ORDER_OR_LIMIT/u);
});
test('MVP273: reject file with index before payload or no index',async()=>{
 const broken=Buffer.concat([entry('objects/000001.bin',bytes[0]),Buffer.alloc(1024)]);
 await assert.rejects(inspectPilotStorageTar(chunks(broken)),
  /MVP273_TAR_INDEX_MISSING/u);
});
