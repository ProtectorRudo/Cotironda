import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 interpretarSilencioIvaMvp185,compararPreciosCotizadosMvp185,
 monedaExplicitaFuenteMvp205
} from '../../src/domain/precios-cotizados-sin-iva-mvp185.ts';
import {compararCotizacionesOffline} from '../../src/domain/comparacion-ofertas.ts';

const REQ='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const H='a'.repeat(64),M='b'.repeat(64),T='c'.repeat(64),U='d'.repeat(64);
const pedido={items:[
 {id:'cemento_001',cantidad:'2',unidad:'bag'},
 {id:'arena_001',cantidad:'1',unidad:'bag'}
]};
const line=(id,no,q,unit,price,total)=>({
 lineNo:no,descriptionLiteral:id,quantityLiteral:q,
 unitLiteral:unit,unitPriceLiteral:price,lineTotalLiteral:total
});
const source=(which,items,iva='no_informado')=>{
 const isB=which==='b',sha=isB?T:H,hmac=isB?U:M;
 const total=items.reduce((sum,x)=>sum+Number(x.totalCents),0);
 const money=n=>'$ '+String(Math.floor(n/100))+','+String(n%100).padStart(2,'0');
 const lines=items.map((x,i)=>line(x.id,i+1,x.q,x.unit,money(x.unitCents),money(x.totalCents)));
 const d={
  requestId:REQ,anonId:'anon_private',messageHmac:hmac,sourceSha256:sha,
  declaredTotalLiteral:money(total),lineas:lines,
  prueba:{
   requestId:REQ,messageHmac:hmac,sourceSha256:sha,version:9,
   state:'verified',reason:'covered',lineCount:lines.length,
   sumLineCents:String(total),declaredTotalCents:String(total),
   rankingAllowed:false,revisionVigente:true,cotizacionVigente:true
  }
 };
 const factura={
  estado:'fuente_leida',
  iva:{estado:iva,tasa:null,ubicaciones:[]},
  flete:{estado:'no_informado',importe:null,ubicaciones:[]},
  pago:{estado:'no_informado',ubicaciones:[]},
  netoSinIvaAcreditado:false,stockCorroborado:false,
  plazoCorroborado:false,minimoCompraCorroborado:false,
  rankingHabilitado:false,originalesModificados:false,
  contactosRevelados:false
 };
 const e={
  state:'source_checked',sourceSha256:sha,rankingAllowed:false,
  descuentos:{
   estado:'descuentos_conciliados_sin_iva',
   precios:lines.map((x,i)=>({
    linea:i+1,pagina:1,fila:i+1,estado:'importe_sin_ajuste_conciliado',
    descuentoPorcentaje:null,unitarioComercialTrasDescuento:
     String(Math.floor(items[i].unitCents/100))+'.'+String(items[i].unitCents%100).padStart(2,'0'),
    ivaAcreditado:false
   })),
   rankingHabilitado:false,contactosRevelados:false,originalesModificados:false
  },
  condiciones:factura
 };
 const f={
  requestId:REQ,messageHmac:hmac,sourceSha256:sha,
  state:'source_checked',rankingAllowed:false,sourceImmutabilityPreserved:true,
  lines:lines.map((x,i)=>({
   lineNo:i+1,unitStatus:'explicit',unit:x.unitLiteral.startsWith('bols')?'bag':'unit',
   presentation:'none',page:1,row:i+1
  }))
 };
 return {
  doc:d,fuente:f,economia:e,moneda:'ARS',
  correlaciones:items.map((x,i)=>({
   itemId:x.id,lineNo:i+1,sourceSha256:sha,
   equivalencia:'verificada',disponibilidadCorroborada:false
  }))
 };
};
const cemento={id:'cemento_001',q:'2',unit:'bolsas',unitCents:10000,totalCents:20000};
const arena={id:'arena_001',q:'1',unit:'bolsa',unitCents:6050,totalCents:6050};
const run=(offers,req=pedido)=>compararPreciosCotizadosMvp185({pedido:req,ofertas:offers});

