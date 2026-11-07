import test from 'node:test';
import assert from 'node:assert/strict';
import {
 adaptarDocumentoMvp162,centavosFuenteMvp162,cantidadFuenteMvp162
} from '../../src/domain/adaptador-documental-mvp162.ts';
import {compararCotizacionesOffline} from '../../src/domain/comparacion-ofertas.ts';
import {recomendarHastaDosOffline} from '../../src/domain/recomendaciones-mvp160.ts';

const H='a'.repeat(64),M='b'.repeat(64),R='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const req={items:[{id:'cemento_001',cantidad:'2',unidad:'bag'}]};
const doc=()=>({
 requestId:R,anonId:'anon_aaa',messageHmac:M,sourceSha256:H,
 declaredTotalLiteral:'$ 242,00',
 lineas:[{lineNo:1,descriptionLiteral:'Cemento Portland gris 25 kg',
  quantityLiteral:'2,00',unitLiteral:'bolsas',unitPriceLiteral:'$ 100,00',
  lineTotalLiteral:'$ 242,00'}],
 prueba:{requestId:R,messageHmac:M,sourceSha256:H,version:9,
  state:'verified',reason:'covered',lineCount:1,sumLineCents:'24200',
  declaredTotalCents:'24200',rankingAllowed:false,
  revisionVigente:true,cotizacionVigente:true}
});
const mapping=()=>[{itemId:'cemento_001',lineNo:1,sourceSha256:H,equivalencia:'verificada',disponibilidadCorroborada:true}];
const terms=()=>({sourceSha256:H,sourceVerified:true,moneda:'ARS',
 pago:'contado',plazoEntregaDias:2,fleteFinal:'0.00',minimoCompraFinal:'0.00',
 tratamientoFlete:'sin_cargo',
 precios:[{lineNo:1,sourceSha256:H,unitarioNetoTrasDescuento:'100.00',
  ivaExplicito:'21',tratamientoIva:'incluido_en_total'}]});
const run=(d=doc(),m=mapping(),t=terms(),p=req)=>
 adaptarDocumentoMvp162(p,d,m,t);

