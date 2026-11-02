import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeMediaManifest} from '../../supabase/functions/cotironda-piloto-whapi/media-intake.ts';
const pdf={document:{id:'pdf-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57',
 mime_type:'application/pdf',file_size:1438781,file_name:'lista.pdf',
 sha256:'T'.repeat(43)+'=',caption:'Materiales para La Plata',
 link:'https://untrusted.example.invalid/do-not-fetch'}};
test('MVP093: PDF de Whapi conserva metadata cifrable, nunca URL de terceros',()=>{
 const result=makeMediaManifest(pdf,'document');
 assert.equal(result.state,'awaiting_secure_download');
 assert.equal(result.mime,'application/pdf');
 assert.equal(result.filename,'lista.pdf');
 assert.equal(result.size,1438781);
 assert.equal(result.providerSha256,'T'.repeat(43)+'=');
 assert.equal(result.caption,'Materiales para La Plata');
 assert.equal('link' in result,false);
 assert.ok(!JSON.stringify(result).includes('example.invalid'));
});
test('MVP093: fotos y planillas admitidas solo como pending download, no pedido ya interpretado',()=>{
 for(const item of [
  {kind:'image',data:{id:'jpeg-verylongwhapi123',mime_type:'image/jpeg',file_size:200000}},
  {kind:'image',data:{id:'png-verylongwhapi123',mime_type:'image/png',file_size:200000}},
  {kind:'document',data:{id:'xlsx-verylongwhapi123',mime_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',file_size:200000}},
  {kind:'document',data:{id:'docx-verylongwhapi123',mime_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',file_size:200000}}
 ]){
  const m=makeMediaManifest({[item.kind]:item.data},item.kind);
  assert.equal(m?.state,'awaiting_secure_download');
  assert.equal('items' in m,false);
 }
});
test('MVP093: formatos no admitidos o tamaños excesivos requieren revisión',()=>{
 const bad=[
  {document:{id:'file-verylongwhapi123',mime_type:'application/zip',file_size:100}},
  {document:{id:'file-verylongwhapi123',mime_type:'application/pdf',file_size:9*1024*1024}},
  {audio:{id:'audio-verylongwhapi123',mime_type:'audio/mpeg',file_size:14000}},
  {document:{id:'file-verylongwhapi123',mime_type:'text/html',file_size:320}},
 ];
 for(const raw of bad){
  const kind=Object.keys(raw)[0];
  assert.equal(makeMediaManifest(raw,kind)?.state,'unsupported_needs_review');
 }
 assert.equal(makeMediaManifest({document:{id:'../bad',mime_type:'application/pdf'}},'document'),null);
 assert.equal(makeMediaManifest({},'document'),null);
 assert.equal(makeMediaManifest({document:{id:'valid-verylongwhapi123',mime_type:'application/pdf',
  file_name:'../../unsafe.pdf'}},'document')?.filename,null);
});
test('MVP093: el webhook guarda metadata en inbox cifrado en vez de descartarla',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(edge,/makeMediaManifest\(row,row\.type\)/);
 assert.match(edge,/JSON\.stringify\(media\?\?/);
 assert.match(edge,/encrypt\(sec\.aes,body/);
 assert.match(edge,/p_kind:row\.type/);
});
