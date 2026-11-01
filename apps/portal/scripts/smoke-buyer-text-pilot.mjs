// MVP-028. Real Next HTTP with synthetic SDK cookies and fake PostgREST.
// No Supabase DEV, no Whapi network, no real suppliers, no persistent data.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createServerClient} from '@supabase/ssr';

const require=createRequire(import.meta.url);
const {projectRef,token,session,user}=require('./ci-auth-fixture.cjs');
const origin='https://cotironda-ci.example';
const app='http://127.0.0.1:4181';
const sb='https://'+projectRef+'.supabase.co';
assert.equal(process.env.COTIRONDA_REGISTRATION_ENABLED,'false');
assert.equal(process.env.COTIRONDA_AUTH_PREVIEW_ENABLED,'true');
assert.equal(process.env.COTIRONDA_ROUNDS_READ_ENABLED,'true');
assert.equal(process.env.COTIRONDA_ROUNDS_CREATE_ENABLED,'true');
assert.equal(process.env.COTIRONDA_SUPPLIER_WA_UI_ENABLED,'false');
assert.equal(process.env.VERCEL_GIT_COMMIT_REF,'integration/mvp-piloto-20261031');
assert.equal(process.env.VERCEL_ENV,'preview');
assert.equal(process.env.COTIRONDA_SITE_ORIGIN,origin);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,sb);
const jar=new Map();
const auth=createServerClient(sb,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{
 global:{fetch:async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input.url);
  assert.equal(url.origin,sb);
  assert.equal(url.pathname,'/auth/v1/token');
  assert.equal(url.searchParams.get('grant_type'),'password');
  const inputBody=JSON.parse(init.body);
  assert.equal(inputBody.email,user.email);
  assert.equal(inputBody.password,'ci-only-never-a-real-password');
  return new Response(JSON.stringify(session),{
   status:200,headers:{'content-type':'application/json'}});
 }},
 cookies:{
  getAll(){return [...jar].map(([name,value])=>({name,value}));},
  setAll(values){for(const {name,value} of values){
   if(value)jar.set(name,value);else jar.delete(name);
  }}
 }
});
const login=await auth.auth.signInWithPassword({
 email:user.email,password:'ci-only-never-a-real-password'});
assert.ifError(login.error);
assert.equal(login.data.session?.access_token,token);
const cookie=[...jar].map(([k,v])=>
 encodeURIComponent(k)+'='+encodeURIComponent(v)).join('; ');
assert.ok(cookie.length>25);
const child=spawn(process.execPath,[
 'node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','4181'
],{
 cwd:process.cwd(),env:{
  ...process.env,
  COTIRONDA_CI_AUTH_SANDBOX:'enabled_for_tests_only',
  COTIRONDA_CI_BUYER_PREVIEW_SANDBOX:'enabled_for_tests_only',
  NODE_OPTIONS:((process.env.NODE_OPTIONS||'')+
   ' --require='+resolve('scripts/ci-auth-fetch-preload.cjs')).trim(),
  NEXT_TELEMETRY_DISABLED:'1'
 },stdio:['ignore','pipe','pipe']
});
let output='';
for(const stream of [child.stdout,child.stderr]){
 stream.on('data',data=>{output=(output+data.toString()).slice(-4200);});
}
async function hit(path,opt={}){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6000);
 try{return await fetch(app+path,{redirect:'manual',signal:ctrl.signal,...opt});}
 finally{clearTimeout(timer);}
}
function noStore(r){
 assert.match(r.headers.get('cache-control')||'',/no-store/,
  'Cache-Control missing at '+r.url);
}
function post(body,credentials='',reqOrigin=origin){
 return hit('/api/rondas',{
  method:'POST',headers:{
   'content-type':'application/json',
   origin:reqOrigin,...(credentials?{cookie:credentials}:{})
  },body:JSON.stringify(body)});
}
const body={
 requestId:'cccccccc-0028-4028-8028-000000000686',
 deliveryZone:'La Plata',vatRequest:'no_especificado',
 items:[{line_no:1,product_code:'cemento_gris_obra',
  quantity:'20',unit:'bag',source_description:'Cemento CPC Loma Negra 50 kg'}]
};
try{
 let started=false;
 for(let i=0;i<60;i++){
  try{if((await hit('/')).ok){started=true;break;}}catch{}
  if(child.exitCode!==null)throw Error('Next stopped '+output);
  await new Promise(r=>setTimeout(r,250));
 }
 assert.ok(started,'Next start failed '+output);
 const entering=await hit('/ingresar');
 assert.equal(entering.status,200);
 assert.match(await entering.text(),/No se habilitarán nuevas altas/);
 noStore(entering);
 const anonymous=await hit('/mis-rondas',{headers:{}});
 // The server renders a client-only dashboard; its API always checks Auth.
 assert.equal(anonymous.status,200);
 const ownPage=await hit('/mis-rondas',{headers:{cookie}});
 assert.equal(ownPage.status,200,output);
 const html=await ownPage.text();
 assert.match(html,/Pedir presupuestos/);
 assert.match(html,/Lista de materiales/);
 assert.doesNotMatch(html,/id="pedido-zona-028"/);
 assert.match(html,/pegá tres columnas de Excel/);
 assert.match(html,/No se sube el archivo/);
 // MVP-033: locality input is progressive, never required on first view.
 assert.doesNotMatch(html,/Activar mi WhatsApp/);
 noStore(ownPage);
 const alta=await hit('/alta',{headers:{cookie}});
 assert.equal(alta.status,200);
 assert.match(await alta.text(),/Pedir presupuestos/);
 noStore(alta);
 const anonPost=await post(body);
 assert.equal(anonPost.status,401);
 noStore(anonPost);
 const cross=await post(body,cookie,'https://bad.example');
 assert.equal(cross.status,403);
 noStore(cross);
 const wrongSource=await post({...body,items:[
  {...body.items[0],source_description:'Cemento 5492211234567'}]},cookie);
 assert.equal(wrongSource.status,400);
 noStore(wrongSource);
 const saved=await post(body,cookie);
 assert.equal(saved.status,201,'RPC fake with source preserved '+output);
 const result=await saved.json();
 assert.equal(result.status,'programada');
 assert.equal(result.invitationsSent,0);
 assert.equal(result.roundId,'cccccccc-0028-4028-8028-000000000688');
 noStore(saved);
 const list=await hit('/api/rondas',{headers:{cookie}});
 assert.equal(list.status,200);
 assert.deepEqual(await list.json(),{rondas:[]});
 noStore(list);
 const blockedSignup=await hit('/api/organizaciones',{
  method:'POST',headers:{cookie,origin,'content-type':'application/json'},
  body:JSON.stringify({nombre:'Trampa CI',tipo:'buyer'})});
 assert.equal(blockedSignup.status,503);
 noStore(blockedSignup);
 console.log('PASS MVP028: HTTP Next buyer text form, Auth SSR, source specs in D064 RPC, no invite, signup OFF, 401, 403, invalid source 400, private list.');
}finally{child.kill('SIGTERM');}
