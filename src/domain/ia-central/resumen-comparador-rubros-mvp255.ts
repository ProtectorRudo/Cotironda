/**
 * MVP255 — puente del comparador MVP254 al seguimiento PRIVADO por rubro.
 * Usa SOLO la proyección del RPC MVP227 ya token-gated y las ofertas
 * económicas verificadas que devolvió SQL. Nunca reconstruye "fuentes"
 * falsas para volver a invocar MVP225 ni inventa renglones respondidos.
 * La cobertura es MINIMA/CONSERVADORA: artículos con precio corroborado.
 */
import {RUBROS_MVP216,type RubroMvp216} from '../rubros-comprador-mvp216.ts';
import {gruposCoberturaMvp254} from './opciones-cobertura-rubros-mvp254.ts';
import type {SalidaVistaMvp227} from './vista-comprador-rubros-mvp227.ts';

type Opcion=Readonly<{
 ofertasAnonimas:readonly string[];
 articulosConPrecio:readonly string[];
 articulosPendientes:readonly string[];
 cobertura:'completa_con_importes'|'parcial_con_importes';
 condicionesDeclaradasIguales:boolean;
 totalGlobalComparable:false;
}>;
export type ProyeccionRubrosMvp255=Readonly<{
 state:'alternativas_rubro_con_importes_sin_ranking';
 presupuestosAnonimos:readonly string[];
 rubros:readonly Readonly<{
  rubro:RubroMvp216;
  titulo:string;
  solicitados:number;
  articulosSolicitados:readonly string[];
  opciones:readonly Opcion[];
  opcionesTotales:number;
  ofertasConRespuestaSinPrecio:readonly string[];
  articulosConReferenciasCoincidentes:readonly string[];
 }>[];
 ranking_global_permitido:false;
 adjudicacion_automatica:false;
 contactos_revelados:false;
}>;
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const items=/^item_[1-9][0-9]{0,2}$/u;
const money=/^[0-9]{1,17}$/u;
const label=/^Presupuesto [1-9][0-9]{0,2}$/u;
const int=(v:unknown,max:number)=>Number.isSafeInteger(v)&&
 typeof v==='number'&&v>=0&&v<=max;
const conditions={
 moneda:['ARS','USD'],iva:['no_informado','sin_iva_explicito','incluido_explicito'],
 flete:['no_informado','incluido_explicito','excluido_explicito','a_convenir'],
 pago:['no_informado','contado','transferencia','credito']
} as const;
type Quote=Readonly<{
 label:string;settings:string;byRubro:Map<RubroMvp216,Readonly<{
  respondidos:number;precioIds:readonly string[];
 }>>;
}>;
const fail=():null=>null;

/** Solo tras el RPC de tracking original + RPC específico de IA Central,
 * ambos con token de comprador validado y revocación consultada. */
