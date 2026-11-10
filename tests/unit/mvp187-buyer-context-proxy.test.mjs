import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const path=new URL('../../piloto/seguimiento-web/api/estado.js',import.meta.url);
const source=readFileSync(path,'utf8');
const start=source.indexOf('function buyerView(parsed){');
const end=source.indexOf('export default async function handler',start);
assert.ok(start>=0&&end>start);
const buyerView=vm.runInNewContext(
 source.slice(start,end)+'\nbuyerView',Object.create(null),{timeout:1000}
);

const econ=()=>({
 state:'economia_observada_sin_ranking',quotations:2,
 iva_not_informed:2,freight_not_informed:2,freight_to_agree:0,
 stock_unverified:2,payment_not_informed:2,net_unverified:2,
 delivery_unverified:2,minimum_unverified:2,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
});
const base=()=>({
 state:'waiting',can_open:true,received_count:2,
 offers:[{label:'Presupuesto 1',text:'anónimo uno'},
         {label:'Presupuesto 2',text:'anónimo dos'}],
 economy:econ(),
 item_prices:{
  state:'importes_por_articulo_sin_ranking',quotations:2,
  requested_items:1,
  articulos:[{
   itemId:'item_001',descripcionSolicitada:'Arena fina para obra',
   cantidadSolicitada:'2.000',unidadSolicitada:'m3',
   referencias:[
    {oferta:'Presupuesto 1',importeCotizado:'$ 120,00',
      cantidadCotizadaLiteral:'2,00',
      estado:'alternativa_comercial_con_aclaracion',
      iva:'sin_iva_por_convencion'},
    {oferta:'Presupuesto 2',importeCotizado:'$ 115,00',
      cantidadCotizadaLiteral:'40',
      estado:'coincide_volumen_nominal_sin_stock',
      iva:'sin_iva_declarado'}
   ]
  }],
  ranking_allowed:false,price_comparable:false,contacts_revealed:false,
  adjudicacion:false,originales_descargables:false,IVA_calculado:false,
  flete_calculado:false,stock_confirmado:false
 }
});
const safe=payload=>JSON.parse(JSON.stringify(buyerView(payload)));

test('MVP187: la API incluye solo el material del comprador y la cantidad de origen',()=>{
 const input=base();
 input.item_prices.articulos[0].supplier_key='secreto';
 input.item_prices.articulos[0].sourceSha256='a'.repeat(64);
 input.item_prices.articulos[0].referencias[0].phone='5491112345678';
 const result=safe(input);
 assert.equal(result.item_prices.articulos.length,1);
 assert.equal(result.item_prices.articulos[0].descripcionSolicitada,'Arena fina para obra');
 assert.equal(result.item_prices.articulos[0].cantidadSolicitada,'2.000');
 assert.equal(result.item_prices.articulos[0].unidadSolicitada,'m3');
 assert.equal(result.item_prices.articulos[0].referencias[1].cantidadCotizadaLiteral,'40');
 const whole=JSON.stringify(result);
 for(const value of ['secreto','sourceSha256','5491112345678'])
  assert.equal(whole.includes(value),false,value);
 assert.equal(result.item_prices.ranking_allowed,false);
 assert.equal(result.item_prices.adjudicacion,false);
});

test('MVP187: no se filtra el resto del pedido ante datos falsos o ajenos',()=>{
 const bad=[
  p=>p.item_prices.articulos[0].descripcionSolicitada='',
  p=>p.item_prices.articulos[0].descripcionSolicitada='x'.repeat(501),
  p=>p.item_prices.articulos[0].cantidadSolicitada='1e99',
  p=>p.item_prices.articulos[0].unidadSolicitada='ARS',
  p=>p.item_prices.articulos[0].referencias[0].cantidadCotizadaLiteral=null,
  p=>p.item_prices.articulos[0].referencias[0].cantidadCotizadaLiteral='40 bolsas',
  p=>p.item_prices.articulos[0].referencias[0].cantidadCotizadaLiteral='40<script>',
  p=>p.item_prices.articulos[0].referencias[0].oferta='Otro proveedor',
  p=>p.item_prices.contacts_revealed=true
 ];
 for(const patch of bad){
  const p=base();patch(p);
  const result=safe(p);
  assert.equal('item_prices' in result,false);
  assert.equal(result.offers.length,2);
 }
});

test('MVP187: precio no asignable mantiene cantidad nula y la oferta visible',()=>{
 const p=base();
 const ref=p.item_prices.articulos[0].referencias[0];
 ref.importeCotizado=null;ref.cantidadCotizadaLiteral=null;
 ref.estado='sin_importe_asignable';
 const result=safe(p);
 assert.equal(result.item_prices.articulos[0].referencias[0].importeCotizado,null);
 assert.equal(result.item_prices.articulos[0].referencias[0].cantidadCotizadaLiteral,null);
});

test('MVP187: estado revocado, acceso denegado o resumen económico ajeno no muestra precios',()=>{
 for(const mutate of [
  p=>{p.state='not_found';p.can_open=false},
  p=>{p.can_open=false},
  p=>{p.economy.quotations=3},
  p=>{p.item_prices.quotations=4}
 ]){
  const p=base();mutate(p);
  const result=safe(p);
  assert.equal('item_prices' in result,false);
 }
});
