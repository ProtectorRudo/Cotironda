/**
 * MVP-093: STRICT BOUNDARY, not an AI client. The model interprets,
 * never invents source proofs and NEVER authorizes WhatsApp dispatch.
 * No document is distributed on an unverified PDF/photo interpretation.
 */
import {parseBuyerPilot} from './core.ts';

export const PILOT_AI_SCHEMA={
 type:'object',additionalProperties:false,
 properties:{
  intent:{type:'string',enum:['quote_request','other']},
  city:{type:['string','null']},
  delivery_note:{type:['string','null']},
  items:{type:'array',maxItems:8,items:{
    type:'object',additionalProperties:false,
    properties:{
     description:{type:'string'},
     quantity:{type:'string'},
     unit:{type:'string',enum:['bag','l','kg','m3','unit']},
     family:{type:'string'},
     source_evidence:{type:'string'}
    },
    required:['description','quantity','unit','family','source_evidence']
  }},
  unresolved:{type:'array',items:{type:'string'},maxItems:20}
 },
 required:['intent','city','delivery_note','items','unresolved']
} as const;
type Line=Readonly<{description:string;quantity:string;unit:string;
 family:string;source_evidence:string}>;
export type AiBuyerProposal=Readonly<{
 intent:'quote_request'|'other';city:string|null;delivery_note:string|null;
 items:readonly Line[];unresolved:readonly string[];
}>;
type Decision=Readonly<{
 state:'review_required'|'missing_zone'|'source_verified_text';
 reason:string;
 normalized:AiBuyerProposal|null;
}>;
const good=(x:unknown):x is Record<string,unknown>=>x!==null&&
 typeof x==='object'&&!Array.isArray(x);
const exact=(x:unknown,keys:readonly string[]):boolean=>
 good(x)&&Object.keys(x).length===keys.length&&
 Object.keys(x).every(k=>keys.includes(k));
function review(reason:string):Decision{
 return {state:'review_required',reason,normalized:null};
}
export function validateAiBuyerProposal(data:unknown,sourceText:string|null):Decision{
 if(!exact(data,['intent','city','delivery_note','items','unresolved']))
  return review('invalid_schema');
 const x=data as Record<string,unknown>;
 if(x.intent!=='quote_request'||!
   (x.city===null||typeof x.city==='string'&&x.city.length>=3&&x.city.length<=80)||
   !(x.delivery_note===null||typeof x.delivery_note==='string'&&
     x.delivery_note.length<=90)||
   !Array.isArray(x.items)||x.items.length===0||x.items.length>8||
   !Array.isArray(x.unresolved)||x.unresolved.length>20||
   !x.unresolved.every(s=>typeof s==='string'&&s.length<=180))
  return review('ambiguous_or_unrecognized');
 if(x.unresolved.length>0)return review('unresolved_lines');
 const items=x.items as unknown[];
 for(const item of items){
  if(!exact(item,['description','quantity','unit','family','source_evidence']))
   return review('invalid_line_schema');
  const v=item as Record<string,unknown>;
  if(typeof v.description!=='string'||v.description.length<3||
    v.description.length>150||typeof v.quantity!=='string'||
    !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/u.test(v.quantity)||
    Number(v.quantity)<=0||!['bag','l','kg','m3','unit'].includes(String(v.unit))||
    typeof v.family!=='string'||!/^[a-z][a-z0-9_]{2,50}$/u.test(v.family)||
    typeof v.source_evidence!=='string'||v.source_evidence.length<4||
    v.source_evidence.length>250)
   return review('invalid_line_data');
 }
 // File contents need an independent, reproducible text/vision verification
 // step, not merely a claim by a model of what appeared in a PDF.
 if(typeof sourceText!=='string'||!sourceText.trim())
  return review('source_document_not_verified');
 if(items.some(line=>!sourceText.includes((line as Line).source_evidence)))
  return review('evidence_absent_from_source');
 // Compare with the independent deterministic parser where possible:
 // different quantities / families / number of lines => no auto-dispatch.
 const independent=parseBuyerPilot(sourceText);
 if(independent.unresolved.length>0||independent.items.length!==items.length)
  return review('not_independently_corroborrated');
 for(let i=0;i<items.length;i++){
  const ai=items[i] as Line;
  const known=independent.items[i];
  if(Number(ai.quantity)!==known.quantity||
    ai.unit!==known.unit||ai.family!==known.family)
   return review('line_mismatch');
 }
 if(x.city===null||independent.city===null)return {
  state:'missing_zone',reason:'zone_required',normalized:data as AiBuyerProposal
 };
 if(x.city!==independent.city)return review('zone_mismatch');
 return {state:'source_verified_text',reason:'independently_checked',
  normalized:data as AiBuyerProposal};
}