test('MVP162: formato monetario argentino e internacional sin confundir 1.000',()=>{
 assert.equal(centavosFuenteMvp162('$414.564,04'),41456404n);
 assert.equal(centavosFuenteMvp162('$1,000.00'),100000n);
 assert.equal(centavosFuenteMvp162('USD 1,000.00'),100000n);
 assert.equal(centavosFuenteMvp162('$ 100,00'),10000n);
 assert.equal(centavosFuenteMvp162('1.000'),null);
 assert.equal(centavosFuenteMvp162(''),null);
 assert.equal(centavosFuenteMvp162('$-9'),null);
 assert.equal(centavosFuenteMvp162('1e5'),null);
 assert.equal(cantidadFuenteMvp162('2,00'),'2.00');
 assert.equal(cantidadFuenteMvp162('25'),'25');
 assert.equal(cantidadFuenteMvp162('1.000'),null);
});
test('MVP162: documento realista técnicamente/económicamente completo crea un único contrato compatible',()=>{
 const r=run();
 assert.equal(r.estado,'comparable');
 assert.equal(r.fuenteCuadra,true);
 assert.deepEqual(r.motivos,[]);
 assert.equal(r.contactosRevelados,false);
 assert.equal(r.originalesDescargables,false);
 assert.equal(r.ofertaComparable.items[0].precioUnitarioNeto,'100.00');
 assert.equal(r.ofertaComparable.items[0].ivaPorcentaje,'21');
 const c=compararCotizacionesOffline(req,[r.ofertaComparable]);
 assert.equal(c.cobertura[0].lineasCompletas,1);
 assert.equal(c.opcionesCompletas[0].totalFinal,'242.00');
 assert.equal(c.adjudicacionAutomatica,false);
});
test('MVP162: los PDF reales Ailín y Nahuel contienen unidades NULL; ambos visibles pero SIN ranking',()=>{
 for(const anon of ['anon_ailin','anon_nahuel']){
  const d=doc();
  d.anonId=anon;
  d.lineas[0].descriptionLiteral='BIG BAG de Arena';
  d.lineas[0].unitLiteral=null; // observed in both real v9 source mirrors
  const r=run(d);
  assert.equal(r.estado,'visible_no_comparable');
  assert.deepEqual(r.motivos,['unidad_sin_acreditar']);
  assert.equal(r.ofertaComparable,null);
  assert.deepEqual(r.articulosSinCobertura,['cemento_001']);
  assert.equal(r.fuenteCuadra,true);
 }
});
test('MVP162: BIG BAG no equivale a m3 aunque IA diga verificada',()=>{
 const d=doc();
 d.lineas[0].descriptionLiteral='BIG BAG de Arena';
 d.lineas[0].unitLiteral='bolsa';
 const request={items:[{id:'arena_001',cantidad:'2',unidad:'m3'}]};
 const m=[{itemId:'arena_001',lineNo:1,sourceSha256:H,equivalencia:'verificada',disponibilidadCorroborada:true}];
 const r=run(d,m,terms(),request);
 assert.equal(r.estado,'visible_no_comparable');
 assert.ok(r.motivos.includes('unidad_sin_acreditar'));
});
test('MVP162: equivalencia IA sin corroborar no habilita comparación',()=>{
 const m=mapping();m[0].equivalencia='sin_verificar';
 const r=run(doc(),m);
 assert.equal(r.estado,'visible_no_comparable');
 assert.ok(r.motivos.includes('equivalencia_sin_acreditar'));
});
test('MVP162: IVA, forma de pago, moneda, plazo y flete NO se infieren',()=>{
 for(const override of [
  {sourceVerified:false},{pago:null},{moneda:null},{plazoEntregaDias:null},
  {fleteFinal:null},{minimoCompraFinal:null},
  {tratamientoFlete:null},{tratamientoFlete:'fuera_del_total'}
 ]){
  const r=run(doc(),mapping(),{...terms(),...override});
  assert.equal(r.estado,'visible_no_comparable',JSON.stringify(override));
  assert.deepEqual(r.motivos,['condiciones_sin_acreditar']);
 }
});
test('MVP162: un IVA omitido o neto antes de descuento no produce un precio ficticio',()=>{
 for(const proof of [
  {...terms().precios[0],ivaExplicito:null},
  {...terms().precios[0],unitarioNetoTrasDescuento:'120.00'},
  {...terms().precios[0],ivaExplicito:'0'},
  {...terms().precios[0],sourceSha256:'c'.repeat(64)}
 ]){
  const r=run(doc(),mapping(),{...terms(),precios:[proof]});
  assert.equal(r.estado,'visible_no_comparable');
  assert.ok(r.motivos.includes('importe_sin_acreditar')||
   r.motivos.includes('importe_no_conciliado'));
 }
});
test('MVP162: importe original fuente distinto, SHA distinta o revisión pendiente invalidan todo',()=>{
 for(const d of [
  {...doc(),sourceSha256:'d'.repeat(64)},
  {...doc(),declaredTotalLiteral:'$ 241,00'},
  {...doc(),prueba:{...doc().prueba,state:'needs_source_review'}},
  {...doc(),prueba:{...doc().prueba,revisionVigente:false}},
  {...doc(),prueba:{...doc().prueba,cotizacionVigente:false}},
  {...doc(),prueba:{...doc().prueba,declaredTotalCents:'24000'}},
 ]){
  assert.equal(run(d).estado,'fuente_no_verificada');
  assert.equal(run(d).ofertaComparable,null);
 }
});
test('MVP162: cargo adicional NO se pierde aunque la fuente total esté verificada',()=>{
 const d=doc();
 d.lineas.push({lineNo:2,descriptionLiteral:'Pallet',
  quantityLiteral:'1',unitLiteral:'unidad',unitPriceLiteral:'$ 10,00',
  lineTotalLiteral:'$ 10,00'});
 d.declaredTotalLiteral='$ 252,00';
 d.prueba.lineCount=2;
 d.prueba.declaredTotalCents='25200';d.prueba.sumLineCents='25200';
 const r=run(d);
 assert.equal(r.estado,'visible_no_comparable');
 assert.deepEqual(r.lineasNoAsignadas,[2]);
 assert.ok(r.motivos.includes('extras_sin_clasificar'));
 assert.equal(r.ofertaComparable,null);
});
test('MVP162: duplicidad de renglón o atribución cruzada a otro SHA se rechaza',()=>{
 const d=doc();
 for(const m of [
  [...mapping(),...mapping()],
  [{...mapping()[0],sourceSha256:'c'.repeat(64)}],
  [{...mapping()[0],lineNo:3}]
 ]){
  const r=run(d,m);
  assert.equal(r.estado,'fuente_no_verificada');
  assert.ok(r.motivos.includes('origen_inconsistente'));
 }
});
test('MVP162: cantidad insuficiente o ambigua queda visible, no extrapola descuento de 25 a 10',()=>{
 for(const literal of ['1,00','1.000']){
  const d=doc();d.lineas[0].quantityLiteral=literal;
  const r=run(d);
  assert.equal(r.estado,'visible_no_comparable');
  assert.ok(r.motivos.includes('cantidad_sin_acreditar'));
 }
});
test('MVP162: medio de comparación y datos privados nunca salen del puente',()=>{
 const r=run();
 assert.equal(JSON.stringify(r).includes(H),false);
 assert.equal(JSON.stringify(r).includes(M),false);
 assert.equal(JSON.stringify(r).includes(R),false);
 assert.equal(JSON.stringify(r).includes('whatsapp'),false);
 assert.equal(r.ofertaComparable?.anonId,'anon_aaa');
});

