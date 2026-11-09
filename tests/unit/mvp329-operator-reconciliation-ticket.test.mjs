import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {cotejarConTicketOperadorMvp329} from
 '../../src/domain/ia-central/operador-conciliacion-autorizado-mvp329.ts';
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const req='11111111-1111-4111-8111-111111111111',mid='a'.repeat(64),
 chat='c'.repeat(64),actor='b'.repeat(64),ticket='7'.repeat(64);
const line='20 bolsas cemento CPC 50 kg c/u AR$ 9000 total AR$ 180000';
const fuente='ARS\n'+line+'\nTotal general: AR$ 180000';
const pedido=[{id:'item_1',descripcion:'Cemento CPC 50 kg',
 cantidad:'20',unidad:'bag',rubro:'obra_gruesa'}];
const propuesta=()=>({
 requestId:req,pedido:structuredClone(pedido),
 oferta:{etiquetaAnonima:'Cotización interna',moneda:'ARS',
  iva:'no_informado',flete:'no_informado',pago:'no_informado',
  fuente,
  lineas:[{numero:1,textoOriginal:line,descripcion:'Cemento CPC 50 kg',
   cantidad:'20',unidad:'bag',precioUnitarioLiteral:'AR$ 9000',
   totalLineaLiteral:'AR$ 180000',tipo:'material'}],
  vinculos:[{lineaOferta:1,articuloPedido:'item_1',
   equivalencia:'misma_presentacion',explicacion:'Cotejo literal'}]
 }
});
async function fixture(){
 const aesKey=await webcrypto.subtle.importKey('raw',new Uint8Array(32).fill(9),
 'AES-GCM',false,['encrypt','decrypt']);
 const iv=new Uint8Array(12).fill(5);
 const encoded=await webcrypto.subtle.encrypt(
 {name:'AES-GCM',iv,
 additionalData:new TextEncoder().encode(chat+'|'+mid+'|text'),tagLength:128},
 aesKey,new TextEncoder().encode(fuente));
 const envelope={
  state:'eligible_encrypted',request_id:req,message_hmac:mid,chat_hmac:chat,
  source_sha256:sha(fuente),latest_message_hmac:mid,
  latest_source_sha256:sha(fuente),finished_at:'2026-11-07T16:45:00Z',
  format:'text',nonce:Buffer.from(iv).toString('base64'),
  ciphertext:Buffer.from(encoded).toString('base64'),
  items:structuredClone(pedido)
 };
 const claimed={state:'claimed_internal',actor_subject_sha256:actor,
  request_id:req,message_hmac:mid,chat_hmac:chat};
 const calls=[];
 let claim=claimed,writeState='recorded_private';
 const rpcService=async(name,params)=>{
  calls.push({name,params});
  const data=name==='cotironda_piloto_claim_reconciliation_mvp329'?claim:
   name==='cotironda_piloto_read_reconciliation_envelope_mvp328'?envelope:
   name==='cotironda_piloto_record_reconciliation_attempt_mvp328'?
   {state:writeState}:null;
  return {data,error:null};
 };
 const args={enabled:true,trustedInternalWorker:true,ticket,
  requestId:req,messageHmac:mid,chatHmac:chat,
  aesKey,rpcService,propuesta:propuesta()};
 return {args,calls,envelope,claimed,setClaim:x=>{claim=x},setWrite:x=>{writeState=x}};
}
test('MVP329: one-use database proof derives actor for private audit; no publish',async()=>{
 const f=await fixture(),res=await cotejarConTicketOperadorMvp329(f.args);
 assert.deepEqual(res,{
  estado:'registrado_privado',
  resultadoComercial:'candidato_para_auditoria_independiente',
  publicacionPermitida:false,originalModificado:false,whatsappEnviados:0,
  llamadasIA:0
 });
 assert.deepEqual(f.calls.map(x=>x.name),[
  'cotironda_piloto_claim_reconciliation_mvp329',
  'cotironda_piloto_read_reconciliation_envelope_mvp328',
  'cotironda_piloto_record_reconciliation_attempt_mvp328'
 ]);
 assert.equal(f.calls[2].params.p_actor_subject_sha256,actor);
 assert.equal(f.calls[2].params.p_result_state,'candidate_only');
 assert.doesNotMatch(JSON.stringify(res),/Cemento|180000|9{2,}|ticket|source|ciphertext/u);
 assert.doesNotMatch(JSON.stringify(f.calls[2]),/Cemento|9000|180000|nonce|ciphertext/u);
});
test('MVP329: default OFF, no ticket, bad input, no worker -> no service RPC',async()=>{
 for(const change of [
  {enabled:false},{trustedInternalWorker:false},{ticket:'bad'},
  {ticket:'A'.repeat(64)},{messageHmac:'tampered'},
  {chatHmac:'tampered'},{requestId:'other'}
 ]){
  const f=await fixture();
  const r=await cotejarConTicketOperadorMvp329({...f.args,...change});
  assert.equal(r.estado,'deshabilitado');
  assert.equal(f.calls.length,0);
 }
});
test('MVP329: revoked or reused ticket blocks the encrypted envelope lookup',async()=>{
 const f=await fixture();
 f.setClaim({state:'not_authorized'});
 const r=await cotejarConTicketOperadorMvp329(f.args);
 assert.equal(r.estado,'no_autorizado');
 assert.equal(f.calls.length,1);
 assert.equal(r.publicacionPermitida,false);
});
test('MVP329: forged actor, extra response fields, mismatched company blocked',async()=>{
 for(const change of [
  {actor_subject_sha256:'bad'},
  {request_id:'22222222-2222-4222-8222-222222222222'},
  {chat_hmac:'f'.repeat(64)},
  {untrusted_operator:true},
  {state:'claimed_internal',operator_ref:'30000000-0000-4000-8000-000000000001'}
 ]){
  const f=await fixture();
  f.setClaim({...f.claimed,...change});
  const r=await cotejarConTicketOperadorMvp329(f.args);
  assert.equal(r.estado,'conciliacion_incierta',JSON.stringify(change));
  assert.equal(f.calls.length,1);
 }
});
test('MVP329: lost proof ack does not replay the claim or send WhatsApp',async()=>{
 const f=await fixture();
 f.args.rpcService=async(name,params)=>{
  f.calls.push({name,params});
  return {error:'timeout',data:null};
 };
 const r=await cotejarConTicketOperadorMvp329(f.args);
 assert.equal(r.estado,'conciliacion_incierta');
 assert.equal(f.calls.length,1);
 assert.equal(r.whatsappEnviados,0);
});
test('MVP329: bad proposal cannot bypass scope and evidence in MVP328',async()=>{
 const f=await fixture();
 f.args.propuesta.pedido[0].cantidad='200';
 const r=await cotejarConTicketOperadorMvp329(f.args);
 assert.equal(r.estado,'custodia_incompleta');
 assert.deepEqual(f.calls.map(x=>x.name),[
  'cotironda_piloto_claim_reconciliation_mvp329',
  'cotironda_piloto_read_reconciliation_envelope_mvp328'
 ]);
});
test('MVP329: tampered quoted price is only a requires_evidence audit attempt',async()=>{
 const f=await fixture();
 f.args.propuesta.oferta.lineas[0].precioUnitarioLiteral='AR$ 8000';
 const r=await cotejarConTicketOperadorMvp329(f.args);
 assert.equal(r.estado,'registrado_privado');
 assert.equal(r.resultadoComercial,'requiere_evidencia');
 assert.equal(f.calls[2].params.p_result_state,'requires_evidence');
 assert.equal(r.publicacionPermitida,false);
});
test('MVP329: SQL record ack can be idempotent without revealing source',async()=>{
 const f=await fixture();f.setWrite('already_recorded');
 const r=await cotejarConTicketOperadorMvp329(f.args);
 assert.equal(r.estado,'ya_registrado');
 assert.equal(r.publicacionPermitida,false);
});
