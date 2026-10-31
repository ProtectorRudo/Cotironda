import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPuertoRecepcionDirectaD059}
 from '../../src/server/whapi-quote-direct-postgres-d059.ts';
const quote={currency:'ARS',payment_method:null,lead_days:null,
 freight_gross:null,min_goods_gross:null,
 lines_snapshot:[{line_no:1,unit:'bag',available_qty:'20',
   net_unit_price:null,vat_rate:null}]};
const prices=[{line_no:1,quoted_unit_price:'121.00',
 vat_basis:'no_informado',source_line_no:2,source_sha256:'a'.repeat(64)}];
const args={channel:'whapi_ci',messageKey:'b'.repeat(64),expectedRevision:0,quote,prices};
const receipt={state:'offer_received',revision:1,version:1,repeated:false,
 prices_preserved:true};
test('D060 server conserva precio literal aun sin IVA; nunca inventa neto',async()=>{
 let called=0;
 const p=crearPuertoRecepcionDirectaD059({query:async(sql,parameters)=>{
  called++;
  assert.equal(sql,'select cotironda_private.whapi_receive_with_prices_d060($1::text,$2::text,$3::integer,$4::jsonb,$5::jsonb) as payload');
  assert.equal(parameters[0],'whapi_ci');
  assert.equal(parameters[1],'b'.repeat(64));
  assert.equal(parameters[2],0);
  assert.equal(JSON.parse(parameters[3]).lines_snapshot[0].net_unit_price,null);
  assert.equal(JSON.parse(parameters[4])[0].quoted_unit_price,'121.00');
  assert.equal(JSON.parse(parameters[4])[0].vat_basis,'no_informado');
  return {rows:[{payload:receipt}]};
 }});
 assert.deepEqual(await p.registrarConPrecios(args),{
  estado:'cotizacion_recibida_sin_confirmacion_extra',
  revision:1,version:1,repetido:false});
 assert.equal(called,1);
});
test('D060 server rechaza precios fuente sin cita, montos e IVA indebido',async()=>{
 let count=0;
 const port=crearPuertoRecepcionDirectaD059({query:async()=>{count++;return{rows:[{payload:receipt}]}}});
 const bad=[
  {...args,prices:[{...prices[0],source_sha256:null}]},
  {...args,prices:[{...prices[0],source_line_no:0}]},
  {...args,prices:[{...prices[0],source_line_no:161}]},
  {...args,prices:[{...prices[0],quoted_unit_price:'121,00'}]},
  {...args,prices:[{...prices[0],quoted_unit_price:'-1.00'}]},
  {...args,prices:[{...prices[0],vat_basis:'free'}]},
  {...args,prices:[{...prices[0],line_no:2}]},
  {...args,prices:[{...prices[0],supplierOrgId:'spoofed'}]},
  {...args,prices:[{...prices[0],quoted_unit_price:null}]},
  {...args,quote:{...quote,lines_snapshot:[{
   ...quote.lines_snapshot[0],net_unit_price:'121.00'
  }]}},
  {...args,prices:[]},
  {...args,extra:'outside'},
  {...args,expectedRevision:-1}
 ];
 for(const value of bad)
  await assert.rejects(port.registrarConPrecios(value),/d059_cotizacion_no_disponible/);
 assert.equal(count,0);
});
test('D060 server admite tasa incluida o no incluida cuando no inventa impuestos',async()=>{
 const queries=[];
 const port=crearPuertoRecepcionDirectaD059({query:async(sql,params)=>{
  queries.push({sql,params});return{rows:[{payload:receipt}]};
 }});
 await port.registrarConPrecios({...args,prices:[{...prices[0],vat_basis:'incluido'}]});
 await port.registrarConPrecios({...args,
  quote:{...quote,lines_snapshot:[{...quote.lines_snapshot[0],net_unit_price:'121.00'}]},
  prices:[{...prices[0],vat_basis:'no_incluido'}]});
 assert.equal(queries.length,2);
});
test('D060 server rechaza recibo DB que no garantiza persistencia de evidencia',async()=>{
 for(const raw of [
  {...receipt,prices_preserved:false},
  {...receipt,prices_preserved:null},
  {...receipt,state:'offer_confirmed'},
  {...receipt,revision:2},
  {...receipt,extra:'untrusted'},
  null
 ]){
  const port=crearPuertoRecepcionDirectaD059({
   query:async()=>({rows:[{payload:raw}]})
  });
  await assert.rejects(port.registrarConPrecios(args),/d059_cotizacion_no_disponible/);
 }
});
test('D060 server no filtra error SQL interno ni reintenta solo',async()=>{
 let n=0;
 const port=crearPuertoRecepcionDirectaD059({query:async()=>{
  n++;throw Error('provider_id_secret');
 }});
 await assert.rejects(port.registrarConPrecios(args),
  e=>e.message==='d059_cotizacion_no_disponible');
 assert.equal(n,1);
});
