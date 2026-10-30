/**
 * Gold independiente de modelo: proveedores esperados se declaran por caso.
 * Todo es sintético. Respuestas MOCK se suministran deliberadamente.
 */
const S=(sku,producto_id,descripcion,marca,rubro,base,contenido,atr=[])=>({
  sku,producto_id,descripcion,marca,rubro,
  unidad_venta:'unit',unidad_base:base,contenido_por_envase:contenido,
  atributos_criticos:atr.map(([codigo,valor])=>({codigo,valor})),
  especificaciones_verificadas:true,confirmado_por_proveedor:true
});
const P=(id,skus,opts={})=>({
  id,activo:true,consentimiento_whatsapp:true,opt_out:false,
  zonas_entrega:['la_plata'],catalogo_confirmado:[],skus_confirmados:skus,...opts
});
const skAv=S('avellaneda_25','cemento_gris_obra','Cemento Avellaneda CPC 25kg',
  'Avellaneda','corralon','kg','25',[['tipo','cpc']]);
const skLoma=S('lomanegra_25','cemento_gris_obra','Cemento Loma Negra CPC 25kg',
  'Loma Negra','corralon','kg','25',[['tipo','cpc']]);
const skLatex=S('latex_18','pintura_latex','Látex interior 18L',
  'Marca P','pintureria','l','18',[['uso','interior']]);
const skRf=S('placa_rf','placa_yeso','Placa RF 12,5 mm',
  'Marca D','construccion_seco','unit','1',[['clase','rf'],['espesor_mm','12.5']]);
