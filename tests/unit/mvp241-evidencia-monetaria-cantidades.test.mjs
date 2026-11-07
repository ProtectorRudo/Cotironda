import test from 'node:test';
import assert from 'node:assert/strict';
import {monedaExplicitaMvp241,monedaFuenteMvp241} from
 '../../src/domain/ia-central/evidencia-moneda-mvp241.ts';
import {evaluarCotizacionMvp225} from
 '../../src/domain/ia-central/calificador-cotizaciones-mvp225.ts';
import {interpretarPresupuestoConIAMvp225} from
 '../../src/domain/ia-central/lector-presupuesto-proveedor-mvp225.ts';

const pedido=[{id:'cemento_01',descripcion:'Cemento CPC 50 kg',
 rubro:'obra_gruesa',cantidad:'20',unidad:'bag'}];
const baseLine=(textoOriginal)=>({
 numero:1,textoOriginal,descripcion:'Cemento CPC 50 kg',
 cantidad:'20',unidad:'bag',precioUnitarioLiteral:'$8.900',
 totalLineaLiteral:'$178.000',tipo:'material'
});
const link=[{lineaOferta:1,articuloPedido:'cemento_01',
 equivalencia:'misma_presentacion',explicacion:'Cemento CPC 50kg bolsa'}];
const supplier=(sourceLine,currencyNote='Moneda: ARS')=>({
 etiquetaAnonima:'Oferta privada',moneda:'ARS',iva:'no_informado',
 flete:'no_informado',pago:'no_informado',
 fuente:sourceLine+'\n'+currencyNote,
 lineas:[baseLine(sourceLine)],vinculos:link
});
const options={pedido,etiquetaAnonima:'Oferta privada',
 apiKey:'sk-'+('x'.repeat(26)),model:'gpt-6-luna'};
function response(...quotes){
 const calls=[];
 const fetchImpl=async(_url,opt)=>{
  calls.push(JSON.parse(opt.body));
  const next=quotes.shift();
  if(!next)throw Error('unexpected extra call');
  return new Response(JSON.stringify({status:'completed',
   output:[{type:'message',role:'assistant',
    content:[{type:'output_text',text:JSON.stringify(next)}]}]
  }),{status:200});
 };
 return {fetchImpl,calls};
}
function aiQuote(line,moneda,monedaEvidencia){
 return {intencion:'presupuesto',moneda,monedaEvidencia,
  iva:'no_informado',ivaEvidencia:null,
  flete:'no_informado',fleteEvidencia:null,
  pago:'no_informado',pagoEvidencia:null,
  lineas:[baseLine(line)],vinculos:link
 };
}

