import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bootstrapPrimerCompradorV2,phoneWhatsappContactSHA}
 from '../../src/server/v2-07-primer-comprador-auth.ts';
const release='c'.repeat(40);
const options=()=>({
 projectUrl:'https://ilggkalaafhtiysyzlmg.supabase.co',
 buyerKey:'buyer_a',phoneE164:'+5491123456789',
 mode:'dry-run',previewOnly:true,registrationClosed:true,
 activeSourceSha:release,approvedSourceSha:release
});
const mock=()=>{
 const calls={count:0,verify:0,create:0};
 const state={users:0,allowed:true,already:false,confirmed:false};
 const ports={
  countExistingAuthUsers:async()=>{calls.count++;return state.users},
  isVerifiedBuyerPhone:async(buyerKey,sha)=>{
   calls.verify++;
   assert.equal(buyerKey,'buyer_a');
   assert.equal(sha,createHash('sha256')
    .update('5491123456789@s.whatsapp.net').digest('hex'));
   return state.allowed;
  },
  createUnconfirmedUser:async phone=>{
   calls.create++;
   assert.equal(phone,'+5491123456789');
   return {created:!state.already,phoneConfirmed:state.confirmed}
  }
 };
 return {ports,calls,state};
};
test('V2-07: WhatsApp contact SHA matches existing V2-03 SQL exactly',()=>{
 assert.equal(phoneWhatsappContactSHA('+5491123456789'),
  createHash('sha256').update('5491123456789@s.whatsapp.net').digest('hex'));
 assert.equal(phoneWhatsappContactSHA('5491123456789'),null);
 assert.equal(phoneWhatsappContactSHA('+5400'),null);
});
test('V2-07: dry run only reads Auth and proof, no createUser',async()=>{
 const m=mock();
 const output=await bootstrapPrimerCompradorV2(options(),m.ports);
 assert.equal(output.state,'READY_DRY_RUN');
 assert.equal(output.userCreated,false);
 assert.equal(output.smsSent,false);
 assert.deepEqual(m.calls,{count:1,verify:1,create:0});
 assert.ok(!JSON.stringify(output).includes('5491123456789'));
 assert.ok(!JSON.stringify(output).includes('buyer_a'));
});
test('V2-07: source SHA mismatch or production/registration guard blocks before calls',async()=>{
 for(const patch of [
  {projectUrl:'https://proyecto-ajeno.supabase.co'},
  {previewOnly:false},{registrationClosed:false},
  {activeSourceSha:'a'.repeat(40)},
  {buyerKey:'buyer_b; DROP TABLE'},
  {phoneE164:'+0000'},
  {phoneE164:'\u202e+5491123456789'}
 ]){
  const m=mock();const out=await bootstrapPrimerCompradorV2(
   {...options(),...patch},m.ports);
  assert.equal(out.state,'BLOCKED');
  assert.deepEqual(m.calls,{count:0,verify:0,create:0});
 }
});
test('V2-07: execute without PUBLICALO never touches Auth or channel',async()=>{
 const m=mock();
 const r=await bootstrapPrimerCompradorV2({...options(),mode:'execute'},m.ports);
 assert.equal(r.state,'BLOCKED');
 assert.equal(r.code,'aprobacion_de_publicacion_ausente');
 assert.equal(m.calls.create,0);
 assert.equal(m.calls.verify,0);
});
test('V2-07: do not register buyer if any Auth user already exists',async()=>{
 const m=mock();m.state.users=1;
 const r=await bootstrapPrimerCompradorV2(options(),m.ports);
 assert.equal(r.state,'BLOCKED');
 assert.equal(r.code,'alta_inicial_ya_realizada_o_no_verificada');
 assert.equal(m.calls.verify,0);
 assert.equal(m.calls.create,0);
});
test('V2-07: buyer opted out, ambiguous channel or no proof fails closed',async()=>{
 const m=mock();m.state.allowed=false;
 const r=await bootstrapPrimerCompradorV2(options(),m.ports);
 assert.equal(r.state,'BLOCKED');
 assert.equal(r.code,'comprador_o_canal_whatsapp_no_verificado');
 assert.equal(m.calls.create,0);
});
test('V2-07: successful approved candidate creates UNCONFIRMED buyer only',async()=>{
 const m=mock();
 const r=await bootstrapPrimerCompradorV2({
  ...options(),mode:'execute',
  explicitApproval:'PUBLICALO_SOLO_COTIRONDA_PILOTO_AUTH_V2'
 },m.ports);
 assert.equal(r.state,'CREATED_UNCONFIRMED_AWAITING_SMS');
 assert.equal(r.userCreated,true);
 assert.equal(r.smsSent,false);
 assert.equal(r.secretsExposed,false);
 assert.deepEqual(m.calls,{count:2,verify:1,create:1});
});
test('V2-07: a competing user appears before create, abort',async()=>{
 const m=mock();
 const ports={...m.ports,countExistingAuthUsers:async()=>{
  m.calls.count++;return m.calls.count===1?0:1;
 }};
 const r=await bootstrapPrimerCompradorV2({
  ...options(),mode:'execute',
  explicitApproval:'PUBLICALO_SOLO_COTIRONDA_PILOTO_AUTH_V2'
 },ports);
 assert.equal(r.state,'BLOCKED');
 assert.equal(r.code,'alta_inicial_compite_con_otra');
 assert.equal(m.calls.create,0);
});
test('V2-07: unexpectedly confirmed phone is not called secure enrollment',async()=>{
 const m=mock();m.state.confirmed=true;
 const r=await bootstrapPrimerCompradorV2({
  ...options(),mode:'execute',
  explicitApproval:'PUBLICALO_SOLO_COTIRONDA_PILOTO_AUTH_V2'
 },m.ports);
 assert.equal(r.state,'BLOCKED');
 assert.equal(r.code,'alta_no_cumplio_verificacion_sms');
 assert.equal(r.userCreated,true);
});
test('V2-07: auth offline or malformed count never creates an account',async()=>{
 const m=mock();
 const ports={...m.ports,countExistingAuthUsers:async()=>{throw Error('offline with token')}}
 const out=await bootstrapPrimerCompradorV2(options(),ports);
 assert.equal(out.state,'BLOCKED');
 assert.equal(out.code,'servicio_auth_o_evidencia_no_disponible');
 assert.equal(m.calls.create,0);
});
