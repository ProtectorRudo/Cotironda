import test from 'node:test';
import assert from 'node:assert/strict';
import {crearAccionesRondaWhatsappD081 as create}
 from '../../src/server/buyer-whatsapp-round-actions-d081.ts';

const CHANNEL='piloto_whapi';
const ORG='aaaaaaaa-0081-4081-8081-000000000811';
const ROUND='bbbbbbbb-0081-4081-8081-000000000811';
const CHAT='a'.repeat(64),SOURCE='b'.repeat(64),REPLY='c'.repeat(64);
const items=[{line_no:1,product_code:'cemento_gris_obra',
 quantity:'20',unit:'bag',source_description:'Cemento CPC Loma Negra 50 kg'}];
function pedido(update={}){
 return {buyerOrgId:ORG,chatKey:CHAT,channel:CHANNEL,
  originMessageKey:SOURCE,replyMessageKey:REPLY,
  pedido:{deliveryZone:'La Plata',vatRequest:'no_especificado',items},
  ...update};
}
function scenario({failSave=false,failInvite=false,badSave=false}={}){
 const calls={round:[],invite:[]};
 const persisted=new Map();
 const roundDb={query:async(sql,args)=>{
  calls.round.push({sql,args});
  if(failSave)throw Error('SECRET_POSTGRES_STRING');
  assert.match(sql,/whapi_create_buyer_round_d081/);
  assert.equal(args.length,8);
  if(badSave)return {rows:[{payload:{roundId:'FAKE',repetida:false}}]};
  const key=args[0]+'|'+args[2];
  const fingerprint=JSON.stringify(args);
  if(persisted.has(key)&&persisted.get(key)!==fingerprint)
   throw Error('d081_replayed_changed_payload');
  const repeat=persisted.has(key);
  persisted.set(key,fingerprint);
  return {rows:[{payload:{roundId:ROUND,repetida:repeat}}]};
 }};
 const inviteDb={query:async(sql,args)=>{
  calls.invite.push({sql,args});
  if(failInvite)throw Error('SECRET_WHAPI');
  assert.match(sql,/whapi_prepare_commercial_round_d071/);
  assert.deepEqual(args,[ROUND,CHANNEL]);
  return {rows:[{payload:{state:'queued_without_sending',
   matchedSuppliers:2,prepared:2,alreadyPrepared:0,
   pendingContact:0,pendingScope:0,messagesSent:0}}]};
 }};
 return {calls,roundDb,inviteDb,actions:create({
  habilitado:true,channel:CHANNEL,roundDb,inviteDb})};
}
test('MVP046: crear ronda por chat autorizado SQL parametrizado sin sesión web',async()=>{
 const h=scenario();
 const result=await h.actions.crearRonda(pedido());
 assert.deepEqual(result,{roundId:ROUND,repetida:false});
 assert.deepEqual(h.calls.round[0].args.slice(0,7),[
  CHANNEL,CHAT,SOURCE,REPLY,ORG,'La Plata','no_especificado'
 ]);
 assert.deepEqual(JSON.parse(h.calls.round[0].args[7]),items);
 assert.equal(h.calls.round[0].sql.includes(ORG),false);
 assert.equal(h.calls.round[0].sql.includes('created_by'),false);
});
test('MVP046: reintentar mismo mensaje devuelve ronda anterior; sin doble alta',async()=>{
 const h=scenario();
 assert.equal((await h.actions.crearRonda(pedido())).repetida,false);
 assert.deepEqual(await h.actions.crearRonda(pedido()),{
  roundId:ROUND,repetida:true
 });
 assert.equal(h.calls.round.length,2);
});
test('MVP046: una vez guardado el pedido, planificador D071 prepara sin enviar',async()=>{
 const h=scenario();
 const saved=await h.actions.crearRonda(pedido());
 const plan=await h.actions.prepararInvitaciones(saved.roundId);
 assert.equal(plan.estado,'queued_without_sending');
 assert.equal(plan.nuevasInvitaciones,2);
 assert.equal(plan.mensajesEnviados,0);
 assert.equal(h.calls.invite.length,1);
});
test('MVP046: caída planificador después del commit preserva idempotencia',async()=>{
 const h=scenario({failInvite:true});
 const saved=await h.actions.crearRonda(pedido());
 await assert.rejects(h.actions.prepararInvitaciones(saved.roundId),
  /d081_round_unavailable/);
 assert.equal((await h.actions.crearRonda(pedido())).repetida,true);
});
test('MVP046: fallos SQL jamás filtran token/URL',async()=>{
 const h=scenario({failSave:true});
 await assert.rejects(h.actions.crearRonda(pedido()),e=>{
  assert.equal(e.message,'d081_round_unavailable');return true;
 });
});
test('MVP046: no confía en cuerpo para elegir canal, comprador o mensaje',async()=>{
 for(const patch of [
  {buyerOrgId:'fake'},{chatKey:'5492212222222'},
  {channel:'fake_channel'},{originMessageKey:'original'},
  {replyMessageKey:'reply-not-hmac'}, {extra:'phone'}
 ]){
  const h=scenario();
  await assert.rejects(h.actions.crearRonda(pedido(patch)),
   /d081_round_unavailable/);
  assert.equal(h.calls.round.length,0);
 }
});
test('MVP046: bloquea cantidades/precios/materiales sin validación',async()=>{
 for(const malformed of [
  {items:[]},{items:[{...items[0],quantity:'-2'}]},
  {items:[{...items[0],product_code:'INVALID'}]},
  {items:[{...items[0],line_no:2}]},
  {items:[items[0],{...items[0],line_no:2}]},
  {items:[{...items[0],extra:'contacto'}]},
  {deliveryZone:'https://test.com'}, {vatRequest:'contradictorio'}
 ]){
  const h=scenario();
  await assert.rejects(h.actions.crearRonda(pedido({
   pedido:{...pedido().pedido,...malformed}
  })),/d081_round_unavailable/);
  assert.equal(h.calls.round.length,0);
 }
});
test('MVP046: resultado SQL falso no permite afirmar una ronda creada',async()=>{
 const h=scenario({badSave:true});
 await assert.rejects(h.actions.crearRonda(pedido()),
  /d081_round_unavailable/);
});
test('MVP046: sin entorno habilitado, jamás ejecuta SQL ni D071',async()=>{
 const h=scenario();
 const disabled=create({habilitado:false,channel:CHANNEL,
  roundDb:h.roundDb,inviteDb:h.inviteDb});
 await assert.rejects(disabled.crearRonda(pedido()),/d081_round_unavailable/);
 assert.equal((await disabled.prepararInvitaciones(ROUND)).estado,'desactivado');
 assert.deepEqual(h.calls,{round:[],invite:[]});
});
test('MVP046: invocación D071 no puede anunciar mensajes WhatsApp enviados',async()=>{
 const h=scenario();
 h.inviteDb.query=async()=>{
  return {rows:[{payload:{state:'queued_without_sending',
   matchedSuppliers:1,prepared:1,alreadyPrepared:0,
   pendingContact:0,pendingScope:0,messagesSent:1}}]};
 };
 await assert.rejects(h.actions.prepararInvitaciones(ROUND),
  /d081_round_unavailable/);
});
