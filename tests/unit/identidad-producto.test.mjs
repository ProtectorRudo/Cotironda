import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararBorradorDocumental} from '../../src/domain/extraccion-documental.ts';
import {planificarPorProducto} from '../../src/domain/identidad-producto.ts';

const solicitud={id:'ronda_producto_01',zona_entrega:'la_plata',envio_autorizado_por_comprador:true};
const linea=(descripcion,cantidad='20',unidad='bag',rubro='corralon',extra={})=>({
  ubicacion:'Texto, línea 1',descripcion_original:descripcion,
  producto_normalizado:descripcion,cantidad,unidad,rubro,marca:null,
  marca_obligatoria:false,confianza:0.99,...extra
});
const attrs=(...kv)=>kv.map(([codigo,valor])=>({codigo,valor}));
const req=(l,opts={})=>({
  fila:1,descripcion_original:l.descripcion_original,producto_id:'cemento',
  rubro:l.rubro,unidad_pedido:l.unidad,
  contenido_por_unidad_pedida:'50',unidad_base:'kg',
  atributos_criticos:attrs(['tipo','cpc'],['resistencia','40']),
  especificaciones_verificadas:true,...opts
});
const sku=(id,nombre,marca,contenido='25',opts={})=>({
  sku:id,descripcion:nombre,producto_id:'cemento',rubro:'corralon',
  marca,unidad_venta:'bag',contenido_por_envase:contenido,unidad_base:'kg',
  atributos_criticos:attrs(['tipo','cpc'],['resistencia','40']),
  especificaciones_verificadas:true,confirmado_por_proveedor:true,...opts
});
const prov=(id,skus,opts={})=>({
  id,activo:true,opt_out:false,consentimiento_whatsapp:true,
  zonas_entrega:['la_plata'],catalogo_confirmado:[],skus_confirmados:skus,...opts
});
const c=linea('20? Cemento CPC 50 kg');
const a=sku('cpc_loma_25','Cemento CPC Loma Negra 25 kg','Loma Negra');
const b=sku('cpc_holcim_25','Cemento CPC Holcim 25 kg','Holcim');
const entrada=(lineas=[c],requisitos=[req(c)],proveedores=[prov('corralon_001',[a,b])],s=solicitud)=>({
  solicitud:s,borrador:prepararBorradorDocumental('texto',{items:lineas}),
  requisitos,proveedores
});
const plan=(...args)=>planificarPorProducto(entrada(...args));

