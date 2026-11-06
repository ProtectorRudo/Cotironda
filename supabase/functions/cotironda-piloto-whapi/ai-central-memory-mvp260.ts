/** MVP260: memoria como control de ALCANCE, nunca como fuente de materiales,
 * precios, condiciones o cantidades. Sólo para pedido original SQL autenticado.
 */
import {RUBROS_MVP216,type RubroMvp216} from '../../../src/domain/rubros-comprador-mvp216.ts';

type Solicitud=Readonly<{rubro:RubroMvp216}>;
type Scope=Readonly<{state:'verified_scope';expires_at:string}>;
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);

/** Contraste determinista con las líneas originales que acabó de autorizar
 * la reserva SQL de la MISMA fuente. No regresa datos para prompts de IA. */
export function validarMemoriaProveedorMvp260(
 raw:unknown,solicitados:readonly Solicitud[],nowMs=Date.now()
):raw is Scope{
 if(!obj(raw)||raw.state!=='verified_scope'||
  raw.contains_contacts!==false||raw.contains_prices!==false||
  raw.automatic_decisions_allowed!==false||
  typeof raw.own_latest_verified_quote_remembered!=='boolean'||
  typeof raw.expires_at!=='string'||
  !/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d/u.test(raw.expires_at)||
  !Number.isFinite(Date.parse(raw.expires_at))||
  Date.parse(raw.expires_at)<=nowMs||
  Date.parse(raw.expires_at)>nowMs+45*86400000||
  !Array.isArray(raw.rubros)||raw.rubros.length<1||
  raw.rubros.length>7||!Array.isArray(solicitados)||
  solicitados.length<1||solicitados.length>25)return false;
 const count=new Map<RubroMvp216,number>();
 for(const s of solicitados){
  if(!s||!Object.hasOwn(RUBROS_MVP216,s.rubro))return false;
  count.set(s.rubro,(count.get(s.rubro)??0)+1);
 }
 const seen=new Set<string>();
 let total=0;
 for(const v of raw.rubros){
  if(!obj(v)||typeof v.rubro!=='string'||
   !Object.hasOwn(RUBROS_MVP216,v.rubro)||seen.has(v.rubro)||
   !Number.isSafeInteger(v.materiales)||
   typeof v.materiales!=='number'||v.materiales<1||
   v.materiales>25||count.get(v.rubro as RubroMvp216)!==v.materiales)
   return false;
  seen.add(v.rubro);
  total+=v.materiales;
 }
 return total===solicitados.length&&seen.size===count.size;
}
