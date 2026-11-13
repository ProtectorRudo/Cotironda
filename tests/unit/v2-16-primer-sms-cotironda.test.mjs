import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {solicitarSmsCompradorV2}
 from '../../src/server/v2-16-primer-sms-cotironda.ts';

const setup=(firstError,secondError=null)=>{
 const calls={login:0,resend:0};
 const ports={
  inicio:async()=>{calls.login++;return {error:firstError}},
  confirmarAltaPendiente:async()=>{calls.resend++;
   return {error:secondError}}
 };
 return {calls,ports};
};
test('V2-16: cuenta ya confirmada recibe SMS normal una sola vez',async()=>{
 const {calls,ports}=setup(null);
 assert.equal(await solicitarSmsCompradorV2(ports),true);
 assert.deepEqual(calls,{login:1,resend:0});
});
test('V2-16: primer comprador Auth no confirmado y signup cerrado usa resend de SMS',async()=>{
 const {calls,ports}=setup({code:'signup_disabled'});
 assert.equal(await solicitarSmsCompradorV2(ports),true);
 assert.deepEqual(calls,{login:1,resend:1});
});
test('V2-16: falla cerrada si SMS de confirmación no se pudo enviar',async()=>{
 const {calls,ports}=setup({code:'signup_disabled'},
  {code:'sms_send_failed'});
 assert.equal(await solicitarSmsCompradorV2(ports),false);
 assert.deepEqual(calls,{login:1,resend:1});
});
test('V2-16: no reenviar frente a otros errores Auth, ni a IP limitada',async()=>{
 for(const code of [
  'otp_disabled','phone_not_confirmed','phone_provider_disabled',
  'sms_send_failed','over_sms_send_rate_limit','over_request_rate_limit',
  'invalid_credentials','invalid_otp','user_not_found'
 ]){
  const {calls,ports}=setup({code});
  assert.equal(await solicitarSmsCompradorV2(ports),false,code);
  assert.deepEqual(calls,{login:1,resend:0},code);
 }
});
test('V2-16: errores de red o respuestas malformadas no provocan segundo envío',async()=>{
 const samples=[null,false,undefined,{error:{message:'message'}},
  {error:{code:null}},{error:{code:42}}];
 for(const sample of samples){
  let resend=0;
  const result=await solicitarSmsCompradorV2({
   inicio:async()=>sample,
   confirmarAltaPendiente:async()=>{resend++;return {error:null}}
  });
  assert.equal(result,false);
  assert.equal(resend,0);
 }
 let calls=0;
 assert.equal(await solicitarSmsCompradorV2({
  inicio:async()=>{throw Error('offline')},
  confirmarAltaPendiente:async()=>{calls++;return {error:null}}
 }),false);
 assert.equal(calls,0);
 assert.equal(await solicitarSmsCompradorV2({
  inicio:async()=>({error:{code:'signup_disabled'}}),
  confirmarAltaPendiente:async()=>{throw Error('offline')}
 }),false);
});
test('V2-16: interfaz exige cuenta ya creada, sin alta pública ni confirmación falsa',()=>{
 const ui=readFileSync(new URL(
  '../../apps/portal/app/piloto/v2/rondas/[rondaId]/respuestas-comprador.tsx',
  import.meta.url),'utf8');
 assert.ok(ui.includes('solicitarSmsCompradorV2'));
 assert.ok(ui.includes('shouldCreateUser:false'));
 assert.match(ui,/client\.auth\.resend\(\{\s*type:'sms',phone:phone\.trim\(\)/u);
 assert.match(ui,/client\.auth\.verifyOtp\(\{[\s\S]*type:'sms'/u);
 assert.doesNotMatch(ui,/signUp\(|phone_confirm:true|admin\.createUser/u);
});
