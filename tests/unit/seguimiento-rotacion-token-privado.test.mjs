import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(
 new URL('../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
const A='a'.repeat(64), B='b'.repeat(64);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Node{
 constructor(){this.children=[];this.hidden=false;this.textContent='';this.className='';}
 append(...items){this.children.push(...items);}
 appendChild(item){this.children.push(item);return item;}
 replaceChildren(){this.children=[];}
}
const answer=(text)=>({
 state:'waiting',can_open:true,received_count:1,files_pending_review:0,
 deadline:'2026-11-07T18:00:00Z',offers:[{label:'Presupuesto 1',text}]
});
async function browser(replies,{initial=A}={}){
 const nodes=new Map(),listeners=new Map(),timers=[],requests=[];
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,new Node());
  return nodes.get(id);
 };
 const window={
  location:{hash:'#'+initial},
  addEventListener(name,fn){listeners.set(name,fn);}
 };
 vm.runInNewContext(source,{
  window,document:{getElementById:get,createElement:()=>new Node()},
  setInterval(fn){timers.push(fn);},
  fetch:async(url,options)=>{
   requests.push({url,method:options.method,body:JSON.parse(options.body),
    credentials:options.credentials,cache:options.cache});
   const v=await replies.shift();
   if(v?.offline)throw Error('offline');
   return {ok:true,json:async()=>v};
  }
 },{timeout:1000});
 await tick();
 return {
  get,requests,
  switchTo(next){
   window.location.hash='#'+next;
   const listener=listeners.get('hashchange');
   assert.equal(typeof listener,'function');
   listener();
  },
  poll(){assert.equal(timers.length,1);timers[0]();}
 };
}

test('El nuevo enlace limpia inmediatamente las ofertas del anterior y carga la ronda nueva',async()=>{
 const p=await browser([answer('Ronda A privada'),answer('Ronda B privada')]);
 assert.match(JSON.stringify(p.get('offers').children),/Ronda A privada/);
 p.switchTo(B);
 assert.equal(p.get('offers').children.length,0);
 assert.equal(p.get('count').textContent,'—');
 assert.equal(p.get('state').textContent,'Verificando enlace privado');
 await tick();
 const visible=JSON.stringify(p.get('offers').children);
 assert.match(visible,/Ronda B privada/);
 assert.doesNotMatch(visible,/Ronda A privada/);
 assert.deepEqual(p.requests.map(r=>r.body.token),[A,B]);
 for(const request of p.requests){
  assert.equal(request.url,'/api/estado');
  assert.equal(request.method,'POST');
  assert.equal(request.credentials,'omit');
  assert.equal(request.cache,'no-store');
  assert.doesNotMatch(request.url,/a{64}|b{64}/);
 }
});

test('Un POST antiguo autorizado no puede reinstalar datos del comprador previo',async()=>{
 let releaseOld;
 const delayed=new Promise(resolve=>{releaseOld=resolve;});
 const p=await browser([
  answer('Estado inicial A'),delayed,answer('Únicamente B')
 ]);
 p.poll(); // consulta A queda en vuelo
 await tick();
 p.switchTo(B);
 await tick();
 assert.match(JSON.stringify(p.get('offers').children),/Únicamente B/);
 releaseOld(answer('Respuesta tardía A'));
 await tick();
 const visible=JSON.stringify(p.get('offers').children);
 assert.match(visible,/Únicamente B/);
 assert.doesNotMatch(visible,/Respuesta tardía A|Estado inicial A/);
});

test('Tras revocación del enlace A solo un enlace B distinto puede abrir otra ronda',async()=>{
 const p=await browser([{state:'not_found'},answer('Ronda B autorizada')]);
 assert.equal(p.get('offers').children.length,0);
 assert.equal(p.get('state').textContent,'Enlace vencido o revocado');
 p.poll();await tick();
 assert.equal(p.requests.length,1,'el token revocado no se consulta de nuevo');
 p.switchTo(B);await tick();
 assert.equal(p.requests.length,2);
 assert.match(JSON.stringify(p.get('offers').children),/Ronda B autorizada/);
});

test('Fragmento inválido elimina todo dato y detiene consultas hasta un token nuevo válido',async()=>{
 let releaseOld;
 const delayed=new Promise(resolve=>{releaseOld=resolve;});
 const p=await browser([answer('A'),delayed,answer('B')]);
 p.poll();await tick();
 p.switchTo('INVALIDO');
 assert.equal(p.get('offers').children.length,0);
 assert.equal(p.get('state').textContent,'Enlace inválido');
 const count=p.requests.length;
 p.poll();await tick();
 assert.equal(p.requests.length,count);
 releaseOld(answer('Respuesta antigua'));
 await tick();
 assert.equal(p.get('offers').children.length,0);
 p.switchTo(B);await tick();
 assert.match(JSON.stringify(p.get('offers').children),/B/);
 assert.deepEqual(p.requests.map(x=>x.body.token),[A,A,B]);
});

test('Un enlace inválido al inicio no bloquea la navegación posterior',async()=>{
 const p=await browser([answer('Ahora autorizado')],{initial:'invalido'});
 assert.equal(p.requests.length,0);
 assert.equal(p.get('state').textContent,'Enlace inválido');
 p.switchTo(B);await tick();
 assert.equal(p.requests.length,1);
 assert.match(JSON.stringify(p.get('offers').children),/Ahora autorizado/);
});

test('No repite consultas por el mismo fragmento ni permite que un error antiguo borre una ronda nueva',async()=>{
 let releaseOld;
 const delayed=new Promise(resolve=>{releaseOld=resolve;});
 const p=await browser([answer('Primera A'),delayed,answer('B vigente')]);
 p.poll();await tick();
 p.switchTo(B);await tick();
 const count=p.requests.length;
 p.switchTo(B);await tick();
 assert.equal(p.requests.length,count);
 releaseOld({offline:true});await tick();
 assert.match(JSON.stringify(p.get('offers').children),/B vigente/);
 assert.notEqual(p.get('state').textContent,'Sin conexión');
});
