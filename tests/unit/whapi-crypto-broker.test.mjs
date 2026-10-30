import test from 'node:test';
import assert from 'node:assert/strict';
import {construirBrokerWhapiPrivado} from '../../src/server/whapi-crypto-broker.ts';
import {procesarWebhookWhapiAislado} from '../../src/server/whapi-inbound-offline.ts';

const CH='whapi_dev_lab',CHAT='5492211234567@s.whatsapp.net';
const TEL='5492211234567';
const NOW=1800000000,SECRET='s'.repeat(48);
const ORG='bbbbbbbb-0000-4000-8000-000000000302';
const ROUND='dddddddd-0000-4000-8000-000000000304';
const KEYS={identidadHmac:Buffer.alloc(32,17),
  huellaHmac:Buffer.alloc(32,71),contenidoAes:Buffer.alloc(32,39)};
const MSG={id:'p.test-0000001',from_me:false,type:'text',from:TEL,
  chat_id:CHAT,timestamp:NOW,text:{body:'100 bolsas de cemento a $8500'}};
const body=(m=MSG)=>({event:{type:'messages',event:'post'},
  channel_id:CH,messages:[m]});
const request=(v=body(),secret=SECRET)=>new Request('https://test.invalid/whapi',{
  method:'POST',headers:{'content-type':'application/json',
    'x-cotironda-webhook-key':secret},body:JSON.stringify(v)
});
function setup(overrides={}){
 const state={messages:new Map(),bajas:new Map(),links:new Map(),
   attempts:0,linkRequests:[],writeRequests:[],bajaRequests:[]};
 state.links.set('default',{supplierOrgId:ORG,roundId:ROUND,
   consentimientoVigente:true,invitacionVigente:true});
 const almac={
  resolverVinculo:async(channel,chatKey)=>{
    state.linkRequests.push({channel,chatKey});
    return state.links.get('default')??null;
  },
  registrarEntrada:async(d)=>{
    state.writeRequests.push(d);
    state.attempts++;
    const key=d.channel+'|'+d.messageKey,old=state.messages.get(key);
    if(old){
      if(old.fingerprint!==d.fingerprint||old.chatKey!==d.chatKey||
         old.kind!==d.kind)throw Error('colision_privada');
      return {estado:'entrada_persistida',repetido:true};
    }
    const link=state.links.get('default');
    if(!link||!link.consentimientoVigente||!link.invitacionVigente||
      state.bajas.size)throw Error('sin_consentimiento_o_ronda');
    state.messages.set(key,d);
    return {estado:'entrada_persistida',repetido:false};
  },
  registrarBaja:async(d)=>{
    state.bajaRequests.push(d);
    const key=d.channel+'|'+d.messageKey,old=state.bajas.get(key);
    if(old){
      if(old.fingerprint!==d.fingerprint||old.chatKey!==d.chatKey)
        throw Error('colision_baja');
      return {estado:'baja_registrada',repetido:true};
    }
    state.bajas.set(key,d);
    state.links.set('default',{...state.links.get('default'),
      consentimientoVigente:false});
    return {estado:'baja_registrada',repetido:false};
  },
  ...overrides.almacen
 };
 const broker=construirBrokerWhapiPrivado({
   channel:CH,claves:KEYS,secretoWebhook:SECRET,habilitado:true,
   ahoraUnix:()=>NOW,almacen,...overrides,
   ...('almacen' in overrides?{almacen}:{})
 });
 return {state,broker};
}
const run=(b,v=body(),secret)=>procesarWebhookWhapiAislado(request(v,secret),
  b.dependencias);
