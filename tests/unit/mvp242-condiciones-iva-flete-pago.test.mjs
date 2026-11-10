import test from 'node:test';
import assert from 'node:assert/strict';
import {
 estadoFuenteCondicionMvp242,
 evidenciaCondicionMvp242,
 condicionFuenteMvp242
} from '../../src/domain/ia-central/evidencia-condiciones-mvp242.ts';
import {evaluarCotizacionMvp225,compararPorRubroMvp225}
 from '../../src/domain/ia-central/calificador-cotizaciones-mvp225.ts';
import {interpretarPresupuestoConIAMvp225}
 from '../../src/domain/ia-central/lector-presupuesto-proveedor-mvp225.ts';

const pedido=[{id:'cemento_01',descripcion:'Cemento CPC 50kg',
 rubro:'obra_gruesa',cantidad:'20',unidad:'bag'}];
const original='20 bolsas cemento CPC 50kg AR$ 8.900 c/u total AR$ 178.000';
const linea={numero:1,textoOriginal:original,descripcion:'Cemento CPC 50kg',
 cantidad:'20',unidad:'bag',precioUnitarioLiteral:'AR$ 8.900',
 totalLineaLiteral:'AR$ 178.000',tipo:'material'};
const vinculos=[{lineaOferta:1,articuloPedido:'cemento_01',
 equivalencia:'misma_presentacion',explicacion:'Presentación exacta'}];
const oferta=(extra='',conds={})=>({
 etiquetaAnonima:'Oferta privada',moneda:'ARS',
 iva:'no_informado',flete:'no_informado',pago:'no_informado',
 fuente:original+(extra?'\n'+extra:''),
 lineas:[linea],vinculos,...conds
});
const read=(extra,params={})=>{
 const source=original+(extra?'\n'+extra:'');
 const quote={
  intencion:'presupuesto',moneda:'ARS',monedaEvidencia:'AR$',
  iva:'no_informado',ivaEvidencia:null,
  flete:'no_informado',fleteEvidencia:null,
  pago:'no_informado',pagoEvidencia:null,
  lineas:[linea],vinculos,...params
 };
 return {source,quote};
};
const interpret=async(source,q1,q2=q1)=>{
 const sequence=[q1,q2];
 let calls=0;
 const fetchImpl=async()=>{
  calls++;
  const result=sequence.shift();
  return new Response(JSON.stringify({status:'completed',
   output:[{type:'message',role:'assistant',content:[
    {type:'output_text',text:JSON.stringify(result)}]}]}),{status:200});
 };
 const result=await interpretarPresupuestoConIAMvp225({
  fuente:source,pedido,etiquetaAnonima:'Presupuesto privado',
  apiKey:'sk-'+'x'.repeat(25),model:'gpt-6-luna',fetchImpl
 });
 return {result,calls};
};