test('MVP241: $ solo nunca acredita ARS ni USD',()=>{
 for(const source of [
  '20 bolsas de cemento $8.900 cada una',
  'Precio $8.900',
  'Subtotal $178.000'
 ]){
  assert.equal(monedaExplicitaMvp241(source,'ARS','$'),false);
  assert.equal(monedaExplicitaMvp241(source,'ARS',null),false);
  assert.equal(monedaFuenteMvp241(source,'ARS'),false);
  assert.equal(monedaExplicitaMvp241(source,'no_informada',null),true);
 }
});
test('MVP241: monedas explícitas, evidencia irrelevante o conflicto',()=>{
 for(const [source,expected,evidence] of [
  ['Precio AR$ 8.900','ARS','AR$'],
  ['Moneda: ARS','ARS','ARS'],
  ['Expresado en pesos argentinos','ARS','pesos argentinos'],
  ['Total US$ 850','USD','US$'],
  ['Total U$S 850','USD','U$S'],
  ['Precio en USD','USD','USD'],
  ['Valor en dólares','USD','dólares']
 ]){
  assert.equal(monedaExplicitaMvp241(source,expected,evidence),true,source);
  assert.equal(monedaFuenteMvp241(source,expected),true,source);
 }
 assert.equal(monedaExplicitaMvp241('Moneda: ARS. Cemento',
  'ARS','Cemento'),false,'cita no prueba moneda');
 assert.equal(monedaExplicitaMvp241('Moneda: ARS','USD','ARS'),false);
 assert.equal(monedaExplicitaMvp241('Cemento US$ 8 y AR$ 8500',
  'ARS','AR$'),false,'mezcla USD/ARS requiere revisión');
 assert.equal(monedaFuenteMvp241('Cemento US$ 8 y AR$ 8500','ARS'),false);
});
test('MVP241: ningún total valida cantidad inventada a partir del pedido',()=>{
 const line='Cemento CPC bolsa 50 kg $8.900 c/u total $178.000';
 const r=evaluarCotizacionMvp225(pedido,supplier(line));
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.precios.length,0);
 assert.ok(r.motivos.includes('importe_sin_conciliacion'));
 assert.equal(r.rubros[0].respondidos,1,'conservar cobertura');
});
test('MVP241: cantidad declarada y total conciliado siguen verificándose',()=>{
 const line='20 bolsas cemento CPC 50 kg $8.900 c/u total $178.000';
 const r=evaluarCotizacionMvp225(pedido,supplier(line));
 assert.equal(r.estado,'verificada_para_comparacion');
 assert.equal(r.precios[0].centavos,17800000n);
});
test('MVP241: $ sin moneda conserva cobertura e importe para revisión',()=>{
 const line='20 bolsas cemento CPC 50 kg $8.900 c/u total $178.000';
 const r=evaluarCotizacionMvp225(pedido,supplier(line,''));
 assert.equal(r.estado,'requiere_revision');
 assert.ok(r.motivos.includes('moneda_sin_evidencia_explicita'));
 assert.equal(r.precios.length,1);
 assert.equal(r.rubros[0].cobertura,'completa');
});
test('MVP241: lector no acepta ARS inventado aunque coincidan las dos IA',async()=>{
 const line='20 bolsas cemento CPC 50 kg $8.900 c/u total $178.000';
 const q=aiQuote(line,'ARS','$');
 const mock=response(q,q);
 const r=await interpretarPresupuestoConIAMvp225({...options,fuente:line,
  fetchImpl:mock.fetchImpl});
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.motivo,'primera_lectura_sin_fuente');
 assert.equal(mock.calls.length,1,'no gastar otra IA para cita inválida');
});
test('MVP241: lector acepta moneda no informada pero NO acredita precio',async()=>{
 const line='20 bolsas cemento CPC 50 kg $8.900 c/u total $178.000';
 const q=aiQuote(line,'no_informada',null);
 const mock=response(q,structuredClone(q));
 const r=await interpretarPresupuestoConIAMvp225({...options,fuente:line,
  fetchImpl:mock.fetchImpl});
 assert.equal(r.estado,'interpretada_para_revision');
 assert.equal(r.oferta.moneda,'no_informada');
 assert.equal(r.cobertura.ofertas[0].estado,'requiere_revision');
 assert.equal(r.cobertura.ofertas[0].precios.length,1,
  'mantener monto declarado y cobertura sin certificar comparabilidad');
});
test('MVP241: cita literal ARS válida puede ser interpretada en dos lecturas',async()=>{
 const line='20 bolsas cemento CPC 50 kg $8.900 c/u total $178.000';
 const q=aiQuote(line,'ARS','ARS');
 const mock=response(q,structuredClone(q));
 const r=await interpretarPresupuestoConIAMvp225({...options,
  fuente:line+'\nMoneda: ARS',fetchImpl:mock.fetchImpl});
 assert.equal(r.estado,'interpretada_para_revision');
 assert.equal(r.cobertura.ofertas[0].estado,'verificada_para_comparacion');
 assert.equal(r.cobertura.ofertas[0].precios[0].centavos,17800000n);
});
