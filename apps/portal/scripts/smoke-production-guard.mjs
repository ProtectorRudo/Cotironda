// Smoke HTTP REAL sobre Next compilado con un entorno tipo Vercel Production.
// NO usa credenciales reales, NO conecta a Auth ni a base, NO despliega.
// El workflow debe COMPILAR con las mismas variables, no solo pasar el runtime.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import {portalHabilitado} from '../../../src/server/portal-entorno.ts';

const port='4174';
const base='http://127.0.0.1:'+port;
const expectedRef='qkercsoqhehbenbbncwk';

assert.equal(process.env.VERCEL_ENV,'production','Esta prueba debe ejecutar modo production');
assert.equal(process.env.COTIRONDA_REGISTRATION_ENABLED,'true','Simular flag solicitado: true');
assert.equal(process.env.COTIRONDA_SUPABASE_PROJECT_REF,expectedRef);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://'+expectedRef+'.supabase.co');
assert.equal(process.env.COTIRONDA_SITE_ORIGIN,'https://cotironda-ci.example');
assert.equal(portalHabilitado({...process.env,VERCEL_ENV:'preview'}),true,
 'Control positivo: con los mismos datos, en preview la configuración debería pasar');
assert.equal(portalHabilitado(process.env),false,
 'Control negativo: Production debe fallar sólo por el guard del entorno');
assert.match(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'',/^sb_publishable_ci_dummy_/);

const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',port],{
 cwd:process.cwd(),
 env:{...process.env},
 stdio:['ignore','pipe','pipe']
});
let output='';
child.stderr.on('data',data=>{output=(output+data.toString()).slice(-3000)});
child.stdout.on('data',data=>{output=(output+data.toString()).slice(-3000)});

async function request(path,options={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),4000);
 try{return await fetch(base+path,{...options,signal:controller.signal,redirect:'manual'});}
 finally{clearTimeout(timer)}
}

try{
 let started=false;
 for(let i=0;i<50;i++){
  try {
   const response=await request('/');
   if(response.ok){started=true;break}
  } catch{}
  if(child.exitCode!==null)throw Error('Next terminó inesperadamente: '+output);
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 assert.ok(started,'Next no respondió: '+output);

 const login=await request('/ingresar');
 assert.equal(login.status,200);
 const html=await login.text();
 assert.match(html,/Acceso y registro cerrados temporalmente/);
 assert.doesNotMatch(html,/<form\b/i,'Production no debe presentar formulario de autenticación');

 const alta=await request('/alta');
 assert.equal(alta.status,200);
 const altaHtml=await alta.text();
 assert.match(altaHtml,/Registro todavía deshabilitado/);
 assert.doesNotMatch(altaHtml,/<form\b/i,'Production no debe permitir formulario de empresa');

 const post=await request('/api/organizaciones',{
  method:'POST',
  headers:{origin:process.env.COTIRONDA_SITE_ORIGIN,'content-type':'application/json'},
  body:JSON.stringify({
   requestId:'123e4567-e89b-42d3-a456-426614170001',
   nombre:'Empresa prueba CI sin datos',
   tipo:'buyer'
  })
 });
 assert.equal(post.status,503,'El corte de producción debe detener la API antes de tocar Auth/DB');
 assert.equal(post.headers.get('cache-control'),'no-store');
 const payload=await post.json();
 assert.deepEqual(payload,{error:'registro_no_disponible'});
 assert.equal((await request('/api/organizaciones',{method:'GET'})).status,405);
 console.log('PASS: HTTP REAL Next production-like + flag true => formularios cerrados y POST 503.');
} finally {
 child.kill('SIGTERM');
}
