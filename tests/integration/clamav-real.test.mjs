// E2E contra un daemon ClamAV REAL, aislado a GitHub Actions.
// Base de firmas local de ensayo (EICAR); NO valida freshclam ni protección comercial.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {escanearConClamd, AnalisisNoDisponible, MAX_SCAN_BYTES} from '../../src/server/documentos/clamav.ts';
import {inspeccionarDocumentoEnWorker, DocumentoInseguro} from '../../src/server/documentos/inspeccion.ts';

const socketPath=process.env.COTIRONDA_CLAMD_TEST_SOCKET;
if(!socketPath || !socketPath.startsWith('/'))
 throw new Error('COTIRONDA_CLAMD_TEST_SOCKET debe ser una ruta Unix de CI');

const eicar=Buffer.from(
 'X5O!P%@AP[4\\PZX54(P^)7CC)7}' +
 '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*','ascii'
);
const pdf=Buffer.from('%PDF-1.7\nCotironda CI: documento sintético inofensivo\n','utf8');
const id={
 organizationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 fileId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
};
const isClosed=e=>e instanceof AnalisisNoDisponible && e.message==='analisis_no_disponible';

test('EICAR fixture coincide con firma hash local exacta (sin contenido real)',()=>{
 assert.equal(eicar.byteLength,68);
 assert.equal(createHash('md5').update(eicar).digest('hex'),'44d88612fea8a8f36de82e1278abb02f');
});
test('clamd real rechaza EICAR por socket Unix (NO firma simulada)',async()=>{
 assert.equal(await escanearConClamd(eicar,socketPath,15000),'malicious');
});
test('clamd real considera limpio un PDF sintético; inspección produce SHA-256',async()=>{
 const file=new Blob([pdf],{type:'application/pdf'});
 const out=await inspeccionarDocumentoEnWorker({...id,file,socketPath,timeoutMs:15000});
 assert.equal(out.sha256Hex,createHash('sha256').update(pdf).digest('hex'));
 assert.equal(out.size,pdf.length);
 assert.equal(out.mime,'application/pdf');
 assert.equal(out.path,id.organizationId+'/requests/'+id.requestId+'/'+id.fileId+'.pdf');
 assert.ok(!('scan_verdict' in out),'No marcar aprobado ni escribir ledger');
});
test('EICAR nunca produce resultado limpio en el adaptador, ni firma de malware en error',async()=>{
 const verdict=await escanearConClamd(eicar,socketPath,15000);
 assert.notEqual(verdict,'clean');
 assert.equal(verdict,'malicious');
});
test('daemon inaccesible falla cerrado, sin falso OK',async()=>{
 await assert.rejects(()=>escanearConClamd(pdf,socketPath+'.missing',400),isClosed);
});
test('límite de 10 MiB del cliente: ni siquiera contacta al daemon',async()=>{
 await assert.rejects(()=>escanearConClamd(Buffer.alloc(MAX_SCAN_BYTES+1),socketPath,1000),isClosed);
});