test('producto técnico primero: distintos nombres y marcas aptas en una sola invitación',()=>{
  const r=plan();
  assert.equal(r.estado,'plan_producto_primero_sin_envio');
  assert.equal(r.solicitudes.length,1);
  assert.equal(r.solicitudes[0].items.length,1);
  const item=r.solicitudes[0].items[0];
  assert.equal(item.pedido_original,'20? Cemento CPC 50 kg');
  assert.equal(item.producto_id,'cemento');
  assert.deepEqual(item.opciones.map(x=>x.marca),['Loma Negra','Holcim']);
  assert.ok(item.opciones.every(x=>x.clase==='producto_compatible'));
  assert.ok(item.opciones.every(x=>x.comparable_como_identico===false));
});
test('20 bolsas 50kg de cemento CPC requieren 40 bolsas 25kg de cualquiera de las marcas',()=>{
  const r=plan();
  for(const x of r.solicitudes[0].items[0].opciones){
    assert.equal(x.envases_a_cotizar,'40');
    assert.equal(x.cantidad_requerida,'1000');
    assert.equal(x.cantidad_ofrecida,'1000');
    assert.equal(x.excedente,'0');
  }
});
test('si marca se exige expresamente, otras marcas no son candidatas',()=>{
  const l=linea(c.descripcion_original,'20','bag','corralon',{
    marca:'Holcim',marca_obligatoria:true
  });
  const r=plan([l],[req(l)]);
  assert.deepEqual(r.solicitudes[0].items[0].opciones.map(x=>x.marca),['Holcim']);
});
test('marca solo preferida, no obligatoria, no limita el acceso a cotizaciones',()=>{
  const l=linea(c.descripcion_original,'20','bag','corralon',{marca:'Loma Negra'});
  const r=plan([l],[req(l)]);
  assert.equal(r.solicitudes[0].items[0].opciones.length,2);
  assert.equal(r.solicitudes[0].items[0].marca_solicitada,'Loma Negra');
  assert.equal(r.solicitudes[0].items[0].marca_obligatoria,false);
});
test('4 litros de hidrófugo solicitado → 1 envase de 5L, sin homologar precio ni calidad',()=>{
  const l=linea('Hidrófugo líquido','4','l');
  const r=plan([l],[req(l,{
    producto_id:'hidrofugo',unidad_pedido:'l',contenido_por_unidad_pedida:'1',
    unidad_base:'l',atributos_criticos:attrs(['uso','mortero_cementicio'],['formula','tipo_1'])
  })],[prov('corralon_001',[sku('hidro_5lit','Hidrófugo X 5 L','Marca X','5',{
    producto_id:'hidrofugo',unidad_venta:'unit',unidad_base:'l',
    atributos_criticos:attrs(['uso','mortero_cementicio'],['formula','tipo_1'])
  })])]);
  const opcion=r.solicitudes[0].items[0].opciones[0];
  assert.equal(opcion.clase,'producto_compatible');
  assert.equal(opcion.envases_a_cotizar,'1');
  assert.equal(opcion.cantidad_ofrecida,'5');
  assert.equal(opcion.excedente,'1');
});
test('mismo producto, envase 18L en lugar de 20L: dos envases, excedente 16 L',()=>{
  const l=linea('Pintura látex interior mate','20','l','pintureria');
  const especificaciones=attrs(['uso','interior'],['base','latex'],['terminacion','mate']);
  const r=plan([l],[req(l,{
    producto_id:'pintura_latex',unidad_pedido:'l',contenido_por_unidad_pedida:'1',
    unidad_base:'l',atributos_criticos:especificaciones
  })],[prov('pintura_0001',[sku('latex_18_l','Pintura látex interior 18 L','Pintumax','18',{
    producto_id:'pintura_latex',rubro:'pintureria',unidad_venta:'unit',
    unidad_base:'l',atributos_criticos:especificaciones
  })])]);
  const o=r.solicitudes[0].items[0].opciones[0];
  assert.equal(o.envases_a_cotizar,'2');
  assert.equal(o.cantidad_ofrecida,'36');
  assert.equal(o.excedente,'16');
});
test('distinto tipo o resistencia de cemento es incompatible aunque compartan producto_id',()=>{
  const r=plan([c],[req(c)],[prov('corralon_001',[
    sku('cemento_cpn','Cemento CPN 25 kg','Marca B','25',{
      atributos_criticos:attrs(['tipo','cpn'],['resistencia','40'])
    }),
    sku('cemento_32','Cemento CPC 32','Marca B','25',{
      atributos_criticos:attrs(['tipo','cpc'],['resistencia','32'])
    })
  ])]);
  assert.equal(r.solicitudes.length,0);
  assert.deepEqual(r.retenidas,[{fila:1,motivo:'sin_producto_compatible'}]);
});
test('placas yeso RH 12,5 no aceptan RF 12,5 ni estándar',()=>{
  const l=linea('Placa RH 12,5 mm','12','unit','construccion_seco');
  const base={producto_id:'placa_yeso',rubro:'construccion_seco',unidad_venta:'unit',
    unidad_base:'unit',contenido_por_envase:'1'};
  const r=plan([l],[req(l,{
    ...base,unidad_pedido:'unit',contenido_por_unidad_pedida:'1',
    atributos_criticos:attrs(['tipo','rh'],['espesor_mm','12.5'])
  })],[prov('seco_00001',[
    sku('placa_rf','Placa RF 12,5','Marca R','1',{
      ...base,atributos_criticos:attrs(['tipo','rf'],['espesor_mm','12.5'])
    }),
    sku('placa_st','Placa ST 12,5','Marca S','1',{
      ...base,atributos_criticos:attrs(['tipo','st'],['espesor_mm','12.5'])
    })
  ])]);
  assert.equal(r.solicitudes.length,0);
});
test('cable 2,5 mm2 no acepta cable 1,5 mm2 ni aislación diferente',()=>{
  const l=linea('Cable 2,5 mm2 PVC','100','m','electricidad');
  const common={producto_id:'cable_unipolar',rubro:'electricidad',
    unidad_venta:'roll',unidad_base:'m'};
  const r=plan([l],[req(l,{
    ...common,unidad_pedido:'m',contenido_por_unidad_pedida:'1',
    atributos_criticos:attrs(['seccion_mm2','2.5'],['aislacion','pvc'])
  })],[prov('electrico_01',[
    sku('cable_15','Cable 1,5 mm2 PVC','Marca C','100',{
      ...common,atributos_criticos:attrs(['seccion_mm2','1.5'],['aislacion','pvc'])
    }),
    sku('cable_xlpe','Cable 2,5 mm2 XLPE','Marca C','100',{
      ...common,atributos_criticos:attrs(['seccion_mm2','2.5'],['aislacion','xlpe'])
    })
  ])]);
  assert.equal(r.solicitudes.length,0);
});
test('mismo producto_id pero características sin acreditar: consulta, nunca oferta conforme',()=>{
  const r=plan([c],[req(c)],[prov('corralon_001',[
    sku('cemento_duda','Cemento bolsa 25 kg','Marca X','25',{
      atributos_criticos:attrs(['tipo','cpc']),
      especificaciones_verificadas:false
    })
  ])]);
  const o=r.solicitudes[0].items[0].opciones[0];
  assert.equal(o.clase,'consulta_especificacion');
  assert.equal(o.envases_a_cotizar,null);
  assert.equal(o.cantidad_ofrecida,null);
  assert.equal(o.comparable_como_identico,false);
});
test('requisito genérico cemento sin tipo/resistencia: consulta SKU confirmado',()=>{
  const l=linea('Cemento de obra','20','bag');
  const r=plan([l],[req(l,{
    atributos_criticos:[],especificaciones_verificadas:false
  })],[prov('corralon_001',[a])]);
  assert.equal(r.solicitudes[0].items[0].opciones[0].clase,'consulta_especificacion');
});
test('producto_id diferente no alcanza con un nombre comercial parecido',()=>{
  const r=plan([c],[req(c)],[prov('corralon_001',[
    sku('adhesivo_01','Cemento adhesivo 25 kg','Marca A','25',{
      producto_id:'adhesivo_ceramico'
    })
  ])]);
  assert.equal(r.solicitudes.length,0);
});
test('no conversión kg por litros, aunque producto_id y otros atributos coincidan',()=>{
  const r=plan([c],[req(c)],[prov('corralon_001',[
    sku('cemento_liq','Cemento líquido 25 L','Marca A','25',{unidad_base:'l'})
  ])]);
  assert.equal(r.solicitudes.length,0);
});
test('SKU no confirmado no habilita ni siquiera consulta',()=>{
  const a0=entrada();
  a0.proveedores[0].skus_confirmados=[{...a,confirmado_por_proveedor:false}];
  assert.throws(()=>planificarPorProducto(a0),/identidad_sku_invalido/);
});
test('proveedores suspendidos, fuera de zona, opt-out o sin consentimiento excluidos',()=>{
  const r=plan([c],[req(c)],[
    prov('suspendido_1',[a],{activo:false}),
    prov('zona_rosario',[a],{zonas_entrega:['rosario']}),
    prov('sin_consentir',[a],{consentimiento_whatsapp:false}),
    prov('baja_wp_0001',[a],{opt_out:true}),
    prov('corralon_001',[a])
  ]);
  assert.deepEqual(r.solicitudes.map(x=>x.proveedor_id),['corralon_001']);
});
test('no autorizar distribución impide preparar plan',()=>{
  assert.throws(()=>plan([c],[req(c)],[prov('corralon_001',[a])],{
    ...solicitud,envio_autorizado_por_comprador:false
  }),/solicitud_sin_autorizacion/);
});
test('doble SKU del mismo proveedor no duplica invitación ni artículo',()=>{
  const r=plan([c],[req(c)],[prov('corralon_001',[a,b])]);
  assert.equal(r.solicitudes.length,1);
  assert.equal(r.solicitudes[0].items.length,1);
  assert.equal(r.solicitudes[0].items[0].opciones.length,2);
  assert.equal(r.solicitudes[0].clave_idempotencia,'ronda_producto_01:producto:corralon_001');
});
test('dos líneas distintas se agrupan por proveedor una sola vez',()=>{
  const l2=linea('Cemento CPC obra 50 kg','10','bag','corralon',{
    ubicacion:'Texto, línea 2'
  });
  const r=plan([c,l2],[req(c),{...req(l2),fila:2}],[prov('corralon_001',[a])]);
  assert.equal(r.solicitudes.length,1);
  assert.deepEqual(r.solicitudes[0].items.map(x=>x.fila),[1,2]);
});
test('duplicados inciertos permanecen retenidos y no se suman silenciosamente',()=>{
  const l2={...c,ubicacion:'Texto, línea 2'};
  const r=plan([c,l2],[req(c),{...req(l2),fila:2}],[prov('corralon_001',[a])]);
  assert.equal(r.solicitudes.length,0);
  assert.deepEqual(r.retenidas.map(x=>x.motivo),['duplicado','duplicado']);
});
test('cantidades ambiguas o 0 no generan alternativas',()=>{
  for(const n of ['1.000','0',null]){
    const l=linea(c.descripcion_original,n);
    const r=plan([l],[req(l)],[prov('corralon_001',[a])]);
    assert.equal(r.solicitudes.length,0);
    assert.equal(r.retenidas[0].motivo,'datos_inseguros');
  }
});
test('cálculo de 2,5 litros no utiliza coma flotante ni falsea excedente',()=>{
  const l=linea('Hidrófugo líquido','2,5','l');
  const r=plan([l],[req(l,{
    producto_id:'hidrofugo',unidad_pedido:'l',
    unidad_base:'l',contenido_por_unidad_pedida:'1',
    atributos_criticos:attrs(['uso','mortero'])
  })],[prov('corralon_001',[sku('hidro_envase5','Hidrófugo de 5 L','Marca H','5',{
    producto_id:'hidrofugo',unidad_base:'l',unidad_venta:'unit',
    atributos_criticos:attrs(['uso','mortero'])
  })])]);
  const o=r.solicitudes[0].items[0].opciones[0];
  assert.equal(o.cantidad_requerida,'2.5');
  assert.equal(o.cantidad_ofrecida,'5');
  assert.equal(o.excedente,'2.5');
});
test('campos arbitrarios de IA no permiten autorizar producto desconocido',()=>{
  const l=linea('Cemento CPC 50 kg','20','bag','corralon',{saltar_verificacion:true});
  const borrador=prepararBorradorDocumental('texto',{items:[l]});
  const r=planificarPorProducto({
    ...entrada([l],[req(l)],[prov('corralon_001',[a])]),borrador
  });
  assert.equal(r.solicitudes.length,0);
  assert.equal(r.retenidas[0].motivo,'datos_inseguros');
});
test('no permite atributos críticos duplicados ni falsos sin validación',()=>{
  const prueba=entrada([c],[req(c,{
    atributos_criticos:attrs(['tipo','cpc'],['tipo','cpn'])
  })],[prov('corralon_001',[a])]);
  assert.throws(()=>planificarPorProducto(prueba),/atributos_criticos_invalidos/);
  const otra=entrada([c],[req(c,{atributos_criticos:[],especificaciones_verificadas:true})],
    [prov('corralon_001',[a])]);
  assert.throws(()=>planificarPorProducto(otra),/atributos_criticos_invalidos/);
});
test('no envía, no incluye precios ni anuncia equivalencia certificada',()=>{
  const result=plan();
  const serialized=JSON.stringify(result);
  assert.equal(result.estado,'plan_producto_primero_sin_envio');
  assert.ok(!serialized.includes('precio'));
  assert.ok(!serialized.includes('certificada'));
  assert.ok(result.solicitudes[0].items[0].opciones.every(x=>x.comparable_como_identico===false));
});
