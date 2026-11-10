import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resumirImportesCotizadosCompradorMvp186 as itemPrices} from
 '../../src/domain/resumen-importes-cotizados-mvp186.ts';
import {resumirMaterialesCotizadosCompradorMvp210 as preview} from
 '../../src/domain/materiales-cotizados-comprador-mvp210.ts';
import {resumirCondicionesEconomicasPorOfertaMvp204 as terms} from
 '../../src/domain/condiciones-economicas-por-oferta-mvp204.ts';
const data=JSON.parse(readFileSync(new URL(
 '../fixtures/mvp199-pilot-shape-anonymized.json',import.meta.url),'utf8'));
const clone=x=>structuredClone(x);

function sample(i=0){
 const source=clone(data.rounds[i].input);
 source.quotations.forEach((q,n)=>q.publicText='ANON_V9_'+n);
 const offers=[{label:'Presupuesto 1',text:'ANON_V9_1'},
  {label:'Presupuesto 2',text:'ANON_V9_0'}];
 const c=source.quotations.map(q=>q.economia.condiciones);
 const economy={
  state:'economia_observada_sin_ranking',quotations:2,
  iva_not_informed:c.filter(x=>x.iva.estado==='no_informado').length,
  freight_not_informed:c.filter(x=>x.flete.estado==='no_informado').length,
  freight_to_agree:c.filter(x=>x.flete.estado==='a_convenir').length,
  payment_not_informed:c.filter(x=>x.pago.estado==='no_informado').length,
  stock_unverified:2,net_unverified:2,delivery_unverified:2,
  minimum_unverified:2,ranking_allowed:false,price_comparable:false,
  contacts_revealed:false
 };
 return {source,status:{state:'closed',can_open:true,offers,economy}};
}

test('MVP210: las 4 fuentes reales anonimizadas muestran por qué NO se pueden ordenar sus totales',()=>{
 for(let i=0;i<2;i++){
  const {source,status}=sample(i);
  const prices=itemPrices(status,source);
  assert.ok(prices);
  const output=preview(status,source,prices);
  assert.ok(output,data.rounds[i].caseLabel);
  assert.equal(output.state,'referencia_materiales_sin_precio_final');
  assert.deepEqual(output.ofertas.map(x=>x.oferta),
   ['Presupuesto 1','Presupuesto 2']);
  assert.equal(output.opciones.length,0);
  assert.ok(output.ofertas.every(x=>x.motivo==='moneda_sin_acreditar'));
  for(const flag of ['ranking_final','iva_calculado','flete_calculado',
   'stock_confirmado','contactos_revelados','adjudicacion',
   'originales_descargables','whatsapp_enviado'])
   assert.equal(output[flag],false);
  const body=JSON.stringify(output);
  for(const q of source.quotations){
   assert.equal(body.includes(q.doc.messageHmac),false,'HMAC');
   assert.equal(body.includes(q.doc.sourceSha256),false,'SHA');
   assert.equal(body.includes(q.doc.declaredTotalLiteral),false,'total original');
  }
  assert.equal(body.includes('supplier_key'),false);
 }
});

test('MVP210: el orden SQL HMAC no cambia precios ni identidad de ofertas del comprador',()=>{
 const {source,status}=sample();
 const r1=preview(status,source,itemPrices(status,source));
 source.quotations.reverse();
 const r2=preview(status,source,itemPrices(status,source));
 assert.ok(r1&&r2);
 assert.deepEqual(r1,r2);
});

test('MVP210: ronda abierta, comprador sin acceso o token revocado NO reciben comparaciones',()=>{
 for(const modify of [
  ctx=>ctx.status.state='waiting',
  ctx=>ctx.status.can_open=false,
  ctx=>ctx.status.state='not_found',
  ctx=>ctx.status.offers[0].text='TEXTO AJENO',
  ctx=>ctx.status.offers[1].label=ctx.status.offers[0].label,
  ctx=>ctx.source.quotations[0].doc.prueba.version=8,
  ctx=>ctx.source.quotations[0].fuente.sourceSha256='f'.repeat(64)
 ]){
  const ctx=sample();
  const prices=itemPrices(ctx.status,ctx.source);
  modify(ctx);
  assert.equal(preview(ctx.status,ctx.source,prices),null,String(modify));
 }
});

