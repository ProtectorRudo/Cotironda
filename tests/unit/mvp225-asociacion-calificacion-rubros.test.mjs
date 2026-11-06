import test from 'node:test';
import assert from 'node:assert/strict';
import {cantidadMil,dineroCentavosLiteral,evaluarCotizacionMvp225,
 compararPorRubroMvp225} from
 '../../src/domain/ia-central/calificador-cotizaciones-mvp225.ts';
const pedido=[
 {id:'cemento_01',descripcion:'Cemento CPC 50 kg',rubro:'obra_gruesa',
  cantidad:'20',unidad:'bag'},
 {id:'arena_02',descripcion:'Arena, bolsón m³',rubro:'obra_gruesa',
  cantidad:'3',unidad:'m3'},
 {id:'piedra_03',descripcion:'Piedra, bolsón m³',rubro:'obra_gruesa',
  cantidad:'2',unidad:'m3'},
 {id:'latex_04',descripcion:'Pintura látex 5 L',rubro:'pintura',
  cantidad:'2',unidad:'unit'}
];
const literals=[
 '20 bolsas de cemento CPC · $8.000 c/u · total $160.000',
 '3 bolsones de arena · $32.000 c/u · total $96.000',
 '2 bolsones piedra · $48.000 c/u · total $96.000',
 '2 látex 5 L · $25.000 c/u · total $50.000'
];
const lines=literals.map((textoOriginal,i)=>({
 numero:i+1,textoOriginal,descripcion:pedido[i].descripcion,
 cantidad:pedido[i].cantidad,unidad:pedido[i].unidad,
 precioUnitarioLiteral:['$8.000','$32.000','$48.000','$25.000'][i],
 totalLineaLiteral:['$160.000','$96.000','$96.000','$50.000'][i],
 tipo:'material'
}));
const vinculos=pedido.map((a,i)=>({
 lineaOferta:i+1,articuloPedido:a.id,
 equivalencia:'misma_presentacion',explicacion:'El artículo y la presentación coinciden'
}));
function offer(label='Oferta A',included=lines){
 return {etiquetaAnonima:label,moneda:'ARS',iva:'no_informado',
  flete:'no_informado',pago:'no_informado',
  fuente:'Moneda: ARS\n'+included.map(x=>x.textoOriginal).join('\n'),
  lineas:included,vinculos:vinculos.filter(v=>
   included.some(l=>l.numero===v.lineaOferta))};
}
test('MVP225 precio AR: decimal con coma y miles con punto sin coma flotante',()=>{
 assert.equal(dineroCentavosLiteral('$ 1.234,56'),123456n);
 assert.equal(dineroCentavosLiteral('1200,50'),120050n);
 assert.equal(dineroCentavosLiteral('$8.000'),800000n);
 assert.equal(dineroCentavosLiteral('8,90'),890n);
 assert.equal(dineroCentavosLiteral('8.000.123,89'),800012389n);
 assert.equal(dineroCentavosLiteral('1,000'),null);
 assert.equal(dineroCentavosLiteral('1.23.45'),null);
 assert.equal(dineroCentavosLiteral('AR$ 12,0'),1200n);
 assert.equal(dineroCentavosLiteral('US$ 12,0'),1200n);
 assert.equal(dineroCentavosLiteral('U$S 1.234,56'),123456n);
 assert.equal(dineroCentavosLiteral('ARS 12.000'),1200000n);
 assert.equal(dineroCentavosLiteral('USD 12.000'),1200000n);
 assert.equal(dineroCentavosLiteral('EUR 12,00'),null);
 assert.equal(cantidadMil('2.5'),2500n);
 assert.equal(cantidadMil('0'),null);
});
test('MVP225 conserva los cuatro rubros/materiales y audita las sumas',()=>{
 const r=evaluarCotizacionMvp225(pedido,offer());
 assert.equal(r.estado,'verificada_para_comparacion');
 assert.deepEqual(r.rubros.map(x=>[x.rubro,x.solicitados,x.respondidos,x.precioComprobado]),
  [['obra_gruesa',3,3,3],['pintura',1,1,1]]);
 assert.equal(r.precios.length,4);
 assert.equal(r.precios[0].centavos,16000000n);
});
test('MVP231: unitario explícito sin total permite cálculo exacto en backend',()=>{
 const q=offer();
 q.lineas=[{...q.lineas[0],
  textoOriginal:'20 bolsas cemento CPC 50kg a $8.000 c/u',
  totalLineaLiteral:null},...q.lineas.slice(1)];
 q.fuente='Moneda: ARS\n'+q.lineas.map(x=>x.textoOriginal).join('\n');
 const r=evaluarCotizacionMvp225(pedido,q);
 assert.equal(r.estado,'verificada_para_comparacion');
 assert.equal(r.rubros[0].precioComprobado,3);
 assert.equal(r.precios[0].centavos,16000000n);
});
test('MVP231: no usar cantidad supuesta ni confundirla con números del precio',()=>{
 for(const original of [
  'Cemento CPC bolsa 50kg a $8.000 c/u',
  'Cemento CPC x $20.000 c/u',
  '20 bolsas cemento CPC $8.000'
 ]){
  const q=offer();
  q.lineas=[{...q.lineas[0],textoOriginal:original,
    precioUnitarioLiteral:original.includes('$20.000')?'$20.000':'$8.000',
    totalLineaLiteral:null},...q.lineas.slice(1)];
  q.fuente='Moneda: ARS\n'+q.lineas.map(x=>x.textoOriginal).join('\n');
  const r=evaluarCotizacionMvp225(pedido,q);
  assert.equal(r.estado,'requiere_revision',original);
  assert.ok(r.motivos.includes('importe_sin_conciliacion'),original);
 }
});
test('MVP231: no ignorar un total declarado distinto al unitario',()=>{
 const q=offer();
 q.lineas=[{...q.lineas[0],
  textoOriginal:'20 bolsas cemento CPC a $8.000 c/u, total $170.000',
  totalLineaLiteral:null},...q.lineas.slice(1)];
 q.fuente='Moneda: ARS\n'+q.lineas.map(x=>x.textoOriginal).join('\n');
 const r=evaluarCotizacionMvp225(pedido,q);
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.rubros[0].precioComprobado,2);
});
test('MVP231: no calcular fracciones menores al centavo',()=>{
 const q=offer();
 q.lineas=[{...q.lineas[0],
  textoOriginal:'0,001 bolsa CPC a $0,01 c/u',
  cantidad:'0.001',precioUnitarioLiteral:'$0,01',
  totalLineaLiteral:null},...q.lineas.slice(1)];
 q.fuente='Moneda: ARS\n'+q.lineas.map(x=>x.textoOriginal).join('\n');
 const r=evaluarCotizacionMvp225(pedido,q);
 assert.equal(r.rubros[0].precioComprobado,2);
 assert.equal(r.estado,'requiere_revision');
});
test('MVP225 oferta parcial NO compite por total global ni pierde materiales',()=>{
 const full=offer('Oferta completa');
 const partialLines=lines.slice(0,2).map((x,i)=>i===0?
  {...x,textoOriginal:'20 bolsas CPC · $7.500 c/u · total $150.000',
   precioUnitarioLiteral:'$7.500',totalLineaLiteral:'$150.000'}:
  {...x,textoOriginal:'3 bolsones de arena · $30.000 c/u · total $90.000',
   precioUnitarioLiteral:'$30.000',totalLineaLiteral:'$90.000'});
 const partial=offer('Oferta parcial',partialLines);
 const r=compararPorRubroMvp225(pedido,[full,partial]);
 assert.equal(r.rankingGlobalPermitido,false);
 assert.equal(r.adjudicacionAutomatica,false);
 assert.equal(r.contactosRevelados,false);
 assert.equal(r.ofertas[1].rubros[0].cobertura,'parcial');
 assert.deepEqual(r.ofertas[1].rubros[0].faltantes,['piedra_03']);
 assert.equal(r.ofertas[1].rubros[1].cobertura,'sin_cobertura');
 assert.equal(r.comparables[0].situacion,'importe_linea_comparable');
 assert.equal(r.comparables[0].alternativas[0].oferta,'Oferta parcial');
 assert.equal(r.comparables[2].situacion,'sin_base_suficiente');
 assert.deepEqual(r.comparables[2].alternativas,[]);
});
test('MVP225 precio inventado o no respaldado por fuente nunca se compara',()=>{
 const fake=offer();
 fake.lineas=[{...fake.lineas[0],precioUnitarioLiteral:'$1.000'},...fake.lineas.slice(1)];
 const r=evaluarCotizacionMvp225(pedido,fake);
 assert.equal(r.estado,'requiere_revision');
 assert.equal(r.rubros[0].precioComprobado,2);
 assert.ok(r.motivos.includes('importe_sin_conciliacion'));
 const stolen=offer();
 stolen.fuente=stolen.fuente.replace('20 bolsas','10 bolsas');
 assert.equal(evaluarCotizacionMvp225(pedido,stolen).estado,'requiere_revision');
});
test('MVP225 precios incompatibles por IVA y flete NO reciben competitividad',()=>{
 const a=offer('A'),b=offer('B');
 b.iva='incluido_explicito';b.flete='incluido_explicito';
 const r=compararPorRubroMvp225(pedido,[a,b]);
 assert.equal(r.comparables[0].situacion,'sin_base_suficiente');
 assert.equal(r.comparables[0].alternativas.length,0);
});
test('MVP225 no compara presentaciones distintas sin equivalencia acreditada',()=>{
 const one=offer('A'),two=offer('B');
 two.vinculos=two.vinculos.map((v,i)=>i===0?
  {...v,equivalencia:'alternativa_razonable'}:v);
 const r=compararPorRubroMvp225(pedido,[one,two]);
 assert.equal(r.comparables[0].situacion,'sin_base_suficiente');
 assert.equal(r.comparables[1].situacion,'importe_linea_comparable');
});
test('MVP225 cantidad distinta se marca para revisión sin inferir equivalencia',()=>{
 const q=offer('A');
 q.lineas=[{...q.lineas[0],textoOriginal:'10 bolsas de cemento CPC · $8.000 c/u · total $80.000',
  cantidad:'10',totalLineaLiteral:'$80.000'},...q.lineas.slice(1)];
 q.fuente='Moneda: ARS\n'+q.lineas.map(l=>l.textoOriginal).join('\n');
 const r=evaluarCotizacionMvp225(pedido,q);
 assert.equal(r.rubros[0].respondidos,3);
 assert.equal(r.rubros[0].precioComprobado,2);
 assert.equal(r.estado,'requiere_revision');
 assert.ok(r.motivos.includes('cantidad_o_unidad_no_comparable'));
});
test('MVP225 conserva pallets, flete y otros extras del proveedor',()=>{
 const extra={numero:5,textoOriginal:'Pallet retornable $12.000',
  descripcion:'Pallet retornable',cantidad:'1',unidad:'unit',
  precioUnitarioLiteral:'$12.000',totalLineaLiteral:'$12.000',
  tipo:'cargo_adicional'};
 const q=offer('A',[...lines,extra]);
 const r=evaluarCotizacionMvp225(pedido,q);
 assert.deepEqual(r.extras,[{numero:5,textoOriginal:'Pallet retornable $12.000'}]);
 assert.ok(r.motivos.includes('cargos_adicionales_sin_comparacion'));
 assert.equal(r.estado,'requiere_revision');
});
test('MVP225 rechaza un vínculo económico duplicado o una ronda inventada',()=>{
 const q=offer();
 q.vinculos=[...q.vinculos,q.vinculos[0]];
 assert.ok(evaluarCotizacionMvp225(pedido,q).motivos.includes('correspondencia_inconsistente'));
 const q2=offer();
 q2.vinculos=[{...q2.vinculos[0],articuloPedido:'cliente_ajeno'},...q2.vinculos.slice(1)];
 assert.equal(evaluarCotizacionMvp225(pedido,q2).estado,'requiere_revision');
});