test('MVP185: IVA silencioso se toma SIN IVA solo para materiales, nunca 0% fiscal',()=>{
 const a=source('a',[cemento,arena]);
 const result=run([a]);
 assert.equal(result.estado,'proyeccion_informativa');
 assert.equal(result.ofertas[0].interpretacionIva,'sin_iva_por_convencion');
 assert.equal(result.opcionesCotizadas.length,1);
 assert.equal(result.opcionesCotizadas[0].subtotalMaterialesCotizadoSinIva,'260.50');
 assert.equal(result.opcionesCotizadas[0].ordenPorPrecioCotizado,1);
 assert.ok(result.opcionesCotizadas[0].advertencias.includes('iva_no_informado'));
 assert.equal(result.impuestosCalculados,false);
 assert.equal(result.rankingFinalHabilitado,false);
 assert.equal(result.adjudicacion,false);
 assert.equal(result.contactosRevelados,false);
 assert.equal(result.fleteCalculado,false);
 assert.equal(result.stockConfirmado,false);
 // Legacy FINAL economic ranking never converts unknown IVA to 0% silently.
 const strict={
  anonId:'anon_aaa',version:9,confirmada:true,moneda:'ARS',
  formaPago:null,plazoEntregaDias:null,fleteFinal:null,minimoCompraFinal:null,
  items:pedido.items.map(x=>({
   itemId:x.id,unidad:x.unidad,cantidadDisponible:x.cantidad,
   equivalencia:'verificada',precioUnitarioNeto:'100.00',ivaPorcentaje:null
  }))
 };
 assert.equal(compararCotizacionesOffline(pedido,[strict]).opcionesCompletas.length,0);
});

test('MVP185: dos presupuestos parciales complementarios se comparan juntos, nunca por sus subtotales sueltos',()=>{
 const a=source('a',[cemento]);
 const b=source('b',[arena]);
 const result=run([a,b]);
 assert.deepEqual(result.ofertas.map(x=>x.lineasConPrecioBaseComparable),[1,1]);
 assert.equal(result.opcionesCotizadas.length,1);
 assert.deepEqual(result.opcionesCotizadas[0].proveedoresAnonimos,['oferta_001','oferta_002']);
 assert.equal(result.opcionesCotizadas[0].subtotalMaterialesCotizadoSinIva,'260.50');
 assert.equal(result.opcionesCotizadas[0].asignacion.length,2);
 assert.equal(result.whatsappEnviado,false);
});

test('MVP185: una oferta completa y dos parciales: ordenar CANASTAS por precio declarado, no ganador',()=>{
 const a=source('a',[cemento,arena]);
 const b=source('b',[{...cemento,totalCents:19000,unitCents:9500}]);
 // Third offer must be a distinct source document; reusing hmac is rejected.
 const c=source('b',[arena]);c.doc.messageHmac='e'.repeat(64);
 c.fuente.messageHmac=c.doc.messageHmac;c.doc.prueba.messageHmac=c.doc.messageHmac;
 c.doc.sourceSha256='f'.repeat(64);c.fuente.sourceSha256=c.doc.sourceSha256;
 c.doc.prueba.sourceSha256=c.doc.sourceSha256;c.economia.sourceSha256=c.doc.sourceSha256;
 c.correlaciones[0].sourceSha256=c.doc.sourceSha256;
 const out=run([a,b,c]);
 // Un proveedor completo puede también integrar una opción de dos.
 // No ocultar otras canastas válidas ni adjudicar automáticamente.
 assert.equal(out.opcionesCotizadas.length,4);
 assert.deepEqual(out.opcionesCotizadas.map(x=>x.subtotalMaterialesCotizadoSinIva),
  ['250.50','250.50','260.50','260.50']);
 assert.ok(out.opcionesCotizadas.some(x=>
  x.proveedoresAnonimos.join('|')==='oferta_002|oferta_003'));
 assert.ok(out.opcionesCotizadas.some(x=>
  x.proveedoresAnonimos.join('|')==='oferta_001'));
 assert.equal(out.opcionesCotizadas[0].ordenPorPrecioCotizado,1);
 assert.equal(out.opcionesCotizadas[1].ordenPorPrecioCotizado,1);
 assert.equal(out.opcionesCotizadas[2].ordenPorPrecioCotizado,2);
 assert.equal(out.adjudicacion,false);
});

test('MVP185: IVA expresamente excluido comparte base material con silencio, pero se distingue',()=>{
 const a=source('a',[cemento,arena]);
 const b=source('b',[cemento,arena],'no_incluido');
 const r=run([a,b]);
 assert.equal(r.ofertas[0].interpretacionIva,'sin_iva_por_convencion');
 assert.equal(r.ofertas[1].interpretacionIva,'sin_iva_declarado');
 assert.equal(r.opcionesCotizadas.filter(x=>x.proveedoresAnonimos.length===1).length,2);
 assert.equal(r.opcionesCotizadas[0].ordenPorPrecioCotizado,1);
 assert.equal(r.opcionesCotizadas[1].ordenPorPrecioCotizado,1);
 assert.deepEqual(r.opcionesCotizadas[0].advertencias.includes('iva_no_informado'),true);
});

