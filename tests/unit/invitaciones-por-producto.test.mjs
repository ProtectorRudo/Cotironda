import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararBorradorDocumental} from '../../src/domain/extraccion-documental.ts';
import {planificarInvitacionesPorProducto} from '../../src/domain/invitaciones-por-producto.ts';

const solicitud={id:'ronda_familia_001',zona_entrega:'la_plata',envio_autorizado_por_comprador:true};
const linea=(descripcion,cantidad='10',unidad='bag',rubro='corralon',extra={})=>({
  ubicacion:'Texto, línea 1',descripcion_original:descripcion,
  producto_normalizado:descripcion,cantidad,unidad,rubro,
  marca:null,marca_obligatoria:false,confianza:0.99,...extra
});
const sk=(id,desc,marca,contenido='25',extra={})=>({
  sku:id,descripcion:desc,marca,producto_id:'cemento_gris_obra',
  rubro:'corralon',unidad_venta:'bag',contenido_por_envase:contenido,
  unidad_base:'kg',atributos_criticos:[{codigo:'tipo',valor:'cpc'}],
  especificaciones_verificadas:true,confirmado_por_proveedor:true,...extra
});
const proveedor=(id,skus,extra={})=>({
  id,activo:true,consentimiento_whatsapp:true,opt_out:false,
  zonas_entrega:['la_plata'],catalogo_confirmado:[],skus_confirmados:skus,...extra
});
const requisito=(l,extra={})=>({
  fila:1,descripcion_original:l.descripcion_original,
  producto_id:'cemento_gris_obra',rubro:l.rubro,
  atributos_solicitados:[],
  contenido_por_unidad_solicitada:null,unidad_base:null,...extra
});
const cemento=linea('Cemento');
const avellaneda=sk('cemento_avellaneda_25','Cemento Avellaneda 25 kg','Avellaneda');
const t35=sk('cemento_avellaneda_35','Cemento Avellaneda 35 kg','Avellaneda','35');
const loma=sk('cemento_loma_25','Cemento Loma Negra 25 kg','Loma Negra');
const entrada=(lines=[cemento],reqs=[requisito(cemento)],
  providers=[proveedor('corralon_001',[avellaneda])],s=solicitud)=>({
  solicitud:s,borrador:prepararBorradorDocumental('texto',{items:lines}),
  requisitos:reqs,proveedores:providers
});
const run=(...args)=>planificarInvitacionesPorProducto(entrada(...args));

