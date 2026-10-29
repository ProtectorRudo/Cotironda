// Prueba desde HTTP REAL contra Next arrancado, con registro deliberadamente apagado.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port='4173';
const base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',port],{
 cwd:process.cwd(),
 env:{...process.env,COTIRONDA_REGISTRATION_ENABLED:'false'},
 stdio:['ignore','pipe','pipe']
});
let output='';
child.stderr.on('data',x=>{output+=x.toString().slice(0,2000);});
child.stdout.on('data',x=>{output+=x.toString().slice(0,2000);});
async function get(url,opts={}){
 const ctl=new AbortController();
 const timer=setTimeout(()=>ctl.abort(),4000);
 try{return await fetch(base+url,{...opts,signal:ctl.signal,redirect:'manual'});}
 finally{clearTimeout(timer);}
}
try{
 let ready=false;
 for(let i=0;i<50;i++){
   try{const response=await get('/');if(response.ok){ready=true;break;}}catch{}
   if(child.exitCode!==null)throw Error('Next finalizó: '+output);
   await new Promise(resolve=>setTimeout(resolve,300));
 }
 assert.ok(ready,'Next no inició '+output);
 const login=await get('/ingresar');
 assert.equal(login.status,200);
 const loginHtml=await login.text();
 assert.match(loginHtml,/Acceso y registro cerrados temporalmente/);
 assert.doesNotMatch(loginHtml,/<form\b/,'No debe aparecer un formulario sin entorno habilitado');
 const alta=await get('/alta');
 assert.equal(alta.status,200);
 assert.match(await alta.text(),/Registro todavía deshabilitado/);
 assert.equal((await get('/api/organizaciones',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'})).status,503);
 assert.equal((await get('/api/organizaciones',{method:'GET'})).status,405);
 const home=await get('/');
 assert.equal(home.status,200);
 console.log('OK: HTTP real /, /ingresar, /alta y /api/organizaciones; registro cerrado');
}finally{child.kill('SIGTERM');}
