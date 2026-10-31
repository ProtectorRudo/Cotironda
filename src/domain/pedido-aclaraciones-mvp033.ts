/**
 * MVP-033 — UI-only plan for the one essential follow-up question.
 * D064 and the stricter MVP-028 parser remain the authority. A pending
 * non-zone line must never be silently discarded to enable POST.
 */
import type {PedidoPilotoMvp028} from './pedido-piloto-mvp028.ts';

export type PlanAclaracionesMvp033=Readonly<{
 preguntarZona:boolean;
 permitirEnvio:boolean;
 pendientes:PedidoPilotoMvp028['pendientes'];
}>;

export function planificarAclaracionesMvp033(
 pedido:PedidoPilotoMvp028
):PlanAclaracionesMvp033{
 const preguntarZona=pedido.zonaEntrega===null&&pedido.pendientes.some(
  p=>p.linea===0&&p.texto==='Zona de entrega'
 );
 const pendientes=Object.freeze(pedido.pendientes.filter(
  p=>p.texto!=='Zona de entrega'
 ));
 return Object.freeze({
  preguntarZona,
  permitirEnvio:pedido.estado==='listo_para_registrar'&&
   pedido.zonaEntrega!==null&&!preguntarZona&&pendientes.length===0,
  pendientes
 });
}
