import test from 'node:test';
import assert from 'node:assert/strict';
import {V2_D016_TTL_MS,puertaD016Lista,origenValidoD016,
 hmacTicketD016,emitirEnlaceD016,canjearEnlaceD016}
 from '../../src/server/v2-d016-enlace-whatsapp.ts';

const ORIGIN='https://cotironda-portal-9sl89v1ho-protector-rudo-s-projects.vercel.app';
const SHA='a'.repeat(40);
const KEY='b'.repeat(64);
const CHAT='c'.repeat(64);
const ROUND='123e4567-e89b-42d3-a456-426614174000';
const NOW=1800000000000;
const gate=()=>({
 habilitada:true,entorno:'preview',proyectoUrl:'https://ilggkalaafhtiysyzlmg.supabase.co',
 shaDesplegado:SHA,shaAprobado:SHA,origenPortal:ORIGIN,claveHmacHex:KEY
});
const buyer=()=>({
 compradorKey:'arquitecto_piloto',rondaId:ROUND,chatHmac:CHAT,
 webhookAutenticado:true
});
function fixture(){
 const state={verified:true,consented:true,revoked:false,now:NOW,sends:0,
  verifying:0,registering:0,consuming:0,seen:[],tickets:new Map()};
 const ports={
  ahora:()=>state.now,
  verificarCompradorYRonda:async q=>{
   state.verifying++;
   assert.equal(q.chatHmac,CHAT);
   assert.equal(q.compradorKey,'arquitecto_piloto');
   assert.equal(q.rondaId,ROUND);
   return state.verified;
  },
  registrarTicket:async q=>{
   state.registering++;
   assert.match(q.ticketHmac,/^[a-f0-9]{64}$/u);
   assert.equal(q.chatHmac,CHAT);
   assert.equal(q.venceMs,state.now+V2_D016_TTL_MS);
   // Simula INSERT transaccional: se revocan tickets previos de la ronda.
   for(const row of state.tickets.values())
    if(row.rondaId===q.rondaId)row.revoked=true;
   state.tickets.set(q.ticketHmac,{...q,used:false,revoked:false});
   return true;
  },
  enviarPorWhatsapp:async q=>{
   state.sends++;
   state.seen.push(q);
   assert.equal(q.chatHmac,CHAT);
   assert.ok(q.enlace.startsWith(ORIGIN+'/piloto/v2/acceso#d016='));
   assert.ok(!q.enlace.includes('?'));
   return true;
  },
  consumirTicketAtomico:async q=>{
   state.consuming++;
   assert.match(q.ticketHmac,/^[a-f0-9]{64}$/u);
   const row=state.tickets.get(q.ticketHmac);
   // Simula una UPDATE atómica con validez, revocación y rol real.
   if(!row||row.used||row.revoked||state.revoked||!state.consented||
      q.ahoraMs>=row.venceMs)return false;
   row.used=true;return true;
  }
 };
 const issue=()=>emitirEnlaceD016(gate(),buyer(),ports);
 const ticket=()=>state.seen.at(-1)?.enlace?.split('#d016=')[1];
 const claim=(override={},body,method='POST')=>{
  const headers={
   origin:ORIGIN,'sec-fetch-site':'same-origin',
   'content-type':'application/json',...override
  };
  return new Request(ORIGIN+'/api/piloto/v2/acceso/canjear',{
   method,headers, ...(method==='POST'?{body:body??JSON.stringify({ticket:ticket()})}:{})
  });
 };
 return {state,ports,issue,ticket,claim};
}
test('D016: token aleatorio 256 bits, solo HMAC persistido y enlace en fragmento',async()=>{
 const t=fixture();
 assert.equal(await t.issue(),'SENT');
 assert.deepEqual({verify:t.state.verifying,save:t.state.registering,
  send:t.state.sends},{verify:1,save:1,send:1});
 const raw=t.ticket();
 assert.match(raw,/^[A-Za-z0-9_-]{43}$/u);
 const digest=hmacTicketD016(raw,KEY);
 assert.equal(digest?.length,64);
 assert.equal(t.state.tickets.has(digest),true);
 assert.equal(t.state.tickets.has(raw),false);
 assert.ok(!JSON.stringify([...t.state.tickets.values()]).includes(raw));
 const output=await t.issue();
 assert.equal(output,'SENT');
 assert.notEqual(t.ticket(),raw,'cada emisión rota el enlace');
 assert.equal(t.state.tickets.get(digest).revoked,true);
 assert.ok(!JSON.stringify(output).includes(raw));
});
test('D016: no emite ante entorno, proyecto, SHA, origen, HMAC, rol o canal incorrecto',async()=>{
 const badGates=[
  {habilitada:false},{entorno:'production'},{entorno:'development'},
  {proyectoUrl:'https://otro.supabase.co'},{shaAprobado:'c'.repeat(40)},
  {shaDesplegado:'mala'},{origenPortal:'http://ejemplo.local'},
  {origenPortal:'https://example.org'},{origenPortal:ORIGIN+'/?return=/private'},
  {claveHmacHex:''},{claveHmacHex:'c'.repeat(63)}
 ];
 for(const patch of badGates){
  const t=fixture();
  assert.equal(await emitirEnlaceD016({...gate(),...patch},buyer(),t.ports),
   'BLOCKED',JSON.stringify(patch));
  assert.equal(t.state.verifying,0);
  assert.equal(t.state.registering,0);
  assert.equal(t.state.sends,0);
 }
 for(const patch of [
  {webhookAutenticado:false},{compradorKey:'supplier_x; DROP TABLE'},
  {rondaId:'otra_ronda'},{chatHmac:'d'.repeat(63)}
 ]){
  const t=fixture();
  assert.equal(await emitirEnlaceD016(gate(),{...buyer(),...patch},t.ports),
   'BLOCKED');
  assert.equal(t.state.verifying,0);
 }
 const t=fixture();t.state.verified=false;
 assert.equal(await t.issue(),'BLOCKED');
 assert.equal(t.state.sends,0);
 assert.equal(t.state.registering,0);
});
test('D016: rechazo de origen y URL maliciosa, token inválido o GET de preview no consume',async()=>{
 assert.equal(puertaD016Lista(gate()),true);
 for(const origin of [
  'http://cotironda-portal-test.vercel.app',
  'https://cotironda-portal-test.vercel.app:8443',
  'https://cotironda-portal-test.vercel.app/x',
  'https://cotironda-portal-test.vercel.app?token=secret',
  'https://evil.com','https://evil.vercel.app@attacker.invalid'
 ])assert.equal(origenValidoD016(origin),false,origin);
 const t=fixture();await t.issue();
 for(const r of [
  new Request(ORIGIN+'/piloto/v2/acceso#d016='+t.ticket()),
  t.claim({origin:'https://atacante.invalid'}),
  t.claim({'sec-fetch-site':'cross-site'}),
  t.claim({'sec-fetch-site':'none'}),
  t.claim({'content-type':'text/plain'}),
  t.claim({},JSON.stringify({ticket:t.ticket(),buyerKey:'otro'})),
  t.claim({},JSON.stringify({ticket:'x'.repeat(43)})),
  t.claim({},JSON.stringify({ticket:1})),
  t.claim({},JSON.stringify({ticket:t.ticket()})+' '.repeat(125))
 ]){
  assert.equal(await canjearEnlaceD016(gate(),r,t.ports),'BLOCKED');
 }
 assert.equal(t.state.consuming,1,'solo token sintáctico falso llegó a la RPC');
});
test('D016: dos clics concurrentes redimen exactamente una vez; NO crean sesión',async()=>{
 const t=fixture();await t.issue();
 const [one,two]=await Promise.all([
  canjearEnlaceD016(gate(),t.claim(),t.ports),
  canjearEnlaceD016(gate(),t.claim(),t.ports)
 ]);
 assert.deepEqual([one,two].sort(),['BLOCKED','CLAIMED_AWAITING_AUTH']);
 assert.equal(await canjearEnlaceD016(gate(),t.claim(),t.ports),'BLOCKED');
 assert.equal(t.state.consuming,3);
 assert.ok(!JSON.stringify([one,two]).includes('access_token'));
});
test('D016: expirado, revocado, sin consentimiento o enlace anterior jamás sirven',async()=>{
 for(const kind of ['expired','revoked','optout','rotated']){
  const t=fixture();await t.issue();
  const old=t.ticket();
  if(kind==='expired')t.state.now+=V2_D016_TTL_MS;
  if(kind==='revoked')t.state.revoked=true;
  if(kind==='optout')t.state.consented=false;
  if(kind==='rotated')await t.issue();
  const req=t.claim({},JSON.stringify({ticket:old}));
  assert.equal(await canjearEnlaceD016(gate(),req,t.ports),'BLOCKED',kind);
 }
});
test('D016: si la emisión o el envío queda incierto no reintenta WhatsApp',async()=>{
 const t=fixture();
 t.ports.enviarPorWhatsapp=async()=>{t.state.sends++;throw Error('network_timeout')};
 assert.equal(await t.issue(),'DELIVERY_UNCERTAIN');
 assert.equal(t.state.sends,1);
 const other=fixture();
 other.ports.registrarTicket=async()=>false;
 assert.equal(await other.issue(),'BLOCKED');
 assert.equal(other.state.sends,0);
 const broken=fixture();
 broken.ports.verificarCompradorYRonda=async()=>{throw Error('db_offline')};
 assert.equal(await broken.issue(),'BLOCKED');
 assert.equal(broken.state.sends,0);
 const uncertain=fixture();
 uncertain.ports.registrarTicket=async()=>{throw Error('db_timeout')};
 assert.equal(await uncertain.issue(),'BLOCKED');
 assert.equal(uncertain.state.sends,0);
});
test('D016: jamás se acepta un HMAC incorrecto como token ni HTTP con payload sensible',async()=>{
 assert.equal(hmacTicketD016('a'.repeat(43),'c'.repeat(63)),null);
 assert.equal(hmacTicketD016('x'.repeat(42),KEY),null);
 const t=fixture();await t.issue();
 const raw=JSON.stringify({ticket:t.ticket()});
 const req=new Request(ORIGIN+'/api/piloto/v2/acceso/canjear?auth=secret',{
  method:'POST',headers:{origin:ORIGIN,'sec-fetch-site':'same-origin',
   'content-type':'application/json'},body:raw
 });
 assert.equal(await canjearEnlaceD016(gate(),req,t.ports),'BLOCKED');
 assert.equal(t.state.consuming,0);
});
