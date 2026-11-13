import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {descargarConWhatsappD016}
 from '../../src/server/v2-d016-descarga-privada.ts';
import {D016_SESSION_COOKIE,digestSesionPrivadaD016}
 from '../../src/server/v2-d016-sesion-privada.ts';

const ORIGIN='https://cotironda-portal-9sl89v1ho-protector-rudo-s-projects.vercel.app';
const ROUND='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC='dddddddd-dddd-4ddd-addd-dddddddddddd';
const HASH='b'.repeat(64);
const KEY='c'.repeat(64);
const COOKIE='f'.repeat(43);
const PDF=new Uint8Array(Buffer.from('%PDF-1.4\nCOTIRONDA SYNTHETIC TEST ONLY\n'));
const SHA=createHash('sha256').update(PDF).digest('hex');
const gate=()=>({
 habilitada:true,entorno:'preview',
 proyectoUrl:'https://ilggkalaafhtiysyzlmg.supabase.co',
 shaDesplegado:'a'.repeat(40),shaAprobado:'a'.repeat(40),
 origenPortal:ORIGIN,claveHmacHex:KEY
});
const source=()=>({
 state:'authorized_original_v2',requestId:ROUND,documentId:DOC,
 buyerKey:'buyer_a',supplierKey:'supplier_a',messageHmac:HASH,
 bucket:'cotironda-piloto-originals',path:'media/'+HASH,
 mime:'application/pdf',byteCount:PDF.length,sha256:SHA,
 consentAt:1700000000000,invitedAt:1700000000001
});
function fixture(){
 const status={ctx:true,source:source(),bytes:PDF,
  secondSource:null,secondCtx:null,audit:true,
  ctxCount:0,sourceCount:0,storageCount:0,auditCount:0};
 const req=(options={})=>new Request(
  ORIGIN+'/api/piloto/v2/rondas/'+ROUND+'/originales-whatsapp/'+DOC+
   (options.query??''),{
  method:options.method??'GET',
  headers:{cookie:options.cookie??D016_SESSION_COOKIE+'='+COOKIE}
 });
 const ports={
  verificarSesion:async q=>{
   status.ctxCount++;
   assert.equal(q.sesionHmac,digestSesionPrivadaD016(COOKIE,KEY));
   if(q.rondaId!==ROUND)return null;
   if(status.ctxCount===2&&status.secondCtx!==null)return status.secondCtx;
   return status.ctx?{buyerKey:'buyer_a',requestId:ROUND}:null;
  },
  fuentePrivada:async q=>{
   status.sourceCount++;
   assert.equal(q.documentoId,DOC);
   assert.equal(q.rondaId,ROUND);
   if(status.sourceCount===2&&status.secondSource!==null)
    return status.secondSource;
   return status.source;
  },
  leerStorage:async q=>{
   status.storageCount++;
   assert.deepEqual(q,{bucket:'cotironda-piloto-originals',path:'media/'+HASH});
   return status.bytes;
  },
  registrarAuditoria:async q=>{
   status.auditCount++;
   assert.deepEqual(q,{sesionHmac:digestSesionPrivadaD016(COOKIE,KEY),
    rondaId:ROUND,documentoId:DOC,sha256:SHA,byteCount:PDF.length});
   return status.audit;
  }
 };
 return {status,req,ports,run:(r=req(),g=gate())=>
  descargarConWhatsappD016(g,r,ROUND,DOC,ports)};
}
test('D016 descarga PDF exacto: sesión doble, origen doble y auditoría antes de bytes',async()=>{
 const f=fixture();const r=await f.run();
 assert.equal(r.status,200);
 assert.equal(r.headers.get('content-type'),'application/pdf');
 assert.match(r.headers.get('content-disposition'),/attachment/u);
 assert.equal(r.headers.get('cache-control')?.includes('no-store'),true);
 assert.equal(r.headers.get('vary'),'Cookie');
 assert.deepEqual(new Uint8Array(await r.arrayBuffer()),PDF);
 assert.deepEqual([f.status.ctxCount,f.status.sourceCount,
  f.status.storageCount,f.status.auditCount],[2,2,1,1]);
});
test('D016 descarga: cookie faltante, duplicada, ronda o documento ajeno no inicia I/O',async()=>{
 const f=fixture();
 for(const bad of [
  f.req({cookie:''}),
  f.req({cookie:D016_SESSION_COOKIE+'='+COOKIE+'; '+D016_SESSION_COOKIE+'='+COOKIE}),
  f.req({method:'POST'}),
  f.req({query:'?preview=true'})
 ]){
  const out=await f.run(bad);
  assert.notEqual(out.status,200);
  assert.equal(out.headers.get('content-length'),null);
 }
 const cross=await descargarConWhatsappD016(gate(),f.req(),
  'aaaaaaaa-bbbb-4bbb-abbb-bbbbbbbbbbbb',DOC,f.ports);
 assert.notEqual(cross.status,200);
 assert.equal(f.status.storageCount,0);
 assert.equal(f.status.auditCount,0);
});
test('D016 descarga: fraude de fuente, MIME o SHA nunca libera archivo',async()=>{
 for(const patch of [
  {buyerKey:'buyer_b'}, {requestId:'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'},
  {mime:'application/x-malware'}, {path:'media/'+'f'.repeat(64)},
  {sha256:'f'.repeat(64)}, {byteCount:PDF.length+1},
  {consentAt:1700000001000,invitedAt:1700000000001}
 ]){
  const f=fixture();f.status.source={...source(),...patch};
  const result=await f.run();
  assert.notEqual(result.status,200,JSON.stringify(patch));
  assert.equal(f.status.auditCount,0);
 }
});
test('D016 descarga: revocación y cambios durante I/O bloquean aun tras leer bytes',async()=>{
 for(const type of ['session','source','audit','content']){
  const f=fixture();
  if(type==='session')f.status.secondCtx={buyerKey:'buyer_b',requestId:ROUND};
  if(type==='source')f.status.secondSource={...source(),sha256:'f'.repeat(64)};
  if(type==='audit')f.status.audit=false;
  if(type==='content')f.status.bytes=new Uint8Array(Buffer.from('tampered'));
  const result=await f.run();
  assert.notEqual(result.status,200,type);
  assert.equal(result.headers.get('content-disposition'),null);
 }
});
test('D016 descarga: flags OFF siempre niegan y no toca las RPC',async()=>{
 const f=fixture();
 const result=await f.run(f.req(),{...gate(),habilitada:false});
 assert.equal(result.status,503);
 assert.equal(f.status.ctxCount,0);
});

