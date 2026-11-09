/** MVP326 — Only a buyer-safe, status-only projection of the private RPC.
 * A completed economic review is NOT a pending model run or a priced quote.
 * Zero retries, no message/source references, no amounts, no identities.
 */
import type {SalidaVistaMvp227} from './vista-comprador-rubros-mvp227.ts';

export type EstadoRevisionComercialMvp326=Readonly<{
 state:'estado_comercial_sin_precios';
 vinculados:number;
 requieren_revision:number;
 en_proceso:number;
 verificados:number;
 precios_incluidos:false;
 identidades_reveladas:false;
 reproceso_automatico:false;
}>;
const record=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const valid=(n:unknown):n is number=>
 typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=25;
const fields=['state','vinculados','requieren_revision','en_proceso',
 'verificados','precios_incluidos','identidades_reveladas',
 'reproceso_automatico'] as const;

export function estadoRevisionComercialMvp326(
 raw:unknown,verified:SalidaVistaMvp227|null
):EstadoRevisionComercialMvp326|null{
 if(!record(raw)||Object.keys(raw).length!==fields.length||
  fields.some(k=>!Object.hasOwn(raw,k))||
  raw.state!=='estado_comercial_sin_precios'||
  raw.precios_incluidos!==false||
  raw.identidades_reveladas!==false||
  raw.reproceso_automatico!==false||
  !valid(raw.vinculados)||!valid(raw.requieren_revision)||
  !valid(raw.en_proceso)||!valid(raw.verificados)||
  !verified||!valid(verified.received_count)||
  raw.vinculados>verified.received_count||
  raw.requieren_revision+raw.en_proceso+raw.verificados!==raw.vinculados
 )return null;
 return Object.freeze({
  state:'estado_comercial_sin_precios',
  vinculados:raw.vinculados,
  requieren_revision:raw.requieren_revision,
  en_proceso:raw.en_proceso,
  verificados:raw.verificados,
  precios_incluidos:false,
  identidades_reveladas:false,
  reproceso_automatico:false
 });
}
