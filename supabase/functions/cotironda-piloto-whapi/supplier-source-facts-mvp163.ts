/**
 * MVP163 — private independent source evidence. Verifies ONLY literal units,
 * packaging and condition mentions; never updates the original supplier quote,
 * calculates ranked prices, reveals identities or calls a model.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
export type FactRow=Readonly<{page:number;row:number;text:string}>;
export type UnitCode='unit'|'bag'|'box'|'kg'|'g'|'l'|'ml'|'m'|'m2'|'m3'|'roll'|'pack';
export type LineFact=Readonly<{
 lineNo:number;unitStatus:'explicit'|'not_explicit'|'ambiguous'|'not_found';
 unit:UnitCode|null;presentation:'big_bag'|'bolson'|'bag_weight'|'none';
 page:number|null;row:number|null
}>;
export type SourceTerms=Readonly<{
 iva:'not_stated'|'included_rate_unknown'|'excluded_rate_unknown'|'rate_seen'|'contradictory';
 freight:'not_stated'|'to_agree'|'included'|'free'|'amount_mentioned'|'contradictory';
 payment:'not_stated'|'cash'|'transfer'|'credit'|'multiple';stock:'not_proven'
}>;
export type LiteralFacts=Readonly<{
 state:'source_checked'|'unreadable';lines:readonly LineFact[];
 terms:SourceTerms;rankingAllowed:false;sourceImmutabilityPreserved:true
}>;
const norm=(v:string)=>v.normalize('NFKC').toLocaleLowerCase('es-AR')
 .normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/gu,' ').trim();
const escape=(s:string)=>[...s].map(c=>'.^$*+?()[]{}|\\'.includes(c)?'\\'+c:c).join('');
const U:Readonly<Record<string,UnitCode>>={
 unidad:'unit',unidades:'unit',un:'unit',u:'unit',
 bolsa:'bag',bolsas:'bag',saco:'bag',sacos:'bag',bag:'bag',
 caja:'box',cajas:'box',kg:'kg',kilo:'kg',kilos:'kg',
 kilogramo:'kg',kilogramos:'kg',g:'g',gramo:'g',gramos:'g',
 litro:'l',litros:'l',l:'l',lt:'l',lts:'l',
 ml:'ml',mililitro:'ml',mililitros:'ml',
 m:'m',metro:'m',metros:'m',m2:'m2','m²':'m2',
 'metro cuadrado':'m2','metros cuadrados':'m2',
 m3:'m3','m³':'m3','metro cubico':'m3','metros cubicos':'m3',
 rollo:'roll',rollos:'roll',paquete:'pack',paquetes:'pack'
};
const choices=Object.keys(U).sort((a,b)=>b.length-a.length).map(escape).join('|');
const unitRegex=new RegExp('(?<![\\p{L}\\p{N}.,])([1-9]\\d{0,7}(?:[.,]\\d{1,3})?)'+
 '[\\s:;|·/-]+('+choices+')(?![\\p{L}\\p{N}])','giu');
const empty:SourceTerms={iva:'not_stated',freight:'not_stated',
 payment:'not_stated',stock:'not_proven'};
const cleaned=(v:string)=>v.replace(/;\s*dscto\.?\s*:?\s*\d{1,2}(?:[.,]\d{1,2})\s*%$/iu,'').trim();
function presentation(desc:string):LineFact['presentation']{
 const v=norm(desc);
 if(/\bbig[\s-]*b(?:a|ia)g\b/u.test(v))return 'big_bag';
 if(/\b(?:bolson|bolsones)\b/u.test(v))return 'bolson';
 if(/\b(?:bolsa|saco)\s*(?:de\s*)?\d+(?:[.,]\d+)?\s*kg\b/u.test(v))
  return 'bag_weight';
 return 'none';
}
const drop=(text:string,value:string):string|null=>{
 const at=text.indexOf(value);
 return at<0?null:text.slice(0,at)+' '+text.slice(at+value.length);
};
const containsNumber=(text:string,x:string)=>{
 const v=norm(x).replace(/^\$\s*/u,'');
 return new RegExp('(?<![\\p{L}\\p{N}.,])'+escape(v)+
 '(?![\\p{L}\\p{N}.,])','u').test(norm(text).replace(/\$\s*/gu,''));
};
const missing=(lineNo:number,p:LineFact['presentation'],
 status:LineFact['unitStatus']='not_found'):LineFact=>
 ({lineNo,presentation:p,unitStatus:status,unit:null,page:null,row:null});
