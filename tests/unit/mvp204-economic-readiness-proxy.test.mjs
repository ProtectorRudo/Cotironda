import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../../piloto/seguimiento-web/api/estado.js',import.meta.url),'utf8');
const start=script.indexOf('function buyerView(parsed){');
const end=script.indexOf('export default async function handler',start);
assert.ok(start>=0&&end>start);
const view=vm.runInNewContext(script.slice(start,end)+'\nbuyerView',{}, {timeout:1000});
const payload=()=>({
 state:'closed',can_open:true,received_count:2,
 offers:[{label:'Presupuesto 1',text:'Revisado A'},
   {label:'Presupuesto 2',text:'Revisado B'}],
 economy:{
  state:'economia_observada_sin_ranking',quotations:2,
  iva_not_informed:2,freight_not_informed:1,freight_to_agree:1,
  stock_unverified:2,payment_not_informed:1,net_unverified:2,
  delivery_unverified:2,minimum_unverified:2,
  ranking_allowed:false,price_comparable:false,contacts_revealed:false
 },
 item_prices:{
  state:'importes_por_articulo_sin_ranking',quotations:2,requested_items:2,
  articulos:[
   {itemId:'item_001',descripcionSolicitada:'Arena',cantidadSolicitada:'1.000',
    unidadSolicitada:'m3',referencias:[
     {oferta:'Presupuesto 1',importeCotizado:'$ 120,00',cantidadCotizadaLiteral:'1,00',
      estado:'alternativa_comercial_con_aclaracion',iva:'sin_iva_por_convencion'},
     {oferta:'Presupuesto 2',importeCotizado:null,cantidadCotizadaLiteral:null,
      estado:'no_homologable',iva:'sin_iva_por_convencion'}]},
   {itemId:'item_002',descripcionSolicitada:'Piedra',cantidadSolicitada:'2.000',
    unidadSolicitada:'m3',referencias:[
     {oferta:'Presupuesto 1',importeCotizado:'$ 250,00',cantidadCotizadaLiteral:'2,00',
      estado:'coincide_volumen_nominal_sin_stock',iva:'sin_iva_por_convencion'},
     {oferta:'Presupuesto 2',importeCotizado:'$ 180,00',cantidadCotizadaLiteral:'2,00',
      estado:'alternativa_comercial_con_aclaracion',iva:'sin_iva_por_convencion'}]}
  ],ranking_allowed:false,price_comparable:false,contacts_revealed:false,
  adjudicacion:false,originales_descargables:false,
  IVA_calculado:false,flete_calculado:false,stock_confirmado:false
 },
 economic_readiness:{
  state:'condiciones_por_oferta_sin_ranking',quotations:2,requested_items:2,
  ofertas:[
   {oferta:'Presupuesto 1',articulosConImporte:2,articulosSolicitados:2,
    iva:'no_informado',flete:'no_informado',pago:'no_informado',
    moneda:'no_acreditada',stockCorroborado:false,
    plazoCorroborado:false,minimoCorroborado:false},
   {oferta:'Presupuesto 2',articulosConImporte:1,articulosSolicitados:2,
    iva:'no_informado',flete:'a_convenir',pago:'contado',
    moneda:'no_acreditada',stockCorroborado:false,
    plazoCorroborado:false,minimoCorroborado:false}
  ],
  ranking_allowed:false,price_comparable:false,contacts_revealed:false,
  tax_calculated:false,freight_calculated:false,stock_confirmed:false,
  automatic_award:false,originals_downloadable:false
 }
});
const safe=x=>JSON.parse(JSON.stringify(view(x)));

test('MVP204 proxy: permite estados económicos de ambas ofertas sin identidad ni rango',()=>{
 const d=payload();
 d.economic_readiness.ofertas[0].supplier_key='CONFIDENCIAL';
 d.economic_readiness.total_final='$0';
 d.economic_readiness.whatsapp='549999';
 const r=safe(d);
 assert.ok(r.economic_readiness);
 assert.deepEqual(r.economic_readiness.ofertas.map(x=>[x.oferta,x.articulosConImporte]),
  [['Presupuesto 1',2],['Presupuesto 2',1]]);
 assert.equal(r.economic_readiness.price_comparable,false);
 assert.equal(r.economic_readiness.ofertas[0].iva,'no_informado');
 assert.equal(r.offers.length,2);
 for(const secret of ['CONFIDENCIAL','total_final','whatsapp','549999',
  'sourceSha256','messageHmac','supplier_key'])
  assert.equal(JSON.stringify(r).includes(secret),false,secret);
});

test('MVP204 proxy: proyección falsificada nunca llega al comprador',()=>{
 const changes=[
  d=>d.economic_readiness.price_comparable=true,
  d=>d.economic_readiness.automatic_award=true,
  d=>d.economic_readiness.ofertas[0].oferta='Otra empresa',
  d=>d.economic_readiness.ofertas[0].articulosConImporte=1,
  d=>d.economic_readiness.ofertas[1].articulosConImporte=2,
  d=>d.economic_readiness.ofertas[0].moneda='ARS',
  d=>d.economic_readiness.ofertas[0].stockCorroborado=true,
  d=>d.economic_readiness.ofertas[0].pago='tarjeta',
  d=>d.economic_readiness.ofertas[1].flete='sin_flete_por_defecto',
  d=>d.economy.iva_not_informed=1,
  d=>d.economy.freight_to_agree=0,
  d=>d.item_prices.articulos[0].referencias[0].importeCotizado=null,
  d=>d.item_prices.articulos[1].referencias[1].oferta='Ataque'
 ];
 for(const change of changes){
  const d=payload();change(d);
  const r=safe(d);
  assert.equal(r.economic_readiness,undefined,String(change));
  assert.equal(r.offers.length,2);
 }
});

test('MVP204 proxy: antes de cierre o token revocado no entrega condiciones por oferta',()=>{
 for(const change of [
  d=>d.state='waiting',
  d=>d.can_open=false,
  d=>d.state='cancelled',
  d=>d.item_prices.price_comparable=true
 ]){
  const d=payload();change(d);
  const r=safe(d);assert.equal(r.economic_readiness,undefined);
 }
});
