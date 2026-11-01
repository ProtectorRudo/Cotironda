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
 const supplierPage=await get('/proveedores/whatsapp');
 assert.equal(supplierPage.status,200);
 const supplierHtml=await supplierPage.text();
 assert.match(supplierHtml,/Activación no habilitada en este entorno/);
 assert.doesNotMatch(supplierHtml,/Activar mi WhatsApp<\/button>/);
 const linkApi=await get('/api/proveedores/whatsapp/enlace',{
  method:'POST',headers:{origin:base,'content-type':'application/json'},
  body:JSON.stringify({supplierOrgId:'bbbbbbbb-0024-4024-8024-000000000661'})});
 assert.equal(linkApi.status,503);
 assert.deepEqual(await linkApi.json(),{error:'alta_whatsapp_no_disponible'});
 assert.equal((await get('/api/proveedores/whatsapp/enlace')).status,405);
 const home=await get('/');
 assert.equal(home.status,200);
 const homeHtml=await home.text();
 assert.match(homeHtml,/Probar una ronda completa/);
 const recorrido=await get('/probar/piloto');
 assert.equal(recorrido.status,200,'MVP038 debe ser navegable desde el celular');
 const recorridoHtml=await recorrido.text();
 assert.match(recorridoHtml,/De tu lista a una decisión/);
 assert.match(recorridoHtml,/SIMULACIÓN/);
 assert.match(recorridoHtml,/Preparar pedido/);
 assert.match(recorridoHtml,/No se envía WhatsApp ni se registra una ronda real/);
 assert.equal(recorridoHtml.includes('action="/api/'),false,
  'La simulación integral nunca debe tener formulario comercial HTTP');
 assert.equal((await get('/probar/piloto',{method:'POST'})).status,405);
 const mvp=await get('/probar');
 assert.equal(mvp.status,200);
 const mvpHtml=await mvp.text();
 assert.match(mvpHtml,/Escribí o pegá tus materiales/);
 assert.match(mvpHtml,/Demostración con proveedores ficticios/);
 assert.match(mvpHtml,/No ingreses datos personales ni presupuestos comerciales/);
 assert.doesNotMatch(mvpHtml,/action="\/api\//,'La demo no debe tener formularios de envío');
 assert.equal((await get('/probar',{method:'POST'})).status,405,
   'No se habilita endpoint para recibir pedidos del público');
 const ofertas=await get('/probar/ofertas');
 assert.equal(ofertas.status,200,'MVP-004 comparador visible y navegable por HTTP');
 const ofertasHtml=await ofertas.text();
 assert.match(ofertasHtml,/Datos inventados para probar la interfaz/);
 assert.match(ofertasHtml,/Cotizaciones claras/);
 assert.match(ofertasHtml,/Sin compras|SIN COMPRAS|no realiza compras/i);
 assert.doesNotMatch(ofertasHtml,/IVA y flete incluidos|IVA incluido|flete incluido/i,
   'No atribuir IVA ni flete incluido por defecto');
 assert.match(ofertasHtml,/Ver aclaraciones de IVA y flete/,
   'IVA y transporte se muestran solo en detalles');
 assert.match(ofertasHtml,/IVA: sin aclarar/,
   'Si falta IVA debe avisar que no fue aclarado');
 assert.match(ofertasHtml,/Flete: sin aclarar/,
   'Si falta flete no debe anunciar transporte gratis');
 assert.doesNotMatch(ofertasHtml,/action="\/api\//,'La comparación no debe enviar un formulario');
 assert.equal((await get('/probar/ofertas',{method:'POST'})).status,405,
   'El ejemplo de ofertas no debe aceptar adjudicaciones HTTP');
 console.log('OK: HTTP real /, /probar, /probar/ofertas, /ingresar, /alta y /api/organizaciones; demo sin endpoint, registro cerrado');
}finally{child.kill('SIGTERM');}