test('MVP162: disponibilidad no es igual a cantidad cotizada',()=>{
 const m=mapping();m[0].disponibilidadCorroborada=false;
 const r=run(doc(),m);
 assert.equal(r.estado,'visible_no_comparable');
 assert.deepEqual(r.motivos,['disponibilidad_sin_acreditar']);
});
test('MVP162: flete adicional solo con tratamiento explicitamente corroborado',()=>{
 const positive={...terms(),fleteFinal:'25.00',tratamientoFlete:'fuera_del_total'};
 const r=run(doc(),mapping(),positive);
 assert.equal(r.estado,'comparable');
 assert.equal(r.ofertaComparable.fleteFinal,'25.00');
 const withShipping=compararCotizacionesOffline(req,[r.ofertaComparable]);
 assert.equal(withShipping.opcionesCompletas[0].totalFinal,'267.00');
 for(const bad of [
  {...positive,tratamientoFlete:'sin_cargo'},
  {...positive,tratamientoFlete:'incluido_en_precios'},
  {...positive,fleteFinal:'0.00'}
 ]){
  const result=run(doc(),mapping(),bad);
  assert.equal(result.estado,'visible_no_comparable');
  assert.ok(result.motivos.includes('condiciones_sin_acreditar'));
 }
});

test('MVP162: PDF verificado con ajuste negativo, importe divergente o unitario ausente SIGUE VISIBLE',()=>{
 for(const patch of [
  {lineTotalLiteral:'-$ 10,00'},
  {lineTotalLiteral:'$ 241,00'},
  {unitPriceLiteral:null}
 ]){
  const d=doc();
  d.lineas[0]={...d.lineas[0],...patch};
  const r=run(d);
  assert.equal(r.estado,'visible_no_comparable',JSON.stringify(patch));
  assert.equal(r.fuenteCuadra,true);
  assert.equal(r.ofertaComparable,null);
 }
});
test('MVP162: ordinales discontinuos de fuente se conservan, no se inventan renglones',()=>{
 const d=doc();d.lineas[0].lineNo=2;
 const r=run(d,[{...mapping()[0],lineNo:2}]);
 assert.equal(r.estado,'visible_no_comparable');
 assert.ok(r.motivos.includes('origen_inconsistente'));
});

test('MVP162: BIG BAG explicitamente cotizado como envase se normaliza a bolsa, NUNCA a m3',()=>{
 const d=doc();d.lineas[0].unitLiteral='BIG BAG';
 const ok=run(d);
 assert.equal(ok.estado,'comparable');
 assert.equal(ok.ofertaComparable.items[0].unidad,'bag');
 const bad=run(d,mapping(),terms(),{items:[{id:'cemento_001',cantidad:'2',unidad:'m3'}]});
 assert.equal(bad.estado,'visible_no_comparable');
 assert.ok(bad.motivos.includes('unidad_sin_acreditar'));
});


