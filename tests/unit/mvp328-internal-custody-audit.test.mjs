import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {cotejarYRegistrarPrivadoMvp328} from
 '../../src/domain/ia-central/custodia-conciliacion-interna-mvp328.ts';
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const req='11111111-1111-4111-8111-111111111111';
const mid='a'.repeat(64),chat='c'.repeat(64),actor='b'.repeat(64);
const quote='20 bolsas cemento CPC 50 kg c/u AR$ 9000 total AR$ 180000';
const fuente='ARS\n'+quote+'\nTotal general: AR$ 180000';
const pedido=[{id:'item_1',descripcion:'Cemento CPC 50 kg',
 cantidad:'20',unidad:'bag',rubro:'obra_gruesa'}];
const propuesta=()=>({
 requestId:req,pedido:structuredClone(pedido),
 oferta:{
  etiquetaAnonima:'Oferta privada',moneda:'ARS',
  iva:'no_informado',flete:'no_informado',pago:'no_informado',
  fuente,lineas:[{
   numero:1,textoOriginal:quote,descripcion:'Cemento CPC 50 kg',
   cantidad:'20',unidad:'bag',precioUnitarioLiteral:'AR$ 9000',
   totalLineaLiteral:'AR$ 180000',tipo:'material'
  }],
  vinculos:[{
   lineaOferta:1,articuloPedido:'item_1',equivalencia:'misma_presentacion',
   explicacion:'Cotejo literal de material, unidad y cantidad'
  }]
 }
});
async function fixture(){
 const aesKey=await webcrypto.subtle.importKey('raw',new Uint8Array(32).fill(9),
  'AES-GCM',false,['decrypt','encrypt']);
 const iv=new Uint8Array(12).fill(5);
 const encrypted=await webcrypto.subtle.encrypt({
  name:'AES-GCM',iv,additionalData:new TextEncoder().encode(chat+'|'+mid+'|text'),
  tagLength:128
 },aesKey,new TextEncoder().encode(fuente));
 const snapshot={
  state:'eligible_encrypted',request_id:req,message_hmac:mid,
  chat_hmac:chat,source_sha256:hash(fuente),
  latest_message_hmac:mid,latest_source_sha256:hash(fuente),
  finished_at:'2026-11-07T16:45:00Z',
  format:'text',nonce:Buffer.from(iv).toString('base64'),
  ciphertext:Buffer.from(encrypted).toString('base64'),
  items:structuredClone(pedido)
 };
 const calls=[];
 let recorderResponse='recorded_private';
 const rpc=async(name,params)=>{
  calls.push({name,params});
  return {error:null,data:name==='cotironda_piloto_read_reconciliation_envelope_mvp328'
   ?snapshot:{state:recorderResponse}};
 };
 const args={
  enabled:true,trustedInternalWorker:true,operatorIdentityVerified:true,
  actorSubjectSha256:actor,
  requestId:req,messageHmac:mid,chatHmac:chat,
  aesKey,rpc,propuesta:propuesta()
 };
 return {args,snapshot,calls,setRecord:s=>{recorderResponse=s}};
}
test('MVP328: valid AES-GCM evidence records only a private candidate, no approval',async()=>{
 const f=await fixture();
 const out=await cotejarYRegistrarPrivadoMvp328(f.args);
 assert.deepEqual(out,{
  estado:'registrado_privado',
  resultadoComercial:'candidato_para_auditoria_independiente',
  publicacionPermitida:false,revisionOriginalModificada:false,
  mensajesEnviados:0,llamadasIA:0
 });
 assert.deepEqual(f.calls.map(x=>x.name),[
  'cotironda_piloto_read_reconciliation_envelope_mvp328',
  'cotironda_piloto_record_reconciliation_attempt_mvp328'
 ]);
 const p=f.calls[1].params;
 assert.equal(p.p_result_state,'candidate_only');
 assert.equal(p.p_evidence_sha256.length,64);
 assert.equal(p.p_idempotency_key.length,64);
 assert.deepEqual(p.p_reason_codes,[]);
 assert.doesNotMatch(JSON.stringify(f.calls[1]),/Cemento CPC|180000|9000|ciphertext|nonce|phone|nombre/u);
 assert.doesNotMatch(JSON.stringify(out),/Cemento CPC|180000|9000|ciphertext/u);
});
test('MVP328: same source, actor and proposed lines produce same idempotency hash',async()=>{
 const f=await fixture(),a=await cotejarYRegistrarPrivadoMvp328(f.args);
 assert.equal(a.estado,'registrado_privado');
 const previous=f.calls[1].params.p_idempotency_key;
 f.setRecord('already_recorded');
 const b=await cotejarYRegistrarPrivadoMvp328(f.args);
 assert.equal(b.estado,'ya_registrado');
 assert.equal(previous,f.calls[3].params.p_idempotency_key);
});
test('MVP328: reject any browser-style call without independent operator attestation',async()=>{
 for(const patch of [
  {enabled:false},{trustedInternalWorker:false},{operatorIdentityVerified:false},
  {actorSubjectSha256:'invalid'},{requestId:'other'},
  {messageHmac:'invalid'},{chatHmac:'invalid'}
 ]){
  const f=await fixture();
  const res=await cotejarYRegistrarPrivadoMvp328({...f.args,...patch});
  assert.equal(res.estado,'deshabilitado',JSON.stringify(patch));
  assert.equal(f.calls.length,0);
 }
});
test('MVP328: revocation / unbound lookup is not eligible',async()=>{
 const f=await fixture();f.snapshot.state='not_found';
 const out=await cotejarYRegistrarPrivadoMvp328(f.args);
 assert.equal(out.estado,'no_elegible');
 assert.equal(f.calls.length,1);
});
test('MVP328: newest source hash mismatch or swapped identity cannot decrypt',async()=>{
 const mutate=[
  s=>{s.latest_message_hmac='f'.repeat(64)},
  s=>{s.latest_source_sha256='f'.repeat(64)},
  s=>{s.message_hmac='f'.repeat(64)},
  s=>{s.chat_hmac='f'.repeat(64)},
  s=>{s.items[0].cantidad='21'},
  s=>{s.items[0].descripcion='Otro comercio'},
  s=>{s.nonce=Buffer.from(new Uint8Array(12).fill(4)).toString('base64')},
  s=>{s.ciphertext=s.ciphertext.slice(0,-5)+'abcde'},
  s=>{s.source_sha256='f'.repeat(64);s.latest_source_sha256='f'.repeat(64)},
  s=>{s.contact='secret'}
 ];
 for(const fn of mutate){
  const f=await fixture();fn(f.snapshot);
  const out=await cotejarYRegistrarPrivadoMvp328(f.args);
  assert.equal(out.estado,'custodia_incompleta');
  assert.equal(f.calls.length,1);
 }
});
test('MVP328: proposal with altered requested quantity is rejected before decrypting or writing',async()=>{
 const f=await fixture();f.args.propuesta.pedido[0].cantidad='200';
 const out=await cotejarYRegistrarPrivadoMvp328(f.args);
 assert.equal(out.estado,'custodia_incompleta');
 assert.equal(f.calls.length,1);
});
test('MVP328: fake price cannot create a candidate and remains private',async()=>{
 const f=await fixture();f.args.propuesta.oferta.lineas[0].precioUnitarioLiteral='AR$ 7000';
 const out=await cotejarYRegistrarPrivadoMvp328(f.args);
 assert.equal(out.estado,'registrado_privado');
 assert.equal(out.resultadoComercial,'requiere_evidencia');
 assert.equal(f.calls[1].params.p_result_state,'requires_evidence');
 assert.equal(out.publicacionPermitida,false);
});
test('MVP328: AES key must be non-exportable and decrypt-capable',async()=>{
 const f=await fixture();
 const badKey=await webcrypto.subtle.importKey('raw',new Uint8Array(32).fill(9),
  'AES-GCM',true,['decrypt']);
 const out=await cotejarYRegistrarPrivadoMvp328({...f.args,aesKey:badKey});
 assert.equal(out.estado,'deshabilitado');assert.equal(f.calls.length,0);
});
test('MVP328: lost record acknowledgment is uncertain; never retries an AI',async()=>{
 const f=await fixture();
 f.args.rpc=async(name,params)=>{
  f.calls.push({name,params});
  return name==='cotironda_piloto_read_reconciliation_envelope_mvp328'
   ?{error:null,data:f.snapshot}:{error:'timeout',data:null};
 };
 const r=await cotejarYRegistrarPrivadoMvp328(f.args);
 assert.equal(r.estado,'conciliacion_incierta');
 assert.equal(r.mensajesEnviados,0);assert.equal(r.llamadasIA,0);
 assert.equal(f.calls.length,2);
});
test('MVP328: service RPC failure returns uncertain and no write',async()=>{
 const f=await fixture();
 f.args.rpc=async(name,params)=>{
  f.calls.push({name,params});
  return {error:'rpc unavailable',data:null};
 };
 const r=await cotejarYRegistrarPrivadoMvp328(f.args);
 assert.equal(r.estado,'conciliacion_incierta');
 assert.equal(f.calls.length,1);
});
