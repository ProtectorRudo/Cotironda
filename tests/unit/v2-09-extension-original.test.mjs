import test from 'node:test';
import assert from 'node:assert/strict';
import {nombreDescargaOriginalV2}
 from '../../apps/portal/lib/piloto-v2-nombre-descarga.ts';

const doc='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

test('V2-09: Excel y Word heredados preservan extension del MIME original',()=>{
 assert.equal(nombreDescargaOriginalV2(doc,'application/vnd.ms-excel'),
  'cotironda-original-bbbbbbbb.xls');
 assert.equal(nombreDescargaOriginalV2(doc,'application/msword'),
  'cotironda-original-bbbbbbbb.doc');
});

test('V2-09: XLSX/DOCX modernos se descargan con su extension real',()=>{
 assert.equal(nombreDescargaOriginalV2(doc,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  'cotironda-original-bbbbbbbb.xlsx');
 assert.equal(nombreDescargaOriginalV2(doc,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  'cotironda-original-bbbbbbbb.docx');
});

test('V2-09: PDF, imágenes, CSV y texto usan tipos permitidos',()=>{
 const examples=[
  ['application/pdf','pdf'],['image/png','png'],['image/jpeg','jpg'],
  ['image/webp','webp'],['text/csv','csv'],['text/plain; charset=utf-8','txt']
 ];
 for(const [mime,ext] of examples)
  assert.equal(nombreDescargaOriginalV2(doc,mime),
   'cotironda-original-bbbbbbbb.'+ext);
});

test('V2-09: MIME desconocido no inventa formato ni ejecuta nombre arbitrario',()=>{
 for(const mime of [null,'application/octet-stream','text/html',
  'application/vnd.ms-excelx','application/msword;evil.docx',
  'application/x-zip-compressed']){
  const result=nombreDescargaOriginalV2(doc,mime);
  assert.ok(result.startsWith('cotironda-original-bbbbbbbb.'));
  if(mime==='application/msword;evil.docx')assert.ok(result.endsWith('.doc'));
  else assert.ok(result.endsWith('.bin'));
 }
 assert.equal(nombreDescargaOriginalV2('../../secreto.xls','application/pdf'),
  'cotironda-original-desconocido.pdf');
});