export function resumirAlternativasRubrosMvp255(
 raw:unknown,vista:SalidaVistaMvp227
):ProyeccionRubrosMvp255|null{
 if(!obj(raw)||raw.state!=='rubros_por_articulo'||
    raw.ranking_global_permitido!==false||
    raw.adjudicacion_automatica!==false||
    raw.contactos_revelados!==false||
    !Array.isArray(raw.items)||raw.items.length<1||
    raw.items.length>200||!Array.isArray(raw.ofertas)||
    raw.ofertas.length>25||!vista||
    !Array.isArray(vista.rubros_ia)||
    !Array.isArray(vista.offers))return fail();
 const byRubro=new Map<RubroMvp216,string[]>();
 const seenItems=new Set<string>();
 for(const item of raw.items){
  if(!obj(item)||typeof item.itemId!=='string'||
     !items.test(item.itemId)||seenItems.has(item.itemId)||
     typeof item.rubro!=='string'||
     !Object.hasOwn(RUBROS_MVP216,item.rubro))return fail();
  seenItems.add(item.itemId);
  const rubro=item.rubro as RubroMvp216;
  const lines=byRubro.get(rubro)??[];
  lines.push(item.itemId);byRubro.set(rubro,lines);
 }
 if(vista.rubros_ia.length!==byRubro.size||
    [...byRubro].some(([rubro,ids])=>
      !vista.rubros_ia.some(x=>x.rubro===rubro&&
        x.solicitados===ids.length&&x.titulo===RUBROS_MVP216[rubro])))
  return fail();
 const checked:Quote[]=[];
 const knownLabels=new Set<string>();
 for(const offer of raw.ofertas){
  if(!obj(offer)||typeof offer.label!=='string'||
     !label.test(offer.label)||knownLabels.has(offer.label)||
     !Array.isArray(offer.rubros)||offer.rubros.length<1||
     offer.rubros.length>7||
     !Array.isArray(offer.precios)||offer.precios.length>25)
   return fail();
  knownLabels.add(offer.label);
  for(const [key,allowed] of Object.entries(conditions))
   if(!allowed.includes(offer[key] as never))return fail();
  const own=new Map<RubroMvp216,{
   respondidos:number;precioIds:string[];solicitados:number;
   precioComprobado:number;faltantes:string[];
  }>();
  for(const summary of offer.rubros){
   if(!obj(summary)||typeof summary.rubro!=='string'||
      !Object.hasOwn(RUBROS_MVP216,summary.rubro)||
      !byRubro.has(summary.rubro as RubroMvp216)||
      own.has(summary.rubro as RubroMvp216)||
      !int(summary.solicitados,200)||summary.solicitados===0||
      Number(summary.solicitados)>(byRubro.get(summary.rubro as RubroMvp216)?.length??0)||
      !int(summary.respondidos,summary.solicitados as number)||
      !int(summary.precioComprobado,summary.respondidos as number)||
      !Array.isArray(summary.faltantes)||
      summary.faltantes.length!==Number(summary.solicitados)-Number(summary.respondidos)||
      summary.faltantes.some(x=>typeof x!=='string'||
       !byRubro.get(summary.rubro as RubroMvp216)!.includes(x))||
      new Set(summary.faltantes).size!==summary.faltantes.length||
      summary.cobertura!==(summary.respondidos===summary.solicitados
       ?'completa':summary.respondidos===0?'sin_cobertura':'parcial'))
    return fail();
   own.set(summary.rubro as RubroMvp216,{
    solicitados:summary.solicitados as number,
    respondidos:summary.respondidos as number,
    precioComprobado:summary.precioComprobado as number,
    faltantes:summary.faltantes as string[],precioIds:[]
   });
  }
  const used=new Set<string>();
  for(const price of offer.precios){
   if(!obj(price)||typeof price.pedidoId!=='string'||
      !seenItems.has(price.pedidoId)||used.has(price.pedidoId)||
      typeof price.centavos!=='string'||!money.test(price.centavos))
    return fail();
   const priceId=price.pedidoId as string;
   used.add(priceId);
   const rubro=[...byRubro].find(([,ids])=>ids.includes(priceId))?.[0];
   if(!rubro||!own.has(rubro))return fail();
   own.get(rubro)!.precioIds.push(priceId);
  }
  if([...own.values()].some(x=>
    x.precioIds.length!==x.precioComprobado||
    x.precioIds.some(y=>x.faltantes.includes(y))))return fail();
  checked.push({
   label:offer.label as string,
   settings:['moneda','iva','flete','pago'].map(k=>offer[k]).join('|'),
   byRubro:new Map([...own].map(([r,x])=>[r,{
    respondidos:x.respondidos,precioIds:x.precioIds
   }]))
  });
 }
 if(vista.rubros_ia.some(meta=>
  checked.filter(c=>c.byRubro.has(meta.rubro)).length!==meta.ofertas))
  return fail();
 const result=[...byRubro].map(([rubro,asked])=>{
  const candidates=checked.filter(c=>(c.byRubro.get(rubro)?.precioIds.length??0)>0);
  const groups=gruposCoberturaMvp254(
   candidates.map(x=>x.byRubro.get(rubro)!.precioIds));
  const opciones=groups.slice(0,12).map(indexes=>{
   const group=indexes.map(i=>candidates[i]);
   const known=new Set(group.flatMap(x=>x.byRubro.get(rubro)!.precioIds));
   const accredited=asked.filter(id=>known.has(id));
   return Object.freeze({
    ofertasAnonimas:Object.freeze(group.map(x=>x.label)),
    articulosConPrecio:Object.freeze(accredited),
    articulosPendientes:Object.freeze(asked.filter(id=>!known.has(id))),
    cobertura:accredited.length===asked.length?'completa_con_importes' as const:
     'parcial_con_importes' as const,
    condicionesDeclaradasIguales:group.every(x=>x.settings===group[0].settings),
    totalGlobalComparable:false as const
   });
  });
  // Ids only: two or more offers with the SAME source-derived price
  // conditions. No total, position, recommendation or implied lowest price.
  const matching=asked.filter(item=>{
   const groups=new Map<string,number>();
   for(const q of candidates){
    if(!q.byRubro.get(rubro)!.precioIds.includes(item))continue;
    const n=(groups.get(q.settings)??0)+1;
    groups.set(q.settings,n);
   }
   return [...groups.values()].some(n=>n>=2);
  });
  return Object.freeze({
   rubro,titulo:RUBROS_MVP216[rubro],solicitados:asked.length,
   articulosSolicitados:Object.freeze(asked.slice()),
   opciones:Object.freeze(opciones),opcionesTotales:groups.length,
   ofertasConRespuestaSinPrecio:Object.freeze(checked.filter(q=>{
    const x=q.byRubro.get(rubro);
    return x&&x.respondidos>0&&x.precioIds.length===0;
   }).map(x=>x.label)),
   articulosConReferenciasCoincidentes:Object.freeze(matching)
  });
 });
 return Object.freeze({
  state:'alternativas_rubro_con_importes_sin_ranking',
  presupuestosAnonimos:Object.freeze([...knownLabels]),
  rubros:Object.freeze(result),
  ranking_global_permitido:false,
  adjudicacion_automatica:false,
  contactos_revelados:false
 });
}
