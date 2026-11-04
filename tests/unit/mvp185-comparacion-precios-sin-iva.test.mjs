import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 interpretarSilencioIvaMvp185,compararPreciosCotizadosMvp185
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