test('MVP185: IVA incluido expreso NO compite con precios sin IVA sin base fiscal común',()=>{
 const incl=source('a',[cemento,arena],'incluido');
 const silent=source('b',[cemento,arena]);
 const r=run([incl,silent]);
 assert.equal(r.ofertas[0].motivoExclusion,'iva_incluido_no_normalizado');
 assert.equal(r.opcionesCotizadas.length,1);
 assert.deepEqual(r.opcionesCotizadas[0].proveedoresAnonimos,['oferta_002']);
 assert.equal(r.rankingFinalHabilitado,false);
});
test('MVP185: IVA contradictorio y tasa sin base no generan referencia engañosa',()=>{
 for(const iva of ['contradictorio','tasa_sin_base']){
  const a=source('a',[cemento,arena],iva);
  const r=run([a]);
  assert.equal(r.ofertas[0].motivoExclusion,'tratamiento_iva_ambiguo');
  assert.equal(r.opcionesCotizadas.length,0);
 }
 assert.equal(interpretarSilencioIvaMvp185('no_informado'),'sin_iva_por_convencion');
 assert.equal(interpretarSilencioIvaMvp185('no_incluido'),'sin_iva_declarado');
});
test('MVP185: no infiere moneda, ni IVA 0, ni flete ni stock de fuente silenciosa',()=>{
 const a=source('a',[cemento,arena]);a.moneda=null;
 const r=run([a]);
 assert.equal(r.ofertas[0].motivoExclusion,'moneda_sin_acreditar');
 assert.equal(r.opcionesCotizadas.length,0);
 assert.equal(r.impuestosCalculados,false);
 assert.equal(r.fleteCalculado,false);
 assert.equal(r.stockConfirmado,false);
});
test('MVP185: línea de pallet o recargo sin asignar impide ordenar barato artificialmente',()=>{
 const a=source('a',[cemento,arena,{id:'pallet',q:'1',unit:'unidad',unitCents:1000,totalCents:1000}]);
 // El pallet figura en el original pero NO es un artículo del pedido.
 a.correlaciones=a.correlaciones.slice(0,2);
 const r=run([a]);
 assert.equal(r.ofertas[0].motivoExclusion,'cargos_o_lineas_sin_asignar');
 assert.equal(r.opcionesCotizadas.length,0);
});
test('MVP185: revisiones, sha, total y fuente no comprobada bloquean comparación',()=>{
 const changes=[
  a=>{a.doc.prueba.revisionVigente=false},
  a=>{a.doc.prueba.cotizacionVigente=false},
  a=>{a.doc.prueba.version=8},
  a=>{a.doc.prueba.sumLineCents='9999'},
  a=>{a.doc.declaredTotalLiteral='$ 0,00'},
  a=>{a.fuente.sourceSha256='f'.repeat(64)},
  a=>{a.economia.sourceSha256='f'.repeat(64)},
  a=>{a.economia.descuentos.estado='parcial'},
  a=>{a.correlaciones[0].sourceSha256='f'.repeat(64)},
  a=>{a.fuente.lines[0].unitStatus='not_explicit';a.doc.lineas[0].unitLiteral=null}
 ];
 for(const patch of changes){
  const a=source('a',[cemento,arena]);patch(a);
  const r=run([a]);
  assert.equal(r.opcionesCotizadas.length,0);
  assert.ok(r.ofertas[0].motivoExclusion!==null);
 }
});
test('MVP185: proveedor no puede aparentar cobertura con una unidad o cantidad distinta',()=>{
 const a=source('a',[cemento,arena]);a.doc.lineas[0].quantityLiteral='1';
 assert.equal(run([a]).opcionesCotizadas.length,0);
 const b=source('a',[cemento,arena]);b.doc.lineas[0].unitLiteral='kg';
 assert.equal(run([b]).opcionesCotizadas.length,0);
 const c=source('a',[cemento,arena]);c.correlaciones.push({...c.correlaciones[0]});
 assert.equal(run([c]).opcionesCotizadas.length,0);
});
test('MVP185: mensajes repetidos, pedidos inconsistentes y 26 artículos fallan cerrados',()=>{
 const a=source('a',[cemento,arena]);
 assert.equal(run([a,a]).estado,'insumos_invalidos');
 const b=source('b',[cemento,arena]);
 b.doc.requestId='otra_ronda';
 assert.equal(run([a,b]).estado,'insumos_invalidos');
 const tooMany={items:Array.from({length:26},(_,i)=>({
  id:'item_'+String(i).padStart(3,'0'),cantidad:'1',unidad:'unit'
 }))};
 assert.equal(run([a],tooMany).estado,'insumos_invalidos');
});
test('MVP185: salidas nunca incluyen SHA, HMAC, IDs ni textos privados',()=>{
 const a=source('a',[cemento,arena]);a.doc.lineas[0].descriptionLiteral=
  'Material Proveedor Privado Teléfono +541199999999';
 const r=run([a]);
 const out=JSON.stringify(r);
 for(const hidden of [H,M,REQ,'Proveedor Privado','541199999999','anon_private'])
  assert.ok(!out.includes(hidden),hidden);
 assert.equal(r.originalesDescargables,false);
});

