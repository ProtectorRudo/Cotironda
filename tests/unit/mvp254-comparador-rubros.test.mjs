import test from 'node:test';
import assert from 'node:assert/strict';
import {opcionesPorRubroMvp254} from
 '../../src/domain/ia-central/opciones-cobertura-rubros-mvp254.ts';

const pedido=[
 {id:'cemento_1',descripcion:'Cemento CPC 50 kg',rubro:'obra_gruesa',
  cantidad:'20',unidad:'bag'},
 {id:'arena_2',descripcion:'Arena en bolsón',rubro:'obra_gruesa',
  cantidad:'3',unidad:'m3'},
 {id:'latex_3',descripcion:'Látex interior 20 L',rubro:'pintura',
  cantidad:'2',unidad:'unit'},
 {id:'cable_4',descripcion:'Cable unipolar 2,5 mm',rubro:'electricidad',
  cantidad:'100',unidad:'m'}
];
const fixtures={
 cemento_1:{qty:20,price:9000,text:'bolsas cemento CPC 50 kg'},
 arena_2:{qty:3,price:30000,text:'bolsones arena'},
 latex_3:{qty:2,price:25000,text:'latas látex interior 20 L'},
 cable_4:{qty:100,price:800,text:'metros cable unipolar 2,5 mm'}
};
function amount(n){
 return '$'+n.toString().replace(/\B(?=(\d{3})+(?!\d))/gu,'.');
}
function quote(label,items,opts={}){
 const moneda=opts.moneda??'ARS';
 const lines=items.map((id,index)=>{
  const f=fixtures[id];
  const first=opts.discount&&index===0?f.price-100:f.price;
  const total=f.qty*first;
  const unitPrice=amount(first),totalText=amount(total);
  const line=String(f.qty)+' '+f.text+' · '+unitPrice+' c/u · total '+totalText;
  return {numero:index+1,textoOriginal:line,
   descripcion:pedido.find(p=>p.id===id).descripcion,
   cantidad:String(f.qty),unidad:pedido.find(p=>p.id===id).unidad,
   precioUnitarioLiteral:unitPrice,totalLineaLiteral:totalText,
   tipo:'material'};
 });
 return {
  etiquetaAnonima:label,moneda,iva:'no_informado',
  flete:'no_informado',pago:'no_informado',
  fuente:'Moneda: '+moneda+'\n'+lines.map(l=>l.textoOriginal).join('\n'),
  lineas:lines,
  vinculos:items.map((id,index)=>({
   lineaOferta:index+1,articuloPedido:id,
   equivalencia:'misma_presentacion',explicacion:'Coincide evidencia documental'
  }))
 };
}
const options=(...q)=>opcionesPorRubroMvp254(pedido,q);

test('etapa 4: dos negocios complementarios cubren obra gruesa, sin comparar totales',()=>{
 const a=quote('Oferta A',['cemento_1']);
 const b=quote('Oferta B',['arena_2']);
 const c=quote('Oferta C',['latex_3']);
 const d=quote('Oferta D',['cable_4']);
 const r=options(a,b,c,d);
 assert.equal(r.estado,'analisis_privado_por_rubro_sin_ranking');
 assert.equal(r.rubros.length,3);
 const obra=r.rubros.find(x=>x.rubro==='obra_gruesa');
 assert.equal(obra.solicitados,2);
 assert.deepEqual(obra.opciones[0].ofertasAnonimas,['Oferta A','Oferta B']);
 assert.equal(obra.opciones[0].cobertura,'completa');
 assert.deepEqual(obra.opciones[0].articulosCotizados,['cemento_1','arena_2']);
 assert.deepEqual(obra.opciones[0].articulosConPrecioComprobado,['cemento_1','arena_2']);
 assert.equal(obra.opciones[0].totalGlobalComparable,false);
 assert.equal(obra.opciones[0].condicionesHomogeneas,true);
 assert.deepEqual(obra.opciones.find(x=>x.ofertasAnonimas.length===1)
  .articulosFaltantes,['arena_2']);
 const pintura=r.rubros.find(x=>x.rubro==='pintura');
 assert.deepEqual(pintura.opciones[0].ofertasAnonimas,['Oferta C']);
 assert.deepEqual(r.rubros.find(x=>x.rubro==='electricidad')
  .opciones[0].articulosCotizados,['cable_4']);
 assert.equal(r.rankingGlobalPermitido,false);
 assert.equal(r.adjudicacionAutomatica,false);
 assert.equal(r.contactosRevelados,false);
});

