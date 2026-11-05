import test from 'node:test';
import assert from 'node:assert/strict';
import {vistaCotizacionesRubrosMvp227} from
 '../../src/domain/ia-central/vista-comprador-rubros-mvp227.ts';

const source={
 state:'rubros_por_articulo',recibidos:2,pendientes_revision:1,
 items:[
  {itemId:'item_1',descripcion:'Cemento CPC bolsa 50kg',cantidad:'20',unidad:'bag',rubro:'obra_gruesa'},
  {itemId:'item_2',descripcion:'Arena bolsón',cantidad:'3',unidad:'m3',rubro:'obra_gruesa'},
  {itemId:'item_3',descripcion:'Pintura látex 5L',cantidad:'2',unidad:'unit',rubro:'pintura'},
  {itemId:'item_4',descripcion:'Cable 2,5 mm',cantidad:'50',unidad:'m',rubro:'electricidad'}
 ],
 ofertas:[
  {label:'Presupuesto 1',moneda:'ARS',iva:'no_informado',
   flete:'no_informado',pago:'no_informado',
   rubros:[{rubro:'obra_gruesa',solicitados:1,respondidos:1,cobertura:'completa'}],
   precios:[{pedidoId:'item_1',centavos:'17800000'}]},
  {label:'Presupuesto 2',moneda:'ARS',iva:'sin_iva_explicito',
   flete:'a_convenir',pago:'transferencia',
   rubros:[{rubro:'pintura',solicitados:1,respondidos:1,cobertura:'completa'}],
   precios:[{pedidoId:'item_3',centavos:'9800050'}]}
 ]
};
test('MVP227: agrupa cotizaciones verificadas por rubro y deja faltantes',()=>{
 const r=vistaCotizacionesRubrosMvp227(source);
 assert.ok(r);
 assert.equal(r.received_count,2);
 assert.equal(r.files_pending_review,1);
 assert.equal(r.offers.length,2);
 assert.match(r.offers[0].label,/Obra gruesa/u);
 assert.match(r.offers[0].text,/178\.000,00/u);
 assert.match(r.offers[0].text,/2 solicitados en el rubro completo/u);
 assert.match(r.offers[0].text,/Arena bolsón.*Sin precio directamente comparable/u);
 assert.match(r.offers[1].label,/Pintura/u);
 assert.match(r.offers[1].text,/98\.000,50/u);
 assert.equal(r.rubros_ia.find(x=>x.rubro==='electricidad').ofertas,0);
 assert.equal(r.rubros_ia.find(x=>x.rubro==='obra_gruesa').ofertas,1);
 assert.doesNotMatch(JSON.stringify(r),/corralon_|whatsapp|contacto|HMAC|SHA|ranking|ganador|teléfono/iu);
});
test('MVP227: permite oferta parcial de rubro aunque el pedido tenga más líneas',()=>{
 const partial=structuredClone(source);
 partial.ofertas[0].rubros[0].cobertura='parcial';
 partial.ofertas[0].rubros[0].respondidos=0;
 partial.ofertas[0].precios=[];
 const r=vistaCotizacionesRubrosMvp227(partial);
 assert.ok(r);
 assert.match(r.offers[0].text,/Cotizó 0 de 1 artículos asignados/u);
});
test('MVP227: rechazamos acceso a token/estado inválido y datos alterados',()=>{
 for(const mutate of [
  x=>x.state='not_found',
  x=>x.ofertas[0].label='Corralon Ailin',
  x=>x.ofertas[0].precios[0].centavos='1.000,33',
  x=>x.ofertas[0].precios[0].pedidoId='item_900',
  x=>x.items[0].rubro='corralon',
  x=>x.ofertas[0].rubros[0].solicitados=3,
  x=>x.items[0].itemId=x.items[1].itemId,
  x=>x.ofertas[0].precios.push(x.ofertas[0].precios[0])
 ]){
  const c=structuredClone(source);mutate(c);
  assert.equal(vistaCotizacionesRubrosMvp227(c),null);
 }
});
test('MVP227: dos proveedores pueden cotizar rubro compartido sin ranking global',()=>{
 const c=structuredClone(source);
 c.ofertas[1].rubros=[{rubro:'obra_gruesa',solicitados:1,respondidos:1,cobertura:'completa'}];
 c.ofertas[1].precios=[{pedidoId:'item_2',centavos:'7500000'}];
 const r=vistaCotizacionesRubrosMvp227(c);
 assert.ok(r);
 assert.equal(r.rubros_ia.find(x=>x.rubro==='obra_gruesa').ofertas,2);
 assert.equal(r.offers.length,2);
 assert.ok(r.offers.every(x=>!x.text.includes('ganador')&&!/\bpuesto\s+[1-9]/iu.test(x.label)));
});
