// Demostración local con proveedores FICTICIOS. No usa conexiones, claves ni WhatsApp.
import {simularDespachoDesdeTexto} from '../../src/domain/flujo-texto.ts';

const lista = [
  '20 bolsas de Cemento CPC 50 kg',
  '3 unidades de Pintura látex interior 20 l',
  '15 unidades de Placa yeso 12,5 mm',
  '1.000 bolsas de Cemento CPC 50 kg',
  '8 unidades de Producto inexistente'
].join('\n');
const proveedores = [
  {id:'corralon_demo', catalogo_confirmado:[
    {descripcion:'Cemento CPC 50 kg',unidad:'bag',rubro:'corralon',marca:null}
  ]},
  {id:'pinturer_demo',catalogo_confirmado:[
    {descripcion:'Pintura látex interior 20 l',unidad:'unit',rubro:'pintureria',marca:null}
  ]},
  {id:'durlock_demo',catalogo_confirmado:[
    {descripcion:'Placa yeso 12,5 mm',unidad:'unit',rubro:'construccion_seco',marca:null}
  ]}
].map(p=>({...p,activo:true,consentimiento_whatsapp:true,opt_out:false,zonas_entrega:['la_plata']}));
const r=simularDespachoDesdeTexto(lista,{
  id:'ronda_demo_0001',
  zona_entrega:'la_plata',
  envio_autorizado_por_comprador:true
},proveedores);

console.log(JSON.stringify({
  simulacion:true,
  no_se_envio_whatsapp:true,
  resumen:r.resumen,
  solicitudes:r.plan.solicitudes.map(p=>({
    proveedor:p.proveedor_id,
    referencia:p.clave_idempotencia,
    items:p.items.map(i=>({linea:i.fila,cantidad:i.cantidad,unidad:i.unidad,material:i.descripcion}))
  })),
  retenidas:r.plan.retenidas,
  sin_catalogo:r.lineas_sin_catalogo,
  rubro_ambiguo:r.lineas_con_rubro_ambiguo,
  texto_no_interpretado:r.lineas_no_interpretadas
},null,2));