test('etapa 4: oferta completa individual se distingue de pareja',()=>{
 const a=quote('Oferta A',['cemento_1']);
 const b=quote('Oferta B',['arena_2']);
 const full=quote('Oferta E',['cemento_1','arena_2']);
 const r=options(a,b,full);
 const obra=r.rubros[0];
 assert.deepEqual(obra.opciones[0].ofertasAnonimas,['Oferta E']);
 assert.equal(obra.opciones[1].ofertasAnonimas.length,2);
 assert.deepEqual(obra.opciones[1].ofertasAnonimas,['Oferta A','Oferta B']);
 assert.equal(obra.opciones.some(x=>x.ofertasAnonimas.includes('Oferta E')&&
  x.ofertasAnonimas.length>1),false);
});

test('etapa 4: USD y ARS no se suman, cobertura puede coexistir',()=>{
 const a=quote('Oferta A',['cemento_1'],{moneda:'ARS'});
 const b=quote('Oferta B',['arena_2'],{moneda:'USD'});
 const r=options(a,b);
 const option=r.rubros[0].opciones[0];
 assert.equal(option.cobertura,'completa');
 assert.equal(option.condicionesHomogeneas,false);
 assert.equal(option.comparacionEconomica,'condiciones_no_homogeneas');
 assert.equal(option.totalGlobalComparable,false);
 assert.ok(r.comparacionPorArticulo.every(x=>x.alternativas.length===0));
});

test('etapa 4: línea con precio inventado permanece en revisión',()=>{
 const a=quote('Oferta A',['cemento_1']);
 const bad=quote('Oferta B',['arena_2']);
 bad.lineas=[{...bad.lineas[0],precioUnitarioLiteral:'$1.000'}];
 const r=options(a,bad);
 assert.deepEqual(r.rubros[0].ofertasEnRevision,['Oferta B']);
 assert.deepEqual(r.rubros[0].opciones.map(x=>x.ofertasAnonimas),
  [['Oferta A']]);
});

test('etapa 4: ofertas vacías producen cobertura sin inventar cotizaciones',()=>{
 const r=options();
 assert.equal(r.rubros.length,3);
 assert.ok(r.rubros.every(x=>x.opciones.length===0));
 assert.ok(r.comparacionPorArticulo.every(x=>x.situacion==='sin_base_suficiente'));
});

test('etapa 4: etiqueta que puede filtrar nombre o datos del proveedor se rechaza',()=>{
 const a=quote('Oferta A',['cemento_1']);
 assert.throws(()=>options(a,a),/mvp254_etiqueta_no_anonima/);
 assert.throws(()=>options({...a,etiquetaAnonima:'Corralón de Juan'}),
  /mvp254_etiqueta_no_anonima/);
 assert.throws(()=>options({...a,etiquetaAnonima:'Oferta A +54 221'}),
  /mvp254_etiqueta_no_anonima/);
});

test('etapa 4: solo artículos equivalentes cotejados reciben comparativa de precios',()=>{
 const a=quote('Oferta A',['cemento_1','arena_2']);
 const b=quote('Oferta B',['cemento_1'],{discount:true});
 const r=options(a,b);
 const cemento=r.comparacionPorArticulo.find(x=>x.pedidoId==='cemento_1');
 assert.equal(cemento.situacion,'importe_linea_comparable');
 assert.deepEqual(cemento.alternativas.map(x=>x.oferta),['Oferta B','Oferta A']);
 assert.equal(r.comparacionPorArticulo.find(x=>x.pedidoId==='arena_2')
  .situacion,'sin_base_suficiente');
 assert.equal(r.rubros[0].opciones.length,2);
});

test('etapa 4: cambios de rubro nunca contaminan otra categoría',()=>{
 const other=quote('Oferta C',['latex_3']);
 const r=options(other);
 assert.deepEqual(r.rubros.find(x=>x.rubro==='obra_gruesa').opciones,[]);
 assert.equal(r.rubros.find(x=>x.rubro==='pintura').opciones.length,1);
});

test('etapa 4: tope dos proveedores por cada alternativa',()=>{
 const a=quote('Oferta A',['cemento_1']);
 const b=quote('Oferta B',['arena_2']);
 const c=quote('Oferta C',['cemento_1']);
 const d=quote('Oferta D',['arena_2']);
 const r=options(a,b,c,d);
 assert.ok(r.rubros.every(x=>x.opciones.every(y=>y.ofertasAnonimas.length<=2)));
 assert.equal(r.rubros[0].opciones.filter(x=>x.ofertasAnonimas.length===2).length,4);
 assert.ok(r.rubros[0].opciones.every(x=>x.totalGlobalComparable===false));
});
