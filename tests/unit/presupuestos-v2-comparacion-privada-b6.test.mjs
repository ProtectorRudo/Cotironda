import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararComparacionPrivadaB6} from
 '../../src/domain/presupuestos-v2/comparacion-privada-b6.ts';

const R='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const pedido={items:[{id:'cemento_001',cantidad:'2',unidad:'bag'}]};
const full={items:[...pedido.items,{id:'arena_001',cantidad:'1',unidad:'bag'}]};
const money=n=>'$ '+(n/100n).toString()+','+(n%100n).toString().padStart(2,'0');
const canonical=n=>(n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');
function quote({
 id='anon_aaa',letter='a',item='cemento_001',description='Cemento CPC 50 kg',
 qty=2,unitCents=10000n,iva='21',payment='contado',currency='ARS',
 freight='0.00',freightTreatment='sin_cargo',sourceState='verified',
 sourceVerified=true,availability=true,equivalence='verificada'
}={}){
 const source=letter.repeat(64),message=(letter.toUpperCase()).repeat(64);
 const base=unitCents*BigInt(qty);
 const withVat=base+(iva==='21'?(base*2100n+5000n)/10000n:
  iva==='10.5'?(base*1050n+5000n)/10000n:0n);
 const doc={
  requestId:R,anonId:id,messageHmac:message,sourceSha256:source,
  declaredTotalLiteral:money(withVat),
  lineas:[{
   lineNo:1,descriptionLiteral:description,quantityLiteral:String(qty),
   unitLiteral:'bolsas',unitPriceLiteral:money(unitCents),
   lineTotalLiteral:money(withVat)
  }],
  prueba:{
   requestId:R,messageHmac:message,sourceSha256:source,version:9,
   state:sourceState,reason:'covered',lineCount:1,
   sumLineCents:String(withVat),declaredTotalCents:String(withVat),
   rankingAllowed:false,revisionVigente:true,cotizacionVigente:true
  }
 };
 const correlations=[{
  itemId:item,lineNo:1,sourceSha256:source,equivalencia:equivalence,
  disponibilidadCorroborada:availability
 }];
 const terms={
  sourceSha256:source,sourceVerified,moneda:currency,pago:payment,
  plazoEntregaDias:2,fleteFinal:freight,minimoCompraFinal:'0.00',
  tratamientoFlete:freightTreatment,
  precios:[{
   lineNo:1,sourceSha256:source,unitarioNetoTrasDescuento:canonical(unitCents),
   ivaExplicito:iva,tratamientoIva:'incluido_en_total'
  }]
 };
 return {documento:doc,correlaciones:correlations,terminos:terms};
}
const compare=(documentos,p=pedido,requestId=R)=>
 prepararComparacionPrivadaB6({requestId,pedido:p,documentos});
test('B6: two independently verified prices for EXACT same requested item and terms',()=>{
 const r=compare([quote(),quote({id:'anon_bbb',letter:'b',unitCents:8000n})]);
 assert.equal(r.estado,'comparacion_privada_sin_publicacion');
 assert.equal(r.cantidadFuentesComparables,2);
 assert.equal(r.articulosComparables.length,1);
 const c=r.articulosComparables[0];
 assert.equal(c.articuloId,'cemento_001');
 assert.equal(c.moneda,'ARS');
 assert.equal(c.cantidadPedida,'2');
 assert.equal(c.ivaExplicito,'21');
 assert.equal(c.precioUnitarioMinimoNeto,'80.00');
 assert.equal(c.precioUnitarioMaximoNeto,'100.00');
 assert.deepEqual(c.referencias,[
  {presupuestoAnonimo:'anon_aaa',precioUnitarioNeto:'100.00'},
  {presupuestoAnonimo:'anon_bbb',precioUnitarioNeto:'80.00'}
 ]);
 assert.equal(c.rankingGeneralPermitido,false);
 assert.equal(c.alcance,'solo_precio_unitario_no_incluye_flete_ni_minimos');
 assert.deepEqual(r.comparacionCanastaCompleta.opcionesCompletas
  .map(x=>x.totalFinal),['193.60','242.00']);
 assert.equal(r.canPublish,false);
 assert.equal(r.canRevealContacts,false);
 assert.equal(r.canAdjudicate,false);
 assert.equal(r.canComparePartialTotals,false);
});
test('B6: two partial offers can complete basket as pair, not compare partial sums',()=>{
 const a=quote();
 const b=quote({id:'anon_bbb',letter:'b',item:'arena_001',
  description:'Arena en bolsas',qty:1,unitCents:5000n});
 const result=compare([a,b],full);
 assert.deepEqual(result.presupuestos.map(x=>x.articulosSinCobertura),
  [['arena_001'],['cemento_001']]);
 assert.equal(result.comparacionCanastaCompleta.cobertura[0].lineasCompletas,1);
 assert.equal(result.comparacionCanastaCompleta.cobertura[1].lineasCompletas,1);
 assert.deepEqual(result.comparacionCanastaCompleta.cobertura
  .map(x=>x.totalComparable),[null,null]);
 assert.equal(result.articulosComparables.length,0);
 assert.equal(result.comparacionCanastaCompleta.opcionesCompletas.length,1);
 assert.equal(result.comparacionCanastaCompleta.opcionesCompletas[0].totalFinal,'302.50');
 assert.deepEqual(result.comparacionCanastaCompleta.opcionesCompletas[0].proveedoresAnonimos,
  ['anon_aaa','anon_bbb']);
});
test('B6: shared prices of partial offers show by item, NEVER as whole-basket winner',()=>{
 const r=compare([quote(),quote({
  id:'anon_bbb',letter:'b',unitCents:9000n
 })],full);
 assert.equal(r.articulosComparables.length,1);
 assert.equal(r.articulosComparables[0].precioUnitarioMinimoNeto,'90.00');
 assert.equal(r.comparacionCanastaCompleta.opcionesCompletas.length,0);
 assert.equal(r.canComparePartialTotals,false);
});
test('B6: mixed payment terms, currency or IVA rates are not the same price group',()=>{
 for(const variant of [
  {payment:'transferencia'},{currency:'USD'},{iva:'0'}
 ]){
  const r=compare([quote(),quote({id:'anon_bbb',letter:'b',...variant})]);
  assert.equal(r.articulosComparables.length,0,JSON.stringify(variant));
  assert.equal(r.cantidadFuentesComparables,2);
 }
});
test('B6: B5d/B5e private candidates cannot be promoted by matching arithmetic',()=>{
 const a=quote({sourceState:'needs_source_review',sourceVerified:false});
 const r=compare([a]);
 assert.equal(r.presupuestos[0].estado,'fuente_no_verificada');
 assert.equal(r.cantidadFuentesComparables,0);
 assert.equal(r.articulosComparables.length,0);
 assert.deepEqual(r.comparacionCanastaCompleta.opcionesCompletas,[]);
});
test('B6: unknown IVA is not filled with zero or 21, no implied price comparison',()=>{
 const x=quote(),y=quote({id:'anon_bbb',letter:'b'});
 x.terminos.precios[0].ivaExplicito=null;
 const r=compare([x,y]);
 assert.equal(r.presupuestos[0].estado,'visible_no_comparable');
 assert.equal(r.cantidadFuentesComparables,1);
 assert.equal(r.articulosComparables.length,0);
 assert.equal(r.canPublish,false);
 assert.equal(JSON.stringify(r).includes('IVA no informado'),false);
});
test('B6: unclassified pallet blocks supplier economic entry, never silently excluded',()=>{
 const a=quote();
 a.documento.lineas.push({
  lineNo:2,descriptionLiteral:'Pallet',quantityLiteral:'1',
  unitLiteral:'unidad',unitPriceLiteral:'$ 10,00',lineTotalLiteral:'$ 10,00'
 });
 a.documento.prueba.lineCount=2;
 a.documento.prueba.sumLineCents='25200';
 a.documento.prueba.declaredTotalCents='25200';
 a.documento.declaredTotalLiteral='$ 252,00';
 const r=compare([a,quote({id:'anon_bbb',letter:'b'})]);
 assert.equal(r.presupuestos[0].estado,'visible_no_comparable');
 assert.deepEqual(r.presupuestos[0].lineasNoAsignadas,[2]);
 assert.equal(r.cantidadFuentesComparables,1);
 assert.equal(r.articulosComparables.length,0);
});
test('B6: alternative formulation can be complete with WARNING but not identical price',()=>{
 const r=compare([quote(),quote({id:'anon_bbb',letter:'b',
  unitCents:9000n,equivalence:'comercial_razonable'})]);
 assert.equal(r.cantidadFuentesComparables,2);
 assert.equal(r.articulosComparables.length,0);
 assert.equal(r.comparacionCanastaCompleta.opcionesCompletas.length,2);
 assert.ok(r.comparacionCanastaCompleta.opcionesCompletas.some(
  x=>x.advertencias?.[0]?.tipo==='alternativa_comercial_con_aclaracion'));
});
test('B6: nonmatching quantity or unverified stock is NOT equivalent',()=>{
 const notQty=quote({qty:1});
 const stock=quote({id:'anon_bbb',letter:'b',availability:false});
 const r=compare([notQty,stock]);
 assert.equal(r.cantidadFuentesComparables,0);
 assert.equal(r.articulosComparables.length,0);
});
test('B6: wrong round or duplicated supplier/archive source fails closed',()=>{
 const a=quote();
 assert.equal(compare([a],pedido,'11111111-1111-4111-8111-111111111111').estado,
  'entrada_invalida');
 assert.equal(compare([a,quote({letter:'b'})]).estado,'entrada_invalida');
 assert.equal(compare([a,quote({id:'anon_bbb',letter:'a'})]).estado,'entrada_invalida');
});
test('B6: output has no request UUID, archive SHA or WhatsApp identifiers',()=>{
 const a=quote(),result=compare([a]);
 const output=JSON.stringify(result);
 assert.equal(output.includes(R),false);
 assert.equal(output.includes(a.documento.messageHmac),false);
 assert.equal(output.includes(a.documento.sourceSha256),false);
 assert.equal(output.includes('whatsapp'),false);
 assert.equal(result.canRevealContacts,false);
});
test('B6: invalid requested quantity or item fails without partial rank',()=>{
 const r=compare([quote()],{items:[{id:'cemento_001',
  cantidad:'1.000',unidad:'bag'}]});
 assert.equal(r.estado,'entrada_invalida');
 assert.equal(r.comparacionCanastaCompleta,null);
});
