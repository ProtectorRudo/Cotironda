/** Conservative WhatsApp reply parser for an already-open single document.
 * The number is the position in the original image; never a new quantity.
 * We parse only units, the fine/coarse arena variant and a labelled city.
 * A SQL gate checks actual pending owner and line details before applying.
 */
export type ClarificationLine=Readonly<{
 line_no:number; unit:string|null; family_hint:'arena_fina'|'arena_gruesa'|null;
}>;
export type DocumentClarification=Readonly<{
 city:string|null; changes:readonly ClarificationLine[];
}>;
const unitPatterns:ReadonlyArray<readonly [RegExp,string]>=[
 [/\b(?:bolsas?|bols)\b/iu,'bag'],
 [/\b(?:unidades?|unid)\b/iu,'unit'],
 [/\b(?:kgs?|kilogramos?)\b/iu,'kg'],
 [/\b(?:litros?|lts?)\b/iu,'l'],
 [/\b(?:cajas?)\b/iu,'box'],
 [/\b(?:rollos?)\b/iu,'roll'],
 [/\b(?:paquetes?)\b/iu,'pack'],
 [/(?:\bmetros?\s+c[uú]bicos?\b|\bm3\b|\bm³)(?!\p{L})/iu,'m3'],
 [/(?:\bmetros?\s+cuadrados?\b|\bm2\b|\bm²)(?!\p{L})/iu,'m2'],
 [/\b(?:metros?|m)\b/iu,'m'],
 [/\b(?:gramos?|g)\b/iu,'g']
];
function canonicalCity(s:string):string|null{
 const v=s.trim().replace(/[.]$/u,'').trim();
 if(v.length<3||v.length>80||v.split(/\s+/u).length>6||
    !/^[\p{L}\s()'.,-]+$/u.test(v))return null;
 if(/\b(?:cemento|arena|bolsas?|unidades?|pedido|presupuesto)\b/iu.test(v))
  return null;
 return v;
}
export function parseDocumentClarification(raw:string):DocumentClarification|null{
 if(typeof raw!=='string'||raw.length<3||raw.length>800)return null;
 const spans=raw.split(/[;\n]+/u).map(x=>x.trim()).filter(Boolean);
 if(spans.length<1||spans.length>10)return null;
 let city:string|null=null;
 const changes:ClarificationLine[]=[];
 const seen=new Set<number>();
 for(const span of spans){
  const cityMatch=span.match(/^(?:entrega|localidad|zona(?: de entrega)?|destino)\s*(?::|=|\ben\b|\ba\b)\s*(.+)$/iu);
  if(cityMatch){
   const value=canonicalCity(cityMatch[1]);
   if(!value||city!==null)return null;
   city=value;continue;
  }
  const line=span.match(/^([1-8])\s*[.):\-]?\s+(.+)$/u);
  if(!line)return null;
  const lineNo=Number(line[1]);
  if(seen.has(lineNo))return null;
  seen.add(lineNo);
  const body=line[2].trim().toLowerCase();
  // Reject numeric changes and pricing: quantities and values were in
  // the original document and must not be overwritten by clarification.
  if(/\d/u.test(body.replace(/\bm[23]\b/giu,''))||/[$€]|(?:precio|costo|total|iva|flete|descuento)/iu.test(body))
   return null;
  const units=unitPatterns.filter(([rx])=>rx.test(body));
  if(units.length>1)return null;
  const hint=/\b(?:fina|zarandeada)\b/iu.test(body)?'arena_fina':
   /\b(?:gruesa)\b/iu.test(body)?'arena_gruesa':null;
  if(/\b(?:fina|zarandeada)\b/iu.test(body)&&/\bgruesa\b/iu.test(body))return null;
  if(units.length===0&&!hint)return null;
  changes.push({line_no:lineNo,unit:units[0]?.[1]??null,family_hint:hint});
 }
 return city!==null||changes.length>0?{city,changes}:null;
}