function one(line:DocumentDraft['lines'][number],lineNo:number,
 rows:readonly FactRow[],used:Set<number>):LineFact{
 const desc=norm(cleaned(line.original_description)),pack=presentation(desc);
 if(!desc||!line.quantity||!line.unit_price||!line.line_total)
  return missing(lineNo,pack);
 const candidates=rows.map((r,i)=>({r,i})).filter(({r,i})=>!used.has(i)&&
  norm(r.text).includes(desc)&&containsNumber(r.text,line.quantity!)&&
  containsNumber(r.text,line.unit_price!)&&containsNumber(r.text,line.line_total!));
 if(candidates.length!==1)
  return missing(lineNo,pack,candidates.length>1?'ambiguous':'not_found');
 const {r,i}=candidates[0];used.add(i);
 let rest=drop(norm(r.text),desc);
 if(rest===null)return missing(lineNo,pack);
 for(const v of [line.unit_price,line.line_total]){
  const raw=norm(v??'');
  rest=drop(rest,raw)??drop(rest.replace(/\$\s*/gu,''),raw.replace(/^\$\s*/u,''));
  if(rest===null)return missing(lineNo,pack,'ambiguous');
 }
 const qty=norm(line.quantity).replace(',','.');
 const found=[...rest.matchAll(unitRegex)]
  .filter(m=>m[1].replace(',','.')===qty)
  .map(m=>U[norm(m[2])]).filter((v):v is UnitCode=>v!==undefined);
 const units=[...new Set(found)];
 const claimed=line.unit?U[norm(line.unit)]:null;
 if(units.length!==1||claimed!==null&&claimed!==units[0])
  return {lineNo,presentation:pack,
   unitStatus:units.length>1||claimed!==null?'ambiguous':'not_explicit',
   unit:null,page:r.page,row:r.row};
 return {lineNo,presentation:pack,unitStatus:'explicit',unit:units[0],
  page:r.page,row:r.row};
}
function terms(rows:readonly FactRow[]):SourceTerms{
 // Categories describe source statements, NOT financially audited terms.
 const all=norm(rows.map(x=>x.text).join(' '));
 const incl=/\b(?:iva\s+incluido|con\s+iva)\b/u.test(all);
 const excl=/\b(?:sin\s+iva|iva\s+no\s+incluido|iva\s+aparte)\b/u.test(all);
 const rate=/\b(?:iva\s*(?:al\s*)?(?:21|10[,.]5|0)\s*%|(?:21|10[,.]5|0)\s*%\s*iva)\b/u.test(all);
 const iva=incl&&excl?'contradictory':rate?'rate_seen':
  incl?'included_rate_unknown':excl?'excluded_rate_unknown':'not_stated';
 const agree=/\b(?:flete|envio|transporte)\s+a\s+convenir\b/u.test(all);
 const free=/\b(?:flete|envio|transporte)\s+(?:sin\s+cargo|gratis)\b/u.test(all);
 const included=/\b(?:flete|envio|transporte)\s+incluido\b/u.test(all);
 const amount=/\b(?:flete|envio|transporte)\s*[:$]\s*\d/u.test(all);
 const count=[agree,free,included,amount].filter(Boolean).length;
 const freight=count>1?'contradictory':agree?'to_agree':
  free?'free':included?'included':amount?'amount_mentioned':'not_stated';
 const cash=/\b(?:contado|efectivo)\b/u.test(all);
 const transfer=/\btransferencia\b/u.test(all);
 const credit=/\b(?:cuenta\s+corriente|credito|financiacion)\b/u.test(all);
 const methods=[cash,transfer,credit].filter(Boolean).length;
 const payment=methods>1?'multiple':cash?'cash':transfer?'transfer':
  credit?'credit':'not_stated';
 return {iva,freight,payment,stock:'not_proven'};
}
/** Never returns supplier identifiers, raw source, contacts or monetary values. */
export function extractLiteralFactsMvp163(draft:DocumentDraft,
 rows:readonly FactRow[]):LiteralFacts{
 if(!draft||draft.kind!=='supplier_quote'||!Array.isArray(draft.lines)||
  draft.lines.length<1||draft.lines.length>25||!Array.isArray(rows)||
  rows.length<2||rows.length>300||rows.some(r=>!Number.isSafeInteger(r.page)||
   r.page<1||r.page>12||!Number.isSafeInteger(r.row)||r.row<1||
   r.row>300||typeof r.text!=='string'||r.text.length>2000))
  return {state:'unreadable',lines:[],terms:empty,
   rankingAllowed:false,sourceImmutabilityPreserved:true};
 const seen=new Set<number>();
 return {state:'source_checked',
  lines:draft.lines.map((x,i)=>one(x,i+1,rows,seen)),
  terms:terms(rows),rankingAllowed:false,sourceImmutabilityPreserved:true};
}