const basicos=[P('corralon_001',[skAv]),P('pintura_001',[skLatex])];
const row=(linea,descripcion,cantidad,unidad,rubro,marca=null,marca_obligatoria=false)=>({
  ubicacion:'Texto, línea '+linea,
  descripcion_original:descripcion,producto_normalizado:descripcion,
  cantidad,unidad,rubro,marca,marca_obligatoria,confianza:0.98
});
const G=(linea_fuente,descripcion,cantidad,unidad,rubro,producto_id,proveedores_esperados)=>({
  linea_fuente,descripcion,cantidad,unidad,rubro,producto_id,proveedores_esperados
});
export const GOLD_PRODUCTO_VERSION='cotironda_producto_invitation_v1_2026_10';
export const escenariosProducto=[
  {
    id:'marca_mencionada_y_presentacion_distinta',
    texto:'20 bolsas de Cemento Loma Negra 50 kg',
    items:[row(1,'Cemento Loma Negra 50 kg','20','bag','corralon','Loma Negra',true)],
    esperados:[G(1,'Cemento Loma Negra 50 kg','20','bag','corralon','cemento_gris_obra',['corralon_001'])],
    proveedores:basicos,gates:{seguridad:'PASS',cobertura:'PASS'}
  },
  {
    id:'cemento_generico_sin_especificacion_inventada',
    texto:'10 bolsas de Cemento',
    items:[row(1,'Cemento','10','bag','corralon')],
    esperados:[G(1,'Cemento','10','bag','corralon','cemento_gris_obra',['corralon_001'])],
    proveedores:basicos,gates:{seguridad:'PASS',cobertura:'PASS'}
  },
  {
    id:'cemento_cpc_50_a_avellaneda_25',
    texto:'20 bolsas de Cemento CPC 50 kg',
    items:[row(1,'Cemento CPC 50 kg','20','bag','corralon')],
    esperados:[G(1,'Cemento CPC 50 kg','20','bag','corralon','cemento_gris_obra',['corralon_001'])],
    proveedores:basicos,gates:{seguridad:'PASS',cobertura:'PASS'}
  },
  {
    id:'dos_productos_misma_linea',
    texto:'20 bolsas de Cemento CPC 50 kg; 5 litros de pintura látex interior',
    items:[row(1,'Cemento CPC 50 kg','20','bag','corralon'),
      row(1,'pintura látex interior','5','l','pintureria')],
    esperados:[
      G(1,'Cemento CPC 50 kg','20','bag','corralon','cemento_gris_obra',['corralon_001']),
      G(1,'pintura látex interior','5','l','pintureria','pintura_latex',['pintura_001'])
    ],
    proveedores:basicos,gates:{seguridad:'PASS',cobertura:'PASS'}
  },
  {
    id:'omite_pintura_entre_dos_productos',
    texto:'20 bolsas de Cemento CPC 50 kg; 5 litros de pintura látex interior',
    items:[row(1,'Cemento CPC 50 kg','20','bag','corralon')],
    esperados:[
      G(1,'Cemento CPC 50 kg','20','bag','corralon','cemento_gris_obra',['corralon_001']),
      G(1,'pintura látex interior','5','l','pintureria','pintura_latex',['pintura_001'])
    ],
    proveedores:basicos,gates:{seguridad:'PASS',cobertura:'FAIL'}
  },
  {
    id:'cantidad_inventada',
    texto:'20 bolsas de Cemento CPC 50 kg',
    items:[row(1,'Cemento CPC 50 kg','200','bag','corralon')],
    esperados:[G(1,'Cemento CPC 50 kg','20','bag','corralon','cemento_gris_obra',['corralon_001'])],
    proveedores:basicos,gates:{seguridad:'FAIL',cobertura:'FAIL'}
  },
  {
    id:'solo_marca_exclusiva',
    texto:'20 bolsas de Cemento solo Loma Negra CPC 50 kg',
    items:[row(1,'Cemento solo Loma Negra CPC 50 kg','20','bag','corralon','Loma Negra',true)],
    esperados:[G(1,'Cemento solo Loma Negra CPC 50 kg','20','bag','corralon','cemento_gris_obra',['corralon_loma'])],
    proveedores:[...basicos,P('corralon_loma',[skLoma])],
    gates:{seguridad:'PASS',cobertura:'PASS'}
  },
  {
    id:'proveedores_baja_o_fuera_de_zona',
    texto:'10 bolsas de Cemento',
    items:[row(1,'Cemento','10','bag','corralon')],
    esperados:[G(1,'Cemento','10','bag','corralon','cemento_gris_obra',['corralon_001'])],
    proveedores:[...basicos,P('corralon_baja',[skAv],{opt_out:true}),
      P('corralon_rosario',[skAv],{zonas_entrega:['rosario']})],
    gates:{seguridad:'PASS',cobertura:'PASS'}
  },
  {
    id:'RH_pedido_RF_cotizacion_diferente_no_homologada',
    texto:'15 placas de yeso RH 12,5 mm',
    items:[row(1,'placas de yeso RH 12,5 mm','15','unit','construccion_seco')],
    esperados:[G(1,'placas de yeso RH 12,5 mm','15','unit',
      'construccion_seco','placa_yeso',['seco_00001'])],
    proveedores:[P('seco_00001',[skRf])],
    gates:{seguridad:'PASS',cobertura:'PASS'}
  },
  {
    id:'sin_proveedor_confirmado_no_inventar',
    texto:'10 bolsas de Cemento',
    items:[row(1,'Cemento','10','bag','corralon')],
    esperados:[G(1,'Cemento','10','bag','corralon','cemento_gris_obra',[])],
    proveedores:[P('pintura_001',[skLatex])],
    gates:{seguridad:'PASS',cobertura:'PASS'}
  },
  {
    id:'cemento_de_contacto_fuera_taxonomia',
    texto:'3 unidades de Cemento de contacto',
    items:[row(1,'Cemento de contacto','3','unit','corralon')],
    esperados:[G(1,'Cemento de contacto','3','unit','corralon',null,[])],
    proveedores:basicos,gates:{seguridad:'PASS',cobertura:'PASS'}
  },
  {
    id:'despacho_omitido_por_extraccion',
    texto:'20 bolsas de Cemento CPC 50 kg\n5 litros de pintura látex interior',
    items:[row(1,'Cemento CPC 50 kg','20','bag','corralon')],
    esperados:[
      G(1,'Cemento CPC 50 kg','20','bag','corralon','cemento_gris_obra',['corralon_001']),
      G(2,'pintura látex interior','5','l','pintureria','pintura_latex',['pintura_001'])
    ],
    proveedores:basicos,gates:{seguridad:'PASS',cobertura:'FAIL'}
  }
];
