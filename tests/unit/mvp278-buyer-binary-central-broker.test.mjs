import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepararDocumentoBinarioCompradorMvp278}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-binary-broker-mvp278.ts';

const C='a'.repeat(64),H='b'.repeat(64);
const source='PEDIDO DE MATERIALES\nCemento CPC 50 kg 20 bolsas\nEntrega La Plata';
const bytes=Uint8Array.from({length:512},(_,i)=>i%256);
const sha=b=>createHash('sha256').update(b).digest('hex');
const file={mime:'application/pdf',bytes,sha256:sha(bytes)};
const proposed={
 status:'review_required',kind:'buyer_request',delivery_city:'La Plata',
 requested_delivery_note:null,total_declared:null,unanswered:[],lines:[
  {original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas',
   unit_price:null,line_total:null,evidence_location:'Página 1',ambiguity:null}
 ]
};
const verified={
 estado:'fuente_contrastada_privada',
 codigo:'independent_rows_verified',sha256Original:file.sha256,
 sha256TextoDerivado:sha(new TextEncoder().encode(source)),
 renglonesAcreditados:1,origenIndependiente:true,
 soloVistaPrivada:true,rondaCreada:false,whatsappEnviado:false,
 textoFuentePrivado:source
};
function factory(overrides={}){
 const calls=[];
 const params={
  habilitado:true,autenticadoPorWebhook:true,compradorAutorizado:true,
  chatHmac:C,messageHmac:H,original:file,
  primera:proposed,segunda:structuredClone(proposed),
  apiKey:'FAKE_KEY_ONLY',model:'gpt-6-luna',
  contrastar:async args=>{
   calls.push('read-original');
   assert.equal(args.original.bytes,bytes);
   return verified;
  },
  rpc:async(name,args)=>{
   calls.push('rpc:'+name);
   assert.equal(name,'cotironda_piloto_ia_attest_binary_mvp278');
   assert.equal(args.p_chat_hmac,C);
   assert.equal(args.p_message_hmac,H);
   assert.equal(args.p_original_sha256,file.sha256);
   assert.equal(args.p_derived_text,source);
   assert.equal(args.p_verified_items,1);
   return {data:{state:'attested'},error:null};
  },
  broker:async args=>{
   calls.push('broker');
   assert.equal(args.publicar,false,
    'Binary rounds require buyer review; never auto-publish');
   assert.equal(args.fuente,source);
   assert.equal(args.sourceSha256,verified.sha256TextoDerivado);
   assert.equal(args.chatHmac,C);assert.equal(args.messageHmac,H);
   return {estado:'ronda_en_sombra',codigo:'publish_flag_disabled',
    requestId:'00000000-0000-4000-8000-000000000001',
    seguimientoHabilitado:false,whatsappEnviado:false};
  },
  ...overrides
 };
 return {calls,run:()=>prepararDocumentoBinarioCompradorMvp278(params)};
}
const safe=r=>{
 assert.equal(r.whatsappEnviado,false);
 assert.equal(r.rondaPublicada,false);
 assert.equal(r.contactosRevelados,false);
};
test('MVP278: source is checked -> SQL attested -> shadow round, never dispatched',async()=>{
 const {calls,run}=factory();
 const result=await run();
 assert.equal(result.estado,'ronda_en_sombra');
 assert.equal(result.originalAutorizado,true);
 assert.deepEqual(calls,['read-original',
  'rpc:cotironda_piloto_ia_attest_binary_mvp278','broker']);
 safe(result);
});
test('MVP278: duplicate same attestation is idempotent without re-reading model',async()=>{
 const {calls,run}=factory({rpc:async(name)=>{
  calls.push('rpc:'+name);return {data:{state:'already_attested'},error:null};
 }});
 const r=await run();assert.equal(r.estado,'ronda_en_sombra');safe(r);
 assert.equal(calls.filter(c=>c==='broker').length,1);
});
test('MVP278: OFF and wrong authenticated role skip every source/SQL call',async()=>{
 for(const delta of [
  {habilitado:false},{autenticadoPorWebhook:false},
  {compradorAutorizado:false},{chatHmac:'BAD'},
  {messageHmac:'wrong'},{original:{...file,mime:'image/png'}}
 ]){
  const {calls,run}=factory(delta),r=await run();
  assert.ok(['apagado','no_autorizado'].includes(r.estado));
  assert.deepEqual(calls,[]);
  safe(r);
 }
});
test('MVP278: no duplicate source proof or invalid hashes can authorize writing',async()=>{
 for(const bad of [
  {...verified,estado:'requiere_revision'},
  {...verified,sha256Original:'f'.repeat(64)},
  {...verified,sha256TextoDerivado:'bad'},
  {...verified,renglonesAcreditados:26},
  {...verified,renglonesAcreditados:0},
  {...verified,textoFuentePrivado:null},
  {...verified,rondaCreada:true},
  {...verified,whatsappEnviado:true},
  {...verified,origenIndependiente:false}
 ]){
  const {calls,run}=factory({contrastar:async()=>{calls.push('read-original');return bad;}});
  const r=await run();
  assert.equal(r.estado,'requiere_revision');
  assert.deepEqual(calls,['read-original']);
  safe(r);
 }
});
test('MVP278: missing locality never attests a presumed city',async()=>{
 const {calls,run}=factory({contrastar:async()=>{
  calls.push('read-original');
  return {...verified,estado:'requiere_zona',
   textoFuentePrivado:null,sha256TextoDerivado:null};
 }});
 const r=await run();
 assert.equal(r.estado,'requiere_zona');
 assert.deepEqual(calls,['read-original']);safe(r);
});
test('MVP278: SQL attestation errors require reconciliation, not retry',async()=>{
 for(const error of [true,false]){
  let n=0;
  const {calls,run}=factory({rpc:async()=>{
   n++;calls.push('rpc:attest');
   if(error)throw Error('network response lost after possible COMMIT');
   return {data:null,error:{message:'server_failed'}};
  }});
  const r=await run();
  assert.equal(r.estado,'conciliacion_requerida');
  assert.equal(n,1);assert.ok(!calls.includes('broker'));
  safe(r);
 }
});
test('MVP278: SQL denies archive mismatch and never starts plan',async()=>{
 for(const state of ['source_not_authorized','conflicting_evidence','disabled']){
  const {calls,run}=factory({rpc:async()=>{
   calls.push('rpc:attest');return {data:{state},error:null};
  }});
  const r=await run();
  assert.equal(r.estado,'requiere_revision');
  assert.ok(!calls.includes('broker'));safe(r);
 }
});
test('MVP278: broker cannot claim published or sent despite staging flag',async()=>{
 for(const answer of [
  {estado:'ronda_publicada',whatsappEnviado:false},
  {estado:'ronda_en_sombra',whatsappEnviado:true}
 ]){
  const {run}=factory({broker:async()=>answer});
  const r=await run();
  assert.equal(r.estado,'conciliacion_requerida');safe(r);
 }
});
test('MVP278: SQL broker uncertainty is never retried',async()=>{
 let count=0;
 const {calls,run}=factory({broker:async()=>{
  calls.push('broker');count++;
  throw Error('unknown commit');
 }});
 const r=await run();
 assert.equal(count,1);
 assert.equal(r.estado,'conciliacion_requerida');
 assert.equal(calls.filter(c=>c==='broker').length,1);
 safe(r);
});
test('MVP278: source reader failure denies SQL and model',async()=>{
 const {calls,run}=factory({contrastar:async()=>{
  calls.push('read-original');throw Error('unpdf internal error');
 }});
 const r=await run();assert.equal(r.estado,'requiere_revision');
 assert.deepEqual(calls,['read-original']);safe(r);
});
test('MVP278: Opt-in binary active branch is mutually exclusive with preview/legacy',()=>{
 const code=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 const start=code.indexOf("if(proposal.kind==='buyer_request'&&!verifiedSupplier){");
 const end=code.indexOf("}else if(proposal.kind==='supplier_quote'){",start);
 assert.ok(start>0&&end>start);
 const part=code.slice(start,end);
 const active=part.indexOf('COTIRONDA_PILOT_BUYER_BINARY_CENTRAL_ACTIVE_ENABLED');
 const preview=part.indexOf('COTIRONDA_PILOT_BUYER_BINARY_CENTRAL_PREVIEW_ENABLED');
 const txt=part.indexOf('COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_ACTIVE_ENABLED');
 const legacy=part.indexOf("cotironda_piloto_plan_document_mvp098");
 assert.ok(active>0&&preview>active&&txt>preview&&legacy>txt);
 assert.match(part,/prepararDocumentoBinarioCompradorMvp278\(/u);
 const only=part.slice(active,preview);
 assert.doesNotMatch(only,/trialDispatchChats\.add|preparedDocumentSourceHmac=|cotironda_piloto_ia_publish_mvp222/u);
 assert.match(part,/const mediaPlan=await prepararDocumentoBinarioCompradorMvp278/u);
});
