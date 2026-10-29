import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {escanearConClamd,AnalisisNoDisponible,MAX_SCAN_BYTES} from '../../src/server/documentos/clamav.ts';
import {inspeccionarDocumentoEnWorker,DocumentoInseguro} from '../../src/server/documentos/inspeccion.ts';

const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQ='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FILE='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const pdf=Buffer.from('%PDF-1.7\nFICTIONAL CI DOCUMENT\n','ascii');
const params=file=>({file,organizationId:ORG,requestId:REQ,fileId:FILE});

async function withClamd(t,reply){
 const dir=mkdtempSync(join(tmpdir(),'cotironda-clamd-'));
 const path=join(dir,'clamd.sock');
 const clients=new Set();
 const scans=[];
 const server=createServer(socket=>{
  clients.add(socket);
  socket.on('close',()=>clients.delete(socket));
  let buf=Buffer.alloc(0),command=false,parts=[],chunks=[];
  socket.on('data',chunk=>{
   buf=Buffer.concat([buf,chunk]);
   while(true){
    if(!command){
     if(buf.length<10)return;
     assert.equal(buf.subarray(0,10).toString('latin1'),'zINSTREAM\0');
     buf=buf.subarray(10);command=true;
    }
    if(buf.length<4)return;
    const size=buf.readUInt32BE(0);
    if(size>65536){socket.destroy();return;}
    if(buf.length<4+size)return;
    if(size===0){
     scans.push({data:Buffer.concat(parts),chunks:[...chunks]});
     const out=typeof reply==='function'?reply(scans.at(-1)):reply;
     if(out===null){socket.destroy();return;}
     if(out==='timeout')return;
     socket.write(out);
     socket.end();
     return;
    }
    parts.push(buf.subarray(4,4+size));
    chunks.push(size);
    buf=buf.subarray(4+size);
   }
  });
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(path,resolve);
 });
 t.after(async()=>{
  for(const s of clients)s.destroy();
  await new Promise(resolve=>server.close(resolve));
  rmSync(dir,{recursive:true,force:true});
 });
 return {path,scans};
}
function rejectsClosed(fn){
 return assert.rejects(fn,e=>e instanceof AnalisisNoDisponible && e.message==='analisis_no_disponible');
}
test('ClamAV INSTREAM envía chunks de 64 KiB y clean solo con respuesta exacta',async t=>{
 const {path,scans}=await withClamd(t,'stream: OK\0');
 const data=Buffer.alloc(140000,0x42);
 assert.equal(await escanearConClamd(data,path),'clean');
 assert.equal(scans.length,1);
 assert.deepEqual(scans[0].data,data);
 assert.deepEqual(scans[0].chunks,[65536,65536,8928]);
});
test('firma FOUND clasifica malicious sin exponer nombre de virus',async t=>{
 const {path}=await withClamd(t,'stream: CI-Fake-Malware FOUND\0');
 assert.equal(await escanearConClamd(pdf,path),'malicious');
 await assert.rejects(()=>inspeccionarDocumentoEnWorker({
  ...params(new Blob([pdf],{type:'application/pdf'})),socketPath:path
 }),e=>e instanceof DocumentoInseguro&&e.message==='documento_rechazado');
});
test('worker con respuesta limpia devuelve path, formato, tamaño y hash real',async t=>{
 const {path}=await withClamd(t,'stream: OK\0');
 const result=await inspeccionarDocumentoEnWorker({
  ...params(new Blob([pdf],{type:'application/pdf'})),socketPath:path
 });
 assert.equal(result.path,ORG+'/requests/'+REQ+'/'+FILE+'.pdf');
 assert.equal(result.mime,'application/pdf');
 assert.equal(result.size,pdf.length);
 assert.equal(result.sha256Hex,createHash('sha256').update(pdf).digest('hex'));
 assert.ok(!('scan_verdict' in result),'No inventar campos ni emitir aprobación SQL');
});
test('sin socket local o con path no permitido falla cerrado',async()=>{
 await rejectsClosed(()=>escanearConClamd(pdf,'/tmp/cotironda-no-such-clamd.sock',300));
 await rejectsClosed(()=>escanearConClamd(pdf,'remote:3310'));
 await rejectsClosed(()=>escanearConClamd(pdf,'/tmp/../run/clamd.sock'));
 await rejectsClosed(()=>escanearConClamd(pdf,''));
});
test('0 bytes, >10 MiB, timeout inválido y tipo de entrada fallan sin conectarse',async()=>{
 await rejectsClosed(()=>escanearConClamd(Buffer.alloc(0),'/tmp/clamd.sock'));
 await rejectsClosed(()=>escanearConClamd(Buffer.alloc(MAX_SCAN_BYTES+1),'/tmp/clamd.sock'));
 await rejectsClosed(()=>escanearConClamd(pdf,'/tmp/clamd.sock',0));
 await rejectsClosed(()=>escanearConClamd(pdf,'/tmp/clamd.sock',60000));
 await rejectsClosed(()=>escanearConClamd('wrong','/tmp/clamd.sock'));
});
test('ERROR, respuesta ambigua, parcial, vacía y sobrelímite jamás son clean',async t=>{
 for(const reply of [
  'stream: size limit exceeded ERROR\0',
  'stream: OKAY\0',
  'stream: OK\0evil',
  'stream: OK',
  '',
  'stream: FOUND\0',
  Buffer.alloc(1025,65)
 ]){
  const {path}=await withClamd(t,reply);
  await rejectsClosed(()=>escanearConClamd(pdf,path,500));
 }
});
test('timeout absoluto termina solicitud incluso si socket queda abierto',async t=>{
 const {path}=await withClamd(t,'timeout');
 const started=Date.now();
 await rejectsClosed(()=>escanearConClamd(pdf,path,150));
 assert.ok(Date.now()-started<1500,'Debe abortar, no continuar esperando al daemon');
});
test('archivo con MIME falso se rechaza antes del escáner',async t=>{
 const {path,scans}=await withClamd(t,'stream: OK\0');
 await assert.rejects(()=>inspeccionarDocumentoEnWorker({
  ...params(new Blob([Buffer.from('not a pdf')],{type:'application/pdf'})),
  socketPath:path
 }),e=>e.code==='firma_no_coincide');
 assert.equal(scans.length,0,'Los bytes inválidos no llegan al socket');
});
