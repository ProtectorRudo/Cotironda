/** MVP299 — buyer-safe summary of interpreted supplier responses that
 * are NOT economically verified. This never feeds offers, ranking, prices,
 * winners or any private source, and is independent from public can_open.
 */
import {RUBROS_MVP216,type RubroMvp216} from '../rubros-comprador-mvp216.ts';
import type {SalidaVistaMvp227} from './vista-comprador-rubros-mvp227.ts';

export type VistaPendientesRubrosMvp299=Readonly<{
 state:'respuestas_interpretadas_sin_precio_comparable';
 respuestas:readonly Readonly<{
  label:string;
  rubros:readonly Readonly<{
   rubro:RubroMvp216;titulo:string;respondidos:number;solicitados:number;
  }>[];
 }>[];
 ranking_permitido:false;contactos_revelados:false;
 adjudicacion_automatica:false;
}>;
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
const exactly=(x:Record<string,unknown>,keys:readonly string[])=>
 Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const count=(n:unknown,max=200):n is number=>typeof n==='number'&&
 Number.isSafeInteger(n)&&n>=0&&n<=max;
const label=/^Respuesta en revisión ([1-9][0-9]{0,1})$/u;
export function vistaPendientesRubrosMvp299(
 raw:unknown,verified:SalidaVistaMvp227|null
):VistaPendientesRubrosMvp299|null{
 if(!obj(raw)||!exactly(raw,[
  'state','respuestas','ranking_permitido','contactos_revelados',
  'adjudicacion_automatica'])||
  raw.state!=='respuestas_pendientes_por_rubro'||
  raw.ranking_permitido!==false||
  raw.contactos_revelados!==false||
  raw.adjudicacion_automatica!==false||
  !Array.isArray(raw.respuestas)||raw.respuestas.length>25||
  !verified||!Array.isArray(verified.rubros_ia)||
  verified.rubros_ia.length<1||verified.rubros_ia.length>7)return null;
 const known=new Map<RubroMvp216,number>();
 for(const r of verified.rubros_ia){
  if(!r||typeof r.rubro!=='string'||
   !Object.hasOwn(RUBROS_MVP216,r.rubro)||known.has(r.rubro as RubroMvp216)||
   r.titulo!==RUBROS_MVP216[r.rubro as RubroMvp216]||
   !count(r.solicitados)||r.solicitados===0)return null;
  known.set(r.rubro as RubroMvp216,r.solicitados);
 }
 const results:VistaPendientesRubrosMvp299['respuestas'][number][]=[];
 for(const [i,row] of raw.respuestas.entries()){
  if(!obj(row)||!exactly(row,['label','rubros'])||
   typeof row.label!=='string'||!label.test(row.label)||
   row.label!=='Respuesta en revisión '+(i+1)||
   !Array.isArray(row.rubros)||row.rubros.length<1||
   row.rubros.length>known.size)return null;
  const used=new Set<RubroMvp216>();
  const rubros:VistaPendientesRubrosMvp299['respuestas'][number]['rubros'][number][]=[];
  for(const r of row.rubros){
   if(!obj(r)||!exactly(r,['rubro','respondidos','solicitados'])||
    typeof r.rubro!=='string'||!Object.hasOwn(RUBROS_MVP216,r.rubro)||
    used.has(r.rubro as RubroMvp216)||
    !count(r.solicitados,25)||r.solicitados<1||
    !count(r.respondidos,r.solicitados)||r.respondidos<1||
    !known.has(r.rubro as RubroMvp216)||
    r.solicitados>known.get(r.rubro as RubroMvp216)!)return null;
   const rubro=r.rubro as RubroMvp216;
   used.add(rubro);
   rubros.push(Object.freeze({rubro,titulo:RUBROS_MVP216[rubro],
    solicitados:r.solicitados,respondidos:r.respondidos}));
  }
  results.push(Object.freeze({label:row.label,rubros:Object.freeze(rubros)}));
 }
 return Object.freeze({
  state:'respuestas_interpretadas_sin_precio_comparable',
  respuestas:Object.freeze(results),
  ranking_permitido:false,contactos_revelados:false,
  adjudicacion_automatica:false
 });
}
