/**
 * The verified sender role is authoritative for document ROUTING, not for
 * economic fidelity. A supplier price list mislabelled by the model is still
 * a PRIVATE quote draft. This function never approves a price or sends data.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
const MONEY=/^[ \t]*-?[ \t]*(?:\$[ \t]*)?\d[\d., ]*$/u;
const monetary=(v:string|null):boolean=>
 typeof v==='string'&&v.length<160&&MONEY.test(v)&&
 /\d/u.test(v)&&!/[A-Za-z]/u.test(v);
export function promoteVerifiedSupplierQuote(
 draft:DocumentDraft,verifiedSupplier:boolean
):DocumentDraft{
 if(!verifiedSupplier||draft.kind!=='buyer_request'||
   !monetary(draft.total_declared)||
   draft.lines.length<1||draft.lines.length>25||
   draft.lines.some(v=>
     typeof v.original_description!=='string'||
     v.original_description.trim().length<2||
     !monetary(v.unit_price)||!monetary(v.line_total)||
     typeof v.evidence_location!=='string'||
     v.evidence_location.trim().length<2||
     v.ambiguity!==null))
  return draft;
 return {...draft,kind:'supplier_quote'};
}
