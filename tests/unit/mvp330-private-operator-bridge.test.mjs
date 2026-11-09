import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {ejecutarConciliacionOperadorMvp330} from
 '../../src/domain/ia-central/servicio-operador-conciliacion-mvp330.ts';

const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const req='11111111-1111-4111-8111-111111111111',
 user='22222222-2222-4222-8222-222222222222',
 message='a'.repeat(64),chat='c'.repeat(64),actor='b'.repeat(64),
 ticket='7'.repeat(64),jwt='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';
const detail='20 bolsas cemento CPC 50 kg c/u AR$ 9000 total AR$ 180000',
 fuente='ARS\n'+detail+'\nTotal general: AR$ 180000',
 pedido=[{id:'item_1',descripcion:'Cemento CPC 50 kg',
  cantidad:'20',unidad:'bag',rubro:'obra_gruesa'}];
const input={jwt,requestId:req,messageHmac:message,chatHmac:chat};
const propuesta=()=>({
 requestId:req,pedido:structuredClone(pedido),
 oferta:{etiquetaAnonima:'Cotización interna',moneda:'ARS',
  iva:'no_informado',flete:'no_informado',pago:'no_informado',
  fuente,lineas:[{numero:1,textoOriginal:detail,
   descripcion:'Cemento CPC 50 kg',cantidad:'20',unidad:'bag',
   precioUnitarioLiteral:'AR$ 9000',totalLineaLiteral:'AR$ 180000',
   tipo:'material'}],
  vinculos:[{lineaOferta:1,articuloPedido:'item_1',
   equivalencia:'misma_presentacion',explicacion:'Cotejo literal'}]
 }
});
async function fixture(){
 const aesKey=await webcrypto.subtle.importKey('raw',
  new Uint8Array(32).fill(9),'AES-GCM',false,['encrypt','decrypt']);
 const iv=new Uint8Array(12).fill(5);
 const ciphertext=await webcrypto.subtle.encrypt({
  name:'AES-GCM',iv,
  additionalData:new TextEncoder().encode(chat+'|'+message+'|text'),
  tagLength:128},aesKey,new TextEncoder().encode(fuente));
 const envelope={
  state:'eligible_encrypted',request_id:req,message_hmac:message,
  chat_hmac:chat,source_sha256:hash(fuente),
  latest_message_hmac:message,latest_source_sha256:hash(fuente),
  finished_at:'2026-11-07T16:45:00Z',format:'text',
  nonce:Buffer.from(iv).toString('base64'),
  ciphertext:Buffer.from(ciphertext).toString('base64'),
  items:structuredClone(pedido)
 };
 let auth={data:{user:{id:user,is_anonymous:false}},error:null};
 let issue={data:{state:'issued',ticket,expires_in_seconds:90},error:null};
 let proof={state:'claimed_internal',actor_subject_sha256:actor,
  request_id:req,message_hmac:message,chat_hmac:chat};
 let storedProposal=propuesta();
 const calls=[];
 const deps={
  enabled:true,trustedInternalWorker:true,aesKey,
  getUser:async(j)=>{calls.push(['auth.getUser',j]);return auth;},
  rpcAutenticada:async(j,name,params)=>{
   calls.push(['authenticated_rpc',j,name,params]);return issue;
  },
  cargarPropuesta:async(ids)=>{
   calls.push(['internal_proposal',ids]);return storedProposal;
  },
  rpcPrivada:async(name,params)=>{
   calls.push(['private_rpc',name,params]);
   const data=name==='cotironda_piloto_claim_reconciliation_mvp329'?proof:
    name==='cotironda_piloto_read_reconciliation_envelope_mvp328'?envelope:
    name==='cotironda_piloto_record_reconciliation_attempt_mvp328'?
    {state:'recorded_private'}:null;
   return {data,error:null};
  }
 };
 return {deps,calls,
  setAuth:x=>{auth=x},setIssue:x=>{issue=x},
  setProof:x=>{proof=x},setProposal:x=>{storedProposal=x}
 };
}
test('MVP330: JWT getUser -> authenticated issue -> internal proposal -> single-use claim',async()=>{
 const f=await fixture();
 const r=await ejecutarConciliacionOperadorMvp330(input,f.deps);
 assert.deepEqual(r,{
  estado:'registrado_privado',
  resultadoComercial:'candidato_para_auditoria_independiente',
  publicacionPermitida:false,originalModificado:false,
  whatsappEnviados:0,llamadasIA:0
 });
 assert.deepEqual(f.calls.map(x=>x[0]),[
  'auth.getUser','authenticated_rpc','internal_proposal',
  'private_rpc','private_rpc','private_rpc'
 ]);
 assert.equal(f.calls[0][1],jwt);
 assert.equal(f.calls[1][1],jwt);
 assert.equal(f.calls[1][2],
  'cotironda_piloto_operator_issue_reconciliation_mvp329');
 assert.equal(f.calls[3][1],
  'cotironda_piloto_claim_reconciliation_mvp329');
 assert.equal(f.calls[3][2].p_ticket,ticket);
 assert.equal(f.calls[5][2].p_actor_subject_sha256,actor);
 assert.doesNotMatch(JSON.stringify(r),/180000|Cemento|ciphertext|ticket|jwt/u);
 assert.doesNotMatch(JSON.stringify(f.calls[5]),/180000|Cemento|nonce|ciphertext/u);
});
test('MVP330: missing config or exportable key fails before Auth',async()=>{
 const f=await fixture();
 const r=await ejecutarConciliacionOperadorMvp330(input,
  {...f.deps,enabled:false});
 assert.equal(r.estado,'deshabilitado');
 assert.equal(f.calls.length,0);
 const k=await webcrypto.subtle.importKey('raw',
  new Uint8Array(32).fill(1),'AES-GCM',true,['decrypt']);
 const r2=await ejecutarConciliacionOperadorMvp330(input,
  {...f.deps,aesKey:k});
 assert.equal(r2.estado,'deshabilitado');
 assert.equal(f.calls.length,0);
});
test('MVP330: injected proposal, buyer, operator, ticket or approval rejected',async()=>{
 for(const key of ['propuesta','buyer_key','operator_ref','ticket','approved',
  'trustedInternalWorker','user_metadata']){
  const f=await fixture();
  const r=await ejecutarConciliacionOperadorMvp330(
   {...input,[key]:'forged'},f.deps);
  assert.equal(r.estado,'no_autorizado',key);
  assert.equal(f.calls.length,0);
 }
});
test('MVP330: malformed JWT, UUID, source or non-object rejected',async()=>{
 for(const bad of [
  {...input,jwt:'not.a.jwt.with.extra'},
  {...input,jwt:'Bearer '+jwt},
  {...input,requestId:'other'},
  {...input,messageHmac:'A'.repeat(64)},
  {...input,chatHmac:'other'},null,[],{}
 ]){
  const f=await fixture();
  const r=await ejecutarConciliacionOperadorMvp330(bad,f.deps);
  assert.equal(r.estado,'no_autorizado');
  assert.equal(f.calls.length,0);
 }
});
test('MVP330: Auth error, anonymous, malformed and revoked user -> no issue',async()=>{
 for(const auth of [
  {data:null,error:{message:'bad signature'}},
  {data:{user:{id:user,is_anonymous:true}},error:null},
  {data:{user:{id:'bad'}},error:null},
  {data:{user:{id:user,deleted_at:'2026-11-09'}},error:null}
 ]){
  const f=await fixture();f.setAuth(auth);
  const r=await ejecutarConciliacionOperadorMvp330(input,f.deps);
  assert.equal(r.estado,'no_autorizado');
  assert.deepEqual(f.calls.map(x=>x[0]),['auth.getUser']);
 }
});
test('MVP330: MFA/session/grant denied by SQL -> never load proposal',async()=>{
 const f=await fixture();
 f.setIssue({data:{state:'not_authorized'},error:null});
 const r=await ejecutarConciliacionOperadorMvp330(input,f.deps);
 assert.equal(r.estado,'no_autorizado');
 assert.deepEqual(f.calls.map(x=>x[0]),
  ['auth.getUser','authenticated_rpc']);
});
test('MVP330: issue with extra fields or invalid TTL denied',async()=>{
 const f=await fixture();
 f.setIssue({data:{state:'issued',ticket,expires_in_seconds:300},error:null});
 const r=await ejecutarConciliacionOperadorMvp330(input,f.deps);
 assert.equal(r.estado,'no_autorizado');
 assert.equal(f.calls.length,2);
});
test('MVP330: proposal comes from server; missing or mismatched -> no claim',async()=>{
 for(const bad of [null,{...propuesta(),requestId:
  '33333333-3333-4333-8333-333333333333'}]){
  const f=await fixture();f.setProposal(bad);
  const r=await ejecutarConciliacionOperadorMvp330(input,f.deps);
  assert.equal(r.estado,'no_elegible');
  assert.deepEqual(f.calls.map(x=>x[0]),
   ['auth.getUser','authenticated_rpc','internal_proposal']);
 }
});
test('MVP330: replay/revoked ticket fails closed and never reads envelope',async()=>{
 const f=await fixture();f.setProof({state:'not_authorized'});
 const r=await ejecutarConciliacionOperadorMvp330(input,f.deps);
 assert.equal(r.estado,'no_autorizado');
 assert.equal(r.publicacionPermitida,false);
 assert.deepEqual(f.calls.map(x=>x[0]),
  ['auth.getUser','authenticated_rpc','internal_proposal','private_rpc']);
});
test('MVP330: altered economic proposal only generates private evidence required',async()=>{
 const f=await fixture(),p=propuesta();
 p.oferta.lineas[0].precioUnitarioLiteral='AR$ 8000';f.setProposal(p);
 const r=await ejecutarConciliacionOperadorMvp330(input,f.deps);
 assert.equal(r.estado,'registrado_privado');
 assert.equal(r.resultadoComercial,'requiere_evidencia');
 assert.equal(r.publicacionPermitida,false);
 assert.equal(r.whatsappEnviados,0);
 assert.equal(r.llamadasIA,0);
});
test('MVP330: failed issue or source loader returns uncertainty without retry',async()=>{
 const f=await fixture();
 f.setIssue({data:null,error:'connection lost'});
 const r=await ejecutarConciliacionOperadorMvp330(input,f.deps);
 assert.equal(r.estado,'conciliacion_incierta');
 assert.deepEqual(f.calls.map(x=>x[0]),['auth.getUser','authenticated_rpc']);
 const g=await fixture();
 g.deps.cargarPropuesta=async()=>{throw Error('database offline')};
 const r2=await ejecutarConciliacionOperadorMvp330(input,g.deps);
 assert.equal(r2.estado,'conciliacion_incierta');
 assert.equal(g.calls.filter(x=>x[0]==='private_rpc').length,0);
});
