import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPuertoRecepcionDirectaD059}
 from '../../src/server/whapi-quote-direct-postgres-d059.ts';

const valid={
 channel:'whapi_ci',messageKey:'a'.repeat(64),expectedRevision:0,
 quote:{currency:'ARS',payment_method:null,lead_days:null,
  freight_gross:null,min_goods_gross:null,
  lines_snapshot:[{line_no:1,unit:'bag',available_qty:'20',
   net_unit_price:null,vat_rate:null}]}
};
const ok={state:'offer_received',revision:1,version:1,repeated:false};
test('MVP-009 server: una cotización sin IVA, precio normalizado, flete ni pago se registra',async()=>{
 const calls=[];
 const gateway=crearPuertoRecepcionDirectaD059({
  query:async(sql,params)=>{calls.push({sql,params});return{rows:[{payload:ok}]}}
 });
 const result=await gateway.registrar(valid);
 assert.deepEqual(result,{estado:'cotizacion_recibida_sin_confirmacion_extra',
  revision:1,version:1,repetido:false});
 assert.equal(calls.length,1);
 assert.equal(calls[0].sql,
  'select cotironda_private.whapi_receive_quote_d059($1::text,$2::text,$3::integer,$4::jsonb) as payload');
 assert.deepEqual(calls[0].params.slice(0,3),
  [valid.channel,valid.messageKey,0]);
 assert.equal(typeof calls[0].params[3],'string');
 assert.equal(JSON.parse(calls[0].params[3]).lines_snapshot[0].net_unit_price,null);
 assert.equal(JSON.parse(calls[0].params[3]).freight_gross,null);
 assert.ok(Object.isFrozen(result));
 assert.doesNotMatch(JSON.stringify(result),/Confirmo|cotizacion_confirmada/);
});
test('MVP-009 server: corrección posterior y replay son recibos versionados sin confirmar',async()=>{
 const gateway=crearPuertoRecepcionDirectaD059({
  query:async(_sql,params)=>({rows:[{payload:{
   state:'offer_received',revision:params[2]+1,version:params[2]+1,
   repeated:params[2]===0
  }}]})
 });
 const first=await gateway.registrar(valid);
 assert.equal(first.repetido,true);
 const second=await gateway.registrar({...valid,messageKey:'b'.repeat(64),
  expectedRevision:1});
 assert.equal(second.version,2);
 assert.equal(second.repetido,false);
});
test('MVP-009 server: no acepta IDs de proveedor, WhatsApp o cambios de esquema en input',async()=>{
 let calls=0;
 const gateway=crearPuertoRecepcionDirectaD059({query:async()=>{calls++;return{rows:[{payload:ok}]}}});
 for(const args of [
  {...valid,supplierOrgId:'bbbbbbbb-0000-4000-8000-000000000201'},
  {...valid,channel:'bad channel'},
  {...valid,messageKey:'notsha'},
  {...valid,expectedRevision:-1},
  {...valid,expectedRevision:100000},
  {...valid,quote:{...valid.quote,phone:'54922100000'}},
  {...valid,quote:{...valid.quote,currency:'EUR'}},
  {...valid,quote:{...valid.quote,freight_gross:'0,00'}},
  {...valid,quote:{...valid.quote,lines_snapshot:[]}},
  {...valid,quote:{...valid.quote,lines_snapshot:[
   valid.quote.lines_snapshot[0],valid.quote.lines_snapshot[0]]}},
  {...valid,quote:{...valid.quote,lines_snapshot:[
   {...valid.quote.lines_snapshot[0],equivalencia:'verificada'}]}},
  {...valid,quote:{...valid.quote,lines_snapshot:[
   {...valid.quote.lines_snapshot[0],net_unit_price:'-20.00'}]}}
 ]){
  await assert.rejects(gateway.registrar(args),/d059_cotizacion_no_disponible/);
 }
 assert.equal(calls,0,'no SQL con input inválido');
});
test('MVP-009 server: rechaza respuestas DB ambiguas o adulteradas sin éxito falso',async()=>{
 for(const response of [
  null,{rows:[]},{rows:[{payload:ok},{payload:ok}]},
  {rows:[{wrong:ok}]},{rows:[{payload:null}]},
  {rows:[{payload:{...ok,state:'offer_confirmed'}}]},
  {rows:[{payload:{...ok,revision:2}}]},
  {rows:[{payload:{...ok,version:'1'}}]},
  {rows:[{payload:{...ok,repeated:'false'}}]},
  {rows:[{payload:{...ok,extra:true}}]}
 ]){
  const gateway=crearPuertoRecepcionDirectaD059({query:async()=>response});
  await assert.rejects(gateway.registrar(valid),/d059_cotizacion_no_disponible/);
 }
});
test('MVP-009 server: cualquier fallo SQL se oculta y nunca se reintenta solo',async()=>{
 let sent=0;
 const gateway=crearPuertoRecepcionDirectaD059({query:async()=>{
  sent++;throw new Error('sensitive_db_error_supplier_identifiers');
 }});
 await assert.rejects(gateway.registrar(valid),e=>
  e.message==='d059_cotizacion_no_disponible');
 assert.equal(sent,1);
});