const json=async r=>r.json();
test('Webhook → broker cifra y persiste; no hay texto/telefono en columnas SQL',async()=>{
 const {state,broker}=setup();
 const response=await run(broker);
 assert.equal(response.status,200);
 assert.deepEqual(await json(response),{estado:'entradas_persistidas',
  guardadas:1,duplicadas:0,presupuestosConfirmados:0,mensajesEnviados:0});
 assert.equal(state.messages.size,1);assert.equal(state.writeRequests.length,1);
 const d=[...state.messages.values()][0];
 for(const name of ['chatKey','messageKey','fingerprint'])
   assert.match(d[name],/^[0-9a-f]{64}$/);
 assert.equal(d.nonce.length,12);assert.equal(d.tag.length,16);
 assert.equal(d.kind,'text');assert.ok(d.ciphertext.length>0);
 const stored=JSON.stringify({...d,nonce:d.nonce.toString('hex'),
  ciphertext:d.ciphertext.toString('hex'),tag:d.tag.toString('hex')});
 assert.equal(stored.includes(TEL),false);
 assert.equal(stored.includes('cemento'),false);
 assert.equal(stored.includes(ORG),false);
 assert.equal(stored.includes(ROUND),false);
 assert.equal(state.linkRequests[0].chatKey.includes(TEL),false);
 assert.deepEqual(broker.verificarContenido(d),
  {tipo:'text',texto:MSG.text.body,marcaTiempoUnix:NOW});
});
test('reenviar mismo ID devuelve duplicado con huella determinista',async()=>{
 const {state,broker}=setup();
 await run(broker);const res=await run(broker);
 assert.equal(res.status,200);assert.equal((await json(res)).duplicadas,1);
 assert.equal(state.messages.size,1);assert.equal(state.writeRequests.length,2);
 assert.equal(state.writeRequests[0].fingerprint,state.writeRequests[1].fingerprint);
 assert.notEqual(state.writeRequests[0].nonce.toString('hex'),
   state.writeRequests[1].nonce.toString('hex'));
});
test('mismo ID con contenido alterado no sobrescribe entrada',async()=>{
 const {state,broker}=setup();
 await run(broker);
 const res=await run(broker,body({...MSG,text:{body:'Precio falso'}}));
 assert.equal(res.status,503);assert.equal(state.messages.size,1);
});
test('cifrado impide alterar ciphertext, tag, canal, fecha y tipo (AAD)',async()=>{
 const {state,broker}=setup();await run(broker);
 const d=[...state.messages.values()][0];
 const attempts=[
  {...d,ciphertext:Buffer.from(d.ciphertext)},
  {...d,tag:Buffer.from(d.tag)},
  {...d,kind:'image'},
  {...d,sourceUnix:d.sourceUnix+1},
  {...d,channel:'otro_canal'},
  {...d,messageKey:'f'.repeat(64)},
  {...d,chatKey:'e'.repeat(64)}
 ];
 attempts[0].ciphertext[0]^=1;attempts[1].tag[0]^=1;
 for(const bad of attempts)assert.throws(()=>broker.verificarContenido(bad));
});
test('la clave equivocada no puede descifrar una entrada anterior',async()=>{
 const {state,broker}=setup();await run(broker);
 const other=setup({claves:{...KEYS,contenidoAes:Buffer.alloc(32,28)}});
 assert.throws(()=>other.broker.verificarContenido([...state.messages.values()][0]));
});
test('HMAC aísla claves de chat entre canales y secreto distinto',async()=>{
 const a=setup();const b=setup({channel:'whapi_otro'});
 const c=setup({claves:{...KEYS,identidadHmac:Buffer.alloc(32,33)}});
 await run(a.broker);
 await procesarWebhookWhapiAislado(
  new Request('https://test.invalid',{method:'POST',
   headers:{'content-type':'application/json','x-cotironda-webhook-key':SECRET},
   body:JSON.stringify({...body(),channel_id:'whapi_otro'})}),b.broker.dependencias);
 await run(c.broker);
 assert.notEqual(a.state.linkRequests[0].chatKey,b.state.linkRequests[0].chatKey);
 assert.notEqual(a.state.linkRequests[0].chatKey,c.state.linkRequests[0].chatKey);
});
test('BAJA no exige ronda activa, no guarda cuerpo y no permite mensajes nuevos',async()=>{
 const {state,broker}=setup();
 state.links.set('default',{supplierOrgId:ORG,roundId:ROUND,
   consentimientoVigente:false,invitacionVigente:false});
 const cmd={...MSG,text:{body:' BAJA '}};
 const out=await run(broker,body(cmd));
 assert.equal(out.status,200);assert.equal((await json(out)).bajasRegistradas,1);
 assert.equal(state.bajas.size,1);assert.equal(state.messages.size,0);
 const stored=[...state.bajas.values()][0];
 assert.deepEqual(Object.keys(stored).sort(),
  ['channel','chatKey','fingerprint','messageKey','sourceUnix'].sort());
 assert.equal(JSON.stringify(stored).includes(TEL),false);
 const replay=await run(broker,body(cmd));
 assert.equal((await json(replay)).duplicadas,1);assert.equal(state.bajas.size,1);
 const next=await run(broker,body({...MSG,id:'p.test-0000002'}));
 assert.equal(next.status,403);assert.equal(state.messages.size,0);
});
test('BAJA usa HMAC propio, ignora hash SHA no autenticado de D027',async()=>{
 const {state,broker}=setup();
 const d=broker.dependencias;
 await d.registrarBaja(CH,CHAT,'p.test-0000019','0'.repeat(64),NOW);
 assert.equal(state.bajas.size,1);
 const fingerprint=[...state.bajas.values()][0].fingerprint;
 assert.notEqual(fingerprint,'0'.repeat(64));
 assert.match(fingerprint,/^[0-9a-f]{64}$/);
 const replay=await d.registrarBaja(CH,CHAT,'p.test-0000019','a'.repeat(64),NOW);
 assert.equal(replay,'duplicada');
});
test('no aceptar llaves vacías/iguales o dependencias incompletas',()=>{
 const make=(values)=>()=>setup(values);
 for(const keys of [
  {...KEYS,identidadHmac:Buffer.alloc(32)},
  {...KEYS,identidadHmac:KEYS.huellaHmac},
  {...KEYS,contenidoAes:Buffer.alloc(31)},
  {...KEYS,huellaHmac:Buffer.alloc(34)}
 ])assert.throws(make({claves:keys}),/broker_whapi_configuracion_invalida/);
 assert.throws(make({secretoWebhook:'corto'}));
 assert.throws(make({channel:'malo canal'}));
 assert.throws(make({almacen:{registrarEntrada:null}}));
});
test('claves se copian: modificación posterior no altera identidad',async()=>{
 const raw={identidadHmac:Buffer.alloc(32,17),
  huellaHmac:Buffer.alloc(32,71),contenidoAes:Buffer.alloc(32,39)};
 const b=setup({claves:raw}),a=setup();
 raw.identidadHmac.fill(9);raw.huellaHmac.fill(9);raw.contenidoAes.fill(9);
 await run(b.broker);await run(a.broker);
 assert.equal(b.state.linkRequests[0].chatKey,a.state.linkRequests[0].chatKey);
 assert.deepEqual(b.broker.verificarContenido([...b.state.messages.values()][0]),
  {tipo:'text',texto:MSG.text.body,marcaTiempoUnix:NOW});
});
test('foto/voz/documento nunca descargan URL ni almacenan enlace',async()=>{
 const {broker,state}=setup();
 const events=['image','voice','document'].map((type,i)=>({
   ...MSG,type,id:'p.file-000000'+i,
   [type]:{link:'http://169.254.169.254/private',filename:'bad.exe'}
 }));
 const res=await run(broker,{...body(),messages:events});
 assert.equal(res.status,200);
 assert.equal(state.messages.size,3);
 for(const d of state.messages.values()){
   assert.equal(broker.verificarContenido(d).texto,null);
   assert.equal(d.ciphertext.toString('utf8').includes('169.254'),false);
 }
});
test('una ronda ambigua o proveedor no verificado falla cerrado',async()=>{
 const {broker,state}=setup();
 state.links.set('default',null);
 assert.equal((await run(broker)).status,403);
 assert.equal(state.messages.size,0);
 state.links.set('default',{supplierOrgId:ORG,roundId:ROUND,
    consentimientoVigente:true,invitacionVigente:false});
 assert.equal((await run(broker)).status,403);
 assert.equal(state.messages.size,0);
});
test('falla al guardar o confirmar BAJA no genera ACK falso',async()=>{
 const a=setup({almacen:{registrarEntrada:async()=>{throw Error('backend caído')}}});
 assert.equal((await run(a.broker)).status,503);
 const b=setup({almacen:{registrarBaja:async()=>{throw Error('backend caído')}}});
 assert.equal((await run(b.broker,body({...MSG,text:{body:'BAJA'}}))).status,503);
});
test('almacén con recibo inesperado no se acepta como guardado',async()=>{
 const s=setup({almacen:{registrarEntrada:async()=>({estado:'ok',repetido:false})}});
 assert.equal((await run(s.broker)).status,503);
});
test('un mensaje "Confirmo" nunca confirma presupuesto',async()=>{
 const {broker,state}=setup();
 const r=await run(broker,body({...MSG,text:{body:'Confirmo'}}));
 assert.equal(r.status,200);
 assert.equal((await json(r)).presupuestosConfirmados,0);
 const d=[...state.messages.values()][0];
 assert.equal(broker.verificarContenido(d).texto,'Confirmo');
});
test('rechaza header incorrecto antes de consultar vínculo o cifrar',async()=>{
 const {broker,state}=setup();
 assert.equal((await run(broker,body(),'wrong')).status,401);
 assert.equal(state.linkRequests.length,0);
 assert.equal(state.messages.size,0);
});
