// MVP-026: actual Next SSR HTTP + fake Supabase Auth/REST, NO live network.
// All account/organization/token values are fictitious; registration stays OFF.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createServerClient} from '@supabase/ssr';

const require=createRequire(import.meta.url);
const {projectRef,token,session,user}=require('./ci-auth-fixture.cjs');
const origin='https://cotironda-ci.example';
const base='http://127.0.0.1:4178';
const supplier='bbbbbbbb-0024-4024-8024-000000000661';
const fakeUrl='https://'+projectRef+'.supabase.co';
assert.equal(process.env.VERCEL_ENV,'preview');
assert.equal(process.env.VERCEL_GIT_COMMIT_REF,'integration/mvp-piloto-20261031');
assert.equal(process.env.COTIRONDA_REGISTRATION_ENABLED,'false');
assert.equal(process.env.COTIRONDA_AUTH_PREVIEW_ENABLED,'true');
assert.equal(process.env.COTIRONDA_SUPPLIER_WA_UI_ENABLED,'true');
assert.equal(process.env.COTIRONDA_SITE_ORIGIN,origin);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,fakeUrl);
const cookieJar=new Map();
const client=createServerClient(fakeUrl,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{
 global:{fetch:async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url);
  assert.equal(url.origin,fakeUrl);
  assert.equal(url.pathname,'/auth/v1/token');
  assert.equal(url.searchParams.get('grant_type'),'password');
  const v=JSON.parse(init.body);
  assert.equal(v.email,user.email);
  assert.equal(v.password,'ci-only-never-a-real-password');
  return new Response(JSON.stringify(session),{
   status:200,headers:{'content-type':'application/json'}});
 }},
 cookies:{
  getAll(){return [...cookieJar].map(([name,value])=>({name,value}));},
  setAll(values){for(const {name,value} of values){
   if(value)cookieJar.set(name,value);else cookieJar.delete(name);
  }}
 }
});
const signed=await client.auth.signInWithPassword({
 email:user.email,password:'ci-only-never-a-real-password'});
assert.ifError(signed.error);
assert.equal(signed.data.session.access_token,token);
assert.ok(cookieJar.size>0,'SSR SDK failed to write cookies');
const cookie=[...cookieJar].map(([k,v])=>
 encodeURIComponent(k)+'='+encodeURIComponent(v)).join('; ');
const child=spawn(process.execPath,[
 'node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','4178'
],{
 cwd:process.cwd(),env:{
  ...process.env,
  COTIRONDA_CI_AUTH_SANDBOX:'enabled_for_tests_only',
  COTIRONDA_CI_WA_PREVIEW_SANDBOX:'enabled_for_tests_only',
  NODE_OPTIONS:((process.env.NODE_OPTIONS||'')+
    ' --require='+resolve('scripts/ci-auth-fetch-preload.cjs')).trim(),
  NEXT_TELEMETRY_DISABLED:'1'
 },stdio:['ignore','pipe','pipe']
});
let output='';
for(const stream of [child.stdout,child.stderr])
 stream.on('data',data=>{output=(output+data.toString()).slice(-5000);});
async function hit(path,options={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),6000);
 try{return await fetch(base+path,{redirect:'manual',signal:controller.signal,...options});}
 finally{clearTimeout(timer);}
}
function noStore(response){
 assert.match(response.headers.get('cache-control')??'',/no-store/,
  'Missing no-store at '+response.url);
}
async function post(path,payload,cookieValue='',requestOrigin=origin){
 return hit(path,{method:'POST',
  headers:{origin:requestOrigin,'content-type':'application/json',
   ...(cookieValue?{cookie:cookieValue}:{})},
  body:JSON.stringify(payload)});
}
try{
 let started=false;
 for(let i=0;i<60;i++){
  try{if((await hit('/')).ok){started=true;break;}}catch{}
  if(child.exitCode!==null)throw Error('Next failed '+output);
  await new Promise(r=>setTimeout(r,250));
 }
 assert.ok(started,'Next never started '+output);
 const login=await hit('/ingresar');
 assert.equal(login.status,200);
 const loginBody=await login.text();
 assert.match(loginBody,/No se habilitarán nuevas altas/);
 assert.doesNotMatch(loginBody,/<button[^>]*>Crear cuenta/);
 noStore(login);
 const notSigned=await hit('/proveedores/whatsapp');
 assert.ok([303,307,308].includes(notSigned.status));
 assert.match(notSigned.headers.get('location')??'',/\/ingresar/);
 noStore(notSigned);
 const notSignedAlta=await hit('/alta');
 assert.ok([303,307,308].includes(notSignedAlta.status));
 const signedAlta=await hit('/alta',{headers:{cookie}});
 assert.equal(signedAlta.status,200);
 const altaBody=await signedAlta.text();
 assert.match(altaBody,/Activar WhatsApp de mi negocio/);
 assert.doesNotMatch(altaBody,/Registrar empresa/);
 assert.doesNotMatch(altaBody,/Nombre de empresa/);
 noStore(signedAlta);
 const signedPage=await hit('/proveedores/whatsapp',{headers:{cookie}});
 assert.equal(signedPage.status,200,'RLS fake supplier read '+output);
 const html=await signedPage.text();
 assert.match(html,/Activar mi WhatsApp/);
 assert.match(html,/Corralón de prueba CI/);
 assert.doesNotMatch(html,/Activación no habilitada/);
 assert.doesNotMatch(html,/COTI ALTA a{32}/);
 noStore(signedPage);
 const noCookie=await post('/api/proveedores/whatsapp/enlace',{supplierOrgId:supplier});
 assert.equal(noCookie.status,401);
 assert.deepEqual(await noCookie.json(),{error:'sesion_no_valida'});
 noStore(noCookie);
 const cross=await post('/api/proveedores/whatsapp/enlace',
  {supplierOrgId:supplier},cookie,'https://attacker.example');
 assert.equal(cross.status,403);
 noStore(cross);
 const forgedOrg=await post('/api/proveedores/whatsapp/enlace',
  {supplierOrgId:'bbbbbbbb-0016-4016-8016-000000000662'},cookie);
 assert.equal(forgedOrg.status,503,'SQL fake must reject unauthorized org');
 noStore(forgedOrg);
 const issued=await post('/api/proveedores/whatsapp/enlace',
  {supplierOrgId:supplier},cookie);
 assert.equal(issued.status,200,'Authenticated SSR D072 fake '+output);
 const data=await issued.json();
 assert.deepEqual(data,{
  url:'https://wa.me/5492211234567?text=COTI%20ALTA%20'+'a'.repeat(32),
  venceEnSegundos:900
 });
 assert.equal(issued.headers.get('referrer-policy'),'no-referrer');
 noStore(issued);
 const reg=await post('/api/organizaciones',{
  requestId:'77777777-7777-4777-8777-777777777777',
  nombre:'Prueba',tipo:'supplier'},cookie);
 assert.equal(reg.status,503,'general signup must remain locked');
 assert.deepEqual(await reg.json(),{error:'registro_no_disponible'});
 noStore(reg);
 console.log('PASS D074: Next HTTP real, buyer/company signup closed, supplier owns org, Auth SSR, RLS synthetic, CSRF and wa.me, zero outbound network');
}finally{
 child.kill('SIGTERM');
}