test('MVP210: manipular una cotización, un importe asociado o un registro de descuento falla cerrado',()=>{
 for(const modify of [
  x=>x.prices.articulos[0].referencias[0].importeCotizado='$ 0,00',
  x=>x.prices.articulos[0].referencias[0].oferta='Oferta inventada',
  x=>x.prices.articulos.pop(),
  x=>x.source.quotations[0].economia.descuentos.precios[0].fila=500,
  x=>x.source.quotations[0].doc.prueba.revisionVigente=false
 ]){
  const {source,status}=sample();
  const prices=clone(itemPrices(status,source));
  const x={source,status,prices};
  modify(x);
  assert.equal(preview(status,source,prices),null,String(modify));
 }
});

test('MVP210: prefijos explícitos AR$ de documentos v9 sobreviven a MVP186 y MVP204',()=>{
 const {source,status}=sample(0);
 for(const q of source.quotations){
  const prefix=t=>t.replace(/^\s*\$\s*/u,'AR$ ');
  q.doc.declaredTotalLiteral=prefix(q.doc.declaredTotalLiteral);
  for(const l of q.doc.lineas){
   l.unitPriceLiteral=prefix(l.unitPriceLiteral);
   l.lineTotalLiteral=prefix(l.lineTotalLiteral);
  }
 }
 const prices=itemPrices(status,source);
 assert.ok(prices,'MVP186 must not drop explicit currency amounts');
 const economic=terms(status,source,prices);
 assert.ok(economic);
 assert.deepEqual(economic.ofertas.map(x=>x.moneda),['ARS','ARS']);
 const r=preview(status,source,prices);
 assert.ok(r);
 assert.equal(r.ofertas.length,2);
 assert.ok(r.ofertas.every(x=>x.motivo!=='moneda_sin_acreditar'));
 assert.ok(r.opciones.every(x=>x.moneda==='ARS'));
});

test('MVP210: canasta AR$ positiva con volumen nominal de árido acreditado en v9',()=>{
 const {source,status}=sample(0);
 const q=source.quotations[0];
 source.requestItems=source.requestItems.slice(0,1);
 source.quotations=[q];
 status.offers=[{label:'Presupuesto 1',text:'ANON_V9_0'}];
 status.economy.quotations=1;
 status.economy.iva_not_informed=1;
 status.economy.freight_not_informed=1;
 status.economy.freight_to_agree=0;
 status.economy.payment_not_informed=0;
 status.economy.stock_unverified=1;
 status.economy.net_unverified=1;
 status.economy.delivery_unverified=1;
 status.economy.minimum_unverified=1;
 q.doc.lineas=q.doc.lineas.slice(0,1);
 q.fuente.lines=q.fuente.lines.slice(0,1);
 q.economia.descuentos.precios=q.economia.descuentos.precios.slice(0,1);
 const line=q.doc.lineas[0];
 const ar=x=>x.replace(/^\s*\$\s*/u,'AR$ ');
 line.unitPriceLiteral=ar(line.unitPriceLiteral);
 line.lineTotalLiteral=ar(line.lineTotalLiteral);
 q.doc.declaredTotalLiteral=line.lineTotalLiteral;
 q.doc.prueba.lineCount=1;
 q.doc.prueba.sumLineCents='7083098';
 q.doc.prueba.declaredTotalCents='7083098';
 const prices=itemPrices(status,source);
 assert.ok(prices,'precio de origen AR$ no se pierde');
 assert.equal(prices.articulos[0].referencias[0].importeCotizado,
  'AR$ 70.830,98');
 const r=preview(status,source,prices);
 assert.ok(r,'fuente verificada debe ser proyectable');
 assert.equal(r.ofertas.length,1);
 assert.equal(r.ofertas[0].motivo,null);
 assert.equal(r.opciones.length,1,'una sola canasta integral sin emparejamiento inventado');
 assert.equal(r.opciones[0].subtotalMaterialesSinIva,'70830.98');
 assert.equal(r.opciones[0].moneda,'ARS');
 assert.deepEqual(r.opciones[0].ofertasAnonimas,['Presupuesto 1']);
 assert.deepEqual(r.opciones[0].asignacion,
  [{itemId:'item_001',oferta:'Presupuesto 1'}]);
 assert.equal(r.ranking_final,false);
});
