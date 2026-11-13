import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnosticoSmsV2Permitido,responderDiagnosticoSmsV2}
 from '../../src/server/v2-20-diagnostico-sms-http.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const PUB='sb_publishable_'+'Q'.repeat(42);
const RELEASE='a'.repeat(40);
const path='https://portal.preview.example/api/piloto/v2/diagnostico-sms';
const env=()=>({
 VERCEL_ENV:'preview',COTIRONDA_AUTH_PREVIEW_ENABLED:'true',
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_PILOT_SUPABASE_URL:PILOT,
 NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_URL:PILOT,
 NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:PUB,
 COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA:RELEASE,
 VERCEL_GIT_COMMIT_SHA:RELEASE,
 COTIRONDA_PILOT_V2_AUTH_PAGE_ENABLED:'false',
 COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'false',
 COTIRONDA_PILOT_V2_ANALYSIS_ENABLED:'false',
 COTIRONDA_PILOT_V2_TEXT_ENABLED:'false',
 COTIRONDA_PILOT_V2_PDF_ENABLED:'false'
});
const settings={
 external:{phone:true},disable_signup:true,
 phone_autoconfirm:false,sms_provider:'twilio'
};
const adapter=(config=settings,code=200)=>{
 let requests=0;
 const fetcher=async(url,options)=>{
  requests++;
  assert.equal(url,PILOT+'/auth/v1/settings');
  assert.equal(options.method,'GET');
  assert.equal(options.headers.apikey,PUB);
  assert.equal(options.cache,'no-store');
  assert.equal(options.redirect,'error');
  assert.equal(options.credentials,'omit');
  assert.ok(!options.headers.Authorization);
  return new Response(JSON.stringify(config),{status:code,
   headers:{'content-type':'application/json'}});
 };
 return {fetcher,calls:()=>requests};
};
test('V2-20: diagnóstico permite comprobar SMS ANTES de habilitar login u ofertas',async()=>{
 const e=env();
 assert.equal(diagnosticoSmsV2Permitido(e),true);
 const net=adapter();
 const response=await responderDiagnosticoSmsV2(new Request(path),e,net.fetcher);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control')?.includes('no-store'),true);
 assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
 assert.equal(net.calls(),1);
 assert.deepEqual(await response.json(),{
  state:'SETTINGS_READY_REQUIRES_REAL_SMS',
  code:'configuracion_auth_publica_compatible',
  serviceAccessible:true,signupClosed:true,phoneConfigured:true,
  phoneEnabled:true,autoConfirmDisabled:true,smsProviderReady:true,
  smsConfirmedByUser:false,writesPerformed:false
 });
});

test('V2-20: falta de configuración, prod o SHA inválida NO consulta Supabase',async()=>{
 const patches=[
  {VERCEL_ENV:'production'},{VERCEL_ENV:'development'},
  {COTIRONDA_AUTH_PREVIEW_ENABLED:'false'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_PILOT_SUPABASE_URL:'https://otra.supabase.co'},
  {NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_URL:'https://otra.supabase.co'},
  {NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:''},
  {NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'sb_secret_exposed'},
  {COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA:'b'.repeat(40)},
  {VERCEL_GIT_COMMIT_SHA:'z'.repeat(40)},
  {VERCEL_GIT_COMMIT_SHA:undefined},
  {COTIRONDA_REGISTRATION_ENABLED:undefined}
 ];
 for(const patch of patches){
  const e={...env(),...patch};
  const net=adapter();
  assert.equal(diagnosticoSmsV2Permitido(e),false,JSON.stringify(patch));
  const res=await responderDiagnosticoSmsV2(new Request(path),e,net.fetcher);
  assert.equal(res.status,503);
  assert.equal(net.calls(),0);
  assert.equal((await res.json()).code,'diagnostico_preview_no_configurado');
 }
 assert.equal(diagnosticoSmsV2Permitido({}),false);
});

