// E2E HTTP del Next compilado: preview autorizado solo en runner CI.
// Las credenciales y JWT son falsos; Auth remoto está interceptado y la base nunca se toca.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createServerClient} from '@supabase/ssr';

const require=createRequire(import.meta.url);
const {projectRef,token,session,user}=require('./ci-auth-fixture.cjs');
const base='http://127.0.0.1:4175';
const allowedOrigin='https://cotironda-ci.example';
const fakeUrl='https://'+projectRef+'.supabase.co';
assert.equal(process.env.VERCEL_ENV,'preview');
assert.equal(process.env.COTIRONDA_REGISTRATION_ENABLED,'true');
assert.equal(process.env.COTIRONDA_SITE_ORIGIN,allowedOrigin);
assert.equal(process.env.COTIRONDA_SUPABASE_PROJECT_REF,projectRef);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,fakeUrl);
assert.match(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'',/^sb_publishable_ci_dummy_/);

// Generar cookie SSR de la librería auténtica, no inventar el formato.
const jar=new Map();
const auth=createServerClient(fakeUrl,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{
 global:{fetch:async(input,init)=>{
  const u=new URL(typeof input==='string'?input:input.url);
  assert.equal(u.origin,fakeUrl);
  assert.equal(u.pathname,'/auth/v1/token');
  assert.equal(u.searchParams.get('grant_type'),'password');
  const data=JSON.parse(init.body);
  assert.equal(data.email,user.email);
  assert.equal(data.password,'ci-only-never-a-real-password');
  return new Response(JSON.stringify(session),{status:200,headers:{'content-type':'application/json'}});
 }},
 cookies:{
  getAll(){return [...jar].map(([name,value])=>({name,value}));},
  setAll(values){for(const {name,value} of values){if(value)jar.set(name,value);else jar.delete(name)}}
 }
});
const signedIn=await auth.auth.signInWithPassword({
 email:user.email,password:'ci-only-never-a-real-password'
});
assert.ifError(signedIn.error);
assert.equal(signedIn.data.session?.access_token,token);
assert.ok(jar.size>0,'Supabase SSR no generó cookies');
const cookie=[...jar].map(([name,value])=>encodeURIComponent(name)+'='+encodeURIComponent(value)).join('; ');
// Adulterar la firma DENTRO del contenido base64 de cookie generado por SDK.
const forgedJar=new Map(jar);
const entry=[...forgedJar].find(([,value])=>value.startsWith('base64-'));
assert.ok(entry,'SSR debe serializar cookies con base64');
const decoded=JSON.parse(Buffer.from(entry[1].slice(7),'base64url').toString('utf8'));
decoded.access_token=decoded.access_token.split('.').slice(0,2).join('.')+'.tampered_signature';
assert.notEqual(decoded.access_token,token);
forgedJar.set(entry[0],'base64-'+Buffer.from(JSON.stringify(decoded)).toString('base64url'));
const fakeCookie=[...forgedJar].map(([name,value])=>
 encodeURIComponent(name)+'='+encodeURIComponent(value)).join('; ');
assert.notEqual(cookie,fakeCookie);

const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','4175'],{
 cwd:process.cwd(),
 env:{
  ...process.env,
  COTIRONDA_CI_AUTH_SANDBOX:'enabled_for_tests_only',
  NODE_OPTIONS:((process.env.NODE_OPTIONS||'')+' --require='+resolve('scripts/ci-auth-fetch-preload.cjs')).trim(),
  NEXT_TELEMETRY_DISABLED:'1'
 },
 stdio:['ignore','pipe','pipe']
});
let output='';
for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{
 output=(output+data.toString()).slice(-2800)
});

async function hit(path,{headers={},...opts}={}){
 const ctl=new AbortController();
 const tm=setTimeout(()=>ctl.abort(),5000);
 try{return await fetch(base+path,{redirect:'manual',...opts,headers,signal:ctl.signal})}
 finally{clearTimeout(tm)}
}
const checkNoStore=response=>{
 const directives=(response.headers.get('cache-control')||'').toLowerCase().split(',').map(x=>x.trim());
 assert.ok(directives.includes('no-store'),'Next respondió sin no-store: '+directives);
};
const post=(cookies,origin=allowedOrigin)=>hit('/api/organizaciones',{
 method:'POST',
 headers:{'content-type':'application/json',origin,...(cookies?{cookie:cookies}:{})},
 body:JSON.stringify({requestId:'77777777-7777-4777-8777-777777777777',nombre:'Empresa CI',tipo:'buyer'})
});
try{
 let ready=false;
 for(let attempt=0;attempt<50;attempt++){
  try{if((await hit('/')).ok){ready=true;break}}catch{}
  if(child.exitCode!==null)throw Error('Next se detuvo: '+output);
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 assert.ok(ready,'Next no arrancó: '+output);

 const login=await hit('/ingresar');assert.equal(login.status,200);
 assert.match(await login.text(),/Correo electrónico/);
 checkNoStore(login);

 const anonymous=await hit('/alta');
 assert.ok([303,307,308].includes(anonymous.status),'Anon debe redirigir a login: '+anonymous.status);
 assert.match(anonymous.headers.get('location')||'',/\/ingresar/);
 checkNoStore(anonymous);

 const authenticated=await hit('/alta',{headers:{cookie}});
 assert.equal(authenticated.status,200,'Cuenta ficticia validada por Auth simulado debe ver formulario de empresa');
 const page=await authenticated.text();
 assert.match(page,/Nombre de empresa/);
 assert.match(page,/Registrar empresa/);
 checkNoStore(authenticated);

 const unauthPost=await post('');
 assert.equal(unauthPost.status,401,'POST anónimo debe ser rechazado');
 assert.deepEqual(await unauthPost.json(),{error:'sesion_no_valida'});
 checkNoStore(unauthPost);

 const tamperedPost=await post(fakeCookie);
 assert.equal(tamperedPost.status,401,'Cookie/token adulterado debe ser rechazado por Auth simulado');
 assert.deepEqual(await tamperedPost.json(),{error:'sesion_no_valida'});
 checkNoStore(tamperedPost);

 const wrongOrigin=await post(cookie,'https://incorrecto.example');
 assert.equal(wrongOrigin.status,403);
 assert.deepEqual(await wrongOrigin.json(),{error:'origen_no_permitido'});
 checkNoStore(wrongOrigin);

 const validPost=await post(cookie);
 assert.equal(validPost.status,503,'El guard de registro debe seguir cerrado aun con sesión simulada');
 assert.deepEqual(await validPost.json(),{error:'limite_no_disponible'});
 checkNoStore(validPost);
 assert.equal((await hit('/api/organizaciones',{method:'GET'})).status,405);

 console.log('PASS: HTTP Next Preview real: cookies SSR, usuario ficticio, anonimato/rechazo, origen y alta 503 sin SQL/red.');
} finally {child.kill('SIGTERM')}
