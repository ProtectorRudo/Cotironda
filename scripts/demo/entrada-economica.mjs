import {simularInvitacionesEconomicasDesdeTexto} from '../../src/domain/entrada-economica.ts';
// Solo escenarios ficticios y sin llamadas de red.
const sku=(id,producto_id,descripcion,rubro,marca,base,envase,attrs=[])=>({
  sku:id,producto_id,descripcion,rubro,marca,unidad_base:base,unidad_venta:'unit',
  contenido_por_envase:envase,atributos_criticos:attrs,
  especificaciones_verificadas:true,confirmado_por_proveedor:true
});
const proveedor=(id,skus)=>({
  id,activo:true,opt_out:false,consentimiento_whatsapp:true,
  zonas_entrega:['la_plata'],catalogo_confirmado:[],skus_confirmados:skus
});
const texto=[
  '10 bolsas cemento',
  '20 bolsas de Cemento CPC Loma Negra 50 kg',
  '5 litros pintura látex interior',
  '15 placas de yeso RH 12,5 mm',
  'Necesito un par de cositas para obra',
  '10 latas cemento de contacto'
].join('\n');
const r=simularInvitacionesEconomicasDesdeTexto({
  texto,
  solicitud:{id:'demo_costo_cero',zona_entrega:'la_plata',
    envio_autorizado_por_comprador:true},
  proveedores:[
    proveedor('corralon_001',[sku('avellaneda_25','cemento_gris_obra',
      'Cemento Avellaneda 25 kg','corralon','Avellaneda','kg','25',
      [{codigo:'tipo',valor:'cpc'}])]),
    proveedor('pintura_001',[sku('latex_18','pintura_latex',
      'Pintura látex interior 18 L','pintureria','Marca P','l','18',
      [{codigo:'uso',valor:'interior'}])]),
    proveedor('seco_00001',[sku('placa_rh','placa_yeso',
      'Placa RH 12,5 mm','construccion_seco','Marca D','unit','1',
      [{codigo:'clase',valor:'rh'},{codigo:'espesor_mm',valor:'12.5'}])])
  ]
});
console.log(JSON.stringify({
  etapa:'02',demo:'datos ficticios sin OpenAI, Supabase ni WhatsApp',
  tokens_consumidos:r.tokens_consumidos,llamadas_ia:r.llamadas_ia,
  resumen:r.resumen,
  invitaciones:r.plan.invitaciones.map(p=>({
    proveedor:p.proveedor_id,
    productos:p.items.map(i=>({
      fila:i.fila,pedido:i.pedido_original,producto:i.producto_id,
      opciones:i.opciones.map(o=>({marca:o.marca_catalogo,
        relacion:o.relacion,envases:o.cantidad_envases_orientativa}))
    }))
  })),
  pendientes_para_ia:r.pendientes_ia
},null,2));
