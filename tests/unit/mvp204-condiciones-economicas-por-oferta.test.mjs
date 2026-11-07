import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resumirImportesCotizadosCompradorMvp186 as pricesFromSource}
 from '../../src/domain/resumen-importes-cotizados-mvp186.ts';
import {resumirCondicionesEconomicasPorOfertaMvp204 as economicReadiness}
 from '../../src/domain/condiciones-economicas-por-oferta-mvp204.ts';

const fixture=JSON.parse(readFileSync(new URL(
 '../fixtures/mvp199-pilot-shape-anonymized.json',import.meta.url),'utf8'));

function sample(caseNumber=1){
 const source=structuredClone(fixture.rounds[caseNumber].input);
 source.quotations.forEach((q,i)=>q.publicText='REVISADO_'+String(i));
 const labels=['Presupuesto 1','Presupuesto 2'];
 const offers=[{label:labels[0],text:'REVISADO_1'},
  {label:labels[1],text:'REVISADO_0'}];
 const cond=source.quotations.map(q=>q.economia.condiciones);
 const economy={
  state:'economia_observada_sin_ranking',quotations:2,
  iva_not_informed:cond.filter(x=>x.iva.estado==='no_informado').length,
  freight_not_informed:cond.filter(x=>x.flete.estado==='no_informado').length,
  freight_to_agree:cond.filter(x=>x.flete.estado==='a_convenir').length,
  payment_not_informed:cond.filter(x=>x.pago.estado==='no_informado').length,
  stock_unverified:2,net_unverified:2,delivery_unverified:2,
  minimum_unverified:2,ranking_allowed:false,price_comparable:false,
  contacts_revealed:false
 };
 const status={state:'closed',can_open:true,offers,economy};
 const audited=pricesFromSource(status,source);
 const prices=audited?structuredClone(audited):null;
 return {source,status,prices};
}

test('MVP204: 4 presupuestos del contrato real anonimizado preservan precio y condiciones por oferta',()=>{
 for(let caseNumber=0;caseNumber<2;caseNumber++){
  const {source,status,prices}=sample(caseNumber);
  assert.ok(prices,'MVP186 source prices '+caseNumber);
  const r=economicReadiness(status,source,prices);
  assert.ok(r,'economic projection '+caseNumber);
  assert.equal(r.quotations,2);
  assert.equal(r.requested_items,source.requestItems.length);
  assert.deepEqual(r.ofertas.map(x=>x.oferta),['Presupuesto 1','Presupuesto 2']);
  assert.deepEqual(r.ofertas.map(x=>x.iva),['no_informado','no_informado']);
  assert.ok(r.ofertas.every(x=>x.moneda==='no_acreditada'&&
   x.stockCorroborado===false&&x.plazoCorroborado===false&&
   x.minimoCorroborado===false));
  const quoted=prices.articulos.flatMap(x=>x.referencias);
  for(const offer of r.ofertas){
   assert.equal(offer.articulosConImporte,
    quoted.filter(x=>x.oferta===offer.oferta&&x.importeCotizado!==null).length);
  }
  assert.equal(r.price_comparable,false);
  assert.equal(r.ranking_allowed,false);
  assert.equal(r.automatic_award,false);
  const body=JSON.stringify(r);
  for(const q of source.quotations){
   assert.equal(body.includes(q.doc.messageHmac),false);
   assert.equal(body.includes(q.doc.sourceSha256),false);
   assert.equal(body.includes(q.doc.declaredTotalLiteral),false);
  }
 }
});

test('MVP204: la convención de IVA no informado no se convierte en IVA 0%',()=>{
 const {source,status,prices}=sample();
 const r=economicReadiness(status,source,prices);
 assert.ok(r);
 assert.equal(r.ofertas[0].iva,'no_informado');
 assert.equal(JSON.stringify(r).includes('ivaPorcentaje'),false);
 assert.equal(JSON.stringify(r).includes('0.00'),false);
 assert.equal(r.tax_calculated,false);
});

test('MVP204: un mismo presupuesto no hereda condiciones del otro por orden de HMAC',()=>{
 const {source,status,prices}=sample();
 const r=economicReadiness(status,source,prices);
 assert.ok(r);
 assert.deepEqual(r.ofertas.map(x=>x.flete),['a_convenir','no_informado']);
 assert.deepEqual(r.ofertas.map(x=>x.pago),['contado','no_informado']);
});

test('MVP204: identidad revocada, ronda abierta o proyección alterada ocultan solo el panel',()=>{
 const mutations=[
  ({status})=>{status.state='waiting'},
  ({status})=>{status.can_open=false},
  ({status})=>{status.offers[0].text='TEXTO DE OTRO'},
  ({source})=>{source.quotations[0].doc.prueba.revisionVigente=false},
  ({source})=>{source.quotations[0].doc.prueba.version=8},
  ({source})=>{source.quotations[0].doc.sourceSha256='0'.repeat(64)},
  ({source})=>{source.quotations[0].economia.condiciones.rankingHabilitado=true},
  ({source})=>{source.quotations[0].economia.condiciones.stockCorroborado=true},
  ({source})=>{source.quotations[0].economia.condiciones.flete.estado='inventado'},
  ({status})=>{status.economy.freight_to_agree=0},
  ({status})=>{status.economy.iva_not_informed=1},
  ({prices})=>{prices.ranking_allowed=true},
  ({prices})=>{prices.articulos[0].referencias[0].oferta='Empresa secreta'}
 ];
 for(const mutation of mutations){
  const context=sample();
  assert.ok(context.prices);
  mutation(context);
  assert.equal(economicReadiness(context.status,context.source,context.prices),
   null,String(mutation));
 }
});

test('MVP204: tampoco convierte ofertas parciales en costo final',()=>{
 const {source,status,prices}=sample();
 const p=prices.articulos[0].referencias[0];
 p.importeCotizado=null;p.cantidadCotizadaLiteral=null;p.estado='no_homologable';
 const r=economicReadiness(status,source,prices);
 assert.ok(r);
 assert.ok(r.ofertas[0].articulosConImporte<=r.requested_items);
 assert.equal(r.price_comparable,false);
});
