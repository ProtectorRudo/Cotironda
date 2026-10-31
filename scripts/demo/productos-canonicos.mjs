import {prepararBorradorDocumental} from '../../src/domain/extraccion-documental.ts';
import {simularInvitacionesDesdeBorrador,VERSION_TAXONOMIA}
  from '../../src/domain/taxonomia-materiales.ts';

// Ejemplo totalmente sintético: no lee archivos ni hace red o WhatsApp.
const lista=[
  {descripcion:'Cemento común',cantidad:'10',unidad:'bag',rubro:'corralon'},
  {descripcion:'Cemento Loma Negra 50 kg',cantidad:'20',unidad:'bag',
    rubro:'corralon',marca:'Loma Negra',marca_obligatoria:true},
  {descripcion:'Pintura látex interior mate',cantidad:'5',unidad:'l',rubro:'pintureria'},
  {descripcion:'Cemento de contacto',cantidad:'4',unidad:'unit',rubro:'corralon'}
];
const borrador=prepararBorradorDocumental('texto',{items:lista.map((l,i)=>({
  ubicacion:'Texto, línea '+(i+1),descripcion_original:l.descripcion,
  producto_normalizado:l.descripcion,cantidad:l.cantidad,unidad:l.unidad,
  rubro:l.rubro,marca:l.marca??null,marca_obligatoria:l.marca_obligatoria??false,
  confianza:0.98
}))});
const s=(sku,descripcion,marca,producto_id,unidad_base,contenido,rubro,attrs=[])=>({
  sku,descripcion,marca,producto_id,unidad_base,contenido_por_envase:contenido,
  unidad_venta:'unit',rubro,atributos_criticos:attrs,
  especificaciones_verificadas:true,confirmado_por_proveedor:true
});
const p=(id,skus)=>({
  id,activo:true,opt_out:false,consentimiento_whatsapp:true,
  zonas_entrega:['la_plata'],catalogo_confirmado:[],skus_confirmados:skus
});
const resultado=simularInvitacionesDesdeBorrador({
  solicitud:{id:'ronda_demo_taxonomia',zona_entrega:'la_plata',
    envio_autorizado_por_comprador:true},
  borrador,proveedores:[
    p('corralon_demo',[s('avellaneda_25','Cemento Avellaneda 25 kg','Avellaneda',
      'cemento_gris_obra','kg','25','corralon')]),
    p('pinturer_demo',[s('latex_5','Pintura látex interior 5 litros','Marca X',
      'pintura_latex','l','5','pintureria',[{codigo:'uso',valor:'interior'}])])
  ]
});
console.log(JSON.stringify({
  demo:'productos y proveedores ficticios — sin OpenAI real ni WhatsApp',
  version_taxonomia:VERSION_TAXONOMIA,
  proveedor_por_linea:resultado.plan.invitaciones.map(i=>({
    proveedor:i.proveedor_id,
    productos:i.items.map(x=>({fila:x.fila,pedido:x.pedido_original,
      marca_exclusiva:x.marca_exclusiva,
      alternativas:x.opciones.map(y=>({
        sku:y.sku,marca:y.marca_catalogo,relacion:y.relacion,
        envases_orientativos:y.cantidad_envases_orientativa
      }))
    }))
  })),
  lineas_no_identificadas:resultado.resolucion.retenidas,
  falsas_exclusividades_corregidas:resultado.resolucion.marcas_no_exclusivas_corregidas
},null,2));