test('arquitecto pide «cemento», comerciante trabaja Avellaneda 25kg: recibe consulta',()=>{
  const r=run();
  assert.equal(r.estado,'invitaciones_por_producto_sin_envio');
  assert.equal(r.invitaciones.length,1);
  const item=r.invitaciones[0].items[0];
  assert.equal(item.pedido_original,'Cemento');
  assert.equal(item.opciones[0].marca_catalogo,'Avellaneda');
  assert.equal(item.opciones[0].relacion,'verificar_especificacion');
  assert.equal(item.opciones[0].cantidad_envases_orientativa,null);
  assert.ok(item.mensaje_proveedor.includes('qué producto de esta familia'));
});
test('arquitecto pide Cemento Loma Negra 50kg; Avellaneda 25kg/35kg también puede cotizar',()=>{
  const l=linea('Cemento Loma Negra 50 kg','20','bag','corralon',{marca:'Loma Negra'});
  const r=run([l],[requisito(l,{
    contenido_por_unidad_solicitada:'50',unidad_base:'kg'
  })],[proveedor('corralon_001',[avellaneda,t35])]);
  assert.equal(r.invitaciones.length,1);
  const item=r.invitaciones[0].items[0];
  assert.equal(item.marca_mencionada,'Loma Negra');
  assert.equal(item.marca_exclusiva,false);
  assert.deepEqual(item.opciones.map(x=>x.marca_catalogo),['Avellaneda','Avellaneda']);
  assert.deepEqual(item.opciones.map(x=>x.cantidad_envases_orientativa),[null,null]);
  assert.ok(item.opciones.every(x=>x.comparable_como_identico===false));
});
test('cuando requisitos técnicos están confirmados, 20×50kg → 40×25 y 29×35, con excedente 15kg',()=>{
  const l=linea('Cemento Loma Negra 50 kg','20','bag','corralon',{marca:'Loma Negra'});
  const r=run([l],[requisito(l,{
    atributos_solicitados:[{codigo:'tipo',valor:'cpc'}],
    contenido_por_unidad_solicitada:'50',unidad_base:'kg'
  })],[proveedor('corralon_001',[avellaneda,t35])]);
  const opts=r.invitaciones[0].items[0].opciones;
  assert.deepEqual(opts.map(x=>x.cantidad_envases_orientativa),['40','29']);
  assert.deepEqual(opts.map(x=>x.excedente_orientativo),['0','15']);
  assert.ok(opts.every(x=>x.relacion==='mismo_producto'));
});
test('marca mencionada no es obligatoria, una marca expresamente exclusiva sí filtra',()=>{
  const l=linea('Cemento Loma Negra','10','bag','corralon',{
    marca:'Loma Negra',marca_obligatoria:true
  });
  const r=run([l],[requisito(l)],[proveedor('corralon_001',[avellaneda,loma])]);
  assert.deepEqual(r.invitaciones[0].items[0].opciones.map(x=>x.marca_catalogo),['Loma Negra']);
  const solo=run([l],[requisito(l)],[proveedor('corralon_001',[avellaneda])]);
  assert.equal(solo.invitaciones.length,0);
});
test('cemento no equivale a adhesivo aunque el proveedor trabaje ambos en mismo rubro',()=>{
  const r=run([cemento],[requisito(cemento)],[proveedor('corralon_001',[
    sk('adhesivo_001','Adhesivo cerámico 25 kg','Marca A','25',{producto_id:'adhesivo_ceramico'})
  ])]);
  assert.equal(r.invitaciones.length,0);
  assert.deepEqual(r.retenidas,[{fila:1,motivo:'sin_proveedor_que_trabaje_producto'}]);
});
test('CPC pedido, CPN en catálogo: puede CONSULTAR alternativa pero con diferencia técnica explícita',()=>{
  const l=linea('Cemento CPC 50 kg','20','bag');
  const r=run([l],[requisito(l,{
    atributos_solicitados:[{codigo:'tipo',valor:'cpc'}],
    contenido_por_unidad_solicitada:'50',unidad_base:'kg'
  })],[proveedor('corralon_001',[sk('cemento_cpn','Cemento CPN 25kg','Marca B','25',{
    atributos_criticos:[{codigo:'tipo',valor:'cpn'}]
  })])]);
  const opcion=r.invitaciones[0].items[0].opciones[0];
  assert.equal(opcion.relacion,'diferencia_tecnica_declarada');
  assert.deepEqual(opcion.diferencias,['tipo']);
  assert.equal(opcion.cantidad_envases_orientativa,null);
  assert.equal(opcion.comparable_como_identico,false);
});
test('placa RH 12,5 y única placa RF: proveedor recibe consulta, pero no se declara cumplimiento',()=>{
  const l=linea('Placa de yeso RH 12,5 mm','15','unit','construccion_seco');
  const r=run([l],[requisito(l,{
    producto_id:'placa_yeso',atributos_solicitados:[
      {codigo:'clase',valor:'rh'},{codigo:'espesor_mm',valor:'12.5'}
    ],unidad_base:'unit',contenido_por_unidad_solicitada:'1'
  })],[proveedor('seco_00001',[sk('placa_rf_125','Placa RF 12,5mm','Marca P','1',{
    producto_id:'placa_yeso',rubro:'construccion_seco',
    unidad_venta:'unit',unidad_base:'unit',
    atributos_criticos:[
      {codigo:'clase',valor:'rf'},{codigo:'espesor_mm',valor:'12.5'}
    ]
  })])]);
  const o=r.invitaciones[0].items[0].opciones[0];
  assert.equal(o.relacion,'diferencia_tecnica_declarada');
  assert.deepEqual(o.diferencias,['clase']);
  assert.equal(o.cantidad_envases_orientativa,null);
});
test('látex interior: quien trabaja látex exterior puede consultar pero no prometer equivalencia',()=>{
  const l=linea('Pintura látex interior mate','20','l','pintureria');
  const p=sk('latex_exterior','Látex exterior 18 L','Marca P','18',{
    producto_id:'pintura_latex',rubro:'pintureria',unidad_base:'l',
    unidad_venta:'unit',atributos_criticos:[{codigo:'uso',valor:'exterior'}]
  });
  const r=run([l],[requisito(l,{
    producto_id:'pintura_latex',atributos_solicitados:[{codigo:'uso',valor:'interior'}],
    contenido_por_unidad_solicitada:'1',unidad_base:'l'
  })],[proveedor('pintura_001',[p])]);
  assert.equal(r.invitaciones[0].items[0].opciones[0].relacion,'diferencia_tecnica_declarada');
});
test('cable 2,5 mm2 y proveedor 1,5 mm2: misma familia consultable, diferencia identificada',()=>{
  const l=linea('Cable unipolar 2,5 mm2','100','m','electricidad');
  const s=sk('cable_15','Cable unipolar 1,5mm2','Marca C','100',{
    producto_id:'cable_unipolar',rubro:'electricidad',unidad_base:'m',
    unidad_venta:'roll',atributos_criticos:[{codigo:'seccion_mm2',valor:'1.5'}]
  });
  const r=run([l],[requisito(l,{
    producto_id:'cable_unipolar',unidad_base:'m',
    contenido_por_unidad_solicitada:'1',
    atributos_solicitados:[{codigo:'seccion_mm2',valor:'2.5'}]
  })],[proveedor('electric_001',[s])]);
  assert.equal(r.invitaciones[0].items[0].opciones[0].relacion,'diferencia_tecnica_declarada');
  assert.equal(r.invitaciones[0].items[0].opciones[0].cantidad_envases_orientativa,null);
});
test('solicitud genérica sin tamaño de bolsa no inventa contenido de envase solicitado',()=>{
  const r=run([cemento],[requisito(cemento)],[proveedor('corralon_001',[t35])]);
  assert.equal(r.invitaciones[0].items[0].cantidad_pedida,'10');
  assert.equal(r.invitaciones[0].items[0].opciones[0].cantidad_envases_orientativa,null);
});
test('producto en catálogo proveedor y unidad base distinta: consulta sin conversión',()=>{
  const r=run([cemento],[requisito(cemento,{
    unidad_base:'kg',contenido_por_unidad_solicitada:'50'
  })],[proveedor('corralon_001',[sk('cemento_litro','Cemento líquido','Marca A','5',{
    unidad_base:'l',unidad_venta:'unit'
  })])]);
  assert.equal(r.invitaciones.length,1);
  assert.equal(r.invitaciones[0].items[0].opciones[0].relacion,'verificar_especificacion');
  assert.equal(r.invitaciones[0].items[0].opciones[0].cantidad_envases_orientativa,null);
});
test('zona, opt-in, opt-out y estado suspendido siguen bloqueando invitación',()=>{
  const r=run([cemento],[requisito(cemento)],[
    proveedor('suspendido_1',[avellaneda],{activo:false}),
    proveedor('fuera_zona_1',[avellaneda],{zonas_entrega:['rosario']}),
    proveedor('baja_000001',[avellaneda],{opt_out:true}),
    proveedor('sin_consentir',[avellaneda],{consentimiento_whatsapp:false}),
    proveedor('corralon_001',[avellaneda])
  ]);
  assert.deepEqual(r.invitaciones.map(x=>x.proveedor_id),['corralon_001']);
});
test('sin autorización comprador no se prepara invitación',()=>{
  assert.throws(()=>run([cemento],[requisito(cemento)],[proveedor('corralon_001',[avellaneda])],{
    ...solicitud,envio_autorizado_por_comprador:false
  }),/solicitud_sin_autorizacion/);
});
test('varios SKUs mismo producto, proveedor recibe una invitación y una línea',()=>{
  const r=run([cemento],[requisito(cemento)],[proveedor('corralon_001',[avellaneda,loma,t35])]);
  assert.equal(r.invitaciones.length,1);
  assert.equal(r.invitaciones[0].items.length,1);
  assert.equal(r.invitaciones[0].items[0].opciones.length,3);
  assert.equal(r.invitaciones[0].clave_idempotencia,'ronda_familia_001:familia:corralon_001');
});
test('dos líneas de rubros distintos se agrupan solo para comercio que trabaja ambos',()=>{
  const p=linea('Látex mate interior','4','l','pintureria',{ubicacion:'Texto, línea 2'});
  const r=run([cemento,p],[requisito(cemento),{
    ...requisito(p),fila:2,producto_id:'pintura_latex'
  }],[proveedor('mixto_00001',[avellaneda,sk('latex_001','Látex 5L','Marca P','5',{
    producto_id:'pintura_latex',rubro:'pintureria',unidad_base:'l',
    unidad_venta:'unit'
  })])]);
  assert.equal(r.invitaciones.length,1);
  assert.deepEqual(r.invitaciones[0].items.map(x=>x.producto_id),['cemento_gris_obra','pintura_latex']);
});
test('cantidad ambigua y duplicados se retienen sin impedir otras líneas',()=>{
  const a=linea('Cemento','1.000');
  const b=linea('Pintura látex interior','2','unit','pintureria',{ubicacion:'Texto, línea 2'});
  const r=run([a,b],[requisito(a),{...requisito(b),fila:2,producto_id:'pintura_latex'}],
    [proveedor('mixto_00001',[avellaneda,sk('latex_001','Látex 5L','Marca P','5',{
      producto_id:'pintura_latex',rubro:'pintureria',unidad_base:'l',unidad_venta:'unit'
    })])]);
  assert.deepEqual(r.invitaciones[0].items.map(x=>x.fila),[2]);
  assert.equal(r.retenidas[0].motivo,'linea_insegura');
  const dup=run([cemento,{...cemento,ubicacion:'Texto, línea 2'}],[requisito(cemento),
    {...requisito(cemento),fila:2}]);
  assert.equal(dup.invitaciones.length,0);
  assert.deepEqual(dup.retenidas.map(x=>x.motivo),['duplicado_dudoso','duplicado_dudoso']);
});
test('SKU de proveedor sin confirmación y producto sin fuente confiable bloqueados',()=>{
  const input=entrada([cemento],[requisito(cemento)],[proveedor('corralon_001',[
    {...avellaneda,confirmado_por_proveedor:false}
  ])]);
  assert.throws(()=>planificarInvitacionesPorProducto(input),/sku_no_confirmado/);
  const invalido=linea('Cemento','10','bag','corralon',{producto_normalizado:'Cemento CPC 40'});
  const r=run([invalido],[requisito(invalido)]);
  assert.equal(r.invitaciones.length,0);
});
test('atributos explícitos contradictorios, IDs duplicados o catálogo inválido fallan cerrado',()=>{
  assert.throws(()=>run([cemento],[requisito(cemento,{
    atributos_solicitados:[{codigo:'tipo',valor:'cpc'},{codigo:'tipo',valor:'cpn'}]
  })]),/atributos_invalidos/);
  assert.throws(()=>run([cemento],[requisito(cemento)],[proveedor('corralon_001',[avellaneda]),
    proveedor('corralon_001',[loma])]),/catalogo_no_verificado/);
});
test('resultado es estable, sin mensajes reales, sin precios ni homologación',()=>{
  const a=run(),b=run();
  assert.deepEqual(a,b);
  const str=JSON.stringify(a);
  assert.equal(a.estado,'invitaciones_por_producto_sin_envio');
  assert.equal(str.includes('precio'),true); // solamente solicitud de precio, NO un valor monetario
  assert.ok(!str.includes('precio_unitario'));
  assert.ok(!str.includes('oferta_confirmada'));
  assert.ok(a.invitaciones[0].items[0].opciones.every(o=>o.comparable_como_identico===false));
});
