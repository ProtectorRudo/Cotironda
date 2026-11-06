import test from 'node:test';
import assert from 'node:assert/strict';
import {importesOriginalesRepresentadosMvp244 as fidelity} from
 '../../src/domain/ia-central/fidelidad-importes-fuente-mvp244.ts';
import {evaluarCotizacionMvp225} from
 '../../src/domain/ia-central/calificador-cotizaciones-mvp225.ts';
import {interpretarPresupuestoConIAMvp225} from
 '../../src/domain/ia-central/lector-presupuesto-proveedor-mvp225.ts';

const pedido=[{id:'item_1',descripcion:'cemento CPC 50 kg',
 rubro:'obra_gruesa',cantidad:'20',unidad:'bag'}];
const first='20 bolsas cemento CPC 50 kg AR$ 8.900 c/u total AR$ 178.000';
const pallet='Pallet retornable AR$ 12.000';
const shipping='Flete AR$ 15.000';
const discount='Descuento especial - AR$ 5.000';
const grandTotal='TOTAL GENERAL AR$ 200.000';
const source=['Moneda: ARS',first,pallet,shipping,discount,grandTotal].join('\n');
const row=(textoOriginal,numero,tipo='cargo_adicional')=>({
 numero,textoOriginal,descripcion:textoOriginal,cantidad:null,unidad:null,
 precioUnitarioLiteral:null,totalLineaLiteral:null,tipo
});
const lines=[
 {numero:1,textoOriginal:first,descripcion:'Cemento CPC 50 kg',
  cantidad:'20',unidad:'bag',precioUnitarioLiteral:'AR$ 8.900',
  totalLineaLiteral:'AR$ 178.000',tipo:'material'},
 row(pallet,2),row(shipping,3),row(discount,4)
];
const links=[{lineaOferta:1,articuloPedido:'item_1',
 equivalencia:'misma_presentacion',explicacion:'Cemento CPC 50 kg'}];
const oferta=(rows,original=source)=>({
 etiquetaAnonima:'Oferta',moneda:'ARS',
 iva:'no_informado',flete:'no_informado',pago:'no_informado',
 fuente:original,lineas:rows,vinculos:links
});
const ai=(rows=lines)=>({
 intencion:'presupuesto',moneda:'ARS',monedaEvidencia:'ARS',
 iva:'no_informado',ivaEvidencia:null,
 flete:'no_informado',fleteEvidencia:null,
 pago:'no_informado',pagoEvidencia:null,
 lineas:rows,vinculos:links
});
const read=async(original,q)=>{
 let calls=0;
 const result=await interpretarPresupuestoConIAMvp225({
  fuente:original,pedido,etiquetaAnonima:'Oferta',
  apiKey:'sk-'+'x'.repeat(25),model:'gpt-6-luna',
  fetchImpl:async()=>{
   calls++;
   return new Response(JSON.stringify({status:'completed',
    output:[{type:'message',role:'assistant',content:[
      {type:'output_text',text:JSON.stringify(q)}
    ]}]}),{status:200});
  }
 });
 return {result,calls};
};
test('MVP244: un importe en pallet/flete/descuento no puede desaparecer',()=>{
 assert.equal(fidelity(source,lines),true);
 for(const omit of [2,3,4]){
  assert.equal(fidelity(source,lines.filter(x=>x.numero!==omit)),false,
   'fila omitida '+omit);
 }
});
test('MVP244: los totales de resumen no obligan a inventar un artículo nuevo',()=>{
 assert.equal(fidelity(source,lines),true);
 assert.equal(fidelity(source,[...lines,row(grandTotal,5,'aclaracion')]),true);
});
test('MVP244: filas con precios iguales conservan multiplicidad real',()=>{
 const duplicate='Bolsa de desperdicio AR$ 12.000';
 const corpus=source+'\n'+duplicate;
 assert.equal(fidelity(corpus,lines),false);
 assert.equal(fidelity(corpus,[...lines,row(duplicate,5)]),true);
 assert.equal(fidelity(source,[...lines,row(pallet,5)]),false,
  'no duplicar precio que no se declaró dos veces');
});
test('MVP244: detecta importe adicional incluso separado por punto y coma',()=>{
 const short=first+'; '+shipping;
 assert.equal(fidelity(short,[lines[0]]),false);
 assert.equal(fidelity(short,[lines[0],row(shipping,2)]),true);
});
test('MVP244: prosa sin precio no provoca una plantilla obligatoria',()=>{
 assert.equal(fidelity('Hola, el presupuesto está en preparación.',[]),true);
 assert.equal(fidelity('Moneda: ARS\nPallet sin cargo',[]),true);
 assert.equal(fidelity('AR$ 8.900',[]),false);
});
test('MVP244: una cifra nueva o falsa hace fallar la integridad',()=>{
 const altered=[{...lines[0],
  textoOriginal:first.replace('AR$ 8.900','AR$ 9.900')},...lines.slice(1)];
 assert.equal(fidelity(source,altered),false);
});
test('MVP244: el comparador no valida cotización si se omitió cargo adicional',()=>{
 const result=evaluarCotizacionMvp225(pedido,oferta([lines[0]]));
 assert.equal(result.estado,'requiere_revision');
 assert.ok(result.motivos.includes('importe_de_fuente_sin_renglon'));
 assert.equal(result.rubros[0].respondidos,1);
 assert.equal(result.precios[0].centavos,17800000n);
 assert.equal(result.rubros[0].cobertura,'completa');
});
test('MVP244: una lectura IA con omisión no consume doble llamada',async()=>{
 const q=ai([lines[0]]);
 const {result,calls}=await read(source,q);
 assert.equal(result.estado,'requiere_revision');
 assert.equal(result.motivo,'primera_lectura_sin_fuente');
 assert.equal(calls,1);
});
test('MVP244: una fuente con extras íntegros conserva cada renglón',async()=>{
 const {result,calls}=await read(source,ai());
 assert.equal(result.estado,'interpretada_para_revision');
 assert.equal(result.oferta.lineas.length,4);
 assert.deepEqual(result.cobertura.ofertas[0].extras.map(x=>x.textoOriginal),
  [pallet,shipping,discount]);
 assert.equal(result.cobertura.ofertas[0].estado,'requiere_revision',
  'los cargos se preservan sin inventar importe final comparable');
 assert.equal(calls,2);
});
