/**
 * MVP152 — Deterministic source evidence for AI-proposed buyer text.
 * A model never authorizes an action or guesses missing quantity/unit.
 */
import {parseBuyerPilot,type ParsedBuyer,type PilotItem} from './core.ts';
import type {AiBuyerProposal} from './ai-contract.ts';

type Result=Readonly<{state:'verified'|'missing_zone'|'review';parsed:ParsedBuyer|null;reason:string}>;
const reject=(reason:string):Result=>({state:'review',parsed:null,reason});
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/\s+/gu,' ').trim();
const QUANTITY=/(\d{1,6}(?:[.,]\d{1,3})?)\s*(bolsas?|bols?\.?|litros?|lts?\.?|l|kgs?|kilogramos?|m3|m³|unidades?|unid?\.?|u|cajas?|rollos?|barras?|placas?|metros?|mts?\.?|m2|m²|packs?)(?=$|[\s,.:;)\]-])/giu;
const UNIT:Record<string,PilotItem['unit']>={
 bolsa:'bag',bolsas:'bag',bols:'bag',bol:'bag',
 litro:'l',litros:'l',lt:'l',lts:'l',l:'l',
 kg:'kg',kgs:'kg',kilogramo:'kg',kilogramos:'kg',
 m3:'m3','m³':'m3',unidad:'unit',unidades:'unit',unid:'unit',u:'unit',
 caja:'box',cajas:'box',rollo:'roll',rollos:'roll',barra:'unit',barras:'unit',
 placa:'unit',placas:'unit',metro:'m',metros:'m',mt:'m',mts:'m',
 m2:'m2','m²':'m2',pack:'pack',packs:'pack'
};
const FAMILY:Record<string,RegExp>={
 cemento_gris_obra:/\bcemento\b/u, hidrofugo:/\b(hidrofugo|ceresita)\b/u,
 arena_fina:/\barena (fina|zarandeada)\b/u, arena_gruesa:/\barena gruesa\b/u,
 piedra_partida:/\bpiedra (partida|triturada)\b/u,
 ladrillo_comun:/\bladrillos?\b.*\bcomun\b/u,
 ladrillo_hueco:/\bladrillos?\b.*\bhuecos?\b/u,
 cal_aerea:/\bcal\b.*\b(aerea|hidratada)\b/u,
 cal_hidraulica:/\bcal\b.*\bhidraulica\b/u,
 hierro_adn:/\bhierros?\b.*\b(adn|420|para hormigon)\b/u,
 alambre_galvanizado:/\balambre\b.*\bgalvanizado\b/u,
 alambre_recocido:/\balambre\b.*\b(recocido|para atar)\b/u,
 bloque_hormigon:/\bbloques?\b.*\bhormigon\b/u,
 cascote_relleno:/\bcascotes?\b/u,
 clavos_punta_paris:/\bclavos?\b.*\bpunta paris\b/u,
 malla_electrosoldada:/\bmallas?\b.*\belectrosoldada\b/u,
 membrana_asfaltica:/\bmembranas?\b.*\basfaltica\b/u,
 pastina_juntas:/\bpastina\b.*\b(juntas|rejuntado)\b/u,
 revoque_fino:/\brevoque\b.*\bfino\b/u,
 revoque_grueso:/\brevoque\b.*\bgrueso\b/u,
 teja_francesa:/\btejas?\b.*\bfrancesa\b/u,
 tosca_relleno:/\btosca\b/u,
 vigueta_pretensada:/\bviguetas?\b.*\bpretensadas?\b/u,
 yeso_obra:/\byeso\b.*\b(obra|tradicional)\b/u
};
function pairs(raw:string){
 return [...raw.matchAll(QUANTITY)].map(m=>({
  start:m.index,end:m.index+m[0].length,
  quantity:/^\d{1,3}\.\d{3}$/u.test(m[1])?null:Number(m[1].replace(',','.')),
  unit:UNIT[fold(m[2]).replace(/\.$/u,'')]??null
 }));
}
export function verifyAiBuyerSourceEvidence(
 source:string,proposal:AiBuyerProposal,curatedFamilies:readonly string[]
):Result{
 if(typeof source!=='string'||source.length>3000||source.length<5||
   proposal?.intent!=='quote_request'||!Array.isArray(proposal.items)||
   proposal.items.length<1||proposal.items.length>25||
   !Array.isArray(proposal.unresolved)||proposal.unresolved.length>0||
   !Array.isArray(curatedFamilies)||curatedFamilies.length<1||curatedFamilies.length>100)
  return reject('invalid_scope');
 const allowed=new Set(curatedFamilies);
 const local=parseBuyerPilot(source);
 if(local.city!==proposal.city)return reject('city_not_in_source');
 if(local.deliveryNote&&local.deliveryNote!==proposal.delivery_note)
  return reject('delivery_note_not_in_source');
 const found=pairs(source);
 if(found.length===0||found.some(x=>x.quantity===null||x.unit===null))
  return reject('ambiguous_quantity_unit');
 const used:{start:number;end:number}[]=[];
 const items:PilotItem[]=[];
 for(const v of proposal.items){
  if(!v||typeof v.description!=='string'||v.description.length<3||
   v.description.length>150||typeof v.quantity!=='string'||
   !/^[1-9]\d{0,5}(?:\.\d{1,3})?$/u.test(v.quantity)||
   !Number.isFinite(Number(v.quantity))||Number(v.quantity)>1000000||
   !['bag','l','kg','m3','unit','box','m','m2','roll','pack'].includes(v.unit)||
   typeof v.family!=='string'||!allowed.has(v.family)||
   typeof v.source_evidence!=='string'||v.source_evidence.length<4||
   v.source_evidence.length>250)return reject('invalid_line');
  const evidence=v.source_evidence;
  let start=source.indexOf(evidence);
  while(start>=0&&used.some(s=>start<s.end&&start+evidence.length>s.start))
    start=source.indexOf(evidence,start+1);
  if(start<0)return reject('evidence_missing_or_overlapping');
  const end=start+evidence.length;
  if(!fold(evidence).includes(fold(v.description)))
   return reject('description_not_in_evidence');
  const normalized=fold(evidence);
  if(!FAMILY[v.family]?.test(normalized)||
   (v.family==='cemento_gris_obra'&&
    /\b(adhesivo|contacto|cola|blanco|refractario|plastico|asfaltico)\b/u.test(normalized)))
   return reject('family_not_proven');
  const sourcePairs=found.filter(p=>p.start>=start&&p.end<=end);
  if(!sourcePairs.some(p=>p.unit===v.unit&&p.quantity===Number(v.quantity)))
   return reject('requested_quantity_not_proven');
  used.push({start,end});
  items.push({description:v.description,quantity:Number(v.quantity),
   unit:v.unit as PilotItem['unit'],family:v.family});
 }
 // The extracted request cannot omit a quantified source item.
 if(found.some(p=>!used.some(s=>p.start>=s.start&&p.end<=s.end)))
  return reject('source_quantity_omitted');
 // Where the independent parser *can* read some lines, never contradict it.
 if(local.items.some(x=>!items.some(y=>x.quantity===y.quantity&&
   x.unit===y.unit&&x.family===y.family&&fold(y.description)===fold(x.description))))
  return reject('conflicts_with_independent_line');
 if(local.city===null)return {state:'missing_zone',parsed:null,reason:'zone_required'};
 return {state:'verified',reason:'literal_evidence_and_curated_catalogue',
  parsed:{city:local.city,deliveryNote:local.deliveryNote,items,unresolved:[]}};
}
