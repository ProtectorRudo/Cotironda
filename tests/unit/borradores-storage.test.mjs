import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararBorrador,rutaBorrador,DocumentoRechazado,MAX_BORRADOR_BYTES} from '../../src/domain/borradores-storage.ts';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const R='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const F='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const file=(data,mime,name='original_del_usuario.bin')=>Object.assign(
 new Blob([data],{type:mime}),{name}
);
const invalid=async(action,code)=>assert.rejects(action,e=>e instanceof DocumentoRechazado&&e.code===code);

// ZIP clásico con entradas vacías: fixture de encabezados, NO documento Office comercial.
// Se comprueba nombre/estructura del contenedor sin ejecutar código.
function zip(entries,flags=0) {
 const parts=[],central=[];let offset=0;
 for(const name of entries){
  const n=Buffer.from(name,'utf8');
  const local=Buffer.alloc(30+n.length);
  local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(flags,6);
  local.writeUInt16LE(n.length,26);
  n.copy(local,30);
  parts.push(local);
  const c=Buffer.alloc(46+n.length);
  c.writeUInt32LE(0x02014b50,0);
  c.writeUInt16LE(flags,8);
  c.writeUInt16LE(n.length,28);
  c.writeUInt32LE(offset,42);
  n.copy(c,46);
  central.push(c);
  offset+=local.length;
 }
 const cen=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(entries.length,8);
 end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(cen.length,12);
 end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,cen,end]);
}
const pdf=Buffer.from('%PDF-1.7\n%CI-TEST\n','ascii');
const jpeg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0]);
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const webp=Buffer.from('RIFF1234WEBPvp8 ','ascii');
const cases=[
 ['application/pdf',pdf,'pdf'],
 ['image/jpeg',jpeg,'jpg'],
 ['image/png',png,'png'],
 ['image/webp',webp,'webp'],
 ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip(['[Content_Types].xml','word/document.xml']),'docx'],
 ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip(['[Content_Types].xml','xl/workbook.xml']),'xlsx']
];
test('seis MIME permitidos con firma válida, path inmutable sin nombre elegido por usuario',async()=>{
 for(const [mime,data,ext] of cases){
  const result=await prepararBorrador({
   file:file(data,mime,'../material malicioso.exe'),organizationId:A,requestId:R,fileId:F
  });
  assert.equal(result.bucket,'cotironda-buyer-drafts');
  assert.equal(result.path,A+'/requests/'+R+'/'+F+'.'+ext);
  assert.equal(result.mime,mime);
 }
});
test('UUID inválidos y path manipulados se rechazan antes de enviar bytes',async()=>{
 for(const invalidId of ['../'+B,'A'.repeat(36),'',A+'/../'+B,A.toUpperCase()]){
  assert.throws(()=>rutaBorrador(invalidId,R,F,'pdf'),e=>e.code==='ruta_invalida');
 }
 assert.throws(()=>rutaBorrador(A,R,F,'js'),e=>e.code==='ruta_invalida');
});
test('tipos no permitidos, vacíos y archivos excedidos fail-closed',async()=>{
 await invalid(()=>prepararBorrador({
  file:file(pdf,'application/x-msdownload'),organizationId:A,requestId:R,fileId:F
 }), 'formato_no_permitido');
 await invalid(()=>prepararBorrador({
  file:file('', 'application/pdf'),organizationId:A,requestId:R,fileId:F
 }), 'archivo_invalido');
 await invalid(()=>prepararBorrador({
  file:file(new Uint8Array(MAX_BORRADOR_BYTES+1),'application/pdf'),
  organizationId:A,requestId:R,fileId:F
 }), 'archivo_excede_limite');
});
test('MIME falsificado no sortea inspección de firma',async()=>{
 for(const [mime,data] of [
  ['application/pdf',Buffer.from('NOT A PDF','ascii')],
  ['image/jpeg',png],
  ['image/png',jpeg],
  ['image/webp',png],
  [cases[4][0],pdf],
  [cases[5][0],zip(['[Content_Types].xml','word/document.xml'])]
 ]){
  await invalid(()=>prepararBorrador({
   file:file(data,mime),organizationId:A,requestId:R,fileId:F
  }), 'firma_no_coincide');
 }
});
test('Office ZIP malicioso, cifrado, duplicado o con macros se rechaza',async()=>{
 for(const entries of [
  ['[Content_Types].xml','word/document.xml','word/vbaProject.bin'],
  ['[Content_Types].xml','word/document.xml','../evil.txt'],
  ['[Content_Types].xml','word/document.xml','word/document.xml'],
  ['[Content_Types].xml','word/document.xml','EncryptionInfo']
 ]){
  await invalid(()=>prepararBorrador({
   file:file(zip(entries),cases[4][0]),organizationId:A,requestId:R,fileId:F
  }),'zip_inseguro');
 }
 await invalid(()=>prepararBorrador({
  file:file(zip(['[Content_Types].xml','word/document.xml'],1),cases[4][0]),
  organizationId:A,requestId:R,fileId:F
 }), 'zip_inseguro');
});
test('Office no acepta ZIP vacío, truncado o contenido de otro tipo',async()=>{
 for(const doc of [
  Buffer.from([80,75,3,4]),
  zip(['random.txt']),
  zip(['[Content_Types].xml','xl/workbook.xml'])
 ]){
  await invalid(()=>prepararBorrador({
   file:file(doc,cases[4][0]),organizationId:A,requestId:R,fileId:F
  }),doc.length===4?'zip_inseguro':'firma_no_coincide');
 }
});