test('MVP242 IVA: expresiones explícitas, negaciones y omitido',()=>{
 for(const [fragment,status] of [
  ['IVA incluido','incluido_explicito'],
  ['IVA: incluido','incluido_explicito'],
  ['Con IVA','incluido_explicito'],
  ['c/IVA','incluido_explicito'],
  ['IVA 21% incluido','incluido_explicito'],
  ['Sin IVA','sin_iva_explicito'],
  ['más IVA','sin_iva_explicito'],
  ['+ IVA','sin_iva_explicito'],
  ['IVA no incluido','sin_iva_explicito'],
  ['IVA: aparte','sin_iva_explicito'],
  ['No incluye el IVA','sin_iva_explicito'],
  ['IVA excluido','sin_iva_explicito']
 ]){
  const source=original+'\n'+fragment;
  assert.equal(estadoFuenteCondicionMvp242(source,'iva'),status,fragment);
  assert.equal(evidenciaCondicionMvp242(source,'iva',status,fragment),true,fragment);
  assert.equal(condicionFuenteMvp242(source,'iva',status),true,fragment);
 }
 assert.equal(evidenciaCondicionMvp242(original,'iva','no_informado',null),true);
 assert.equal(evidenciaCondicionMvp242(original,'iva','sin_iva_explicito','AR$'),false);
 assert.equal(evidenciaCondicionMvp242(original+'\nIVA incluido',
  'iva','no_informado',null),false,'omitido NO puede esconder un IVA explícito');
});
test('MVP242 IVA: citas irrelevantes y contradicciones bloqueadas',()=>{
 const source=original+'\nIVA incluido';
 assert.equal(evidenciaCondicionMvp242(source,'iva','incluido_explicito','IVA'),false);
 assert.equal(evidenciaCondicionMvp242(source,'iva','incluido_explicito','cemento'),false);
 assert.equal(evidenciaCondicionMvp242(source,'iva','sin_iva_explicito','IVA incluido'),false);
 const conflict=source+'\nPrecios sin IVA';
 assert.equal(estadoFuenteCondicionMvp242(conflict,'iva'),'ambiguo');
 assert.equal(evidenciaCondicionMvp242(conflict,'iva','incluido_explicito','IVA incluido'),false);
 assert.equal(condicionFuenteMvp242(conflict,'iva','no_informado'),false);
});
test('MVP242 flete: incluido, excluido, a convenir y fecha de entrega',()=>{
 for(const [fragment,status] of [
  ['Flete incluido','incluido_explicito'],
  ['Flete: incluido','incluido_explicito'],
  ['Entrega sin cargo','incluido_explicito'],
  ['Envío gratis','incluido_explicito'],
  ['Flete aparte','excluido_explicito'],
  ['Sin flete','excluido_explicito'],
  ['No incluye flete','excluido_explicito'],
  ['Envío no incluido','excluido_explicito'],
  ['Flete a convenir','a_convenir'],
  ['Flete: a convenir','a_convenir'],
  ['Envío a cotizar','a_convenir'],
  ['Flete según zona','a_convenir']
 ]){
  const source=original+'\n'+fragment;
  assert.equal(estadoFuenteCondicionMvp242(source,'flete'),status,fragment);
  assert.equal(evidenciaCondicionMvp242(source,'flete',status,fragment),true,fragment);
 }
 for(const text of ['Entrega el lunes','Flete','Retiro por el local']){
  assert.equal(estadoFuenteCondicionMvp242(original+'\n'+text,'flete'),
   'no_informado',text);
 }
 const source=original+'\nFlete incluido';
 assert.equal(evidenciaCondicionMvp242(source,'flete',
  'incluido_explicito','Flete'),false);
 assert.equal(evidenciaCondicionMvp242(source,'flete',
  'incluido_explicito','Entrega el lunes'),false);
});
test('MVP242 pago: transferencia, contado, crédito y varias opciones',()=>{
 for(const [fragment,status] of [
  ['Pago contado','contado'],
  ['Al contado','contado'],
  ['Pago en efectivo','contado'],
  ['Transferencia bancaria','transferencia'],
  ['Pago por transferencia','transferencia'],
  ['Pago por CBU','transferencia'],
  ['A crédito','credito'],
  ['Cuenta corriente','credito'],
  ['Pago a 30 días','credito'],
  ['Crédito 60 días','credito']
 ]){
  const source=original+'\n'+fragment;
  assert.equal(estadoFuenteCondicionMvp242(source,'pago'),status,fragment);
  assert.equal(evidenciaCondicionMvp242(source,'pago',status,fragment),true,fragment);
 }
 const options=original+'\nContado o transferencia';
 assert.equal(estadoFuenteCondicionMvp242(options,'pago'),'ambiguo');
 assert.equal(evidenciaCondicionMvp242(options,'pago','contado','Contado'),false);
 assert.equal(evidenciaCondicionMvp242(options,'pago','no_informado',null),false);
 assert.equal(estadoFuenteCondicionMvp242(original+'\nEntrega a 30 días','pago'),'no_informado');
 assert.equal(estadoFuenteCondicionMvp242(original+'\nTarjeta de crédito','pago'),'no_informado');
});
test('MVP242 cotización sin condiciones explícitas conserva cobertura y precio',()=>{
 const result=evaluarCotizacionMvp225(pedido,oferta());
 assert.equal(result.estado,'verificada_para_comparacion');
 assert.equal(result.precios[0].centavos,17800000n);
 assert.equal(result.rubros[0].cobertura,'completa');
});
test('MVP242 comparador impide IVA/flete/pago inventados',()=>{
 for(const [extra,conds,motivo] of [
  ['',{iva:'incluido_explicito'},'condicion_iva_sin_evidencia'],
  ['IVA no incluido',{iva:'incluido_explicito'},'condicion_iva_sin_evidencia'],
  ['Entrega lunes',{flete:'incluido_explicito'},'condicion_flete_sin_evidencia'],
  ['Contado',{pago:'transferencia'},'condicion_pago_sin_evidencia'],
  ['Flete incluido\nFlete aparte',{flete:'incluido_explicito'},'condicion_flete_sin_evidencia'],
  ['Contado o transferencia',{pago:'contado'},'condicion_pago_sin_evidencia']
 ]){
  const r=evaluarCotizacionMvp225(pedido,oferta(extra,conds));
  assert.equal(r.estado,'requiere_revision',extra);
  assert.ok(r.motivos.includes(motivo),extra);
  assert.equal(r.rubros[0].cobertura,'completa');
  assert.equal(r.precios[0].centavos,17800000n);
 }
 const a=oferta('\nIVA incluido',{iva:'incluido_explicito'});
 const b=oferta('',{iva:'no_informado'});
 const r=compararPorRubroMvp225(pedido,[a,b]);
 assert.equal(r.comparables[0].situacion,'sin_base_suficiente');
});
test('MVP242 dos lecturas aceptan condiciones correctamente citadas',async()=>{
 const {source,quote}=read('IVA incluido\nFlete a convenir\nPago: transferencia',{
  iva:'incluido_explicito',ivaEvidencia:'IVA incluido',
  flete:'a_convenir',fleteEvidencia:'Flete a convenir',
  pago:'transferencia',pagoEvidencia:'transferencia'
 });
 const {result,calls}=await interpret(source,quote,structuredClone(quote));
 assert.equal(result.estado,'interpretada_para_revision');
 assert.equal(result.cobertura.ofertas[0].estado,'verificada_para_comparacion');
 assert.equal(result.cobertura.ofertas[0].rubros[0].respondidos,1);
 assert.equal(calls,2);
});
test('MVP242 lector rechaza cita que no sustenta IVA antes de gastar segunda IA',async()=>{
 const {source,quote}=read('IVA no incluido',{
  iva:'incluido_explicito',ivaEvidencia:'IVA no incluido'
 });
 const {result,calls}=await interpret(source,quote);
 assert.equal(result.estado,'requiere_revision');
 assert.equal(result.motivo,'primera_lectura_sin_fuente');
 assert.equal(calls,1);
});
test('MVP242 lector rechaza omitir condición presente para no perder términos',async()=>{
 const {source,quote}=read('Flete a convenir');
 const {result,calls}=await interpret(source,quote);
 assert.equal(result.estado,'requiere_revision');
 assert.equal(result.motivo,'primera_lectura_sin_fuente');
 assert.equal(calls,1);
});
test('MVP242 lector bloquea opciones de pago contradictorias aunque cite una',async()=>{
 const {source,quote}=read('Contado o transferencia',{
  pago:'contado',pagoEvidencia:'Contado'
 });
 const {result,calls}=await interpret(source,quote);
 assert.equal(result.estado,'requiere_revision');
 assert.equal(result.motivo,'primera_lectura_sin_fuente');
 assert.equal(calls,1);
});