test('V2-20: sin POST, querystrings ni lecturas si ruta incompatible',async()=>{
 for(const request of [
  new Request(path,{method:'POST'}),
  new Request(path,{method:'PATCH'}),
  new Request(path+'?token=privado')
 ]){
  const net=adapter();
  const res=await responderDiagnosticoSmsV2(request,env(),net.fetcher);
  assert.ok([400,405].includes(res.status));
  assert.equal(net.calls(),0);
  const body=JSON.stringify(await res.json());
  assert.ok(!body.includes('privado'));
 }
});

test('V2-20: sin proveedor SMS o registro abierto, informa BLOQUEO SIN filtraciones',async()=>{
 for(const cfg of [
  {...settings,external:{phone:false}},
  {...settings,disable_signup:false},
  {...settings,phone_autoconfirm:true},
  {...settings,sms_provider:''}
 ]){
  const net=adapter(cfg);
  const res=await responderDiagnosticoSmsV2(new Request(path),env(),net.fetcher);
  assert.equal(res.status,200);
  const output=await res.json();
  assert.equal(output.state,'BLOCKED');
  assert.equal(output.smsConfirmedByUser,false);
  assert.equal(output.writesPerformed,false);
  assert.ok(!JSON.stringify(output).includes(PUB));
  assert.ok(!JSON.stringify(output).includes('twilio'));
  assert.equal(net.calls(),1);
 }
});

test('V2-20: errores de GoTrue no abren permisos ni imprimen la key',async()=>{
 const net=adapter({error:'Unauthorized'},401);
 const res=await responderDiagnosticoSmsV2(new Request(path),env(),net.fetcher);
 const raw=await res.text();
 assert.equal(res.status,200);
 assert.match(raw,/"state":"BLOCKED"/u);
 assert.ok(!raw.includes(PUB));
 assert.ok(!raw.includes('Unauthorized'));
 assert.ok(!raw.includes('phoneE164'));
});

test('V2-20: ruta Next exclusivamente GET, sin token, WhatsApp ni RPC',()=>{
 const route=readFileSync(new URL(
  '../../apps/portal/app/api/piloto/v2/diagnostico-sms/route.ts',import.meta.url
 ),'utf8');
 assert.match(route,/export const runtime='nodejs'/u);
 assert.match(route,/export const dynamic='force-dynamic'/u);
 assert.match(route,/export async function GET\(req:Request\)/u);
 assert.match(route,/responderDiagnosticoSmsV2\(req,process\.env\)/u);
 assert.doesNotMatch(route,/export (?:async )?function (?:POST|PUT|PATCH|DELETE)/u);
 assert.doesNotMatch(route,/service_role|admin\.createUser|signInWithOtp|whapi|createClient/u);
 const mod=readFileSync(new URL(
  '../../src/server/v2-20-diagnostico-sms-http.ts',import.meta.url
 ),'utf8');
 assert.doesNotMatch(mod,/COTIRONDA_PILOT_SUPABASE_SECRET_KEY|COTIRONDA_PILOT_AES_HEX/u);
 assert.match(mod,/VERCEL_ENV==='preview'/u);
 assert.match(mod,/VERCEL_GIT_COMMIT_SHA===release/u);
 assert.match(mod,/COTIRONDA_REGISTRATION_ENABLED==='false'/u);
});

test('V2-20: reporta bloqueo real de signup abierto sin atribuirlo falsamente al SMS',async()=>{
 const net=adapter({...settings,disable_signup:false});
 const response=await responderDiagnosticoSmsV2(new Request(path),env(),net.fetcher);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.state,'BLOCKED');
 assert.equal(data.signupClosed,false);
 assert.equal(data.phoneEnabled,true);
 assert.equal(data.autoConfirmDisabled,true);
 assert.equal(data.smsProviderReady,true);
 assert.equal(data.phoneConfigured,false);
 assert.equal(data.smsConfirmedByUser,false);
 assert.equal(data.writesPerformed,false);
 assert.equal(net.calls(),1);
 assert.ok(!JSON.stringify(data).includes('twilio'));
 assert.ok(!JSON.stringify(data).includes(PUB));
});
