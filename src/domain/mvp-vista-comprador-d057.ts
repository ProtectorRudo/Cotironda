/**
 * MVP-001: vista de prueba que reutiliza el motor D015/D021 sin APIs.
 * Solo catálogos inventados. Nunca crea licitaciones ni envía WhatsApp.
 * El texto se analiza únicamente en el navegador que la invoca.
 */
import {simularInvitacionesEconomicasDesdeTexto} from './entrada-economica.ts';
import type {ProveedorPorProducto,SkuPorProducto} from './identidad-producto.ts';

export const EJEMPLO_PEDIDO_MVP = [
  '20 bolsas Cemento CPC Loma Negra 50 kg',
  '5 litros pintura látex interior',
  '15 placas de yeso RH 12,5 mm',
  '1 servicio de colocación a definir'
].join('\n');

const sku=(data:SkuPorProducto):SkuPorProducto=>Object.freeze(data);
const cement=sku({
  sku:'cemento_50_demo',descripcion:'Cemento CPC 50 kg (ficticio)',
  producto_id:'cemento_gris_obra',rubro:'corralon',marca:'Ejemplo',
  unidad_venta:'bag',unidad_base:'kg',contenido_por_envase:'50',
  atributos_criticos:[{codigo:'tipo',valor:'cpc'}],
  especificaciones_verificadas:true,confirmado_por_proveedor:true
});
const latex=sku({
  sku:'latex_5_demo',descripcion:'Látex interior 5 L (ficticio)',
  producto_id:'pintura_latex',rubro:'pintureria',marca:'Ejemplo',
  unidad_venta:'unit',unidad_base:'l',contenido_por_envase:'5',
  atributos_criticos:[{codigo:'uso',valor:'interior'}],
  especificaciones_verificadas:true,confirmado_por_proveedor:true
});
const gypsum=sku({
  sku:'placa_rh_demo',descripcion:'Placa yeso RH 12,5 mm (ficticia)',
  producto_id:'placa_yeso',rubro:'construccion_seco',marca:'Ejemplo',
  unidad_venta:'unit',unidad_base:'unit',contenido_por_envase:'1',
  atributos_criticos:[{codigo:'clase',valor:'rh'},{codigo:'espesor_mm',valor:'12.5'}],
  especificaciones_verificadas:true,confirmado_por_proveedor:true
});
const provider=(id:string,items:SkuPorProducto[],opts:Partial<ProveedorPorProducto>={}):
  ProveedorPorProducto=>Object.freeze({
    id,activo:true,opt_out:false,consentimiento_whatsapp:true,
    zonas_entrega:['la_plata'],catalogo_confirmado:[],skus_confirmados:items,
    ...opts
  });

const FIXTURES:readonly ProveedorPorProducto[]=Object.freeze([
  provider('corralon_ficticio',[cement]),
  provider('pintureria_ficticia',[latex]),
  provider('construccion_seco_ficticia',[gypsum]),
  provider('sin_opt_in_ficticio',[cement],{consentimiento_whatsapp:false}),
  provider('fuera_zona_ficticio',[cement],{zonas_entrega:['rosario']}),
  provider('baja_ficticio',[cement],{opt_out:true})
]);
const NOMBRES:Readonly<Record<string,string>>={
  corralon_ficticio:'Corralón de ejemplo',
  pintureria_ficticia:'Pinturería de ejemplo',
  construccion_seco_ficticia:'Casa de construcción en seco de ejemplo'
};
const RUBROS:Readonly<Record<string,string>>={
  corralon:'Corralón',pintureria:'Pinturería',
  construccion_seco:'Construcción en seco',electricidad:'Electricidad',
  sanitarios:'Sanitarios'
};
const REASONS:Readonly<Record<string,string>>={
  sintaxis_no_segura:'No se pudo interpretar la cantidad y unidad con seguridad.',
  producto_no_identificado:'Ese producto todavía no está en el catálogo de prueba.',
  descripcion_demasiado_libre:'La descripción necesita una aclaración.',
  cantidad_ambigua:'La cantidad puede interpretarse de varias formas.',
  marca_exclusiva_no_confirmada:'Hay que comprobar la marca obligatoria.',
  retencion_documental:'Requiere una comprobación adicional.'
};
export type VistaCompradorMvp=Readonly<{
  estado:'demo_local_sin_envio';
  lineas:number;
  aprovechadas:number;
  pendientes:number;
  invitaciones:number;
  mensajesEnviados:0;
  llamadasIA:0;
  preciosReales:0;
  filas:readonly Readonly<{numero:number;texto:string;estado:'preparada'|'pendiente';motivo?:string}>[];
  proveedores:readonly Readonly<{
    id:string;nombre:string;rubro:string;
    items:readonly string[];
    mensajes:readonly string[];
    requiereValidarAlternativas:boolean;
  }>[];
}>;
export function generarVistaCompradorMvp(texto:string):VistaCompradorMvp{
  if(typeof texto!=='string'||texto.trim().length===0)throw new TypeError('pedido_vacio');
  const result=simularInvitacionesEconomicasDesdeTexto({
    texto,
    solicitud:{id:'ronda_mvp_demostracion',zona_entrega:'la_plata',
      envio_autorizado_por_comprador:true},
    proveedores:FIXTURES
  });
  const pendientes=new Map(result.pendientes_ia.map(p=>
    [p.numero_linea,REASONS[p.motivo]??'Necesita revisión']));
  const fuentes=texto.split(/\r\n|\r|\n/u).map((s,i)=>({texto:s.trim(),numero:i+1}))
    .filter(x=>x.texto.length>0);
  const filas=fuentes.map(f=>({
    numero:f.numero,texto:f.texto,
    estado:pendientes.has(f.numero)?'pendiente' as const:'preparada' as const,
    ...(pendientes.has(f.numero)?{motivo:pendientes.get(f.numero)}:{})
  }));
  const proveedores=result.plan.invitaciones.map(p=>({
    id:p.proveedor_id,
    nombre:NOMBRES[p.proveedor_id]??'Proveedor de prueba',
    rubro:RUBROS[p.items[0]?.producto_id==='cemento_gris_obra'?'corralon':
      p.items[0]?.producto_id==='pintura_latex'?'pintureria':
      p.items[0]?.producto_id==='placa_yeso'?'construccion_seco':'']??'Materiales',
    items:p.items.map(item=>item.pedido_original),
    mensajes:p.items.map(item=>item.mensaje_proveedor),
    requiereValidarAlternativas:p.items.some(item=>
      item.opciones.some(op=>op.comparable_como_identico===false))
  }));
  return Object.freeze({
    estado:'demo_local_sin_envio',
    lineas:result.resumen.lineas,
    aprovechadas:result.resumen.lineas_aprovechadas,
    pendientes:result.resumen.lineas_pendientes_ia,
    invitaciones:result.resumen.proveedores,
    mensajesEnviados:0,llamadasIA:0,preciosReales:0,
    filas,proveedores
  });
}
