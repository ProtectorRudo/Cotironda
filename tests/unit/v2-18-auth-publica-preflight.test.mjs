import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {comprobarAuthPublicaPilotoV2}
 from '../../src/server/v2-18-auth-publica-preflight.ts';

const URL='https://ilggkalaafhtiysyzlmg.supabase.co';
const KEY='sb_publishable_'+'Q'.repeat(42);
const good={
 external:{phone:true},disable_signup:true,
 phone_autoconfirm:false,sms_provider:'twilio'
};
const fn=(body=good,status=200,ctype='application/json')=>{
 const called=[];
 const fetchImpl=async(url,init)=>{
  called.push({url,init});
  return new Response(typeof body==='string'?body:JSON.stringify(body),
   {status,headers:{'content-type':ctype}});
 };
 return {called,fetchImpl};
};
test('V2-18: endpoint GET solo con clave publicable PILOTO y ningún secreto',async()=>{
 const mock=fn();
 const r=await comprobarAuthPublicaPilotoV2(URL,KEY,mock.fetchImpl);
 assert.deepEqual(r,{
  state:'SETTINGS_READY_REQUIRES_REAL_SMS',
  code:'configuracion_auth_publica_compatible',
  serviceAccessible:true,signupClosed:true,phoneConfigured:true,
  smsConfirmedByUser:false,writesPerformed:false
 });
 assert.equal(mock.called.length,1);
 assert.equal(mock.called[0].url,URL+'/auth/v1/settings');
 assert.equal(mock.called[0].init.method,'GET');
 assert.equal(mock.called[0].init.headers.apikey,KEY);
 assert.deepEqual(Object.keys(mock.called[0].init.headers).sort(),
  ['accept','apikey']);
 assert.equal(mock.called[0].init.cache,'no-store');
 assert.equal(mock.called[0].init.redirect,'error');
 assert.equal(mock.called[0].init.credentials,'omit');
 assert.ok(mock.called[0].init.signal);
 assert.ok(!JSON.stringify(r).includes(KEY));
});

test('V2-18: URL equivocada, secret key u otras keys se rechazan sin red',async()=>{
 for(const [url,key] of [
  ['https://otro.supabase.co',KEY],
  [URL,'sb_secret_'+'x'.repeat(50)],
  [URL,'eyJfake'],
  [URL,''],
  [URL,'sb_publishable_foo'],
  ['',KEY]
 ]){
  const mock=fn();
  const r=await comprobarAuthPublicaPilotoV2(url,key,mock.fetchImpl);
  assert.equal(r.state,'BLOCKED');
  assert.equal(r.code,'url_o_publicable_key_incorrecta');
  assert.equal(mock.called.length,0);
 }
});

test('V2-18: sin SMS, signup abierto o confirmación automática nunca se declara listo',async()=>{
 for(const cfg of [
  {...good,external:{phone:false}},
  {...good,disable_signup:false},
  {...good,phone_autoconfirm:true},
  {...good,sms_provider:'none'},
  {...good,sms_provider:''},
  {...good,sms_provider:'mock'},
  {...good,sms_provider:null},
  {external:{phone:true}}
 ]){
  const mock=fn(cfg);
  const r=await comprobarAuthPublicaPilotoV2(URL,KEY,mock.fetchImpl);
  assert.equal(r.state,'BLOCKED',JSON.stringify(cfg));
  assert.equal(r.code,'sms_o_registro_go_true_no_seguros');
  assert.equal(r.smsConfirmedByUser,false);
  assert.equal(r.writesPerformed,false);
 }
});

test('V2-18: red, HTTP, JSON, truncamiento o respuesta malformada fallan cerrado',async()=>{
 for(const mock of [
  fn({error:'forbidden'},401),
  fn('html',200,'text/html'),
  fn('not-json'),
  fn('a'.repeat(8193)),
  fn(null),
  fn([]),
  fn({})
 ]){
  const r=await comprobarAuthPublicaPilotoV2(URL,KEY,mock.fetchImpl);
  assert.equal(r.state,'BLOCKED');
  assert.equal(r.writesPerformed,false);
 }
 const r=await comprobarAuthPublicaPilotoV2(URL,KEY,async()=>{throw Error('red unreachable')});
 assert.equal(r.state,'BLOCKED');
 assert.equal(r.code,'auth_settings_no_disponible');
});
test('V2-18: comando de operador no registra claves ni consulta secretos',()=>{
 const src=readFileSync(new URL(
  '../../apps/portal/scripts/v2-auth-pilot-preflight.mjs',import.meta.url
 ),'utf8');
 assert.ok(src.includes('comprobarAuthPublicaPilotoV2'));
 assert.ok(!src.includes('COTIRONDA_PILOT_SUPABASE_SECRET_KEY'));
 assert.ok(!src.includes('createUser('));
 assert.ok(!src.includes('signInWithOtp('));
 assert.ok(!src.includes('resend('));
 assert.ok(!src.includes('service_role'));
 assert.ok(!src.includes('JSON.stringify(process.env)'));
});
test('V2-18: CLI falla sin variables y nunca imprime valores confidenciales',()=>{
 const file=new URL(
  '../../apps/portal/scripts/v2-auth-pilot-preflight.mjs',
  import.meta.url);
 const run=spawnSync(process.execPath,['--experimental-strip-types',file.pathname],{
  encoding:'utf8',timeout:10000,
  env:{PATH:process.env.PATH??'',NODE_NO_WARNINGS:'1'}
 });
 assert.equal(run.status,2);
 const out=JSON.parse(run.stdout);
 assert.equal(out.state,'BLOCKED');
 assert.equal(out.smsConfirmedByUser,false);
 assert.equal(out.writesPerformed,false);
 assert.ok(!run.stdout.includes('sb_publishable_'));
 assert.ok(!run.stdout.includes('sb_secret_'));
});
