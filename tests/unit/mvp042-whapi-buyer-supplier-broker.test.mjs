import test from 'node:test';
import assert from 'node:assert/strict';
import {construirBrokerWhapiPrivado}
 from '../../src/server/whapi-crypto-broker.ts';
import {procesarWebhookWhapiAislado}
 from '../../src/server/whapi-inbound-offline.ts';

const CH='canal_piloto',CHAT='5492211234567@s.whatsapp.net';
const TEL='5492211234567',NOW=1800000000,SECRET='s'.repeat(48);
const BUYER='aaaaaaaa-0000-4000-8000-000000000042';
const SUPPLIER='bbbbbbbb-0000-4000-8000-000000000042';
const ROUND='cccccccc-0000-4000-8000-000000000042';
const KEYS={identidadHmac:Buffer.alloc(32,17),
 huellaHmac:Buffer.alloc(32,71),contenidoAes:Buffer.alloc(32,39)};
const M={id:'p.test-0000042',from_me:false,type:'text',from:TEL,
 chat_id:CHAT,timestamp:NOW,
 text:{body:'20 bolsas de cemento CPC Loma Negra 50 kg'}};
const envelope=(m=M)=>({event:{type:'messages',event:'post'},
 channel_id:CH,messages:[m]});
const request=(v=envelope(),secret=SECRET)=>new Request('https://local.test',{
 method:'POST',headers:{'content-type':'application/json',
  'x-cotironda-webhook-key':secret},
 body:JSON.stringify(v)
});
function setup(opts={}){
 const state={buyers:new Map(),suppliers:new Map(),bajas:new Map(),
  queries:[],writes:0,buyerBinding:{
   buyerOrgId:BUYER,consentimientoContactoVigente:true,chatHabilitado:true
  },supplierBinding:null};
 const almacen={
  resolverVinculo:async(_channel,hash)=>{
   state.queries.push({role:'supplier',hash});return state.supplierBinding;
  },
  registrarEntrada:async msg=>{
   state.writes++;
   state.suppliers.set(msg.channel+'|'+msg.messageKey,msg);
   return {estado:'entrada_persistida',repetido:false};
  },
  registrarBaja:async()=>({estado:'baja_registrada',repetido:false}),
  resolverComprador:async(_channel,hash)=>{
   state.queries.push({role:'buyer',hash});return state.buyerBinding;
  },
  registrarEntradaComprador:async msg=>{
   state.writes++;
   const key=msg.channel+'|'+msg.messageKey;
   const prior=state.buyers.get(key);
   if(prior){
    if(prior.fingerprint!==msg.fingerprint||
       prior.buyerOrgId!==msg.buyerOrgId)throw Error('collision');
    return {estado:'entrada_persistida',repetido:true};
   }
   if(msg.buyerOrgId!==state.buyerBinding?.buyerOrgId)
    throw Error('buyer-identity-revoked');
   state.buyers.set(key,msg);
   return {estado:'entrada_persistida',repetido:false};
  },
  registrarBajaComprador:async msg=>{
   const key=msg.channel+'|'+msg.messageKey;
   if(state.bajas.has(key))return {estado:'baja_registrada',repetido:true};
   state.bajas.set(key,msg);
   state.buyerBinding={...state.buyerBinding,
    consentimientoContactoVigente:false};
   return {estado:'baja_registrada',repetido:false};
  }
 };
 if(opts.noBuyer){delete almacen.resolverComprador;
  delete almacen.registrarEntradaComprador;
  delete almacen.registrarBajaComprador;}
 const broker=construirBrokerWhapiPrivado({
  channel:CH,claves:KEYS,secretoWebhook:SECRET,habilitado:true,
  ahoraUnix:()=>NOW,almacen});
 const run=(v=envelope())=>procesarWebhookWhapiAislado(request(v),
  broker.dependencias);
 return {state,broker,almacen,run};
}
test('MVP042: arquitecto envía texto Whapi y se guarda cifrado, no en bandeja proveedor',async()=>{
 const x=setup();const r=await x.run();
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{
  estado:'entradas_persistidas',guardadas:1,duplicadas:0,
  compradoresGuardados:1,presupuestosConfirmados:0,mensajesEnviados:0
 });
 assert.equal(x.state.buyers.size,1);
 assert.equal(x.state.suppliers.size,0);
 const d=[...x.state.buyers.values()][0];
 assert.equal(d.buyerOrgId,BUYER);
 for(const k of ['chatKey','messageKey','fingerprint'])
  assert.match(d[k],/^[a-f0-9]{64}$/);
 const snap=JSON.stringify({...d,nonce:d.nonce.toString('hex'),
  ciphertext:d.ciphertext.toString('hex'),tag:d.tag.toString('hex')});
 assert.equal(snap.includes(TEL),false);
 assert.equal(snap.includes('cemento'),false);
 assert.equal(d.nonce.length,12);
 assert.equal(d.tag.length,16);
 assert.deepEqual(x.broker.verificarContenidoComprador(d),{
  tipo:'text',texto:M.text.body,marcaTiempoUnix:NOW
 });
 assert.ok(x.state.queries.every(q=>q.hash.length===64&&!q.hash.includes(TEL)));
});
test('MVP042: Webhook repetido no genera dos pedidos; hash de evento estable',async()=>{
 const x=setup();await x.run();
 const d=[...x.state.buyers.values()][0];
 const r=await x.run();
 assert.equal((await r.json()).duplicadas,1);
 assert.equal(x.state.buyers.size,1);
 assert.equal(x.state.writes,2);
 assert.equal(x.state.buyers.values().next().value.fingerprint,d.fingerprint);
});
test('MVP042: mismo ID con texto adulterado jamás modifica el cifrado anterior',async()=>{
 const x=setup();await x.run();
 const r=await x.run(envelope({...M,text:{body:'otro producto y precio'}}));
 assert.equal(r.status,503);
 assert.equal(x.state.buyers.size,1);
});
test('MVP042: doble vinculación comprador/proveedor no permite registrar nada',async()=>{
 const x=setup();
 x.state.supplierBinding={supplierOrgId:SUPPLIER,roundId:ROUND,
  consentimientoVigente:true,invitacionVigente:true};
 assert.equal((await x.run()).status,403);
 assert.equal(x.state.writes,0);
});
test('MVP042: sin vínculo verificado comprador, sin consentimiento o baja no registra',async()=>{
 for(const binding of [
  null,{buyerOrgId:BUYER,consentimientoContactoVigente:false,chatHabilitado:true},
  {buyerOrgId:BUYER,consentimientoContactoVigente:true,chatHabilitado:false},
  {buyerOrgId:'FAKE',consentimientoContactoVigente:true,chatHabilitado:true}
 ]){
  const x=setup();x.state.buyerBinding=binding;
  // Binding malformed from our PRIVATE backend is an internal incident (503);
  // a valid identity lacking consent/chat access is an ordinary denial (403).
  assert.equal((await x.run()).status,binding?.buyerOrgId==='FAKE'?503:403);
  assert.equal(x.state.writes,0);
 }
});
test('MVP042: webhook con org falsificada no altera binding del servidor',async()=>{
 const x=setup();
 const fake={...envelope(),
  buyerOrgId:SUPPLIER,supplierOrgId:SUPPLIER,
  messages:[{...M,buyerOrgId:SUPPLIER,roundId:ROUND}]};
 assert.equal((await x.run(fake)).status,200);
 assert.equal([...x.state.buyers.values()][0].buyerOrgId,BUYER);
});
test('MVP042: claves AES compradoras se atan a rol+empresa+fecha+mensaje',async()=>{
 const x=setup();await x.run();
 const d=[...x.state.buyers.values()][0];
 assert.throws(()=>x.broker.verificarContenido(d));
 const tampered=[
  {...d,buyerOrgId:SUPPLIER},{...d,channel:'otro_canal'},
  {...d,sourceUnix:d.sourceUnix+1},
  {...d,chatKey:'1'.repeat(64)},
  {...d,messageKey:'2'.repeat(64)},
  {...d,kind:'document'},
  {...d,tag:Buffer.from(d.tag)},
  {...d,ciphertext:Buffer.from(d.ciphertext)}
 ];
 tampered[6].tag[0]^=1;tampered[7].ciphertext[0]^=1;
 for(const v of tampered)
  assert.throws(()=>x.broker.verificarContenidoComprador(v));
});
test('MVP042: BAJA de comprador se registra sin bajar proveedor ni almacenar el numero',async()=>{
 const x=setup();
 const cmd=envelope({...M,text:{body:'BAJA'}});
 const r=await x.run(cmd);
 assert.equal(r.status,200);
 assert.equal((await r.json()).bajasRegistradas,1);
 assert.equal(x.state.buyers.size,0);
 const d=[...x.state.bajas.values()][0];
 assert.equal(d.buyerOrgId,BUYER);
 assert.equal(JSON.stringify(d).includes(TEL),false);
 assert.match(d.fingerprint,/^[0-9a-f]{64}$/);
 assert.equal((await x.run(cmd)).status,200);
 assert.equal(x.state.bajas.size,1);
 assert.equal((await x.run()).status,403);
});
test('MVP042: BAJA con doble rol rechazada y no hace bajas ajenas',async()=>{
 const x=setup();
 x.state.supplierBinding={supplierOrgId:SUPPLIER,roundId:ROUND,
  consentimientoVigente:true,invitacionVigente:true};
 assert.equal((await x.run(envelope({...M,text:{body:'BAJA'}}))).status,403);
 assert.equal(x.state.bajas.size,0);
});
test('MVP042: documento/foto solo queda pendiente y no descarga URL arbitraria',async()=>{
 const x=setup();
 for(const [i,type] of ['document','image','voice'].entries()){
  const r=await x.run(envelope({...M,id:'p.media-000042'+i,
   type,text:undefined,[type]:{link:'http://169.254.169.254/latest/meta-data'}}));
  assert.equal(r.status,200);
 }
 assert.equal(x.state.buyers.size,3);
 assert.ok([...x.state.buyers.values()].every(d=>d.kind!=='text'&&
  x.broker.verificarContenidoComprador(d).texto===null));
});
test('MVP042: sin almacenamiento comprador no se habilita ruta del nuevo rol',async()=>{
 const x=setup({noBuyer:true});
 assert.equal((await x.run()).status,403);
 assert.equal(x.state.writes,0);
});
test('MVP042: error SQL en registro comprador => 503, no ACK 200',async()=>{
 const x=setup();x.almacen.registrarEntradaComprador=async()=>{
  throw Error('db-down PRIVATE_SECRET');
 };
 assert.equal((await x.run()).status,503);
 assert.equal(x.state.buyers.size,0);
});
test('MVP042: al cambiar identidad entre resolver y persistir se bloquea',async()=>{
 const x=setup();
 let calls=0;
 x.almacen.resolverComprador=async()=>{
  calls++;
  if(calls===2)x.state.buyerBinding={...x.state.buyerBinding,
    buyerOrgId:SUPPLIER};
  return x.state.buyerBinding;
 };
 // broker closure reads the live original port; if identity changes mid-flow
 // the second callback fails because buyerOrgId no longer matches.
 assert.equal((await x.run()).status,503);
 assert.equal(x.state.buyers.size,0);
});
test('MVP042: secreto webhook inválido/otro canal bloquea ambos roles',async()=>{
 const x=setup();
 const badSecret=await procesarWebhookWhapiAislado(
  request(envelope(),'NO'),x.broker.dependencias);
 assert.equal(badSecret.status,401);
 const badChannel=await x.run({...envelope(),channel_id:'otro_canal'});
 assert.equal(badChannel.status,403);
 assert.equal(x.state.writes,0);
});
