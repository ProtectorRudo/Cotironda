import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const api=readFileSync(new URL('../../piloto/seguimiento-web/api/estado.js',
 import.meta.url),'utf8');
const buyerView=vm.runInNewContext(api.slice(0,api.indexOf('export default'))+
 '\n buyerView;',{}, {timeout:1000});
const labels=['Presupuesto 1','Presupuesto 2'];
function fixture(){
 const references=labels.map(oferta=>({oferta,importeCotizado:null,
  cantidadCotizadaLiteral:null,estado:'sin_importe_asignable',
  iva:'sin_iva_por_convencion'}));
 return {
  state:'waiting',can_open:true,received_count:2,
  offers:labels.map(label=>({label,text:'COTIRONDA · Presupuesto anónimo'})),
  economy:{state:'economia_observada_sin_ranking',quotations:2,
   iva_not_informed:2,freight_not_informed:2,freight_to_agree:0,
   stock_unverified:2,payment_not_informed:2,net_unverified:2,
   delivery_unverified:2,minimum_unverified:2,
   ranking_allowed:false,price_comparable:false,contacts_revealed:false},
  item_prices:{state:'importes_por_articulo_sin_ranking',quotations:2,
   requested_items:3,
   articulos:[['item_001','Cemento','bag'],['item_002','Pintura','unit'],
    ['item_003','Cable','m']].map(([itemId,descripcionSolicitada,unidadSolicitada])=>({
    itemId,descripcionSolicitada,unidadSolicitada,
    cantidadSolicitada:'2.000',referencias:structuredClone(references)
   })),
   ranking_allowed:false,price_comparable:false,contacts_revealed:false,
   adjudicacion:false,originales_descargables:false,
   IVA_calculado:false,flete_calculado:false,stock_confirmado:false},
  rubros:{state:'rubros_por_articulo',
   items:[{itemId:'item_001',rubro:'obra_gruesa'},
    {itemId:'item_002',rubro:'pintura'},
    {itemId:'item_003',rubro:'electricidad'}],
   ranking_allowed:false,contacts_revealed:false,automatic_award:false}
 };
}
test('MVP218 proxy: solo enum/itemId, sin identidad ni contacto',()=>{
 const d=fixture();
 const view=buyerView(d);
 assert.deepEqual(JSON.parse(JSON.stringify(view.rubros.items)),
  d.rubros.items);
 assert.equal(view.rubros.state,'rubros_por_articulo');
 assert.equal(view.item_prices.articulos.length,3);
 const response=JSON.stringify(view);
 assert.doesNotMatch(response,/sourceSha256|contactPhone|chat_hmac|storage_path/);
});
test('MVP218 proxy: rubro extra/PII, orden cambiado o desconocido no atraviesa',()=>{
 const modifications=[
  d=>d.rubros.items[0].telefono='2215551234',
  d=>d.rubros.items[0].itemId='item_099',
  d=>d.rubros.items[1].rubro='prov_nombre_real',
  d=>d.rubros.items.pop(),
  d=>d.rubros.contacts_revealed=true,
  d=>d.rubros.ranking_allowed=true,
  d=>d.rubros.automatic_award=true
 ];
 for(const change of modifications){
  const d=fixture();change(d);
  const view=buyerView(d);
  assert.equal(view?.rubros,undefined);
  assert.equal(view?.item_prices?.articulos?.length,3);
 }
});
test('MVP218 proxy: deniega mapa completo para token revocado',()=>{
 const d=fixture();d.can_open=false;
 const view=buyerView(d);
 assert.equal(view.rubros,undefined);
 assert.equal(view.item_prices,undefined);
 assert.deepEqual(JSON.parse(JSON.stringify(view)),{state:'waiting',can_open:false,
  received_count:2});
});