test('MVP183: dos PDFs parciales verificados pueden cubrir juntos la canasta, sin atribuir cobertura total a ninguno',()=>{
 const pedido={items:[
  {id:'cemento_001',cantidad:'2',unidad:'bag'},
  {id:'arena_001',cantidad:'1',unidad:'bag'}
 ]};
 const a=run(doc(),mapping(),terms(),pedido);
 assert.equal(a.estado,'comparable');
 assert.deepEqual(a.articulosSinCobertura,['arena_001']);
 assert.deepEqual(a.motivos,['faltan_articulos']);
 assert.equal(a.ofertaComparable.items.length,1);
 assert.equal(compararCotizacionesOffline(pedido,[a.ofertaComparable]).opcionesCompletas.length,0);

 const B='c'.repeat(64),BM='d'.repeat(64);
 const bdoc=doc();
 bdoc.anonId='anon_bbb';bdoc.sourceSha256=B;bdoc.messageHmac=BM;
 bdoc.declaredTotalLiteral='$ 60,50';
 bdoc.lineas[0]={lineNo:1,descriptionLiteral:'Arena en bolsa',quantityLiteral:'1',
  unitLiteral:'bolsa',unitPriceLiteral:'$ 50,00',lineTotalLiteral:'$ 60,50'};
 bdoc.prueba={...bdoc.prueba,sourceSha256:B,messageHmac:BM,
  sumLineCents:'6050',declaredTotalCents:'6050'};
 const bmap=[{itemId:'arena_001',lineNo:1,sourceSha256:B,
  equivalencia:'verificada',disponibilidadCorroborada:true}];
 const bterms={...terms(),sourceSha256:B,
  precios:[{lineNo:1,sourceSha256:B,unitarioNetoTrasDescuento:'50.00',ivaExplicito:'21',tratamientoIva:'incluido_en_total'}]};
 const b=run(bdoc,bmap,bterms,pedido);
 assert.equal(b.estado,'comparable');
 assert.deepEqual(b.articulosSinCobertura,['cemento_001']);
 const result=recomendarHastaDosOffline(pedido,[a.ofertaComparable,b.ofertaComparable]);
 assert.equal(result.estado,'alternativas_comparables');
 assert.deepEqual(result.recomendadosAnonimos,['anon_aaa','anon_bbb']);
 assert.equal(result.opcionPrincipal.totalFinal,'302.50');
 assert.equal(result.opcionPrincipal.asignacion.length,2);
 assert.deepEqual(result.cobertura.map(x=>x.lineasCompletas),[1,1]);
 assert.equal(result.contactosRevelados,false);
 assert.equal(result.adjudicacion,false);
});

test('MVP183: parcial sin IVA/flete o disponibilidad NO se vuelve comparable',()=>{
 const pedido={items:[...req.items,{id:'arena_001',cantidad:'1',unidad:'bag'}]};
 const noFlete=run(doc(),mapping(),{...terms(),fleteFinal:null},pedido);
 assert.equal(noFlete.estado,'visible_no_comparable');
 assert.equal(noFlete.ofertaComparable,null);
 assert.deepEqual(noFlete.articulosSinCobertura,['arena_001']);
 assert.ok(noFlete.motivos.includes('condiciones_sin_acreditar'));
 const noStock=mapping();noStock[0].disponibilidadCorroborada=false;
 const sinStock=run(doc(),noStock,terms(),pedido);
 assert.equal(sinStock.estado,'visible_no_comparable');
 assert.equal(sinStock.ofertaComparable,null);
 assert.ok(sinStock.motivos.includes('disponibilidad_sin_acreditar'));
});

test('MVP183: renglones ajenos no clasificados y oferta sin renglones asignados nunca ingresan a ranking',()=>{
 const pedido={items:[...req.items,{id:'arena_001',cantidad:'1',unidad:'bag'}]};
 const conExtra=doc();conExtra.lineas.push({
  lineNo:2,descriptionLiteral:'Pallet',quantityLiteral:'1',unitLiteral:'unidad',
  unitPriceLiteral:'$ 10,00',lineTotalLiteral:'$ 10,00'
 });
 conExtra.prueba.lineCount=2;conExtra.prueba.sumLineCents='25200';
 conExtra.prueba.declaredTotalCents='25200';conExtra.declaredTotalLiteral='$ 252,00';
 const a=run(conExtra,mapping(),terms(),pedido);
 assert.equal(a.estado,'visible_no_comparable');
 assert.equal(a.ofertaComparable,null);
 assert.deepEqual(a.lineasNoAsignadas,[2]);
 assert.ok(a.motivos.includes('extras_sin_clasificar'));
 const b=run(doc(),[],terms(),pedido);
 assert.equal(b.estado,'visible_no_comparable');
 assert.equal(b.ofertaComparable,null);
 assert.ok(b.motivos.includes('extras_sin_clasificar'));
});


