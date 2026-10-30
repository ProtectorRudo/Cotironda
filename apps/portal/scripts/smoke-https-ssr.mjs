/**
 * E2E TLS real sobre 127.0.0.1: Next.js compilado + @supabase/ssr auténtico.
 * TODO EL AUTH ES FICTICIO mediante scripts/ci-auth-fetch-preload.cjs.
 * Cert/key son efímeros del runner; no se imprimen ni versionan.
 * Cero requests externos, cero proyectos Supabase remotos, cero despliegues.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createServerClient} from '@supabase/ssr';

const require=createRequire(import.meta.url);
const {projectRef,token,user,session}=require('./ci-auth-fixture.cjs');
const nextPort=4176, tlsPort=4177, host='127.0.0.1';
const fakeUrl='https://'+projectRef+'.supabase.co';
const expectedOrigin='https://cotironda-ci.example';
const authOnly=process.env.COTIRONDA_CI_AUTH_ONLY==='true';

if(process.env.GITHUB_ACTIONS!=='true'||
   process.env.COTIRONDA_CI_TLS_LOOPBACK!=='true'||
   process.env.VERCEL_ENV!=='preview'||
   process.env.COTIRONDA_REGISTRATION_ENABLED!==(authOnly?'false':'true')||
   (authOnly && process.env.COTIRONDA_AUTH_PREVIEW_ENABLED!=='true')||
   (authOnly && process.env.COTIRONDA_SITE_ORIGIN!==undefined)||
   process.env.COTIRONDA_SUPABASE_PROJECT_REF!==projectRef||
   process.env.NEXT_PUBLIC_SUPABASE_URL!==fakeUrl||
   !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_ci_dummy_')||
   (!authOnly && process.env.COTIRONDA_SITE_ORIGIN!==expectedOrigin)||
   !process.env.COTIRONDA_CI_TLS_CERT?.startsWith(process.env.RUNNER_TEMP+'/')||
   !process.env.COTIRONDA_CI_TLS_KEY?.startsWith(process.env.RUNNER_TEMP+'/')){
 throw new Error('https_ci_no_autorizado');
}
const cert=readFileSync(process.env.COTIRONDA_CI_TLS_CERT);
const key=readFileSync(process.env.COTIRONDA_CI_TLS_KEY);
const tlsUrl='https://'+host+':'+tlsPort;
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const noStore=r=>{
 const cc=(r.headers['cache-control']||'').toLowerCase();
 assert.ok(cc.split(',').map(s=>s.trim()).includes('no-store'),'Respuesta potencialmente cacheable');
 assert.ok(!/\bpublic\b|\bs-maxage\b/.test(cc),'No permitir cache pública');
};
const cookieValues=(r)=>r.headers['set-cookie']||[];
const cookieHeaderFromSetCookie=(cookies)=>cookies.map(line=>line.split(';')[0]).join('; ');

async function tlsHit(path,{headers={},body,method='GET'}={}){
 assert.ok(path.startsWith('/'),'El test solo navega rutas internas');
 return await new Promise((done,fail)=>{
  const request=https.request({
   hostname:host,port:tlsPort,path,method,
   ca:cert,rejectUnauthorized:true,
   headers:{...headers,...(body?{'content-type':'application/json'}:{})},
   timeout:7500
  },response=>{
   // Node puede liberar response.socket al terminar el stream: capturar
   // la autorización TLS durante el evento de respuesta, antes de 'end'.
   const tlsVerified=response.socket?.authorized===true;
   const chunks=[];
   response.on('data',c=>chunks.push(c));
   response.on('end',()=>done({
    status:response.statusCode,
    headers:response.headers,
    body:Buffer.concat(chunks).toString('utf8'),
    tlsVerified
   }));
  });
  request.on('timeout',()=>request.destroy(new Error('https_ci_timeout')));
  request.on('error',fail);
  if(body)request.write(JSON.stringify(body));
  request.end();
 });
}
function makeStaleCookieJar(){
 const cookies=new Map();
 const fakeAuth=createServerClient(fakeUrl,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{
  global:{fetch:async(input,options)=>{
   const endpoint=new URL(typeof input==='string'?input:input.url);
   assert.equal(endpoint.origin,fakeUrl);
   assert.equal(endpoint.pathname,'/auth/v1/token');
   assert.equal(endpoint.searchParams.get('grant_type'),'password');
   const credentials=JSON.parse(options.body);
   assert.equal(credentials.email,user.email);
   assert.equal(credentials.password,'ci-only-never-a-real-password');
   return new Response(JSON.stringify(session),{status:200,
    headers:{'content-type':'application/json'}});
  }},
  cookies:{
   getAll(){return [...cookies].map(([name,value])=>({name,value}));},
   setAll(values){for(const {name,value} of values){if(value)cookies.set(name,value);else cookies.delete(name)}}
  }
 });
 return {cookies,fakeAuth};
}

const child=spawn(process.execPath,['node_modules/next/dist/bin/next',
 'start','-H',host,'-p',String(nextPort)],{
 cwd:process.cwd(),
 env:{
  ...process.env,
  COTIRONDA_CI_AUTH_SANDBOX:'enabled_for_tests_only',
  NODE_OPTIONS:((process.env.NODE_OPTIONS||'')+' --require='+
   resolve('scripts/ci-auth-fetch-preload.cjs')).trim(),
  NEXT_TELEMETRY_DISABLED:'1'
 },
 stdio:['ignore','pipe','pipe']
});
let childOutput='';
for(const stream of [child.stdout,child.stderr]){
 stream.on('data',chunk=>{childOutput=(childOutput+chunk.toString()).slice(-1600)});
}

// Terminación TLS en el mismo runner, sin Node HTTPS desactivado ni reverse-proxy externo.
// No retransmitir el valor Host del cliente sin validar; todo está fijado a loopback.
const tlsServer=https.createServer({cert,key},(req,res)=>{
 const upstream=http.request({
  hostname:host,port:nextPort,method:req.method,path:req.url,
  headers:{
   ...req.headers,
   host:host+':'+nextPort,
   'x-forwarded-proto':'https',
   'x-forwarded-host':host+':'+tlsPort
  }
 },u=>{
  res.writeHead(u.statusCode||502,u.headers);
  u.pipe(res);
 });
 upstream.on('error',()=>{res.writeHead(502);res.end()});
 req.pipe(upstream);
});

try{
 let ready=false;
 for(let i=0;i<55;i++){
  try{
   const status=await new Promise((resolve,reject)=>{
    http.get('http://'+host+':'+nextPort+'/',r=>{r.resume();resolve(r.statusCode)})
      .on('error',reject);
   });
   if(status===200){ready=true;break}
  }catch{}
  if(child.exitCode!==null)throw new Error('Next no arrancó en loopback: '+childOutput);
  await sleep(300);
 }
 assert.ok(ready,'Next no arrancó en loopback: '+childOutput);
 await new Promise((ok,fail)=>{
  tlsServer.once('error',fail);
  tlsServer.listen(tlsPort,host,ok);
 });

 // CA desconocida -> handshake real falla. Jamás usar -k o deshabilitar TLS.
 await assert.rejects(new Promise((done,fail)=>{
  https.get({hostname:host,port:tlsPort,path:'/',rejectUnauthorized:true,
   timeout:4000},r=>{r.resume();done(r.statusCode)}).on('error',fail);
 }),/self.signed|certificate|unable.to.verify/i);
 console.log('PASS TLS: certificado aislado desconocido rechazado');

 const login=await tlsHit('/ingresar');
 assert.equal(login.status,200);
 assert.ok(login.tlsVerified);
 assert.match(login.body,/Correo electrónico/);
 if(authOnly){
  assert.match(login.body,/Ingresar a prueba/);
  assert.doesNotMatch(login.body,/>Crear cuenta</);
 } else assert.match(login.body,/>Crear cuenta</);
 noStore(login);
 const anon=await tlsHit('/alta');
 assert.ok([303,307,308].includes(anon.status),'No se rechazó visitante anónimo');
 assert.ok(anon.tlsVerified);
 assert.match(anon.headers.location||'',/\/ingresar/);
 noStore(anon);
 assert.equal(cookieValues(anon).length,0,'Anon no debe recibir cookie autenticada');
 console.log('PASS HTTPS: login SSR y visitante anónimo con CA verificada');

 const {cookies,fakeAuth}=makeStaleCookieJar();
 const signedIn=await fakeAuth.auth.signInWithPassword({
  email:user.email,password:'ci-only-never-a-real-password'
 });
 assert.ifError(signedIn.error);
 assert.equal(signedIn.data.session?.access_token,token);
 const entry=[...cookies].find(([,v])=>v.startsWith('base64-'));
 assert.ok(entry,'El SDK real no creó su cookie SSR');
 const stale=JSON.parse(Buffer.from(entry[1].slice(7),'base64url').toString('utf8'));
 const now=Math.floor(Date.now()/1000);
 stale.expires_at=now-600;
 stale.expires_in=-600;
 const [h,p,s]=stale.access_token.split('.');
 const claims=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));
 claims.iat=now-4000;claims.exp=now-600;
 stale.access_token=h+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.'+s;
 cookies.set(entry[0],'base64-'+Buffer.from(JSON.stringify(stale)).toString('base64url'));
 const cookieForOldSession=[...cookies]
  .map(([name,value])=>encodeURIComponent(name)+'='+encodeURIComponent(value)).join('; ');

 const refreshed=await tlsHit('/alta',{headers:{cookie:cookieForOldSession}});
 assert.equal(refreshed.status,200,'La página SSR debe renovar sesión sintética');
 assert.ok(refreshed.tlsVerified);
 if(authOnly){
  assert.match(refreshed.body,/Sesión de prueba activa/);
  assert.match(refreshed.body,/Comprobar cookies y caché/,
    'Diagnóstico seguro solo dentro de la vista Auth privada de Preview');
  assert.doesNotMatch(refreshed.body,/Nombre de empresa|Registrar empresa/);
 } else assert.match(refreshed.body,/Nombre de empresa/);
 noStore(refreshed);
 const newSetCookies=cookieValues(refreshed);
 assert.ok(newSetCookies.length>0,'Proxy debe transmitir Set-Cookie tras refresh');
 for(const value of newSetCookies){
  assert.match(value,/;\s*secure(?:;|$)/i,'El refresh HTTPS requiere cookie Secure');
  assert.match(value,/;\s*samesite=lax(?:;|$)/i,'El refresh HTTPS debe conservar SameSite=Lax');
  assert.match(value,/;\s*path=\/(?:;|$)/i,'Cookie con path mínimo adecuado');
  assert.ok(!value.includes('ci-only-never-a-real-password'),'No divulgar contraseña en cookie');
 }
 console.log('PASS HTTPS: refresh SSR devuelve Set-Cookie Secure/SameSite=Lax con no-store');

 // Otro usuario sin cookies nunca recibe la página ni la sesión de A.
 const anonymousAgain=await tlsHit('/alta');
 assert.ok([303,307,308].includes(anonymousAgain.status));
 assert.doesNotMatch(anonymousAgain.body,/Nombre de empresa/);
 assert.equal(cookieValues(anonymousAgain).length,0,'Sin cookies no puede recibir sesión ajena');
 noStore(anonymousAgain);

 const refreshedCookie=cookieHeaderFromSetCookie(newSetCookies);
 assert.ok(refreshedCookie.includes('sb-'+projectRef+'-auth-token'),
  'Cookie de refresh fuera del proyecto');
 const nextRequest=await tlsHit('/alta',{headers:{cookie:refreshedCookie}});
 assert.equal(nextRequest.status,200,'Cookie renovada no funcionó en request siguiente');
 if(authOnly){
  assert.match(nextRequest.body,/Sesión de prueba activa/);
  assert.doesNotMatch(nextRequest.body,/Nombre de empresa|Registrar empresa/);
 } else assert.match(nextRequest.body,/Nombre de empresa/);
 noStore(nextRequest);
 console.log('PASS HTTPS: roundtrip de cookie renovada, aislamiento del anónimo');

 const payload={requestId:'77777777-7777-4777-8777-777777777777',
  nombre:'Empresa CI',tipo:'buyer'};
 const wrongOrigin=await tlsHit('/api/organizaciones',{
  method:'POST',headers:{origin:'https://atacante-ci.example',cookie:refreshedCookie},body:payload});
 if(authOnly){
  assert.equal(wrongOrigin.status,503);
  assert.deepEqual(JSON.parse(wrongOrigin.body),{error:'registro_no_disponible'});
 }else{
  assert.equal(wrongOrigin.status,403);
  assert.deepEqual(JSON.parse(wrongOrigin.body),{error:'origen_no_permitido'});
 }
 noStore(wrongOrigin);
 const validOrigin=await tlsHit('/api/organizaciones',{
  method:'POST',headers:{origin:expectedOrigin,cookie:refreshedCookie},body:payload});
 assert.equal(validOrigin.status,503,'Ni con cookie renovada puede habilitar registro');
 assert.deepEqual(JSON.parse(validOrigin.body),
  authOnly?{error:'registro_no_disponible'}:{error:'limite_no_disponible'});
 noStore(validOrigin);
 console.log('PASS HTTPS: Origin adversarial bloqueado y alta 503 fail-closed');

 console.log('PASS CI: HTTPS/TLS de loopback + Next real + Supabase SSR real + Auth ficticio'+
  (authOnly?' (login-only, sin signup ni alta)':''));
}finally{
 await new Promise(ok=>tlsServer.close(()=>ok()));
 child.kill('SIGTERM');
}