const TXT=new TextEncoder().encode('Cotización WhatsApp: 15 bolsas de cemento x 50 kg. IVA no informado.');
const TXT_SHA=createHash('sha256').update(TXT).digest('hex');
const textSource=()=>({
 state:'authorized_text_v2',requestId:ROUND,documentId:DOC,
 buyerKey:'buyer_a',supplierKey:'supplier_a',messageHmac:HASH,
 chatHmac:'7'.repeat(64),
 nonceB64:'AAAAAAAAAAAAAAAA',ciphertextB64:'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
 sha256:TXT_SHA,mime:'text/plain',
 consentAt:1700000000000,invitedAt:1700000000001
});
function textFixture(){
 const f=fixture();
 f.status.source=textSource();
 f.status.bytes=TXT;
 f.status.textRead=0;
 f.status.textAudit=0;
 f.ports.leerTexto=async(src,sessionHmac)=>{
  assert.deepEqual(src,f.status.source);
  assert.equal(sessionHmac,digestSesionPrivadaD016(COOKIE,KEY));
  f.status.textRead++;
  return f.status.bytes;
 };
 f.ports.registrarAuditoriaTexto=async q=>{
  f.status.textAudit++;
  assert.deepEqual(q,{
   sesionHmac:digestSesionPrivadaD016(COOKIE,KEY),
   rondaId:ROUND,documentoId:DOC,sha256:TXT_SHA,
   byteCount:TXT.length
  });
  return f.status.audit;
 };
 return f;
}
test('D016 texto WhatsApp descifrado en Edge: bytes exactos, doble permiso y auditoría TXT',async()=>{
 const f=textFixture();const res=await f.run();
 assert.equal(res.status,200);
 assert.equal(res.headers.get('content-type'),'text/plain');
 assert.match(res.headers.get('content-disposition'),/\.txt"/u);
 assert.deepEqual(new Uint8Array(await res.arrayBuffer()),TXT);
 assert.deepEqual([f.status.ctxCount,f.status.sourceCount,
  f.status.textRead,f.status.textAudit,f.status.storageCount,
  f.status.auditCount],[2,2,1,1,0,0]);
});
test('D016 texto: no hay acceso si Edge no está configurado o cambian permisos',async()=>{
 const noEdge=fixture();noEdge.status.source=textSource();
 assert.equal((await noEdge.run()).status,503);
 for(const kind of ['revoked','changed','bad_sha','invalid_utf8','audit']){
  const f=textFixture();
  if(kind==='revoked')f.status.secondCtx={buyerKey:'buyer_b',requestId:ROUND};
  if(kind==='changed')f.status.secondSource={...textSource(),
   sha256:'f'.repeat(64)};
  if(kind==='bad_sha')f.status.bytes=new TextEncoder().encode('ALTERED');
  if(kind==='invalid_utf8')f.status.bytes=new Uint8Array(
   TXT.map((v,i)=>i===9?255:v));
  if(kind==='audit')f.status.audit=false;
  const res=await f.run();
  assert.notEqual(res.status,200,kind);
  assert.equal(res.headers.get('content-disposition'),null);
  assert.equal(f.status.storageCount,0);
 }
});
test('D016 texto: fuente ajena o sobre inválido no llama al lector Edge',async()=>{
 for(const patch of [
  {buyerKey:'buyer_b'},{mime:'application/pdf'},
  {chatHmac:'bad'}, {nonceB64:'bad'},
  {documentId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
  {consentAt:1700000000010,invitedAt:1700000000001}
 ]){
  const f=textFixture();
  f.status.source={...textSource(),...patch};
  const res=await f.run();
  assert.notEqual(res.status,200,JSON.stringify(patch));
  assert.equal(f.status.textRead,0);
 }
});
