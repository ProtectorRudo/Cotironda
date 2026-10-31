/**
 * MVP-004 — Datos inventados para enseñar el comparador EXISTENTE.
 * Solo se usa en /probar/ofertas. No deriva ofertas de un pedido de usuario.
 * No hay lectura de DB, IA, WhatsApp, adjudicación o persistencia.
 */
import {compararCotizacionesOffline} from './comparacion-ofertas.ts';
import type {PedidoComparable,OfertaComparable,ResultadoComparacion} from './comparacion-ofertas.ts';

export const PEDIDO_DEMO_OFERTAS:PedidoComparable=Object.freeze({items:[
  {id:'cemento_001',cantidad:'20',unidad:'bag'},
  {id:'latex_001',cantidad:'5',unidad:'l'},
  {id:'placa_001',cantidad:'15',unidad:'unit'}
]});
export const ETIQUETAS_DEMO:Readonly<Record<string,string>>=Object.freeze({
  cemento_001:'20 bolsas de cemento CPC 50 kg',
  latex_001:'5 litros de pintura látex interior',
  placa_001:'15 placas de yeso RH 12,5 mm'
});
const linea=(itemId:'cemento_001'|'latex_001'|'placa_001',
  unidad:'bag'|'l'|'unit',cantidadDisponible:string,precioUnitarioNeto:string)=>({
  itemId,unidad,cantidadDisponible,
  equivalencia:'verificada' as const,precioUnitarioNeto,ivaPorcentaje:'21' as const
});
const oferta=(anonId:string,items:OfertaComparable['items'],fleteFinal:string,
  confirmada=true):OfertaComparable=>({
  anonId,version:1,confirmada,moneda:'ARS',
  formaPago:'transferencia',plazoEntregaDias:3,
  fleteFinal,minimoCompraFinal:'0.00',items
});
export const OFERTAS_DEMO:readonly OfertaComparable[]=Object.freeze([
  // Completa, más cara que la combinación de dos ofertas parciales.
  oferta('anon_a',[
    linea('cemento_001','bag','20','8900.00'),
    linea('latex_001','l','5','7500.00'),
    linea('placa_001','unit','15','10500.00')
  ],'24000.00'),
  // Parcial: jamás puede competir por total contra una completa.
  oferta('anon_b',[linea('cemento_001','bag','20','8100.00')],'16000.00'),
  oferta('anon_c',[
    linea('latex_001','l','5','7000.00'),
    linea('placa_001','unit','15','9800.00')
  ],'12000.00'),
  // Aunque parezca barata, no hay confirmación del proveedor.
  oferta('anon_d',[
    linea('cemento_001','bag','20','1000.00'),
    linea('latex_001','l','5','1000.00'),
    linea('placa_001','unit','15','1000.00')
  ],'1000.00',false)
]);

export type DemoComparacion = Readonly<{
  estado:'solo_demostracion_sin_compra';
  pedido:PedidoComparable;
  etiquetas:Readonly<Record<string,string>>;
  comparacion:ResultadoComparacion;
  ofertasReales:0;
  enviosWhatsapp:0;
  compraRealizada:false;
  informacionPersistida:false;
}>;

export function generarComparacionDemo():DemoComparacion{
  const comparacion=compararCotizacionesOffline(PEDIDO_DEMO_OFERTAS,OFERTAS_DEMO);
  return Object.freeze({
    estado:'solo_demostracion_sin_compra',
    pedido:PEDIDO_DEMO_OFERTAS,
    etiquetas:ETIQUETAS_DEMO,
    comparacion,
    ofertasReales:0,enviosWhatsapp:0,
    compraRealizada:false,informacionPersistida:false
  });
}
