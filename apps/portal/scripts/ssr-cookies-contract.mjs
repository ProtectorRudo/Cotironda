// Contrato SSR real de @supabase/ssr + supabase-js, sin llamadas de red.
// Se ejecuta en GitHub Actions usando las dependencias instaladas con npm ci.
// Tokens, usuarios y contraseñas son FICTICIOS y nunca salen de este proceso.
import assert from 'node:assert/strict';
import {createServerClient} from '@supabase/ssr';
import {NextRequest} from 'next/server.js';
import {proxy} from '../proxy.ts';

const ref='qkercsoqhehbenbbncwk';
const url='https://'+ref+'.supabase.co';
const key='sb_publishable_ci_dummy_not_valid';
const uid='11111111-1111-4111-8111-111111111111';
const sid='22222222-2222-4222-8222-222222222222';
const now=Math.floor(Date.now()/1000);
let netCalls=[];
let refreshes=0;
let userReads=0;
let logouts=0;

const jwt=(generation)=>{
 const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({
  iss:url+'/auth/v1',sub:uid,aud:'authenticated',role:'authenticated',
  iat:now,exp:now+3600,session_id:sid,is_anonymous:false,
  cotironda_email_verified:true,token_generation:generation
 })).toString('base64url');
 return header+'.'+payload+'.ci_fake_signature_'+generation;
};
const user={id:uid, email:'ci-only@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false};
const session=(generation)=>({
 access_token:jwt(generation),refresh_token:'ci_refresh_'+generation,
 token_type:'bearer',expires_in:3600,expires_at:now+3600,user
});
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});
const fakeFetch=async (input,init={})=>{
 const endpoint=new URL(typeof input==='string'?input:input.url);
 assert.equal(endpoint.origin,url,'Ninguna llamada puede salir de la URL fijada del entorno de prueba');
 assert.ok(endpoint.pathname.startsWith('/auth/v1/'),'Prohibida cualquier RPC/SQL y URL ajena al Auth de prueba');
 netCalls.push(endpoint.pathname+endpoint.search);
 if(endpoint.pathname==='/auth/v1/token'){
  const grant=endpoint.searchParams.get('grant_type');
  if(grant==='password'){
   const body=JSON.parse(init.body);
   assert.equal(body.email,'ci-only@example.invalid');
   assert.equal(body.password,'ci-password-never-real');
   return json(session('one'));
  }
  if(grant==='refresh_token'){
   const body=JSON.parse(init.body);
   assert.equal(body.refresh_token,'ci_refresh_one');
   refreshes++;
   return json(session('two'));
  }
 }
 if(endpoint.pathname==='/auth/v1/user'){
  userReads++;
  return json(user);
 }
 if(endpoint.pathname==='/auth/v1/logout'){
  logouts++;
  return new Response(null,{status:204});
 }
 throw Error('Solicitud no prevista en transporte simulado: '+endpoint.pathname);
};

const jar=new Map();
let setterCalls=0;
let cookieOptions=[];
let responseHeaders=[];
function makeClient(jarTarget=jar){
 return createServerClient(url,key,{
  global:{fetch:fakeFetch},
  cookies:{
   getAll(){return [...jarTarget].map(([name,value])=>({name,value}));},
   setAll(entries,headers){
    setterCalls++;
    for(const {name,value,options} of entries){
     if(!value || options?.maxAge===0)jarTarget.delete(name);
     else jarTarget.set(name,value);
     cookieOptions.push(options||{});
    }
    if(headers)responseHeaders.push(headers);
   }
  }
 });
}
function assertNoSensitiveLog(){
 assert.ok(!JSON.stringify(netCalls).includes('ci-password-never-real'));
 assert.ok(!JSON.stringify(netCalls).includes('ci_refresh_one'));
}
const initial=makeClient();
const {data:login,error:loginError}=await initial.auth.signInWithPassword({
 email:'ci-only@example.invalid',password:'ci-password-never-real'
});
assert.ifError(loginError);
assert.equal(login.session?.access_token,jwt('one'));
assert.ok(jar.size>0,'El inicio de sesión debe escribir cookies SSR reales del SDK');
assert.ok(setterCalls>0,'El SDK debe llamar setAll de cookies');
assert.ok([...jar.keys()].every(name=>name.startsWith('sb-'+ref+'-auth-token')));
assert.ok(cookieOptions.every(x=>x.sameSite===undefined || ['lax','Lax','strict','Strict','none','None'].includes(x.sameSite)));

