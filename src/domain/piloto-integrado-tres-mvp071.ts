/**
 * MVP-071 — 1 buyer + 2 suppliers browser-only rehearsal.
 * Inputs are fictitious and local to the browser. No DB, HTTP, Whapi, phones.
 * All sourcing uses the same 51-line catalogue; unrecognised entries do not
 * authorize invitations. Each supplier quote remains literal and separate.
 */
import {analizarListadoComercioMvp069,
 simularConsultasCatalogosMvp069} from './catalogo-listado-mvp069.ts';
import {LISTADO_AMBOS_CORRALONES_MVP070,
 PEDIDO_COMUN_DEMO_MVP070} from './catalogo-fixture-corralones-mvp070.ts';
import {resumenFuenteFielMvp065} from './prototipo-whatsapp-mvp065.ts';

export const PEDIDO_PILOTO_TRES_MVP071=PEDIDO_COMUN_DEMO_MVP070;
export const PRESUPUESTO_A_MVP071=[
 'PRESUPUESTO CORRALÓN A — FICTICIO',
 '20 bolsas cemento CPC 50 kg x $ 9.500,00 = $ 190.000,00',
 '5 litros hidrófugo x $ 4.200,00 = $ 21.000,00',
 '2 pallets vacíos x $ 7.000,00 = $ 14.000,00',
 '1 bolsón vacío x $ 3.500,00 = $ 3.500,00',
 'Flete: $ 12.000,00',
 'Descuento: -$ 3.000,00',
 'TOTAL FINAL: $ 237.500,00',
 'IVA: no informado'
].join('\n');
export const PRESUPUESTO_B_MVP071=[
 'PRESUPUESTO CORRALÓN B — FICTICIO',
 '20 bolsas cemento CPC 50 kg x $ 9.100,00 = $ 182.000,00',
 '5 litros hidrófugo x $ 4.500,00 = $ 22.500,00',
 'Flete: a convenir',
 'TOTAL DECLARADO: $ 204.500,00',
 'IVA: no informado'
].join('\n');
export function prepararEnsayoTresMvp071(
 pedido:string=PEDIDO_PILOTO_TRES_MVP071,
 zonaA='La Plata',zonaB='La Plata',
 listadoA:string=LISTADO_AMBOS_CORRALONES_MVP070,
 listadoB:string=LISTADO_AMBOS_CORRALONES_MVP070
){
 const ca=analizarListadoComercioMvp069(listadoA,'texto'),
  cb=analizarListadoComercioMvp069(listadoB,'texto');
 const plan=simularConsultasCatalogosMvp069({pedido,comercios:[
  {id:'corralon_a',zona:zonaA,catalogo:ca},
  {id:'corralon_b',zona:zonaB,catalogo:cb}
 ]});
 return {modo:'simulacion_sin_red' as const,
  catalogos:{corralon_a:ca,corralon_b:cb},plan,
  enviosWhatsApp:0 as const,datosPersistidos:false as const};
}
export function preservarPresupuestosTresMvp071(
 originalA:string,originalB:string
){
 if(!originalA.trim()||!originalB.trim())throw Error('faltan_presupuestos');
 const a=resumenFuenteFielMvp065(originalA);
 const b=resumenFuenteFielMvp065(originalB);
 return {
  a:{original:originalA,...a},
  b:{original:originalB,...b},
  ranking:'no_verificable_sin_extraccion_economica_y_condiciones' as const,
  enviosWhatsApp:0 as const,
  // No extrapolate price, VAT, coverage or winner from unchanged source text.
  adjudicacion:'no_realizada' as const
 };
}
