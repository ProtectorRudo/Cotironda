/**
 * D045 — ejemplo B2B integral, TOTALMENTE FICTICIO y offline.
 * Une motores existentes: documento validado -> invitaciones por producto ->
 * ofertas confirmadas de ensayo -> comparación exacta. No existe WhatsApp,
 * DB, IA externa ni equivalencia técnica inferida entre etapas.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepararBorradorDocumental } from '../../src/domain/extraccion-documental.ts';
import { simularInvitacionesDesdeBorrador } from '../../src/domain/taxonomia-materiales.ts';
import { compararCotizacionesOffline } from '../../src/domain/comparacion-ofertas.ts';

const solicitud = Object.freeze({
  id:'ronda_d045_ficticia',
  zona_entrega:'la_plata',
  envio_autorizado_por_comprador:true,
});
const entrada=(descripcion,cantidad,unidad,rubro,extra={},fila=1)=>({
  ubicacion:'Texto, línea '+fila,
  descripcion_original:descripcion,
  producto_normalizado:descripcion,
  cantidad,unidad,rubro,
  marca:null,marca_obligatoria:false,confianza:0.99,...extra
});
const sku=(id,descripcion,producto_id,rubro,marca,unidad_venta,unidad_base,contenido,attrs)=>({
  sku:id,descripcion,producto_id,rubro,marca,unidad_venta,unidad_base,
  contenido_por_envase:contenido,
  atributos_criticos:attrs,especificaciones_verificadas:true,confirmado_por_proveedor:true
});
const cpc=[{codigo:'tipo',valor:'cpc'}];
const latex=[{codigo:'uso',valor:'interior'},{codigo:'terminacion',valor:'mate'}];
const placa=[{codigo:'clase',valor:'rh'},{codigo:'espesor_mm',valor:'12.5'}];
const cemento50=sku('cemento_50_demo','Cemento CPC 50 kg','cemento_gris_obra',
  'corralon','Marca Ejemplo','bag','kg','50',cpc);
const cemento25=sku('cemento_25_demo','Cemento CPC 25 kg','cemento_gris_obra',
  'corralon','Avellaneda','bag','kg','25',cpc);
const pintura=sku('latex_5_demo','Pintura látex interior mate 5 L','pintura_latex',
  'pintureria','Marca Ejemplo','unit','l','5',latex);
const yeso=sku('placa_rh_demo','Placa de yeso RH 12,5 mm','placa_yeso',
  'construccion_seco','Marca Ejemplo','unit','unit','1',placa);
const proveedor=(id,skus,extra={})=>({
  id,activo:true,opt_out:false,consentimiento_whatsapp:true,
  zonas_entrega:['la_plata'],catalogo_confirmado:[],skus_confirmados:skus,...extra
});
const proveedores=Object.freeze([
  proveedor('distribuidor_total_demo',[cemento50,pintura,yeso]),
  proveedor('corralon_50_demo',[cemento50]),
  proveedor('corralon_25_demo',[cemento25]),
  proveedor('acabados_demo',[pintura,yeso]),
  proveedor('sin_consentimiento_demo',[cemento50],{consentimiento_whatsapp:false}),
  proveedor('dado_de_baja_demo',[cemento50],{opt_out:true}),
  proveedor('otra_zona_demo',[cemento50],{zonas_entrega:['rosario']})
]);
const pedidoEconomico=Object.freeze({items:[
  {id:'cemento_001',cantidad:'20',unidad:'bag'},
  {id:'latex_001',cantidad:'5',unidad:'l'},
  {id:'placa_001',cantidad:'10',unidad:'unit'}
]});
// Los tres presupuestos son fixtures independientes: la equivalencia marcada
// verificada es un supuesto EXPLÍCITO de ensayo, no una salida del matcher.
const cotizacion=(itemId,unit,qty,neto,iva='21',equivalencia='verificada')=>({
  itemId,unidad:unit,cantidadDisponible:qty,
  equivalencia,precioUnitarioNeto:neto,ivaPorcentaje:iva
});
const oferta=(anonId,items,freight,opts={})=>({
  anonId,version:1,confirmada:true,moneda:'ARS',
  formaPago:'transferencia',plazoEntregaDias:3,
  fleteFinal:freight,minimoCompraFinal:'0.00',items,...opts
});
const ofertasFicticias=Object.freeze([
  oferta('anon_total',[
    cotizacion('cemento_001','bag','20','100.00'),
    cotizacion('latex_001','l','5','80.00'),
    cotizacion('placa_001','unit','10','200.00')
  ],'150.00'),
  oferta('anon_cemento',[
    cotizacion('cemento_001','bag','20','70.00')
  ],'110.00'),
  oferta('anon_acabados',[
    cotizacion('latex_001','l','5','70.00'),
    cotizacion('placa_001','unit','10','150.00')
  ],'130.00')
]);
export function ejecutarCicloComercialD045(config={}) {
  const s={...solicitud,...(config.solicitud??{})};
  const catalogos=config.proveedores??proveedores;
  const b=prepararBorradorDocumental('texto',{items:[
    entrada('Cemento CPC Loma Negra 50 kg','20','bag','corralon',{
      marca:'Loma Negra',marca_obligatoria:true},1),
    entrada('Pintura látex interior mate','5','l','pintureria',{},2),
    entrada('Placa de yeso RH 12,5 mm','10','unit','construccion_seco',{},3),
    entrada('Servicio de colocación a definir','1','unit',null,{},4)
  ]});
  const invitaciones=simularInvitacionesDesdeBorrador({
    solicitud:s,borrador:b,proveedores:catalogos
  });
  // Los presupuestos nunca se generan desde las invitaciones sin una instancia
  // REAL de recepción, comprobación técnica y confirmación del proveedor.
  // Aquí se comparan ofertas YA VERIFICADAS por el fixture independiente.
  const comparacion=compararCotizacionesOffline(
    pedidoEconomico,config.ofertas??ofertasFicticias
  );
  return {estado:'ENSAYO_SIN_INTEGRACIONES',borrador:b,invitaciones,comparacion,
    no_se_envio_whatsapp:true,ofertas_sinteticas_confirmadas_por_fixture:true};
}
export function resumenSeguroD045(r) {
  const idsNuevos=new Set(r.invitaciones.plan.invitaciones.map(x=>x.proveedor_id));
  const personasAConsultar=r.invitaciones.plan.invitaciones.length;
  const dudas=new Set([...r.invitaciones.plan.retenidas.map(x=>x.fila),
    ...r.invitaciones.resolucion.retenidas.map(x=>x.fila)]);
  const opciones=r.comparacion.opcionesCompletas;
  return {
    simulacion:true,no_se_envio_whatsapp:true,no_se_conecto_base:true,
    no_se_llamo_ia:true,ofertas_reales:0,
    pedido_lineas:r.borrador.lineas.length,
    lineas_con_aclaracion:dudas.size,
    proveedores_a_consultar:personasAConsultar,
    proveedores_con_clave_unica:idsNuevos.size===personasAConsultar,
    precio_comparable_solo_sobre_ofertas_verificadas:true,
    opciones_que_cubren_todo:opciones.length,
    opcion_mas_economica_con_mismas_condiciones:
      opciones.length ? {proveedores:opciones[0].proveedoresAnonimos.length,
        total:opciones[0].totalFinal,moneda:opciones[0].moneda}:null,
    contacto_revelado:r.comparacion.contactoRevelado,
    adjudicacion_automatica:r.comparacion.adjudicacionAutomatica,
    aviso:'Los precios son ficticios. No hay ofertas de WhatsApp ni adjudicación real.'
  };
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const report=resumenSeguroD045(ejecutarCicloComercialD045());
  console.log(JSON.stringify(report,null,2));
}