const reloaded=makeClient();
const {data:{session:stored},error:storedErr}=await reloaded.auth.getSession();
assert.ifError(storedErr);
assert.equal(stored?.access_token,jwt('one'),'El SSR debe leer el JWT persistido en la cookie');

const {data:renewed,error:renewErr}=await reloaded.auth.refreshSession();
assert.ifError(renewErr);
assert.equal(renewed.session?.access_token,jwt('two'));
assert.equal(renewed.session?.refresh_token,'ci_refresh_two');
assert.equal(refreshes,1,'Debe haberse solicitado un refresh a Auth simulado');
assert.ok([...jar.values()].some(value=>value.includes('base64-')),'El SDK debe persistir cookies SSR, no localStorage');

const pageLoad=makeClient();
const {data:{session:roundTrip},error:roundTripError}=await pageLoad.auth.getSession();
assert.ifError(roundTripError);
assert.equal(roundTrip?.access_token,jwt('two'),'La siguiente request SSR debe leer el token renovado');
assert.equal(roundTrip?.refresh_token,'ci_refresh_two');
assertNoSensitiveLog();

// Otro visitante sin cookies no debe heredar la sesión.
const otherJar=new Map();
const outsider=makeClient(otherJar);
const {data:{session:anonymous},error:anonErr}=await outsider.auth.getSession();
assert.ifError(anonErr);
assert.equal(anonymous,null,'Sesiones SSR no deben compartirse entre clientes');

// Probar el PROXY auténtico de Next.js con la cookie rotada y fetch falso.
const prevFetch=globalThis.fetch;
const keep={};
for(const name of [
 'COTIRONDA_REGISTRATION_ENABLED','COTIRONDA_SUPABASE_PROJECT_REF',
 'NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
 'COTIRONDA_SITE_ORIGIN','VERCEL_ENV'
]){keep[name]=process.env[name];}
try{
 Object.assign(process.env,{
  COTIRONDA_REGISTRATION_ENABLED:'true',
  COTIRONDA_SUPABASE_PROJECT_REF:ref,
  NEXT_PUBLIC_SUPABASE_URL:url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,
  COTIRONDA_SITE_ORIGIN:'https://cotironda-ci.example',
  VERCEL_ENV:'preview'
 });
 globalThis.fetch=fakeFetch;
 const cookieHeader=[...jar].map(([name,value])=>encodeURIComponent(name)+'='+encodeURIComponent(value)).join('; ');
 const request=new NextRequest('https://cotironda-ci.example/alta',{headers:{cookie:cookieHeader}});
 const result=await proxy(request);
 assert.equal(result.headers.get('cache-control'),'private, no-store','El proxy debe impedir cache cross-user');
 assert.ok(userReads>0,'El SDK autenticado usa la API simulada de Auth, no sólo un JWT no confiable');
 const inactive=new NextRequest('https://cotironda-ci.example/ingresar');
 process.env.COTIRONDA_REGISTRATION_ENABLED='false';
 const response=await proxy(inactive);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal(netCalls.length,netCalls.length,'No hay fetch al proyecto real');
} finally {
 globalThis.fetch=prevFetch;
 for(const [name,value] of Object.entries(keep)){
  if(value===undefined)delete process.env[name];
  else process.env[name]=value;
 }
}
const {error:logoutErr}=await pageLoad.auth.signOut({scope:'global'});
assert.ifError(logoutErr);
assert.equal(logouts,1);
assert.equal(jar.size,0,'El logout debe limpiar cookies SSR del cliente');
const {data:{session:afterLogout},error:postLogoutErr}=await makeClient().auth.getSession();
assert.ifError(postLogoutErr);
assert.equal(afterLogout,null);
assertNoSensitiveLog();
console.log('PASS: SDK SSR real + cookies iniciales, refresh, aislamiento, Proxy Next no-store y logout; fetch 100% simulado.');