test('MVP184: proveedor expresa 21% FUERA del total; precio base concilia y motor suma IVA solo una vez',()=>{
 const d=doc();
 d.declaredTotalLiteral='$ 200,00';
 d.lineas[0].lineTotalLiteral='$ 200,00';
 d.prueba.declaredTotalCents='20000';
 d.prueba.sumLineCents='20000';
 const t=terms();
 t.precios[0].tratamientoIva='excluido_del_total';
 const bridge=run(d,mapping(),t);
 assert.equal(bridge.estado,'comparable');
 assert.equal(bridge.fuenteCuadra,true);
 assert.equal(bridge.ofertaComparable.items[0].precioUnitarioNeto,'100.00');
 assert.equal(bridge.ofertaComparable.items[0].ivaPorcentaje,'21');
 const ranked=compararCotizacionesOffline(req,[bridge.ofertaComparable]);
 assert.equal(ranked.opcionesCompletas[0].materialesConIva,'242.00');
 assert.equal(ranked.opcionesCompletas[0].totalFinal,'242.00');
 assert.equal(bridge.contactosRevelados,false);
});

test('MVP184: base IVA no acreditada se rechaza aun con alícuota explícita',()=>{
 for(const basis of [null,undefined,'desconocido']){
  const t=terms();
  t.precios[0].tratamientoIva=basis;
  const result=run(doc(),mapping(),t);
  assert.equal(result.estado,'visible_no_comparable',String(basis));
  assert.equal(result.ofertaComparable,null);
  assert.ok(result.motivos.includes('condiciones_sin_acreditar'));
 }
 // "Sin IVA" sin alícuota comprobada jamás equivale a 21% por defecto.
 const d=doc();d.lineas[0].lineTotalLiteral='$ 200,00';
 d.declaredTotalLiteral='$ 200,00';
 d.prueba.sumLineCents='20000';d.prueba.declaredTotalCents='20000';
 const noRate=terms();
 noRate.precios[0].tratamientoIva='excluido_del_total';
 noRate.precios[0].ivaExplicito=null;
 const result=run(d,mapping(),noRate);
 assert.equal(result.estado,'visible_no_comparable');
 assert.equal(result.ofertaComparable,null);
 assert.ok(result.motivos.includes('importe_sin_acreditar'));
});

test('MVP184: equivocarse de base incluido/excluido NO acredita el importe documental',()=>{
 const included=terms();
 included.precios[0].tratamientoIva='excluido_del_total';
 const a=run(doc(),mapping(),included);
 assert.equal(a.estado,'visible_no_comparable');
 assert.ok(a.motivos.includes('importe_no_conciliado'));
 const d=doc();d.lineas[0].lineTotalLiteral='$ 200,00';
 d.declaredTotalLiteral='$ 200,00';
 d.prueba.sumLineCents='20000';d.prueba.declaredTotalCents='20000';
 const b=run(d,mapping(),terms());
 assert.equal(b.estado,'visible_no_comparable');
 assert.ok(b.motivos.includes('importe_no_conciliado'));
});

test('MVP184: dos artículos del MISMO presupuesto con base IVA distinta se concilian por línea, sin falsificar total',()=>{
 const d=doc();
 d.declaredTotalLiteral='$ 260,50';
 d.lineas[0].lineTotalLiteral='$ 200,00';
 d.lineas.push({
  lineNo:2,descriptionLiteral:'Bolsa de arena comercial',
  quantityLiteral:'1',unitLiteral:'bolsa',unitPriceLiteral:'$ 50,00',
  lineTotalLiteral:'$ 60,50'
 });
 d.prueba.lineCount=2;d.prueba.sumLineCents='26050';
 d.prueba.declaredTotalCents='26050';
 const t=terms();
 t.precios[0].tratamientoIva='excluido_del_total';
 t.precios.push({lineNo:2,sourceSha256:H,unitarioNetoTrasDescuento:'50.00',
  ivaExplicito:'21',tratamientoIva:'incluido_en_total'});
 const order={items:[...req.items,{id:'arena_001',cantidad:'1',unidad:'bag'}]};
 const mapping2=[...mapping(),{itemId:'arena_001',lineNo:2,sourceSha256:H,
  equivalencia:'verificada',disponibilidadCorroborada:true}];
 const result=run(d,mapping2,t,order);
 assert.equal(result.estado,'comparable');
 assert.equal(result.ofertaComparable.items.length,2);
 const comparison=compararCotizacionesOffline(order,[result.ofertaComparable]);
 assert.equal(comparison.opcionesCompletas[0].totalFinal,'302.50');
 assert.equal(d.declaredTotalLiteral,'$ 260,50');
 assert.equal(result.originalesDescargables,false);
});
