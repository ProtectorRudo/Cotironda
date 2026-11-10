import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretarPresupuestoConIAMvp225} from
 '../../src/domain/ia-central/lector-presupuesto-proveedor-mvp225.ts';
const pedido=[{id:'cemento_01',descripcion:'Cemento CPC 50 kg',
 rubro:'obra_gruesa',cantidad:'20',unidad:'bag'}];
const fuente='Hola. 20 bolsas de cem CPC 50kg x $8.900 = $178.000. Pallet sin cargo. Moneda: ARS.';
const line={
 numero:1,textoOriginal:'20 bolsas de cem CPC 50kg x $8.900 = $178.000',
 descripcion:'Cemento CPC 50 kg',cantidad:'20',unidad:'bag',
 precioUnitarioLiteral:'$8.900',totalLineaLiteral:'$178.000',tipo:'material'
};
const pallet={
 numero:2,textoOriginal:'Pallet sin cargo',descripcion:'Pallet',
 cantidad:null,unidad:null,precioUnitarioLiteral:null,
 totalLineaLiteral:null,tipo:'aclaracion'
};
const quote={
 intencion:'presupuesto',moneda:'ARS',monedaEvidencia:'ARS',
 iva:'no_informado',ivaEvidencia:null,
 flete:'no_informado',fleteEvidencia:null,
 pago:'no_informado',pagoEvidencia:null,
 lineas:[line,pallet],
 vinculos:[{lineaOferta:1,articuloPedido:'cemento_01',
  equivalencia:'misma_presentacion',
  explicacion:'CPC por bolsa 50 kg'}]
};
function mockResponses(...responses){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  const req=JSON.parse(options.body);calls.push({url,req});
  const r=responses.shift();
  return new Response(JSON.stringify({
   status:'completed',output:[{type:'message',role:'assistant',
    content:[{type:'output_text',text:JSON.stringify(r)}]}]
  }),{status:200});
 };
 return {fetchImpl,calls};
}
const args={fuente,pedido,etiquetaAnonima:'Presupuesto 1',
 apiKey:'sk-'+'x'.repeat(25),model:'gpt-6-luna'};
test('MVP225 dos lecturas leen jerga, asocian material y mantienen pallet',async()=>{
 const reread=structuredClone(quote);
 reread.vinculos[0].explicacion='Misma presentación comercial (CPC bolsa)';
 const {fetchImpl,calls}=mockResponses(quote,reread);
 const r=await interpretarPresupuestoConIAMvp225({...args,fetchImpl});
 assert.equal(r.estado,'interpretada_para_revision');
 assert.equal(r.oferta.lineas.length,2);
 assert.equal(r.oferta.vinculos[0].articuloPedido,'cemento_01');
 assert.equal(r.cobertura.ofertas[0].precios[0].centavos,17800000n);
 assert.deepEqual(r.cobertura.ofertas[0].extras,
  [{numero:2,textoOriginal:'Pallet sin cargo'}]);
 assert.equal(calls.length,2);
 assert.equal(calls[0].req.store,false);
 assert.deepEqual(calls[0].req.tools,[]);
});
test('MVP225 cita monetaria inventada se rechaza sin segunda llamada',async()=>{
 const fake=structuredClone(quote);
 fake.lineas[0].precioUnitarioLiteral='$1.000';
 const {fetchImpl,calls}=mockResponses(fake);
 const r=await interpretarPresupuestoConIAMvp225({...args,fetchImpl});
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.motivo,'primera_lectura_sin_fuente');
 assert.equal(calls.length,1);
});
test('MVP225 cantidad discordante entre lecturas bloquea publicación',async()=>{
 const altered=structuredClone(quote);
 altered.lineas[0].cantidad='200';
 const {fetchImpl}=mockResponses(quote,altered);
 const r=await interpretarPresupuestoConIAMvp225({...args,fetchImpl});
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.motivo,'lecturas_no_coinciden');
});
test('MVP225 no inventa IVA cuando la fuente no lo menciona',async()=>{
 const invented=structuredClone(quote);
 invented.iva='incluido_explicito';
 const {fetchImpl}=mockResponses(invented);
 const r=await interpretarPresupuestoConIAMvp225({...args,fetchImpl});
 assert.equal(r.estado,'requiere_revision');
});
test('MVP225 saludo real de proveedor no es una cotización',async()=>{
 const other=structuredClone(quote);
 other.intencion='otro';other.lineas=[];other.vinculos=[];
 other.moneda='no_informada';other.monedaEvidencia=null;
 const {fetchImpl,calls}=mockResponses(other);
 const r=await interpretarPresupuestoConIAMvp225({
  ...args,fuente:'Hola, buenos días',fetchImpl
 });
 assert.equal(r.estado,'sin_cotizacion');
 assert.equal(calls.length,1);
});
test('MVP244: una cotización con importes no desaparece como saludo',async()=>{
 const other=structuredClone(quote);
 other.intencion='otro';other.lineas=[];other.vinculos=[];
 const {fetchImpl,calls}=mockResponses(other);
 const r=await interpretarPresupuestoConIAMvp225({...args,fetchImpl});
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.motivo,'primera_lectura_sin_fuente');
 assert.equal(calls.length,1);
});
test('MVP225 API fallida se marca pendiente y no crea datos',async()=>{
 const r=await interpretarPresupuestoConIAMvp225({...args,
  fetchImpl:async()=>new Response('{}',{status:429})});
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.oferta,null);
});
