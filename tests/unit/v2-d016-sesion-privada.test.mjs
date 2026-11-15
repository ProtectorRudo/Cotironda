import test from 'node:test';
import assert from 'node:assert/strict';
import {hmacTicketD016} from '../../src/server/v2-d016-enlace-whatsapp.ts';
import {D016_SESSION_COOKIE,D016_SESSION_SECONDS,digestSesionPrivadaD016,
 canjearConSesionPrivadaD016,cookieSesionD016,verificarAccesoSesionD016}
 from '../../src/server/v2-d016-sesion-privada.ts';

const ORIGIN='https://cotironda-portal-9sl89v1ho-protector-rudo-s-projects.vercel.app';
const ROUND='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY='8'.repeat(64);
const TOKEN='c'.repeat(43);
const gate=()=>({habilitada:true,entorno:'preview',
 proyectoUrl:'https://ilggkalaafhtiysyzlmg.supabase.co',
 shaDesplegado:'a'.repeat(40),shaAprobado:'a'.repeat(40),
 origenPortal:ORIGIN,claveHmacHex:KEY
});
function fixture(){
 const state={issued:true,consumed:false,sessions:new Map(),now:1800000000000,
  authorized:true,claimCalls:0,readCalls:0};
 const ports={
  ahora:()=>state.now,
  reclamarYCrearSesion:async({ticketHmac,sesionHmac})=>{
   state.claimCalls++;
   assert.equal(ticketHmac,hmacTicketD016(TOKEN,KEY));
   assert.match(sesionHmac,/^[a-f0-9]{64}$/u);
   if(state.consumed||!state.issued)return false;
   state.consumed=true;
   state.sessions.set(sesionHmac,{buyerKey:'buyer_a',requestId:ROUND});
   return true;
  },
  verificarSesion:async({sesionHmac,rondaId})=>{
   state.readCalls++;
   assert.match(sesionHmac,/^[a-f0-9]{64}$/u);
   if(!state.authorized||rondaId!==ROUND)return null;
   return state.sessions.get(sesionHmac)??null;
  }
 };
 const req=(patch={},body=JSON.stringify({ticket:TOKEN}),method='POST')=>
  new Request(ORIGIN+'/api/piloto/v2/acceso/canjear',{
   method,headers:{origin:ORIGIN,'sec-fetch-site':'same-origin',
    'content-type':'application/json',...patch},
   ...(method==='POST'?{body}:{})
  });
 const redeem=(req1=req())=>canjearConSesionPrivadaD016(gate(),req1,ports);
 return {state,ports,req,redeem};
}
test('D016 sesión: POST único crea cookie HttpOnly Secure SameSite sin JWT ni email',async()=>{
 const f=fixture();
 const response=await f.redeem();
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{state:'SESSION_CREATED'});
 assert.equal(response.headers.get('cache-control')?.includes('no-store'),true);
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 const cookie=response.headers.get('set-cookie');
 assert.match(cookie,new RegExp('^'+D016_SESSION_COOKIE+'=[A-Za-z0-9_-]{43};'));
 assert.match(cookie,/HttpOnly/u);
 assert.match(cookie,/Secure/u);
 assert.match(cookie,/SameSite=Lax/u);
 assert.match(cookie,/Path=\//u);
 assert.ok(cookie.includes('Max-Age='+D016_SESSION_SECONDS));
 assert.ok(!cookie.includes(TOKEN));
 assert.equal(f.state.sessions.size,1);
 const raw=cookie.split('=')[1].split(';')[0];
 assert.ok(![...f.state.sessions.keys()].includes(raw));
 const browserRequest=new Request(ORIGIN+'/piloto/v2/rondas/'+ROUND,{
  headers:{cookie:D016_SESSION_COOKIE+'='+raw}
 });
 assert.equal(cookieSesionD016(browserRequest),raw);
 assert.deepEqual(await verificarAccesoSesionD016(
  gate(),browserRequest,ROUND,f.ports),
  {buyerKey:'buyer_a',requestId:ROUND});
 const wrong=await verificarAccesoSesionD016(gate(),browserRequest,
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',f.ports);
 assert.equal(wrong,null);
});
test('D016 sesión: dos intentos de canje concurrentes solo crean una cookie',async()=>{
 const f=fixture();
 const [a,b]=await Promise.all([f.redeem(),f.redeem()]);
 assert.deepEqual([a.status,b.status].sort(),[200,403]);
 assert.equal(f.state.sessions.size,1);
 const denied=[a,b].find(x=>x.status===403);
 assert.equal(denied.headers.has('set-cookie'),false);
 assert.deepEqual(await denied.json(),{state:'BLOCKED'});
});
test('D016 sesión: bloquea GET preview, otras URLs, origen y cuerpo inválido',async()=>{
 const invalid=[
  new Request(ORIGIN+'/piloto/v2/acceso#d016='+TOKEN),
  new Request(ORIGIN+'/api/piloto/v2/acceso/canjear',{method:'GET'}),
  fixture().req({origin:'https://attacker.invalid'}),
  fixture().req({'sec-fetch-site':'cross-site'}),
  fixture().req({'content-type':'text/plain'}),
  fixture().req({},JSON.stringify({ticket:TOKEN,buyer:'otro'})),
  fixture().req({},JSON.stringify({ticket:'x'})),
  fixture().req({},JSON.stringify({ticket:TOKEN})+' '.repeat(200))
 ];
 for(const req of invalid){
  const f=fixture();const result=await f.redeem(req);
  assert.equal(result.status,403);
  assert.equal(result.headers.has('set-cookie'),false);
  assert.equal(f.state.claimCalls,0);
 }
 const f=fixture();assert.equal((await canjearConSesionPrivadaD016(
  {...gate(),habilitada:false},f.req(),f.ports)).status,403);
 assert.equal(f.state.claimCalls,0);
});
test('D016 sesión: cookie ajena, vencida o duplicada no accede',async()=>{
 const f=fixture();
 for(const raw of [
  '',D016_SESSION_COOKIE+'=short',
  D016_SESSION_COOKIE+'='+'c'.repeat(43)+'; '+D016_SESSION_COOKIE+'='+'d'.repeat(43),
  '__Host-cotironda-v20='+'a'.repeat(43)
 ]){
  const req=new Request(ORIGIN+'/piloto/v2/rondas/'+ROUND,{headers:{cookie:raw}});
  assert.equal(cookieSesionD016(req),null);
  assert.equal(await verificarAccesoSesionD016(gate(),req,ROUND,f.ports),null);
 }
 const r=await f.redeem();
 const raw=r.headers.get('set-cookie').split('=')[1].split(';')[0];
 f.state.authorized=false;
 const req=new Request(ORIGIN+'/piloto/v2/rondas/'+ROUND,{
  headers:{cookie:D016_SESSION_COOKIE+'='+raw}});
 assert.equal(await verificarAccesoSesionD016(gate(),req,ROUND,f.ports),null);
});
test('D016 sesión: no filtra token en errores ni declara sesión si BD falla',async()=>{
 const f=fixture();f.ports.reclamarYCrearSesion=async()=>false;
 const r=await f.redeem();
 assert.equal(r.status,403);
 assert.equal(r.headers.has('set-cookie'),false);
 const raw=JSON.stringify(await r.json());
 assert.equal(raw.includes(TOKEN),false);
 assert.equal(digestSesionPrivadaD016('a'.repeat(43),KEY)?.length,64);
 assert.equal(digestSesionPrivadaD016('x',KEY),null);
});
