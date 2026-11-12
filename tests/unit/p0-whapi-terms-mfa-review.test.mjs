import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash} from 'node:crypto';
import {crearRevisorMfaOriginalesP0}
 from '../../src/server/whapi-terms-mfa-review-p0.ts';

const KEY=Buffer.alloc(32,91);
const MESSAGE='a'.repeat(64),NOTICE='b'.repeat(64),CHAT='c'.repeat(64);
const BODY='cotironda-originales-alta-v1: el proveedor autoriza expresamente '+
 'descargar sus presupuestos originales después del cierre de rondas futuras. '+
 'El documento puede tener datos de contacto, QR o información bancaria y '+
 'el comprador autenticado podrá acceder a presupuestos no adjudicados.';
const PLAIN='Confirmo que autorizo la descarga de mis originales de rondas futuras.';
const HASH=x=>createHash('sha256').update(x,'utf8').digest('hex');
const NONCE=Buffer.alloc(12,9);
function packet(text=PLAIN,overrides={}){
 const cipher=createCipheriv('aes-256-gcm',KEY,NONCE);
 cipher.setAAD(Buffer.from(CHAT+'|'+MESSAGE+'|text','utf8'));
 const sealed=Buffer.concat([
  cipher.update(text,'utf8'),cipher.final(),cipher.getAuthTag()
 ]);
 return {state:'ready',messageHmac:MESSAGE,supplierKey:'supplier_1',
  noticeMessageHmac:NOTICE,termsVersion:'cotironda-originales-alta-v1',
  termsSha256:HASH(BODY),termsBody:BODY,chatHmac:CHAT,
  receivedAt:'2026-11-12T15:30:00.000Z',
  plaintextSha256:HASH(text),
  nonceB64:NONCE.toString('base64'),
  ciphertextB64:sealed.toString('base64'),...overrides};
}
function mock(value=packet()){
 const calls=[];
 const module=crearRevisorMfaOriginalesP0({
  authenticatedRpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='cotironda_piloto_terms_review_packet_auth_p0')
    return value;
   return {state:'recorded',decision:args.p_decision};
  },
  inboxAesKey:KEY
 });
 return {module,calls};
}
test('P0 MFA: obtiene texto ORIGINAL del inbox cifrado y términos exactos',async()=>{
 const x=mock(),v=await x.module.preparar(MESSAGE);
 assert.equal(v.text,PLAIN);
 assert.equal(v.termsBody,BODY);
 assert.equal(v.plaintextSha256,HASH(PLAIN));
 assert.equal(v.noticeMessageHmac,NOTICE);
 assert.equal(x.calls.length,1);
 assert.deepEqual(x.calls[0],{
  name:'cotironda_piloto_terms_review_packet_auth_p0',
  args:{p_message_hmac:MESSAGE}
 });
});
test('P0 MFA: decisión es SEGUNDA acción humana, revalida inbox y no interpreta IA',async()=>{
 const x=mock();
 const v=await x.module.preparar(MESSAGE);
 assert.equal(x.calls.length,1);
 assert.deepEqual(await x.module.decidir({
  messageHmac:v.messageHmac,noticeMessageHmac:v.noticeMessageHmac,
  reviewedPlaintextSha256:v.plaintextSha256,
  decision:'explicit_accept',humanAttestation:true
 }),{state:'recorded',decision:'explicit_accept'});
 assert.equal(x.calls.length,3);
 assert.equal(x.calls[2].name,'cotironda_piloto_terms_review_decide_auth_p0');
 assert.deepEqual(x.calls[2].args,{
  p_message_hmac:MESSAGE,p_notice_message_hmac:NOTICE,
  p_reviewed_text:PLAIN,p_decision:'explicit_accept',p_human_attestation:true
 });
});
test('P0 MFA: revisar no crea consentimiento y puede rechazar sin aceptación',async()=>{
 const x=mock();
 const v=await x.module.preparar(MESSAGE);
 assert.equal(x.calls.length,1);
 assert.deepEqual(await x.module.decidir({
  messageHmac:MESSAGE,noticeMessageHmac:NOTICE,
  reviewedPlaintextSha256:v.plaintextSha256,
  decision:'not_explicit',humanAttestation:true
 }),{state:'recorded',decision:'not_explicit'});
 assert.equal(x.calls[2].args.p_decision,'not_explicit');
});
test('P0 MFA: no acepta suplantación, texto alterado ni otro aviso',async()=>{
 for(const override of [
  {messageHmac:'f'.repeat(64)},
  {noticeMessageHmac:'bad'},
  {termsSha256:'e'.repeat(64)},
  {termsVersion:'otra_version'},
  {chatHmac:'bad'},
  {plaintextSha256:'d'.repeat(64)},
  {nonceB64:'bad'},
  {ciphertextB64:packet().ciphertextB64.slice(0,-4)+'AAAA'},
  {receivedAt:'bad-date'},
  {supplierKey:'Buyer Invalid'},
  {untrusted:'extra'}
 ]){
  const x=mock(packet(PLAIN,override));
  await assert.rejects(x.module.preparar(MESSAGE),
   /p0_mfa_revision_no_disponible/u,JSON.stringify(override));
 }
 const wrongKey=crearRevisorMfaOriginalesP0({
  authenticatedRpc:async()=>packet(),inboxAesKey:Buffer.alloc(32,80)
 });
 await assert.rejects(wrongKey.preparar(MESSAGE),
  /p0_mfa_revision_no_disponible/u);
});
test('P0 MFA: estado no autorizado, error de DB y parámetros inválidos no aprueban',async()=>{
 for(const response of [
  {state:'not_authorized'},{state:'unavailable'},null,
  {state:'ready'},{state:'ready',messageHmac:MESSAGE}
 ]){
  const x=mock(response);
  await assert.rejects(x.module.preparar(MESSAGE),
   /p0_mfa_revision_no_disponible/u);
 }
 const no=crearRevisorMfaOriginalesP0({
  authenticatedRpc:async()=>{throw Error('JWT secret');},inboxAesKey:KEY
 });
 await assert.rejects(no.preparar(MESSAGE),
  e=>e.message==='p0_mfa_revision_no_disponible');
 const x=mock();
 for(const input of [
  {messageHmac:MESSAGE,noticeMessageHmac:NOTICE,
   reviewedPlaintextSha256:HASH(PLAIN),
   decision:'explicit_accept',humanAttestation:false},
  {messageHmac:MESSAGE,noticeMessageHmac:NOTICE,
   reviewedPlaintextSha256:HASH(PLAIN),
   decision:'maybe',humanAttestation:true},
  {messageHmac:MESSAGE,noticeMessageHmac:'e'.repeat(64),
   reviewedPlaintextSha256:HASH(PLAIN),
   decision:'explicit_accept',humanAttestation:true},
  {messageHmac:MESSAGE,noticeMessageHmac:NOTICE,
   reviewedPlaintextSha256:'f'.repeat(64),
   decision:'explicit_accept',humanAttestation:true},
 ]){
  await assert.rejects(x.module.decidir(input),
   /p0_mfa_revision_no_disponible/u);
 }
 assert.equal(x.calls.filter(x=>x.name.includes('decide')).length,0);
});
test('P0 MFA: rechaza una carrera si el aviso cambia entre ver y decidir',async()=>{
 let calls=0;
 const x=crearRevisorMfaOriginalesP0({
  inboxAesKey:KEY,
  authenticatedRpc:async name=>{
   if(name.includes('review_packet')){
    calls++;
    return packet(PLAIN,calls===2?{noticeMessageHmac:'e'.repeat(64)}:{});
   }
   throw Error('must not approve');
  }
 });
 const v=await x.preparar(MESSAGE);
 await assert.rejects(x.decidir({
  messageHmac:MESSAGE,noticeMessageHmac:v.noticeMessageHmac,
  reviewedPlaintextSha256:v.plaintextSha256,
  decision:'explicit_accept',humanAttestation:true
 }),/p0_mfa_revision_no_disponible/u);
 assert.equal(calls,2);
});
