import test from 'node:test';
import assert from 'node:assert/strict';
import {procesarWebhookWhapiAislado}
 from '../../src/server/whapi-inbound-offline.ts';

const C='canal_piloto',SECRET='s'.repeat(48);
const NUMBER='5492211234567',CHAT=NUMBER+'@s.whatsapp.net';
const BUYER='aaaaaaaa-0000-4000-8000-000000000066';
const SUPPLIER='bbbbbbbb-0000-4000-8000-000000000066';
const ROUND='cccccccc-0000-4000-8000-000000000066';
const NOW=1800000000;
function incoming(id='mvp-066-0001'){
 return new Request('https://example.test/api/integraciones/whapi',{
  method:'POST',
  headers:{'content-type':'application/json',
   'x-cotironda-webhook-key':SECRET},
  body:JSON.stringify({
   event:{type:'messages',event:'post'},channel_id:C,messages:[{
    id,from_me:false,from:NUMBER,chat_id:CHAT,
    type:'text',timestamp:NOW,
    text:{body:'20 bolsas cemento CPC 50kg'}
   }]
  })
 });
}
function setup(){
 const written={buyer:[],supplier:[]};
 const state={buyer:null,supplier:null};
 const dep={
  habilitado:true,exigirAmbosRoles:true,canalId:C,
  secretoWebhook:SECRET,ahoraUnix:()=>NOW,
  resolverProveedor:async()=>state.supplier,
  persistirEntrada:async entry=>{
   written.supplier.push(entry);
   return 'guardada';
  },
  registrarBaja:async()=> 'registrada',
  resolverComprador:async()=>state.buyer,
  persistirEntradaComprador:async entry=>{
   written.buyer.push(entry);
   return 'guardada';
  },
  registrarBajaComprador:async()=> 'registrada'
 };
 return {dep,state,written,run:()=>procesarWebhookWhapiAislado(incoming(),dep)};
}

test('MVP066 piloto con puerto comprador faltante => 503 y cero cotizaciones',async()=>{
 const x=setup();
 x.state.supplier={supplierOrgId:SUPPLIER,roundId:ROUND,
  consentimientoVigente:true,invitacionVigente:true};
 delete x.dep.resolverComprador;
 const r=await x.run();
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,'canal_doble_rol_no_configurado');
 assert.equal(x.written.supplier.length,0);
});

test('MVP066 piloto sin opt-out comprador => 503 antes de escribir',async()=>{
 const x=setup();
 x.state.buyer={buyerOrgId:BUYER,
  consentimientoContactoVigente:true,chatHabilitado:true};
 delete x.dep.registrarBajaComprador;
 assert.equal((await x.run()).status,503);
 assert.equal(x.written.buyer.length,0);
});

test('MVP066 el número del arquitecto entra SOLO por inbox comprador',async()=>{
 const x=setup();
 x.state.buyer={buyerOrgId:BUYER,
  consentimientoContactoVigente:true,chatHabilitado:true};
 const r=await x.run();
 assert.equal(r.status,200);
 const answer=await r.json();
 assert.equal(answer.compradoresGuardados,1);
 assert.equal(answer.presupuestosConfirmados,0);
 assert.equal(answer.mensajesEnviados,0);
 assert.equal(x.written.buyer.length,1);
 assert.equal(x.written.supplier.length,0);
 assert.equal(x.written.buyer[0].compradorOrgId,BUYER);
});

test('MVP066 el número del negocio entra SOLO por inbox proveedor y ronda',async()=>{
 const x=setup();
 x.state.supplier={supplierOrgId:SUPPLIER,roundId:ROUND,
  consentimientoVigente:true,invitacionVigente:true};
 const r=await x.run();
 assert.equal(r.status,200);
 assert.equal(x.written.supplier.length,1);
 assert.equal(x.written.buyer.length,0);
 assert.equal(x.written.supplier[0].proveedorOrgId,SUPPLIER);
 assert.equal(x.written.supplier[0].rondaId,ROUND);
});

test('MVP066 número no registrado y doble rol jamás disparan acciones',async()=>{
 for(const dual of [false,true]){
  const x=setup();
  if(dual){
   x.state.buyer={buyerOrgId:BUYER,
    consentimientoContactoVigente:true,chatHabilitado:true};
   x.state.supplier={supplierOrgId:SUPPLIER,roundId:ROUND,
    consentimientoVigente:true,invitacionVigente:true};
  }
  const r=await x.run();
  assert.equal(r.status,403);
  assert.equal(x.written.buyer.length,0);
  assert.equal(x.written.supplier.length,0);
 }
});

test('MVP066 receptor histórico proveedor-only sigue disponible sin nuevo gate',async()=>{
 const x=setup();
 x.dep.exigirAmbosRoles=false;
 delete x.dep.resolverComprador;
 delete x.dep.persistirEntradaComprador;
 delete x.dep.registrarBajaComprador;
 x.state.supplier={supplierOrgId:SUPPLIER,roundId:ROUND,
  consentimientoVigente:true,invitacionVigente:true};
 const r=await x.run();
 assert.equal(r.status,200);
 assert.equal(x.written.supplier.length,1);
});