test('MVP185: dos monedas no pueden sumarse ni compararse como si fueran iguales',()=>{
 const a=source('a',[cemento]);a.moneda='ARS';
 const b=source('b',[arena]);b.moneda='USD';
 const pair=run([a,b]);
 assert.equal(pair.opcionesCotizadas.length,0);
 const wholeA=source('a',[cemento,arena]);
 const wholeB=source('b',[cemento,arena]);wholeB.moneda='USD';
 const result=run([wholeA,wholeB]);
 assert.equal(result.opcionesCotizadas.length,2);
 assert.deepEqual(result.opcionesCotizadas.map(x=>x.moneda),['ARS','USD']);
 assert.deepEqual(result.opcionesCotizadas.map(x=>x.ordenPorPrecioCotizado),[1,1]);
});

test('MVP185: la vista piloto explica que silencio IVA se toma sin IVA sin calcular impuesto',()=>{
 const app=readFileSync(new URL('../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
 assert.match(app,/e\.iva_not_informed>0/);
 assert.match(app,/SIN IVA solo para referencias comerciales/);
 assert.match(app,/no significa IVA 0%/);
 assert.match(app,/no se presentan ganadores/);
});

/** MVP193: presentación de áridos corroborada nominalmente, nunca stock. */
function bolsonNominal(which,itemId='arena_001',material='arena',precio=150000){
 const entry=source(which,[{id:itemId,q:'1',unit:'',unitCents:precio,totalCents:precio}]);
 entry.doc.lineas[0].descriptionLiteral='Bolsón de '+material;
 entry.doc.lineas[0].unitLiteral=null;
 entry.fuente.lines[0].unitStatus='not_explicit';
 entry.fuente.lines[0].unit=null;
 entry.fuente.lines[0].presentation='bolson';
 entry.correlaciones[0].equivalencia='comercial_razonable';
 entry.pruebasBolson=[{
  itemId,lineNo:1,sourceSha256:entry.doc.sourceSha256,
  pedidoDescripcionLiteral:material+' 1 m3 para obra',
  presentacionFuente:'bolson'
 }];
 return entry;
}
const pedidoAridos={items:[
 {id:'arena_001',cantidad:'1',unidad:'m3'},
 {id:'piedra_001',cantidad:'1',unidad:'m3'}
]};

test('MVP193: 1 bolsón = 1 m³ NOMINAL de áridos con prueba SHA, sin IVA ni stock inventado',()=>{
 const a=bolsonNominal('a');
 const r=run([a],{items:pedidoAridos.items.slice(0,1)});
 assert.equal(r.estado,'proyeccion_informativa');
 assert.equal(r.ofertas[0].lineasConPrecioBaseComparable,1);
 assert.equal(r.opcionesCotizadas.length,1);
 assert.equal(r.opcionesCotizadas[0].subtotalMaterialesCotizadoSinIva,'1500.00');
 assert.ok(r.opcionesCotizadas[0].advertencias.includes('bolson_1m3_nominal_sin_stock'));
 assert.ok(r.opcionesCotizadas[0].advertencias.includes('iva_no_informado'));
 assert.equal(r.stockConfirmado,false);
 assert.equal(r.rankingFinalHabilitado,false);
 assert.equal(r.originalesDescargables,false);
 assert.equal(r.contactosRevelados,false);
});

test('MVP193: dos ofertas parciales de áridos se unen sin comparar parciales como totales',()=>{
 const a=bolsonNominal('a','arena_001','arena',150000);
 const b=bolsonNominal('b','piedra_001','piedra',170000);
 const r=run([a,b],pedidoAridos);
 assert.deepEqual(r.ofertas.map(x=>x.lineasConPrecioBaseComparable),[1,1]);
 assert.equal(r.opcionesCotizadas.length,1);
 assert.equal(r.opcionesCotizadas[0].subtotalMaterialesCotizadoSinIva,'3200.00');
 assert.deepEqual(r.opcionesCotizadas[0].proveedoresAnonimos,['oferta_001','oferta_002']);
 assert.deepEqual(r.opcionesCotizadas[0].asignacion.map(x=>x.oferta),['oferta_001','oferta_002']);
 assert.ok(r.opcionesCotizadas[0].advertencias.includes('bolson_1m3_nominal_sin_stock'));
 assert.equal(r.adjudicacion,false);
});

test('MVP193: SIN prueba de pedido y línea de fuente no reemplazar unidad ausente',()=>{
 const r={items:[pedidoAridos.items[0]]};
 for(const alter of [
  x=>{delete x.pruebasBolson},
  x=>{x.pruebasBolson[0].sourceSha256='f'.repeat(64)},
  x=>{x.pruebasBolson[0].lineNo=2},
  x=>{x.pruebasBolson[0].itemId='item_999'},
  x=>{x.pruebasBolson[0].pedidoDescripcionLiteral='piedra 1 m3'},
  x=>{x.pruebasBolson[0].presentacionFuente='big_bag'},
  x=>{x.fuente.lines[0].presentation='none'},
  x=>{x.fuente.lines[0].page=null},
  x=>{x.fuente.lines[0].row=null},
  x=>{x.fuente.lines[0].unit='m3'},
  x=>{x.doc.lineas[0].unitLiteral='kg'},
  x=>{x.correlaciones[0].equivalencia='sin_verificar'}
 ]){
  const a=bolsonNominal('a');alter(a);
  const v=run([a],r);
  assert.equal(v.opcionesCotizadas.length,0,JSON.stringify({
   proof:a.pruebasBolson?.[0],line:a.doc.lineas[0].unitLiteral,
   fact:a.fuente.lines[0],equiv:a.correlaciones[0].equivalencia
  }));
  assert.ok(v.ofertas[0].motivoExclusion!==null);
 }
});

test('MVP193: bolsón chico, peso/capacidad contradictoria y cantidades diferentes NO se convierten',()=>{
 const r={items:[pedidoAridos.items[0]]};
 for(const alter of [
  x=>{x.doc.lineas[0].descriptionLiteral='Bolsón chico de arena'},
  x=>{x.doc.lineas[0].descriptionLiteral='Bolsón arena 500 kg'},
  x=>{x.doc.lineas[0].descriptionLiteral='Bolsón arena de 0.5 m3'},
  x=>{x.doc.lineas[0].quantityLiteral='2'},
  x=>{x.doc.lineas[0].descriptionLiteral='Bolsón piedra'},
  x=>{x.doc.lineas[0].descriptionLiteral='Arena suelta'},
  x=>{x.pruebasBolson[0].pedidoDescripcionLiteral='arena fina exclusivamente 1 m3';
     x.doc.lineas[0].descriptionLiteral='Bolsón arena'}
 ]){
  const a=bolsonNominal('a');alter(a);
  const o=run([a],r);
  assert.equal(o.opcionesCotizadas.length,0,JSON.stringify(a.doc.lineas[0]));
  assert.equal(o.rankingFinalHabilitado,false);
 }
});

test('MVP193: líneas extras del original no ocultan pallet ni cargos',()=>{
 const a=source('a',[
  {id:'arena_001',q:'1',unit:'',unitCents:150000,totalCents:150000},
  {id:'pallet',q:'1',unit:'unidad',unitCents:10000,totalCents:10000}
 ]);
 a.doc.lineas[0].descriptionLiteral='Bolsón arena';
 a.doc.lineas[0].unitLiteral=null;
 a.fuente.lines[0].unitStatus='not_explicit';
 a.fuente.lines[0].unit=null;
 a.fuente.lines[0].presentation='bolson';
 a.correlaciones=a.correlaciones.slice(0,1);
 a.correlaciones[0].equivalencia='comercial_razonable';
 a.pruebasBolson=[{
  itemId:'arena_001',lineNo:1,sourceSha256:a.doc.sourceSha256,
  pedidoDescripcionLiteral:'arena 1 m3',presentacionFuente:'bolson'
 }];
 const o=run([a],{items:[pedidoAridos.items[0]]});
 assert.equal(o.ofertas[0].motivoExclusion,'cargos_o_lineas_sin_asignar');
 assert.equal(o.opcionesCotizadas.length,0);
});


/** MVP195 — packages tied to the same v9 supplier document + buyer request. */
const requestedCement={items:[{id:'cemento_001',cantidad:'20',unidad:'bag'}]};
const requestedWaterproof={items:[{id:'hidrofugo_001',cantidad:'5',unidad:'l'}]};
function verifiedPack(which,{itemId='cemento_001',quantity='40',name='cemento avellaneda x 25 kg',
 unitCents=1000,totalCents=40000,familia='cemento_gris_obra',
 buyer='cemento CPC 50 kg'}={}){
 const a=source(which,[{id:itemId,q:quantity,unit:'',unitCents,totalCents}]);
 a.doc.lineas[0].descriptionLiteral=name;
 a.doc.lineas[0].unitLiteral=null;
 a.fuente.lines[0].unitStatus='not_explicit';
 a.fuente.lines[0].unit=null;
 a.fuente.lines[0].presentation='none';
 a.correlaciones[0].equivalencia='comercial_razonable';
 a.pruebasEnvasesObra=[{
  itemId,lineNo:1,sourceSha256:a.doc.sourceSha256,
  pedidoDescripcionLiteral:buyer,familia
 }];
 return a;
}
test('MVP195: 20 bolsas de cemento 50 kg frente a 40 de 25 kg comparan MATERIAL total, no bolsas sueltas',()=>{
 const a=verifiedPack('a');
 const r=run([a],requestedCement);
 assert.equal(r.estado,'proyeccion_informativa');
 assert.equal(r.ofertas[0].lineasConPrecioBaseComparable,1);
 assert.equal(r.opcionesCotizadas.length,1);
 assert.equal(r.opcionesCotizadas[0].subtotalMaterialesCotizadoSinIva,'400.00');
 assert.ok(r.opcionesCotizadas[0].advertencias.includes(
  'presentacion_envase_diferente_misma_cantidad_sin_stock'));
 for(const f of ['stockConfirmado','rankingFinalHabilitado','contactosRevelados',
  'fleteCalculado','adjudicacion','originalesDescargables'])
  assert.equal(r[f],false,f);
});
test('MVP195: hidrófugo 5 litros permite cotizar UN bidón original de 5 L',()=>{
 const a=verifiedPack('a',{
  itemId:'hidrofugo_001',quantity:'1',
  name:'Sinteplast Hidrofugo 5lts',unitCents:75000,totalCents:75000,
  familia:'hidrofugo',buyer:'hidrófugo'
 });
 const r=run([a],requestedWaterproof);
 assert.equal(r.opcionesCotizadas.length,1);
 assert.equal(r.opcionesCotizadas[0].subtotalMaterialesCotizadoSinIva,'750.00');
 assert.ok(r.opcionesCotizadas[0].advertencias.includes(
  'presentacion_envase_diferente_misma_cantidad_sin_stock'));
});
test('MVP195: dos envases equivalentes son dos opciones completas de materiales, no ranking final',()=>{
 const a=verifiedPack('a');
 const b=verifiedPack('b',{
  quantity:'20',name:'CEMENTO CPC 50 KG',
  unitCents:1900,totalCents:38000
 });
 const r=run([a,b],requestedCement);
 assert.deepEqual(r.opcionesCotizadas.map(x=>x.subtotalMaterialesCotizadoSinIva),
  ['380.00','400.00']);
 assert.deepEqual(r.opcionesCotizadas[0].proveedoresAnonimos,['oferta_002']);
 assert.equal(r.rankingFinalHabilitado,false);
 assert.equal(r.adjudicacion,false);
 assert.equal(r.impuestosCalculados,false);
});
test('MVP195: rechaza falta de prueba, descripción, familia, páginas, SHA o correlación manipulada',()=>{
 for(const patch of [
  x=>{delete x.pruebasEnvasesObra},
  x=>{x.pruebasEnvasesObra[0].sourceSha256='f'.repeat(64)},
  x=>{x.pruebasEnvasesObra[0].itemId='otro_001'},
  x=>{x.pruebasEnvasesObra[0].lineNo=2},
  x=>{x.pruebasEnvasesObra[0].pedidoDescripcionLiteral='piedra partida'},
  x=>{x.pruebasEnvasesObra[0].familia='hidrofugo'},
  x=>{x.fuente.lines[0].row=null},
  x=>{x.fuente.lines[0].page=null},
  x=>{x.fuente.lines[0].unit='bag'},
  x=>{x.doc.lineas[0].unitLiteral='kg'},
  x=>{x.correlaciones[0].equivalencia='sin_verificar'},
  x=>{x.doc.prueba.revisionVigente=false},
  x=>{x.doc.lineas[0].descriptionLiteral='piedra partida x 25 kg'},
  x=>{x.doc.lineas[0].descriptionLiteral='hidrofugo 5 litros'},
  x=>{x.doc.lineas[0].descriptionLiteral='cemento avellaneda x 25 kg y 50 kg'}
 ]){
  const a=verifiedPack('a');patch(a);
  const r=run([a],requestedCement);
  assert.equal(r.opcionesCotizadas.length,0,JSON.stringify({
   source:a.doc.lineas[0].descriptionLiteral,
   proof:a.pruebasEnvasesObra?.[0],unit:a.fuente.lines[0].unit
  }));
 }
});
test('MVP195: 40 bolsas 25 kg NO alcanzan un pedido de 25 bolsas 50 kg',()=>{
 const a=verifiedPack('a');
 const r=run([a],{items:[{id:'cemento_001',cantidad:'25',unidad:'bag'}]});
 assert.equal(r.opcionesCotizadas.length,0);
});
test('MVP195: 5L de hidrófugo no equivalen a 5 unidades SIN contenido declarado',()=>{
 const a=verifiedPack('a',{
  itemId:'hidrofugo_001',quantity:'5',name:'HIDROFUGO EN PASTA',
  unitCents:15000,totalCents:75000,familia:'hidrofugo',buyer:'hidrófugo'
 });
 assert.equal(run([a],requestedWaterproof).opcionesCotizadas.length,0);
});
test('MVP195: descuentos, precios después del descuento y coordenadas exactas son obligatorios',()=>{
 for(const mutate of [
  x=>{x.economia.descuentos.precios[0].unitarioComercialTrasDescuento='9999.00'},
  x=>{x.economia.descuentos.precios[0].pagina=99},
  x=>{x.economia.descuentos.precios[0].fila=99},
  x=>{x.economia.descuentos.precios[0].unitarioComercialTrasDescuento=null},
  x=>{x.doc.lineas[0].lineTotalLiteral='$ 999,00'}
 ]){
  const a=verifiedPack('a');mutate(a);
  const r=run([a],requestedCement);
  assert.equal(r.opcionesCotizadas.length,0);
  assert.ok(r.ofertas[0].motivoExclusion!==null);
 }
});

test('MVP195: caso representativo del PILOTO 310359,22 vs oferta parcial más barata sin litros',()=>{
 // Fixture of two supplier source lines, NOT live private identifiers.
 const a=source('a',[
  {id:'cemento_001',q:'40',unit:'',unitCents:760370,totalCents:30414800},
  {id:'hidrofugo_001',q:'1',unit:'',unitCents:621122,totalCents:621122}
 ]);
 a.doc.lineas[0].descriptionLiteral='cemento avellaneda x 25 kg';
 a.doc.lineas[1].descriptionLiteral='Sinteplast Hidrofugo 5lts';
 for(let i=0;i<2;i++){
  a.doc.lineas[i].unitLiteral=null;
  a.fuente.lines[i].unitStatus='not_explicit';
  a.fuente.lines[i].unit=null;
  a.correlaciones[i].equivalencia='comercial_razonable';
 }
 a.pruebasEnvasesObra=[
  {itemId:'cemento_001',lineNo:1,sourceSha256:a.doc.sourceSha256,
   pedidoDescripcionLiteral:'cemento CPC 50 kg',familia:'cemento_gris_obra'},
  {itemId:'hidrofugo_001',lineNo:2,sourceSha256:a.doc.sourceSha256,
   pedidoDescripcionLiteral:'hidrófugo',familia:'hidrofugo'}
 ];
 const b=source('b',[
  {id:'cemento_001',q:'20',unit:'',unitCents:1025000,totalCents:20500000},
  {id:'hidrofugo_001',q:'5',unit:'',unitCents:305000,totalCents:1525000}
 ]);
 b.doc.lineas[0].descriptionLiteral='CEMENTO CPC 50 KG';
 b.doc.lineas[1].descriptionLiteral='HIDROFUGO EN PASTA';
 for(let i=0;i<2;i++){
  b.doc.lineas[i].unitLiteral=null;
  b.fuente.lines[i].unitStatus='not_explicit';
  b.fuente.lines[i].unit=null;
  b.correlaciones[i].equivalencia='comercial_razonable';
 }
 b.pruebasEnvasesObra=[
  {itemId:'cemento_001',lineNo:1,sourceSha256:b.doc.sourceSha256,
   pedidoDescripcionLiteral:'cemento CPC 50 kg',familia:'cemento_gris_obra'},
  {itemId:'hidrofugo_001',lineNo:2,sourceSha256:b.doc.sourceSha256,
   pedidoDescripcionLiteral:'hidrófugo',familia:'hidrofugo'}
 ];
 const req={items:[{id:'cemento_001',cantidad:'20',unidad:'bag'},
                   {id:'hidrofugo_001',cantidad:'5',unidad:'l'}]};
 const r=run([a,b],req);
 assert.deepEqual(r.opcionesCotizadas.map(x=>x.subtotalMaterialesCotizadoSinIva),
  ['310359.22']);
 assert.deepEqual(r.opcionesCotizadas[0].proveedoresAnonimos,['oferta_001']);
 assert.equal(r.ofertas[1].motivoExclusion,'unidad_sin_acreditar');
 assert.equal(r.rankingFinalHabilitado,false);
 assert.equal(r.contactosRevelados,false);
});

const changeCurrency=(entry,currency)=>{
 const prefix=currency==='ARS'?'AR$':currency==='USD'?'US$':'$';
 const set=x=>x.replace(/^\$\s*/u,prefix+' ');
 entry.doc.declaredTotalLiteral=set(entry.doc.declaredTotalLiteral);
 for(const line of entry.doc.lineas){
  line.unitPriceLiteral=set(line.unitPriceLiteral);
  line.lineTotalLiteral=set(line.lineTotalLiteral);
 }
 return entry;
};

test('MVP205: origen v9 con AR$ explícito en TODOS los importes permite referencia comercial sin otra pregunta',()=>{
 const a=changeCurrency(source('a',[cemento,arena]),'ARS');a.moneda=null;
 assert.equal(monedaExplicitaFuenteMvp205(a.doc),'ARS');
 const r=run([a]);
 assert.equal(r.ofertas[0].motivoExclusion,null);
 assert.equal(r.opcionesCotizadas.length,1);
 assert.equal(r.opcionesCotizadas[0].moneda,'ARS');
 assert.equal(r.opcionesCotizadas[0].subtotalMaterialesCotizadoSinIva,'260.50');
 assert.ok(r.opcionesCotizadas[0].advertencias.includes('iva_no_informado'));
 assert.equal(r.rankingFinalHabilitado,false);
 assert.equal(r.whatsappEnviado,false);
});

test('MVP205: AR$ y US$ explícitos se mantienen en grupos separados, sin conversión entre monedas',()=>{
 const a=changeCurrency(source('a',[cemento,arena]),'ARS');a.moneda=null;
 const b=changeCurrency(source('b',[cemento,arena]),'USD');b.moneda=null;
 assert.equal(monedaExplicitaFuenteMvp205(b.doc),'USD');
 const r=run([a,b]);
 assert.equal(r.opcionesCotizadas.length,2);
 assert.deepEqual(r.opcionesCotizadas.map(x=>x.moneda),['ARS','USD']);
 assert.deepEqual(r.opcionesCotizadas.map(x=>x.ordenPorPrecioCotizado),[1,1]);
 assert.equal(r.opcionesCotizadas.some(x=>x.proveedoresAnonimos.length===2),false);
});

test('MVP205: $ a secas, marca parcial o total aislado NO acreditan moneda',()=>{
 for(const mutate of [
  a=>{},
  a=>{a.doc.declaredTotalLiteral='AR$ '+a.doc.declaredTotalLiteral.slice(2)},
  a=>{a.doc.lineas[0].lineTotalLiteral='AR$ '+a.doc.lineas[0].lineTotalLiteral.slice(2)}
 ]){
  const a=source('a',[cemento,arena]);a.moneda=null;mutate(a);
  assert.equal(monedaExplicitaFuenteMvp205(a.doc),null);
  assert.equal(run([a]).ofertas[0].motivoExclusion,'moneda_sin_acreditar');
  assert.equal(run([a]).opcionesCotizadas.length,0);
 }
});

test('MVP205: USD en un renglón contradice AR$ aunque exista moneda externa',()=>{
 for(const external of [null,'ARS','USD']){
  const a=changeCurrency(source('a',[cemento,arena]),'ARS');
  a.doc.lineas[0].lineTotalLiteral=a.doc.lineas[0].lineTotalLiteral.replace('AR$','US$');
  a.moneda=external;
  assert.equal(monedaExplicitaFuenteMvp205(a.doc),null);
  const r=run([a]);
  assert.equal(r.ofertas[0].motivoExclusion,'moneda_contradictoria_en_original');
  assert.equal(r.opcionesCotizadas.length,0);
 }
});

test('MVP205: una atestación externa opuesta al original explícito siempre bloquea',()=>{
 const a=changeCurrency(source('a',[cemento,arena]),'USD');a.moneda='ARS';
 const r=run([a]);
 assert.equal(r.ofertas[0].motivoExclusion,'moneda_contradictoria_en_original');
 assert.equal(r.opcionesCotizadas.length,0);
});

test('MVP205: falsear SHA/version o total impide acreditar la moneda',()=>{
 for(const mutate of [
  a=>a.doc.prueba.version=8,
  a=>a.doc.prueba.revisionVigente=false,
  a=>a.doc.sourceSha256='f'.repeat(64),
  a=>a.doc.prueba.sumLineCents='5'
 ]){
  const a=changeCurrency(source('a',[cemento,arena]),'ARS');
  a.moneda=null;mutate(a);
  assert.equal(monedaExplicitaFuenteMvp205(a.doc),null);
  assert.equal(run([a]).opcionesCotizadas.length,0);
 }
});
